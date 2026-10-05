// Packs dist/ into dist.zip (files at the top level, ready for a Cloudflare
// Pages direct upload) after a few safety checks.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { loadEnv } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const REQUIRED = ["index.html", "app.js", "app.css", "_redirects"];
const files = readdirSync(dist);

const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

for (const f of REQUIRED) if (!files.includes(f)) fail(`dist/${f} is missing.`);
if (readFileSync(path.join(dist, "_redirects"), "utf8") !== "/*    /index.html    200\n") fail("dist/_redirects is not the SPA rule.");

const js = readFileSync(path.join(dist, "app.js"), "utf8");
const html = readFileSync(path.join(dist, "index.html"), "utf8");
const all = js + html + readFileSync(path.join(dist, "app.css"), "utf8");

// Never ship a service-role key.
for (const jwt of all.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) ?? []) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    if (payload.role && payload.role !== "anon") fail(`Bundle contains a "${payload.role}" key. Use the anon key only.`);
  } catch {
    /* not a JWT */
  }
}
if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(all)) fail("Bundle contains a Supabase secret key. Use the anon / publishable key only.");

// The PIN ships as a hash only.
const env = loadEnv("production", root, "");
const pin = (env.VITE_SHOP_PIN ?? "").trim();
if (pin && pin.length >= 4 && all.includes(pin)) fail("The plain shop PIN ended up in the bundle.");
if (/skid\s*mark/i.test(all) || /["'`]SM-/.test(all)) fail("Old brand text found in the bundle.");
if (!/\/app\.js/.test(html)) fail("index.html does not load /app.js.");

const zip = new JSZip();
for (const f of files) zip.file(f, readFileSync(path.join(dist, f)));
const out = path.join(root, "dist.zip");
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" }));
console.log(`✓ dist.zip: ${files.join(", ")}`);
