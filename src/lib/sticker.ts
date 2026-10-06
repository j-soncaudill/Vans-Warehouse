import QRCode from "qrcode";
import { BARCODES_BUCKET, sb } from "@/lib/supabase";

const PAPER = "#ffffff";
const INK = "#000000";

export function stickerPath(code: string) {
  return `${code}.png`;
}

/**
 * 4×3 label (800×600). Job name across the top, a large QR code on the left
 * (about 74% of the height, so a phone reads it from arm's length), and the
 * code, received date and shop name on the right. No 1D barcode.
 */
export type StickerInfo = { code: string; jobName: string; receivedAt?: string | null };

const SANS = "'Geist Sans', -apple-system, 'Segoe UI', Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, Menlo, Consolas, monospace";

export async function renderSticker({ code, jobName, receivedAt }: StickerInfo): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const W = 800;
  const H = 600;
  const PAD = 36;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Could not draw the sticker.");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 46px ${SANS}`;
  ctx.fillText(jobName.slice(0, 48), PAD, 76, W - PAD * 2);
  ctx.fillRect(PAD, 96, W - PAD * 2, 4);

  // High error correction so a scuffed or creased label still scans.
  const QR = 444;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, code, {
    width: QR,
    margin: 2,
    color: { dark: INK, light: PAPER },
    errorCorrectionLevel: "Q",
  });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, PAD - 12, 120, QR, QR);

  const colX = PAD + QR + 8;
  const colW = W - PAD - colX;
  ctx.font = `700 40px ${MONO}`;
  ctx.fillText(code, colX, 190, colW);

  ctx.font = `500 22px ${SANS}`;
  ctx.fillText("Received", colX, 262, colW);
  ctx.font = `700 28px ${SANS}`;
  const day = receivedAt ? new Date(receivedAt) : new Date();
  ctx.fillText(day.toLocaleDateString(), colX, 298, colW);

  ctx.textAlign = "right";
  ctx.font = `700 22px ${SANS}`;
  ctx.fillText("VAN'S WAREHOUSE", W - PAD, H - 40);

  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the sticker."))), "image/png"),
  );
}

export async function uploadSticker(info: StickerInfo): Promise<string | null> {
  const code = info.code;
  try {
    const blob = await renderSticker(info);
    const path = stickerPath(code);
    const { error } = await sb()
      .storage.from(BARCODES_BUCKET)
      .upload(path, blob, { upsert: true, contentType: "image/png", cacheControl: "60" });
    return error ? null : path;
  } catch {
    return null;
  }
}

/** Share sheet on phones (Save Image / Print), download elsewhere. */
export async function saveSticker(info: StickerInfo): Promise<"shared" | "downloaded" | "cancelled"> {
  const { code, jobName } = info;
  const blob = await renderSticker(info);
  const file = new File([blob], `${code}.png`, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${jobName} ${code}` });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, `${code}.png`);
  return "downloaded";
}

/** Prints only the sticker, sized to a 4×3 in label. */
export async function printSticker(info: StickerInfo): Promise<void> {
  const code = info.code;
  const blob = await renderSticker(info);
  const url = URL.createObjectURL(blob);
  const host = document.createElement("div");
  host.id = "print-sticker";
  const img = new Image();
  img.alt = code;
  img.src = url;
  host.appendChild(img);
  document.body.appendChild(host);
  await img.decode().catch(() => undefined);
  const cleanup = () => {
    host.remove();
    URL.revokeObjectURL(url);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Some mobile browsers never fire afterprint.
  window.setTimeout(cleanup, 60_000);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Letter-size poster for the returns station (1275×1650, 150 dpi). Posted in
 * the warehouse; scanning it is how a return proves it started on site.
 */
export async function renderStationPoster(payload: string): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const W = 1275;
  const H = 1650;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Could not draw the poster.");
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = `700 150px ${SANS}`;
  ctx.fillText("RETURNS", W / 2, 230);
  ctx.font = `500 46px ${SANS}`;
  ctx.fillText("Open the app → returns → Start a return", W / 2, 320, W - 120);
  ctx.fillText("then scan this code.", W / 2, 380, W - 120);

  const QR = 900;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, payload, { width: QR, margin: 2, color: { dark: INK, light: PAPER }, errorCorrectionLevel: "M" });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (W - QR) / 2, 440, QR, QR);

  ctx.font = `500 40px ${SANS}`;
  ctx.fillText("Write the code the app gives you on the item.", W / 2, 1430, W - 120);
  ctx.fillRect(120, 1490, W - 240, 4);
  ctx.font = `700 34px ${SANS}`;
  ctx.fillText("VAN'S WAREHOUSE · RETURN STATION", W / 2, 1560, W - 120);
  return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the poster."))), "image/png"));
}
