import QRCode from "qrcode";
import logoUrl from "@/assets/vans-logo.png";
import { FLAMES } from "@/lib/brand";

/**
 * Drawing pieces shared by the crew badges (badgeTall.ts) and the posters
 * (posterArt.ts): fonts, brand colors, the logo, the flame mark, the QR code.
 *   color: the app's dark look, the full-color Vans logo, a glowing QR tile.
 *   label: black and white only.
 * The QR is always dark on white so every scanner reads it.
 */
export type BadgeStyle = "color" | "label";

export const SANS = "'Geist Sans', -apple-system, 'Segoe UI', Arial, sans-serif";
export const MONO = "'Geist Mono', ui-monospace, Menlo, Consolas, monospace";
export const CYAN = "#2daec4";
export const RED = "#c52c2e";

let logo: Promise<HTMLImageElement> | null = null;
export function loadLogo() {
  logo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the logo."));
    img.src = logoUrl;
  });
  return logo;
}

/** The logo as one flat color (white on the black header of the label badge). */
export function tinted(img: HTMLImageElement, color: string) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Largest bold size (down to min) at which text fits the width. */
export function fit(g: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family = SANS) {
  let size = max;
  for (; size > min; size -= 2) {
    g.font = `${weight} ${size}px ${family}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${weight} ${size}px ${family}`;
  return size;
}

export function flames(g: CanvasRenderingContext2D, x: number, y: number, height: number, draw: (p: Path2D) => void) {
  const k = height / 290;
  g.save();
  g.translate(x + 6 * k, y + 4 * k);
  g.scale(k, k);
  for (const d of FLAMES) draw(new Path2D(d));
  g.restore();
}

export async function qrCanvas(payload: string, size: number) {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, payload, { width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "Q" });
  return c;
}
