"use client";

import type { TgAny } from "@/lib/types";
import { botFetch } from "./botToken";

export interface TgResult<T = any> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: TgAny;
}

export interface CallMeta {
  queryLocalId?: string;
  deleteChatId?: string | number;
  deleteMessageIds?: number[];
}

/** Call any Bot API method through the transient Worker proxy. */
export async function tg<T = any>(
  method: string,
  params: TgAny = {},
  meta?: CallMeta
): Promise<TgResult<T>> {
  try {
    const res = await botFetch("/api/tg", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, params, meta }),
    });
    return (await res.json()) as TgResult<T>;
  } catch (e: any) {
    return { ok: false, description: e?.message || "network error" };
  }
}

/** Same, but with multipart file uploads (photo, document, media groups, …). */
export async function tgUpload<T = any>(
  method: string,
  params: TgAny = {},
  files: Record<string, File | Blob> = {},
  meta?: CallMeta
): Promise<TgResult<T>> {
  const fd = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    fd.append(
      key,
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value)
    );
  }
  for (const [k, f] of Object.entries(files)) {
    fd.append(k, f, (f as File).name || k);
  }
  try {
    const query = new URLSearchParams({ method });
    if (meta) query.set("meta", JSON.stringify(meta));
    const res = await botFetch(`/api/tg?${query}`, { method: "POST", body: fd });
    return (await res.json()) as TgResult<T>;
  } catch (e: any) {
    return { ok: false, description: e?.message || "network error" };
  }
}

export async function polling(action: "start" | "stop" | "clear" | "skip"): Promise<TgResult> {
  const res = await botFetch("/api/polling", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return (await res.json()) as TgResult;
}

export async function avatar(
  id: number | string,
  kind: "user" | "chat"
): Promise<{ ok: boolean; file_id?: string | null }> {
  try {
    const query = new URLSearchParams({ id: String(id), kind });
    const response = await botFetch(`/api/avatar?${query}`, { cache: "no-store" });
    return await response.json() as { ok: boolean; file_id?: string | null };
  } catch {
    return { ok: false };
  }
}
