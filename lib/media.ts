export type MediaFileLike = Pick<File, "name" | "type">;

export type SingleAttachmentKind = "photo" | "video" | "animation" | "audio" | "document";
export type AlbumMediaKind = "photo" | "video" | "audio" | "document";
export type ProfilePhotoKind = "static" | "animated";

export const MAX_ALBUM_ITEMS = 10;

function lowerName(file: MediaFileLike): string {
  return file.name.toLowerCase();
}

function isGif(file: MediaFileLike): boolean {
  return file.type.toLowerCase() === "image/gif" || lowerName(file).endsWith(".gif");
}

export function singleAttachmentKind(file: MediaFileLike): SingleAttachmentKind {
  const type = file.type.toLowerCase();
  if (isGif(file)) return "animation";
  if (type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

export function attachmentKindForFiles(
  files: readonly MediaFileLike[]
): SingleAttachmentKind | "media_group" | null {
  if (files.length === 0) return null;
  return files.length === 1 ? singleAttachmentKind(files[0]) : "media_group";
}

/** GIFs aren't a supported InputMediaAnimation album item, so they travel as documents. */
export function albumMediaKind(file: MediaFileLike): AlbumMediaKind {
  const type = file.type.toLowerCase();
  if (!isGif(file) && type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "document";
}

export function mediaGroupError(files: readonly MediaFileLike[]): string | null {
  if (files.length < 2) return "An album needs at least 2 items";
  if (files.length > MAX_ALBUM_ITEMS) return `An album can contain at most ${MAX_ALBUM_ITEMS} items`;

  const kinds = files.map(albumMediaKind);
  if (kinds.includes("audio") && kinds.some((kind) => kind !== "audio")) {
    return "Audio albums can contain audio files only";
  }
  if (kinds.includes("document") && kinds.some((kind) => kind !== "document")) {
    return "Document albums can contain documents only";
  }
  return null;
}

export function paidMediaKind(file: MediaFileLike): "photo" | "video" | null {
  const type = file.type.toLowerCase();
  if (!isGif(file) && type.startsWith("image/")) return "photo";
  if (type.startsWith("video/")) return "video";
  return null;
}

export function paidMediaError(files: readonly MediaFileLike[]): string | null {
  if (files.length === 0) return "Add at least one photo or video";
  if (files.length > MAX_ALBUM_ITEMS) return `Paid media can contain at most ${MAX_ALBUM_ITEMS} items`;
  if (files.some((file) => paidMediaKind(file) === null)) {
    return "Paid media accepts photos and videos only";
  }
  return null;
}

export function profilePhotoKind(file: MediaFileLike): ProfilePhotoKind | null {
  const type = file.type.toLowerCase();
  const name = lowerName(file);
  if (type === "video/mp4" || name.endsWith(".mp4")) return "animated";
  if (type.startsWith("image/") || /\.jpe?g$/.test(name)) return "static";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
