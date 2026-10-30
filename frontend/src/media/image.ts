/** Photos are shrunk on the phone before they are saved: a wound photo from a modern camera is several
 *  megabytes, far too much for a 2G connection. The aim is about 100 KB, never more than the limit
 *  in repo.ts (300 KB). */
export const TARGET_BYTES = 100_000;
export const HARD_LIMIT_BYTES = 300_000;

export type Encoder = (width: number, height: number, quality: number) => Promise<Blob>;

/** Finds a size and quality that fit. Tries high quality first, lowers quality, then shrinks the picture. */
export async function fitToSize(width: number, height: number, encode: Encoder, { target = TARGET_BYTES, limit = HARD_LIMIT_BYTES, minQuality = 0.4 } = {}): Promise<{ blob: Blob; width: number; height: number }> {
  let w = width, h = height;
  let best: { blob: Blob; width: number; height: number } | null = null;
  for (let shrink = 0; shrink < 5; shrink++) {
    for (let q = 0.8; q >= minQuality - 1e-9; q -= 0.1) {
      const blob = await encode(w, h, q);
      if (!best || blob.size < best.blob.size) best = { blob, width: w, height: h };
      if (blob.size <= target) return { blob, width: w, height: h };
    }
    w = Math.max(1, Math.round(w * 0.8)); h = Math.max(1, Math.round(h * 0.8));
  }
  if (best && best.blob.size <= limit) return best;
  throw new Error("That photo can't be made small enough. Take it again, closer.");
}

export class ImageError extends Error {}

/** Browser part: decode (respecting the camera's rotation), scale to at most 1280 px, then fit to size. */
export async function compressImage(file: Blob, maxEdge = 1280): Promise<{ bytes: Uint8Array; width: number; height: number; contentType: "image/jpeg" }> {
  if (!file.type.startsWith("image/")) throw new ImageError("That file is not a photo.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new ImageError("We couldn't read that photo. Take it again."); }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const encode: Encoder = (w, h, q) => new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new ImageError("This phone can't prepare photos."));
    ctx.drawImage(bitmap, 0, 0, w, h);
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError("We couldn't prepare that photo."))), "image/jpeg", q);
  });
  try {
    const { blob, width, height } = await fitToSize(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), encode);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height, contentType: "image/jpeg" };
  } finally {
    bitmap.close?.();
  }
}
