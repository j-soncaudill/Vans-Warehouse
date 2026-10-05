import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { BARCODES_BUCKET, sb } from "@/lib/supabase";

const PAPER = "#ffffff";
const INK = "#000000";

export function stickerPath(code: string) {
  return `${code}.png`;
}

/** 4×3 label at 203 dpi-ish (800×600). Job name, Code 128, QR, footer. */
export type StickerInfo = { code: string; jobName: string; receivedAt?: string | null };

export async function renderSticker({ code, jobName, receivedAt }: StickerInfo): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const W = 800;
  const H = 600;
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
  ctx.font = "700 54px 'Archivo Narrow', 'Arial Narrow', Arial, sans-serif";
  ctx.fillText(jobName.slice(0, 40), 36, 84, W - 72);
  ctx.fillRect(36, 104, W - 72, 4);

  const bar = document.createElement("canvas");
  JsBarcode(bar, code, {
    format: "CODE128",
    displayValue: false,
    height: 150,
    width: 3,
    margin: 0,
    background: PAPER,
    lineColor: INK,
  });
  const barW = Math.min(W - 72 - 220, bar.width);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bar, 36, 140, barW, 150);

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, code, {
    width: 200,
    margin: 0,
    color: { dark: INK, light: PAPER },
    errorCorrectionLevel: "M",
  });
  ctx.drawImage(qr, W - 36 - 200, 128, 200, 200);

  ctx.font = "700 64px 'JetBrains Mono', ui-monospace, Menlo, monospace";
  ctx.fillText(code, 36, 400, W - 72);

  ctx.font = "600 26px Archivo, Arial, sans-serif";
  const day = receivedAt ? new Date(receivedAt) : new Date();
  ctx.fillText(`Received ${day.toLocaleDateString()}`, 36, 470);
  ctx.textAlign = "right";
  ctx.fillText("VAN'S WAREHOUSE", W - 36, 560);

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
