import { CYAN, MONO, RED, SANS, fit, flames, loadLogo, qrCanvas, roundRect, tinted, type BadgeStyle } from "@/lib/badgeArt";

/**
 * Crew badges, 3 × 4 in vertical, to fit Avery 5392 name badge inserts
 * (900×1200, 300 dpi): color or label (black and white). The "side rail"
 * design: a strip down the left with CREW / ADMIN on it, a solid flame
 * faintly behind the name, the name stacked big, clearance and ID bottom
 * left, and a small QR in corner brackets bottom right. Admin badges are
 * mostly red, with the blue and red accents swapped.
 * Drawn on a 750×1000 grid, then scaled up 1.2× to 300 dpi.
 *
 * "3x5" is the same badge at 3 × 5 in for printed plastic badges (Vistaprint),
 * with 0.132 in of bleed on every side: 979×1579 px.
 */
const W = 750;
const SCALE = 1.2;
export const BADGE_PX = { w: W * SCALE, h: 1000 * SCALE };
export type BadgeSize = "3x4" | "3x5";
/** Height and bleed on the 750-wide grid (250 per inch). */
const SIZES: Record<BadgeSize, { h: number; bleed: number }> = { "3x4": { h: 1000, bleed: 0 }, "3x5": { h: 1250, bleed: 33 } };

/** Text with letter spacing (canvas letterSpacing isn't everywhere yet). */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let at = x;
  for (const ch of text) {
    g.fillText(ch, at, y);
    at += g.measureText(ch).width + spacing;
  }
  return at - spacing - x;
}
function spacedWidth(g: CanvasRenderingContext2D, text: string, spacing: number) {
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + spacing;
  return w - spacing;
}

/** One badge as a canvas (for printing several on a sheet). */
export async function drawBadge(
  name: string,
  payload: string,
  style: BadgeStyle = "color",
  role: "crew" | "admin" = "crew",
  size: BadgeSize = "3x4",
): Promise<HTMLCanvasElement> {
  await document.fonts?.ready.catch(() => undefined);
  const QR = 190;
  const { h: H, bleed: B } = SIZES[size];
  const [img, qr] = await Promise.all([loadLogo(), qrCanvas(payload, Math.round(QR * SCALE))]);
  const c = document.createElement("canvas");
  c.width = Math.round((W + 2 * B) * SCALE);
  c.height = Math.round((H + 2 * B) * SCALE);
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the badge.");
  g.scale(SCALE, SCALE);
  // Everything below is laid out on the trimmed badge; the background and rail run on into the bleed.
  g.translate(B, B);
  const color = style === "color";
  const admin = role === "admin";
  const accent = color ? (admin ? "#ff6b6e" : CYAN) : "#000000";
  const accentRgb = admin ? "255,107,110" : "45,174,196";
  const ink = color ? "#ffffff" : "#000000";
  const soft = (a: number) => (color ? `rgba(255,255,255,${a})` : "#000000");
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const rest = parts.slice(1).join(" ");
  const id = payload.slice(-4);
  const RAIL = 115;
  const PAD = 50;
  const left = RAIL + PAD;
  const right = W - PAD;

  // ---------------------------------------------------------------- background + flame
  if (color) {
    // A CSS-style 150° gradient: from the top left toward the bottom right.
    const dx = 0.5;
    const dy = 0.866;
    const half = (W * dx + H * dy) / 2;
    const bg = g.createLinearGradient(W / 2 - dx * half, H / 2 - dy * half, W / 2 + dx * half, H / 2 + dy * half);
    const stops: Array<[number, string]> = admin
      ? [[0, "#4a1014"], [0.5, "#1c0a0c"], [1, "#0b0a0c"]]
      : [[0, "#0d2f36"], [0.5, "#0a1316"], [1, "#0b0a0c"]];
    for (const [at, col] of stops) bg.addColorStop(at, col);
    g.fillStyle = bg;
    g.fillRect(-B, -B, W + 2 * B, H + 2 * B);
    // A solid flame, faint, off the right edge behind the name.
    flames(g, 460, 130, 800, (p) => {
      g.fillStyle = `rgba(${accentRgb},0.13)`;
      g.fill(p);
    });
  } else {
    g.fillStyle = "#ffffff";
    g.fillRect(-B, -B, W + 2 * B, H + 2 * B);
  }

  // ---------------------------------------------------------------- the rail
  if (color) {
    const rail = g.createLinearGradient(0, 0, 0, H);
    if (admin) {
      rail.addColorStop(0, "#ff6b6e");
      rail.addColorStop(0.55, RED);
      rail.addColorStop(1, "#1f7f93");
    } else {
      rail.addColorStop(0, CYAN);
      rail.addColorStop(0.55, "#1f7f93");
      rail.addColorStop(1, RED);
    }
    g.fillStyle = rail;
  } else {
    g.fillStyle = "#000000";
  }
  g.fillRect(-B, -B, RAIL + B, H + 2 * B);
  // CREW / ADMIN reading up the rail.
  const tag = admin ? "ADMIN" : "CREW";
  g.save();
  g.translate(RAIL / 2, H / 2);
  g.rotate(-Math.PI / 2);
  g.font = `800 55px ${SANS}`;
  g.fillStyle = "#ffffff";
  g.textAlign = "left";
  g.textBaseline = "middle";
  const tagSpace = 55 * 0.32;
  spaced(g, tag, -spacedWidth(g, tag, tagSpace) / 2, 2, tagSpace);
  g.restore();

  // ---------------------------------------------------------------- header
  const logoH = 60;
  const logoW = (img.naturalWidth / img.naturalHeight) * logoH;
  const logo = color ? img : tinted(img, "#000000");
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.font = `600 22px ${MONO}`;
  g.fillStyle = accent;
  const fc = "FLOORCAST";
  if (size === "3x5") {
    // Printed 3 x 5 badges have a clip slot punched centered near the top
    // (about x 296 to 452, y 51 to 84 on this grid). The logo and FLOORCAST
    // flank it on the same line, each the same distance from the slot.
    const slotL = 296;
    const slotR = 452;
    const midY = 67.5;
    const gap = 30;
    const h = 50;
    const w = (img.naturalWidth / img.naturalHeight) * h;
    g.drawImage(logo, slotL - gap - w, midY - h / 2, w, h);
    spaced(g, fc, slotR + gap, midY, 2.6);
  } else {
    g.drawImage(logo, left, 50, logoW, logoH);
    spaced(g, fc, right - spacedWidth(g, fc, 2.6), 50 + logoH / 2, 2.6);
  }

  // ---------------------------------------------------------------- name
  g.textBaseline = "alphabetic";
  g.font = `500 20px ${MONO}`;
  g.fillStyle = soft(0.5);
  // On a taller badge the name sits a little lower, so the space reads as balanced.
  const drop = (H - 1000) * 0.4;
  spaced(g, "OPERATOR", left, 228 + drop, 3.6);
  // First name, then the rest, each shrunk to fit the width.
  const nameW = right - left;
  const s1 = fit(g, first, 800, 95, 40, nameW);
  const s2 = rest ? fit(g, rest, 800, 95, 40, nameW) : s1;
  const px = Math.min(s1, s2);
  g.font = `800 ${px}px ${SANS}`;
  const y1 = 250 + drop + px * 0.86;
  g.fillStyle = ink;
  g.fillText(first, left, y1);
  let below = y1;
  if (rest) {
    below = y1 + px + 10;
    g.fillStyle = soft(0.7);
    g.fillText(rest, left, below);
  }
  g.fillStyle = accent;
  g.fillRect(left, below + px * 0.14 + 35, 100, 7.5);

  // ---------------------------------------------------------------- QR in corner brackets
  const box = QR + 35;
  const bx = right - 15 - box;
  const by = H - 45 - box;
  g.fillStyle = "#ffffff";
  roundRect(g, bx + 17.5, by + 17.5, QR, QR, 10);
  g.fill();
  if (!color) {
    g.strokeStyle = "#000000";
    g.lineWidth = 2;
    g.stroke();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(qr, bx + 17.5, by + 17.5, QR, QR);
  g.imageSmoothingEnabled = true;
  g.strokeStyle = accent;
  g.lineWidth = 5;
  g.lineCap = "square";
  const arm = 27.5;
  const e = 2.5; // half the line width, so the brackets sit inside the box
  for (const [cx, cy, sx, sy] of [
    [bx + e, by + e, 1, 1],
    [bx + box - e, by + e, -1, 1],
    [bx + e, by + box - e, 1, -1],
    [bx + box - e, by + box - e, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(cx, cy + sy * arm);
    g.lineTo(cx, cy);
    g.lineTo(cx + sx * arm, cy);
    g.stroke();
  }

  // ---------------------------------------------------------------- clearance + ID
  const label = (text: string, y: number) => {
    g.font = `500 17.5px ${MONO}`;
    g.fillStyle = soft(0.45);
    spaced(g, text, left, y, 3.2);
  };
  const bottom = H - 45 - 4;
  label("ID", bottom - 32);
  g.font = `600 27.5px ${MONO}`;
  g.fillStyle = ink;
  g.fillText(`···${id}`, left, bottom);
  label("CLEARANCE", bottom - 32 - 60);
  g.font = `700 27.5px ${MONO}`;
  g.fillStyle = accent;
  g.fillText(admin ? "FULL ACCESS" : "CHECK-OUT", left, bottom - 60);
  return c;
}

const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the badge."))), "image/png"));

export async function renderBadgeTall(
  name: string,
  payload: string,
  style: BadgeStyle = "color",
  role: "crew" | "admin" = "crew",
  size: BadgeSize = "3x4",
): Promise<Blob> {
  return toPng(await drawBadge(name, payload, style, role, size));
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
