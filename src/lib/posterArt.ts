import { CYAN, MONO, RED, SANS, fit, flames, loadLogo, qrCanvas, roundRect } from "@/lib/badgeArt";

/**
 * Letter-size wall posters (8.5×11 in at 200 dpi), full color, in the same
 * look as the crew badges: dark gradient, fine diagonal lines, a big Vans
 * flame in the background, the full-color logo, and a glowing white QR tile.
 *   blue: the app poster (like a crew badge)
 *   red:  the returns station poster (like an admin badge)
 */
type Tone = "blue" | "red";
type PosterInfo = {
  tone: Tone;
  /** Small line under "floorcast", top right. */
  kind: string;
  title: string;
  /** One or two short lines under the title. */
  lines: string[];
  payload: string;
  /** Printed under the QR (e.g. the web address), in case a camera won't scan. */
  caption?: string;
  tips?: string[];
};

const W = 1700;
const H = 2200;
const M = 110;

export async function renderPoster({ tone, kind, title, lines, payload, caption, tips = [] }: PosterInfo): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const QR = 900;
  const [img, qr] = await Promise.all([loadLogo(), qrCanvas(payload, QR)]);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the poster.");
  const red = tone === "red";
  const accent = red ? "#ff6b6e" : CYAN;
  const accentRgb = red ? "255,107,110" : "45,174,196";
  const [from, to] = red ? [RED, CYAN] : [CYAN, RED];

  // ---------------------------------------------------------------- background
  const bg = g.createLinearGradient(0, 0, W, H);
  const stops: Array<[number, string]> = red
    ? [[0, "#4a1014"], [0.42, "#1c0a0c"], [0.72, "#0b0a0c"], [1, "#0d2f36"]]
    : [[0, "#0d2f36"], [0.42, "#0a1316"], [0.75, "#0b0a0c"], [1, "#2a0c0f"]];
  for (const [at, col] of stops) bg.addColorStop(at, col);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.save();
  g.strokeStyle = "rgba(255,255,255,0.035)";
  g.lineWidth = 3;
  for (let x = -H; x < W; x += 30) {
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
    g.stroke();
  }
  g.restore();
  // A huge flame bleeding off the left edge, mostly behind the QR tile.
  flames(g, -330, 790, 1700, (p) => {
    g.fillStyle = `rgba(${accentRgb},0.08)`;
    g.fill(p);
    g.strokeStyle = `rgba(${accentRgb},0.26)`;
    g.lineWidth = 1.6;
    g.stroke(p);
  });

  // ---------------------------------------------------------------- header
  const logoH = 150;
  const logoW = (img.naturalWidth / img.naturalHeight) * logoH;
  g.drawImage(img, M, 110, logoW, logoH);
  g.textAlign = "right";
  g.textBaseline = "alphabetic";
  g.fillStyle = CYAN;
  g.font = `600 72px ${MONO}`;
  g.fillText("floorcast", W - M, 190);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = `500 38px ${MONO}`;
  g.fillText(kind, W - M, 248);
  const rule = g.createLinearGradient(M, 0, W - M, 0);
  rule.addColorStop(0, "rgba(0,0,0,0)");
  rule.addColorStop(0.18, from);
  rule.addColorStop(0.6, to);
  rule.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rule;
  g.fillRect(M, 320, W - M * 2, 7);

  // ---------------------------------------------------------------- title
  g.textAlign = "left";
  const size = fit(g, title, 800, 230, 120, W - M * 2);
  g.fillStyle = "#ffffff";
  g.fillText(title, M - 6, 400 + size * 0.86);
  g.font = `500 54px ${SANS}`;
  g.fillStyle = "rgba(255,255,255,0.75)";
  lines.slice(0, 2).forEach((line, i) => g.fillText(line, M, 700 + i * 70, W - M * 2));

  // ---------------------------------------------------------------- QR tile
  const tile = 1000;
  const tx = (W - tile) / 2;
  const ty = 850;
  g.save();
  g.shadowColor = `rgba(${accentRgb},0.75)`;
  g.shadowBlur = 90;
  g.fillStyle = "#ffffff";
  roundRect(g, tx, ty, tile, tile, 56);
  g.fill();
  g.restore();
  g.strokeStyle = accent;
  g.lineWidth = 10;
  roundRect(g, tx - 5, ty - 5, tile + 10, tile + 10, 61);
  g.stroke();
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, tx + (tile - QR) / 2, ty + (tile - QR) / 2, QR, QR);
  g.imageSmoothingEnabled = true;

  // ---------------------------------------------------------------- under the QR
  g.textAlign = "center";
  let y = ty + tile + 110;
  if (caption) {
    g.fillStyle = accent;
    g.font = `600 56px ${MONO}`;
    g.fillText(caption, W / 2, y, W - M * 2);
    y += 80;
  }
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.font = `500 40px ${MONO}`;
  for (const tip of tips.slice(0, 2)) {
    g.fillText(tip, W / 2, y, W - M * 2);
    y += 58;
  }

  const strip = g.createLinearGradient(0, 0, W, 0);
  strip.addColorStop(0, from);
  strip.addColorStop(1, to);
  g.fillStyle = strip;
  g.fillRect(0, H - 34, W, 34);

  return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the poster."))), "image/png"));
}

/** Posted in the warehouse; scanning it is how a return proves it started on site. */
export function renderStationPoster(payload: string): Promise<Blob> {
  return renderPoster({
    tone: "red",
    kind: "RETURN STATION",
    title: "RETURNS",
    lines: ["Floorcast → returns → Start a return,", "then scan this code."],
    payload,
    tips: ["Write the code the app gives you on the item."],
  });
}

/** Posted anywhere the crew needs the app: scanning it opens Floorcast. */
export function renderAppPoster(url: string): Promise<Blob> {
  return renderPoster({
    tone: "blue",
    kind: "WAREHOUSE APP",
    title: "FLOORCAST",
    lines: ["Scan with your phone camera", "to open the warehouse app."],
    payload: url,
    caption: url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    tips: ["iPhone: Share → Add to Home Screen", "Android: ⋮ menu → Add to Home screen"],
  });
}
