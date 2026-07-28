"use client";

import type { AppSnapshot } from "../types";
import { isStickerLibrary, type StickerLibrary } from "../stickers";

export const BROWSER_DB_NAME = "humanoid-browser-state";
const DB_VERSION = 2;
const DASHBOARDS = "dashboards";
const RICH_DRAFTS = "rich-drafts";
const PREFERENCES = "preferences";
const STICKER_LIBRARIES = "sticker-libraries";

export interface StoredDashboard {
  version: 1;
  botId: string;
  savedAt: number;
  snapshot: AppSnapshot;
  avatarFileIds: Record<string, string | null>;
  selectedChatId: string | null;
}

let databasePromise: Promise<IDBDatabase> | null = null;

export function browserStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function loadDashboard(botId: string): Promise<StoredDashboard | null> {
  const value = await getRecord<unknown>(DASHBOARDS, botId);
  return isStoredDashboard(value, botId) ? value : null;
}

export async function saveDashboard(record: StoredDashboard): Promise<void> {
  await putRecord(DASHBOARDS, record, record.botId);
}

export async function clearDashboard(botId: string): Promise<void> {
  await deleteRecord(DASHBOARDS, botId);
}

export async function loadStickerLibrary(botId: string): Promise<StickerLibrary | null> {
  const value = await getRecord<unknown>(STICKER_LIBRARIES, botId);
  return isStickerLibrary(value, botId) ? value : null;
}

export async function saveStickerLibrary(library: StickerLibrary): Promise<void> {
  await putRecord(STICKER_LIBRARIES, library, library.botId);
}

export async function clearStickerLibrary(botId: string): Promise<void> {
  await deleteRecord(STICKER_LIBRARIES, botId);
}

export async function loadRichDraft<T>(botId: string): Promise<T | null> {
  const value = await getRecord<{ version?: unknown; value?: T }>(RICH_DRAFTS, botId);
  return value?.version === 1 && value.value != null ? value.value : null;
}

export async function saveRichDraft<T>(botId: string, value: T): Promise<void> {
  await putRecord(RICH_DRAFTS, { version: 1, savedAt: Date.now(), value }, botId);
}

export async function clearRichDraft(botId: string): Promise<void> {
  await deleteRecord(RICH_DRAFTS, botId);
}

export async function loadPreference<T>(key: string): Promise<T | null> {
  const value = await getRecord<{ version?: unknown; value?: T }>(PREFERENCES, key);
  return value?.version === 1 && value.value != null ? value.value : null;
}

export async function savePreference<T>(key: string, value: T): Promise<void> {
  await putRecord(PREFERENCES, { version: 1, savedAt: Date.now(), value }, key);
}

export async function closeBrowserDatabase(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise.catch(() => null);
  database?.close();
  databasePromise = null;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!browserStorageAvailable()) return Promise.reject(new Error("IndexedDB is unavailable"));
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(BROWSER_DB_NAME, DB_VERSION);
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DASHBOARDS)) database.createObjectStore(DASHBOARDS);
      if (!database.objectStoreNames.contains(RICH_DRAFTS)) database.createObjectStore(RICH_DRAFTS);
      if (!database.objectStoreNames.contains(PREFERENCES)) database.createObjectStore(PREFERENCES);
      if (!database.objectStoreNames.contains(STICKER_LIBRARIES)) {
        database.createObjectStore(STICKER_LIBRARIES);
      }
    };
    request.onerror = () => fail(request.error || new Error("Could not open IndexedDB"));
    request.onblocked = () => fail(new Error("IndexedDB upgrade is blocked by another tab"));
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  databasePromise = opening;
  return opening;
}

async function getRecord<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).get(key);
  const completed = transactionComplete(transaction);
  const result = await requestResult<T | undefined>(request);
  await completed;
  return result ?? null;
}

async function putRecord(storeName: string, value: unknown, key: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value, key);
  await transactionComplete(transaction);
}

async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionComplete(transaction);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}

function isStoredDashboard(value: unknown, botId: string): value is StoredDashboard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredDashboard>;
  const snapshot = candidate.snapshot as Partial<AppSnapshot> | undefined;
  return candidate.version === 1
    && candidate.botId === botId
    && typeof candidate.savedAt === "number"
    && Boolean(snapshot)
    && Array.isArray(snapshot?.chats)
    && Boolean(snapshot?.messages && typeof snapshot.messages === "object")
    && Array.isArray(snapshot?.queries)
    && Array.isArray(snapshot?.rawUpdates)
    && Array.isArray(snapshot?.log)
    && Boolean(snapshot?.polling && typeof snapshot.polling === "object")
    && Boolean(candidate.avatarFileIds && typeof candidate.avatarFileIds === "object")
    && (candidate.selectedChatId == null || typeof candidate.selectedChatId === "string");
}
