import QRCode from "qrcode";
import logoUrl from "@/assets/vans-logo.png";
import { FLAMES } from "@/lib/brand";

/**
 * Crew badges, 4×3 in landscape (1200×900, 300 dpi).
 *   color: the app's dark look, the full-color Vans logo, a glowing QR tile.
 *          For a color printer on cardstock, in a 4×3 badge holder.
 *   label: black and white only, for the Brother thermal label printer.
 * The QR is always dark on white so every scanner reads it.
 * Admin badges swap the blue accents for Vans red and say ADMIN.
 */
export type BadgeStyle = "color" | "label";

const W = 1200;
const H = 900;
const M = 64;
const SANS = "'Geist Sans', -apple-system, 'Segoe UI', Arial, sans-serif";
const MONO = "'Geist Mono', ui-monospace, Menlo, Consolas, monospace";
const CYAN = "#2daec4";
const RED = "#c52c2e";

let logo: Promise<HTMLImageElement> | null = null;
function loadLogo() {
  logo ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the logo."));
    img.src = logoUrl;
  });
  return logo;
}

/** The logo as one flat color (white on the black header of the label badge). */
function tinted(img: HTMLImageElement, color: string) {
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

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Largest bold size (down to min) at which text fits the width. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family = SANS) {
  let size = max;
  for (; size > min; size -= 2) {
    g.font = `${weight} ${size}px ${family}`;
    if (g.measureText(text).width <= width) break;
  }
  g.font = `${weight} ${size}px ${family}`;
  return size;
}

function flames(g: CanvasRenderingContext2D, x: number, y: number, height: number, draw: (p: Path2D) => void) {
  const k = height / 290;
  g.save();
  g.translate(x + 6 * k, y + 4 * k);
  g.scale(k, k);
  for (const d of FLAMES) draw(new Path2D(d));
  g.restore();
}

/** First name big, everything after it on a second line. */
function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

async function qrCanvas(payload: string, size: number) {
  const c = document.createElement("canvas");
  await QRCode.toCanvas(c, payload, { width: size, margin: 1, color: { dark: "#000000", light: "#ffffff" }, errorCorrectionLevel: "Q" });
  return c;
}

export async function renderBadge(name: string, payload: string, style: BadgeStyle = "color", role: "crew" | "admin" = "crew"): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const [img, qr] = await Promise.all([loadLogo(), qrCanvas(payload, 420)]);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the badge.");
  const id = payload.slice(-4);
  const [first, rest] = splitName(name);
  const color = style === "color";
  const ink = color ? "#ffffff" : "#000000";
  const admin = role === "admin";
  /** Crew badges glow blue, admin badges glow red. */
  const accent = admin ? RED : CYAN;
  const accentRgb = admin ? "197,44,46" : "45,174,196";

  // ---------------------------------------------------------------- background
  if (color) {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0d2f36");
    bg.addColorStop(0.42, "#0a1316");
    bg.addColorStop(0.75, "#0b0a0c");
    bg.addColorStop(1, "#2a0c0f");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // Fine diagonal lines, like a security card.
    g.save();
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 2;
    for (let x = -H; x < W; x += 22) {
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
      g.stroke();
    }
    g.restore();
    // A huge flame mark bleeding off the left edge, behind the name.
    flames(g, -170, 210, 820, (p) => {
      g.fillStyle = `rgba(${accentRgb},0.08)`;
      g.fill(p);
      g.strokeStyle = `rgba(${accentRgb},0.26)`;
      g.lineWidth = 2.2;
      g.stroke(p);
    });
  } else {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- header
  const headH = 176;
  if (!color) {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, W, headH);
  }
  const logoH = 96;
  const logoW = (img.naturalWidth / img.naturalHeight) * logoH;
  g.drawImage(color ? img : tinted(img, "#ffffff"), M, (headH - logoH) / 2 + 4, logoW, logoH);
  g.textAlign = "right";
  g.textBaseline = "alphabetic";
  g.fillStyle = color ? CYAN : "#ffffff";
  g.font = `600 40px ${MONO}`;
  g.fillText("floorcast", W - M, 92);
  g.fillStyle = color ? "rgba(255,255,255,0.55)" : "#ffffff";
  g.font = `500 24px ${MONO}`;
  g.fillText(admin ? "ADMIN BADGE" : "CHECK-OUT BADGE", W - M, 130);
  if (color) {
    const rule = g.createLinearGradient(M, 0, W - M, 0);
    rule.addColorStop(0, "rgba(45,174,196,0)");
    rule.addColorStop(0.18, CYAN);
    rule.addColorStop(0.6, RED);
    rule.addColorStop(1, "rgba(197,44,46,0)");
    g.fillStyle = rule;
    g.fillRect(M, headH, W - M * 2, 5);
  }

  // ---------------------------------------------------------------- QR tile
  const tile = 476;
  const tx = W - M - tile;
  const ty = 246;
  g.save();
  if (color) {
    g.shadowColor = `rgba(${accentRgb},0.75)`;
    g.shadowBlur = 48;
  }
  g.fillStyle = "#ffffff";
  roundRect(g, tx, ty, tile, tile, 30);
  g.fill();
  g.restore();
  if (color) {
    g.strokeStyle = accent;
    g.lineWidth = 6;
    roundRect(g, tx - 3, ty - 3, tile + 6, tile + 6, 33);
    g.stroke();
  } else {
    g.strokeStyle = "#000000";
    g.lineWidth = 8;
    roundRect(g, tx, ty, tile, tile, 30);
    g.stroke();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, tx + (tile - 420) / 2, ty + (tile - 420) / 2, 420, 420);
  g.imageSmoothingEnabled = true;

  // ---------------------------------------------------------------- name
  const colW = tx - M - 48;
  g.textAlign = "left";
  // Small flame + "CREW" / "ADMIN" tag above the name. On the black & white
  // admin badge the tag is a solid black pill so it reads at a glance.
  const tag = admin ? "ADMIN" : "CREW";
  g.font = `700 30px ${MONO}`;
  if (admin && !color) {
    const tw = g.measureText(tag).width;
    g.fillStyle = "#000000";
    roundRect(g, M - 8, 256, tw + 82, 62, 12);
    g.fill();
    flames(g, M + 4, 264, 46, (p) => {
      g.fillStyle = "#ffffff";
      g.fill(p);
    });
    g.fillStyle = "#ffffff";
    g.fillText(tag, M + 54, 300);
  } else {
    flames(g, M, 262, 54, (p) => {
      g.fillStyle = color ? accent : "#000000";
      g.fill(p);
    });
    g.fillStyle = color ? accent : "#000000";
    g.fillText(tag, M + 50, 302);
  }

  const firstSize = fit(g, first.toUpperCase(), 800, 168, 64, colW);
  g.fillStyle = ink;
  g.fillText(first.toUpperCase(), M - 4, 330 + firstSize * 0.86);
  let y = 330 + firstSize * 0.86;
  if (rest) {
    const restSize = fit(g, rest.toUpperCase(), 700, 72, 34, colW);
    y += restSize * 1.15;
    g.fillStyle = color ? "rgba(255,255,255,0.72)" : "#000000";
    g.fillText(rest.toUpperCase(), M, y);
  }

  // ---------------------------------------------------------------- footer
  if (color) {
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.font = `500 26px ${MONO}`;
    g.fillText("scan at the check-out station", M, H - 104);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.font = `500 22px ${MONO}`;
    g.fillText(`ID ···${id}`, M, H - 66);
    const strip = g.createLinearGradient(0, 0, W, 0);
    strip.addColorStop(0, CYAN);
    strip.addColorStop(1, RED);
    g.fillStyle = strip;
    g.fillRect(0, H - 22, W, 22);
  } else {
    g.fillStyle = "#000000";
    g.fillRect(0, H - 96, W, 96);
    g.fillStyle = "#ffffff";
    g.font = `600 28px ${MONO}`;
    g.fillText("SCAN AT THE CHECK-OUT STATION", M, H - 38);
    g.textAlign = "right";
    g.font = `500 24px ${MONO}`;
    g.fillText(`ID ${id}`, W - M, H - 38);
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the badge."))), "image/png"));
}
