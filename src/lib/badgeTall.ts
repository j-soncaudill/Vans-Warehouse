import { CYAN, MONO, RED, fit, flames, loadLogo, qrCanvas, roundRect, type BadgeStyle } from "@/lib/badgeArt";

/**
 * Vertical crew badges for 2½ × 3¾ in badge holders (750×1125, 300 dpi).
 * Same look as the 4×3 badges: color (dark gradient, big background flame,
 * glowing QR tile) or label (black and white for the thermal printer).
 * Admin badges are mostly red, with the blue and red accents swapped.
 */
const W = 750;
const H = 1125;
const M = 48;

export async function renderBadgeTall(name: string, payload: string, style: BadgeStyle = "color", role: "crew" | "admin" = "crew"): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const QR = 470;
  const [img, qr] = await Promise.all([loadLogo(), qrCanvas(payload, QR)]);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("Could not draw the badge.");
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
  let logoImg: CanvasImageSource = img;
  if (!color) {
    const t = document.createElement("canvas");
    t.width = img.naturalWidth;
    t.height = img.naturalHeight;
    const tg = t.getContext("2d")!;
    tg.drawImage(img, 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = "#ffffff";
    tg.fillRect(0, 0, t.width, t.height);
    logoImg = t;
  }
  g.drawImage(logoImg, M, 40, logoW, logoH);
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
  const tag = admin ? "ADMIN" : "CREW";
  g.textAlign = "left";
  g.font = `700 24px ${MONO}`;
  const tw = g.measureText(tag).width;
  if (color) {
    roundRect(g, M, 186, tw + 32, 46, 10);
    g.fillStyle = admin ? "#2a080a" : "#0c1c20";
    g.fill();
    g.fillStyle = `rgba(${accentRgb},0.16)`;
    g.fill();
    g.strokeStyle = accent;
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = accent;
    g.fillText(tag, M + 16, 218);
  } else if (admin) {
    roundRect(g, M, 186, tw + 72, 46, 10);
    g.fillStyle = "#000000";
    g.fill();
    flames(g, M + 10, 192, 34, (p) => {
      g.fillStyle = "#ffffff";
      g.fill(p);
    });
    g.fillStyle = "#ffffff";
    g.fillText(tag, M + 50, 218);
  } else {
    flames(g, M, 190, 40, (p) => {
      g.fillStyle = "#000000";
      g.fill(p);
    });
    g.fillStyle = "#000000";
    g.fillText(tag, M + 38, 220);
  }

  const firstSize = fit(g, first, 800, 118, 54, W - M * 2);
  g.fillStyle = color ? "#ffffff" : "#000000";
  let y = 250 + firstSize * 0.86;
  g.fillText(first, M - 3, y);
  if (rest) {
    const restSize = fit(g, rest, 700, 52, 28, W - M * 2);
    y += restSize * 1.12;
    g.fillStyle = color ? "rgba(255,255,255,0.72)" : "#000000";
    g.fillText(rest, M, y);
  }

  // ---------------------------------------------------------------- QR tile
  const tile = 520;
  const tx = (W - tile) / 2;
  const ty = 470;
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
    g.fillText("scan at the check-out station", W / 2, 1040);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.font = `500 17px ${MONO}`;
    g.fillText(`ID ···${id}`, W / 2, 1072);
    const strip = g.createLinearGradient(0, 0, W, 0);
    strip.addColorStop(0, from);
    strip.addColorStop(1, to);
    g.fillStyle = strip;
    g.fillRect(0, H - 18, W, 18);
  } else {
    g.fillStyle = "#000000";
    g.fillRect(0, H - 90, W, 90);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.font = `600 21px ${MONO}`;
    g.fillText("SCAN AT THE CHECK-OUT STATION", W / 2, H - 50);
    g.font = `500 17px ${MONO}`;
    g.fillText(`ID ${id}`, W / 2, H - 22);
  }

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not save the badge."))), "image/png"));
}
