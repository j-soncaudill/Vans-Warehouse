// Renders the home-screen icons into public/ (run once after changing the look:
// `node scripts/make-icons.mjs`). Uses the Playwright Chromium already installed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logo = `data:image/png;base64,${readFileSync(path.join(root, "src/assets/vans-logo.png")).toString("base64")}`;

const page = (size, pad) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;position:relative;overflow:hidden;
  background:linear-gradient(160deg,#0b262c 0%,#07141a 34%,#0a0a0c 60%,#2a0c0f 100%)">
  <img src="${logo}" style="position:absolute;left:${pad}%;right:${pad}%;width:${100 - 2 * pad}%;top:42%;transform:translateY(-50%)">
  <div style="position:absolute;left:${pad}%;right:${pad}%;top:66%;height:${Math.max(2, size / 90)}px;border-radius:99px;
    background:linear-gradient(90deg,rgba(45,174,196,0),#2daec4 30%,#c52c2e 75%,rgba(197,44,46,0))"></div>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();
// Android masks icons to a circle or squircle, so keep the mark inside the safe zone.
for (const [file, size, pad] of [
  ["icon-512.png", 512, 16],
  ["icon-192.png", 192, 16],
  ["apple-touch-icon.png", 180, 12],
  ["favicon.png", 64, 8],
]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(page(size, pad));
  await p.waitForLoadState("load");
  await p.screenshot({ path: path.join(root, "public", file), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✓ public/${file}`);
}
await browser.close();
