import { PHOTOS_BUCKET, sb } from "@/lib/supabase";

export const PHOTO_MAX_EDGE = 1280;
export const PHOTO_QUALITY = 0.72;
export const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.7;

export type CapturedPhoto = { full: Blob; thumb: Blob };

type Source = { image: CanvasImageSource; width: number; height: number };

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo."))), "image/jpeg", quality),
  );
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Could not process photo.");
  return { c, ctx };
}

/** Long edge scaled down to PHOTO_MAX_EDGE, JPEG. */
async function fullFrom(src: Source): Promise<Blob> {
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const { c, ctx } = canvas(w, h);
  ctx.drawImage(src.image, 0, 0, w, h);
  return toJpeg(c, PHOTO_QUALITY);
}

/** Square center crop. Every thumbnail in the app uses this one crop. */
async function thumbFrom(src: Source): Promise<Blob> {
  const side = Math.min(src.width, src.height);
  const sx = (src.width - side) / 2;
  const sy = (src.height - side) / 2;
  const { c, ctx } = canvas(THUMB_EDGE, THUMB_EDGE);
  ctx.drawImage(src.image, sx, sy, side, side, 0, 0, THUMB_EDGE, THUMB_EDGE);
  return toJpeg(c, THUMB_QUALITY);
}

export async function photoFromVideo(video: HTMLVideoElement): Promise<CapturedPhoto> {
  const src = { image: video, width: video.videoWidth, height: video.videoHeight };
  if (!src.width || !src.height) throw new Error("Camera is not ready yet.");
  return { full: await fullFrom(src), thumb: await thumbFrom(src) };
}

async function loadBitmap(file: Blob): Promise<Source & { close: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read that photo."));
        el.src = url;
      });
      return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function photoFromFile(file: Blob): Promise<CapturedPhoto> {
  const src = await loadBitmap(file);
  try {
    return { full: await fullFrom(src), thumb: await thumbFrom(src) };
  } finally {
    src.close();
  }
}

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return sb().storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl || null;
}

/**
 * Each capture gets a fresh file name so phones never show a cached old photo
 * after a retake. Layout: <code>/<stamp>.jpg and <code>/<stamp>-t.jpg
 */
export async function uploadPhoto(code: string, photo: CapturedPhoto): Promise<{ photoPath: string; thumbPath: string }> {
  const stamp = Date.now().toString(36);
  const photoPath = `${code}/${stamp}.jpg`;
  const thumbPath = `${code}/${stamp}-t.jpg`;
  const bucket = sb().storage.from(PHOTOS_BUCKET);
  const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: true };
  const a = await bucket.upload(photoPath, photo.full, opts);
  if (a.error) throw storageError(a.error);
  const b = await bucket.upload(thumbPath, photo.thumb, opts);
  if (b.error) {
    await bucket.remove([photoPath]);
    throw storageError(b.error);
  }
  return { photoPath, thumbPath };
}

export async function removePhotoFiles(code: string, keep: string[] = []): Promise<void> {
  const bucket = sb().storage.from(PHOTOS_BUCKET);
  const { data } = await bucket.list(code, { limit: 100 });
  const paths = (data ?? []).map((f) => `${code}/${f.name}`).filter((p) => !keep.includes(p));
  if (paths.length) await bucket.remove(paths);
}

export function storageError(error: { message?: string }): Error {
  const msg = error.message ?? "";
  if (/bucket not found|not found/i.test(msg)) {
    return new Error("Photo storage is missing. Run supabase/schema.sql in the Supabase SQL Editor.");
  }
  if (/row-level security|unauthorized|403/i.test(msg)) {
    return new Error("Storage refused the upload. Re-run supabase/schema.sql to restore the storage policies.");
  }
  return new Error(msg || "Upload failed.");
}

// Receive-form draft. On iPhone the page can reload while the camera is open;
// this keeps the photo with the form until it is saved.
const DRAFT_KEY = "vw.receive.photo";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export async function savePhotoDraft(photo: CapturedPhoto | null) {
  try {
    if (!photo) return sessionStorage.removeItem(DRAFT_KEY);
    const value = JSON.stringify({ full: await blobToDataUrl(photo.full), thumb: await blobToDataUrl(photo.thumb) });
    sessionStorage.setItem(DRAFT_KEY, value);
  } catch {
    /* storage full or blocked: the photo still lives in memory */
  }
}

export function loadPhotoDraft(): CapturedPhoto | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { full?: string; thumb?: string };
    const full = parsed.full ? dataUrlToBlob(parsed.full) : null;
    const thumb = parsed.thumb ? dataUrlToBlob(parsed.thumb) : null;
    return full && thumb ? { full, thumb } : null;
  } catch {
    return null;
  }
}
