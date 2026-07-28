import type { TgAny } from "./types";

/** Decode Telegram's gzip-compressed Lottie sticker format without persisting bytes. */
export async function decodeTgs(bytes: Uint8Array): Promise<TgAny> {
  const { gunzipSync, strFromU8 } = await import("fflate");
  const jsonBytes = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const animationData = JSON.parse(strFromU8(jsonBytes)) as TgAny;
  if (!animationData || !Array.isArray(animationData.layers)) {
    throw new Error("Invalid TGS animation");
  }
  // Telegram TGS files are vector animations. Drop external image assets if a
  // malformed payload contains them, keeping playback same-origin only.
  if (Array.isArray(animationData.assets)) {
    animationData.assets = animationData.assets.filter(
      (asset: TgAny) => Array.isArray(asset?.layers) && !asset?.p && !asset?.u
    );
  }
  return animationData;
}
