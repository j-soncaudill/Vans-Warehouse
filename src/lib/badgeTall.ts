import { CYAN, MONO, RED, fit, flames, loadLogo, qrCanvas, roundRect, tinted, type BadgeStyle } from "@/lib/badgeArt";

/**
 * Crew badges, 3 × 4 in vertical, to fit Avery 5392 name badge inserts
 * (900×1200, 300 dpi): color (dark gradient, big background flame, glowing
 * QR tile) or label (black and white). Admin badges are mostly red, with
 * the blue and red accents swapped.
 * Drawn on a 750×1000 grid, then scaled up 1.2× to 300 dpi.
 */
const W = 750;
const H = 1000;
const M = 48;
const SCALE = 1.2;
export const BADGE_PX = { w: W * SCALE, h: H * SCALE };

/** One badge as a canvas (for printing several on a sheet). */
export async function drawBadge(name: string, payload: string, style: BadgeStyle = "color", role: "crew" | "admin" = "crew"): Promise<HTMLCanvasElement> {
  await document.fonts?.ready.catch(() => undefined);
  const QR = 400;
  const [img, qr] = await Promise.all([loadLogo(), qrCanvas(payload, Math.round(QR * SCALE))]);
  const c = document.createElement("canvas");
  c.width = BADGE_PX.w;
  c.height = BADGE_PX.h;
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the badge.");
  g.scale(SCALE, SCALE);
  const color = style === "color";
  const admin = role === "admin";
  const accent = admin ? (color ? "#ff6b6e" : RED) : CYAN;
  const accentRgb = admin ? "255,107,110" : "45,174,196";
  const [from, to] = admin ? [RED, CYAN] : [CYAN, RED];
  const parts = name.trim().split(/\s+/);
  const first = (parts[0] ?? "").toUpperCase();
  const rest = parts.slice(1).join(" ").toUpperCase();
  const id = payload.slice(-4);

  // ---------------------------------------------------------------- background
  if (color) {
    const bg = g.createLinearGradient(0, 0, W, H);
    const stops: Array<[number, string]> = admin
      ? [[0, "#4a1014"], [0.42, "#1c0a0c"], [0.72, "#0b0a0c"], [1, "#0d2f36"]]
      : [[0, "#0d2f36"], [0.42, "#0a1316"], [0.75, "#0b0a0c"], [1, "#2a0c0f"]];
    for (const [at, col] of stops) bg.addColorStop(at, col);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 2;
    for (let x = -H; x < W; x += 20) {
      g.beginPath();
      g.moveTo(x, H);
      g.lineTo(x + H, 0);
      g.stroke();
    }
    g.restore();
    // A big flame bleeding off the left edge, behind the name.
    flames(g, -150, 150, 760, (p) => {
      g.fillStyle = `rgba(${accentRgb},0.08)`;
      g.fill(p);
      g.strokeStyle = `rgba(${accentRgb},0.26)`;
      g.lineWidth = 2.4;
      g.stroke(p);
    });
  } else {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
  }

  // ---------------------------------------------------------------- header
  const headH = 150;
  if (!color) {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, W, headH);
  }
  const logoH = 74;
  const logoW = (img.naturalWidth / img.naturalHeight) * logoH;
  g.drawImage(color ? img : tinted(img, "#ffffff"), M, 40, logoW, logoH);
  g.textAlign = "right";
  g.textBaseline = "alphabetic";
  g.fillStyle = color ? CYAN : "#ffffff";
  g.font = `600 34px ${MONO}`;
  g.fillText("floorcast", W - M, 78);
  g.fillStyle = color ? "rgba(255,255,255,0.55)" : "#ffffff";
  g.font = `500 19px ${MONO}`;
  g.fillText(admin ? "ADMIN BADGE" : "CHECK-OUT BADGE", W - M, 108);
  if (color) {
    const rule = g.createLinearGradient(M, 0, W - M, 0);
    rule.addColorStop(0, "rgba(0,0,0,0)");
    rule.addColorStop(0.18, from);
    rule.addColorStop(0.6, to);
    rule.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rule;
    g.fillRect(M, headH, W - M * 2, 4);
  }

  // ---------------------------------------------------------------- tag + name
  // Both centered: the CREW / ADMIN tag, then first and last name on one line.
  const tag = admin ? "ADMIN" : "CREW";
  g.textAlign = "left";
  g.font = `700 24px ${MONO}`;
  const tw = g.measureText(tag).width;
  const tagTop = 192;
  if (color) {
    const pw = tw + 32;
    const px = (W - pw) / 2;
    roundRect(g, px, tagTop, pw, 46, 10);
    g.fillStyle = admin ? "#2a080a" : "#0c1c20";
    g.fill();
    g.fillStyle = `rgba(${accentRgb},0.16)`;
    g.fill();
    g.strokeStyle = accent;
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = accent;
    g.fillText(tag, px + 16, tagTop + 32);
  } else {
    // Black & white: a small flame beside the word; admin gets a solid black pill.
    const pw = tw + (admin ? 72 : 44);
    const px = (W - pw) / 2;
    if (admin) {
      roundRect(g, px, tagTop, pw, 46, 10);
      g.fillStyle = "#000000";
      g.fill();
    }
    const ink = admin ? "#ffffff" : "#000000";
    flames(g, px + (admin ? 10 : 0), tagTop + 6, 34, (p) => {
      g.fillStyle = ink;
      g.fill(p);
    });
    g.fillStyle = ink;
    g.fillText(tag, px + (admin ? 50 : 40), tagTop + 32);
  }

  // One line, shrunk to fit; the last name a shade lighter on the color badge.
  const gap = rest ? " " : "";
  const size = fit(g, `${first}${gap}${rest}`, 800, 92, 34, W - M * 2);
  const wFirst = g.measureText(`${first}${gap}`).width;
  const wAll = g.measureText(`${first}${gap}${rest}`).width;
  const nx = (W - wAll) / 2;
  const ny = 352 + size * 0.36;
  g.fillStyle = color ? "#ffffff" : "#000000";
  g.fillText(first, nx, ny);
  if (rest) {
    g.fillStyle = color ? "rgba(255,255,255,0.72)" : "#000000";
    g.fillText(rest, nx + wFirst, ny);
  }

  // ---------------------------------------------------------------- QR tile
  const tile = 440;
  const tx = (W - tile) / 2;
  const ty = 452;
  g.save();
  if (color) {
    g.shadowColor = `rgba(${accentRgb},0.75)`;
    g.shadowBlur = 44;
  }
  g.fillStyle = "#ffffff";
  roundRect(g, tx, ty, tile, tile, 30);
  g.fill();
  g.restore();
  g.strokeStyle = color ? accent : "#000000";
  g.lineWidth = color ? 6 : 7;
  roundRect(g, tx - (color ? 3 : 0), ty - (color ? 3 : 0), tile + (color ? 6 : 0), tile + (color ? 6 : 0), color ? 33 : 30);
  g.stroke();
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, tx + (tile - QR) / 2, ty + (tile - QR) / 2, QR, QR);
  g.imageSmoothingEnabled = true;

  // ---------------------------------------------------------------- footer
  if (color) {
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.font = `500 21px ${MONO}`;
    g.fillText("scan at the check-out station", W / 2, 928);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.font = `500 17px ${MONO}`;
    g.fillText(`ID ···${id}`, W / 2, 958);
    const strip = g.createLinearGradient(0, 0, W, 0);
    strip.addColorStop(0, from);
    strip.addColorStop(1, to);
    g.fillStyle = strip;
    g.fillRect(0, H - 16, W, 16);
  } else {
    g.fillStyle = "#000000";
    g.fillRect(0, H - 82, W, 82);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = `600 21px ${MONO}`;
    g.fillText("SCAN AT THE CHECK-OUT STATION", W / 2, H - 46);
    g.font = `500 17px ${MONO}`;
    g.fillText(`ID ${id}`, W / 2, H - 20);
  }
  return c;
}

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the badge."))), "image/png"));

export async function renderBadgeTall(name: string, payload: string, style: BadgeStyle = "color", role: "crew" | "admin" = "crew"): Promise<Blob> {
  return toPng(await drawBadge(name, payload, style, role));
}

// ------------------------------------------------------------------ Avery 5392 sheet
/**
 * Avery 5392: letter sheet, six 4 × 3 in inserts, 2 across and 3 down,
 * ¼ in side margins and 1 in top margin. A vertical 3 × 4 badge is turned
 * a quarter turn to fit each spot; it comes out upright once torn out.
 * Spots are numbered 1–6, left to right, top to bottom.
 */
const DPI = 300;
const SHEET = { w: 8.5 * DPI, h: 11 * DPI };
export const AVERY_SPOTS = 6;
const spot = (i: number) => ({ x: 0.25 * DPI + (i % 2) * 4 * DPI, y: 1 * DPI + Math.floor(i / 2) * 3 * DPI, w: 4 * DPI, h: 3 * DPI });

function sheet() {
  const c = document.createElement("canvas");
  c.width = SHEET.w;
  c.height = SHEET.h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, c.width, c.height);
  return { c, g };
}

/** A full letter page with each badge in its spot (spot numbers 1–6). */
export async function renderAverySheet(items: Array<{ badge: HTMLCanvasElement; spot: number }>): Promise<Blob> {
  const { c, g } = sheet();
  for (const { badge, spot: n } of items) {
    const s = spot(n - 1);
    g.save();
    // Quarter turn: the badge's top edge lands on the spot's left edge.
    g.translate(s.x, s.y + s.h);
    g.rotate(-Math.PI / 2);
    g.drawImage(badge, 0, 0, s.h, s.w);
    g.restore();
  }
  return toPng(c);
}

/** Plain-paper test: the six spots outlined and numbered, to hold against a real sheet. */
export async function renderAveryTest(): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const { c, g } = sheet();
  g.strokeStyle = "#000000";
  g.lineWidth = 4;
  g.setLineDash([24, 14]);
  g.fillStyle = "#000000";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < AVERY_SPOTS; i++) {
    const s = spot(i);
    g.strokeRect(s.x, s.y, s.w, s.h);
    g.font = `700 180px ${MONO}`;
    g.fillText(String(i + 1), s.x + s.w / 2, s.y + s.h / 2);
  }
  g.font = `600 42px ${MONO}`;
  g.fillText("Avery 5392 alignment test · print on plain paper at 100%", SHEET.w / 2, 0.5 * DPI);
  g.fillText("Hold it against an Avery sheet: the dashed boxes should match the perforations.", SHEET.w / 2, 10.5 * DPI);
  return toPng(c);
}
