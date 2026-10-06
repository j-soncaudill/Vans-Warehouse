// Folds dist-demo/ into one self-contained HTML page (CSS + JS inline) for a
// shareable preview. The demo build has no Supabase keys and a fixed PIN.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "dist-demo");
const css = readFileSync(path.join(dir, "app.css"), "utf8");
const js = readFileSync(path.join(dir, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const env = loadEnv("production", root, "");
const leaks = [env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, env.VITE_SHOP_PIN].filter((v) => v && v.length > 5);
if (/eyJ[\w-]+\.eyJ[\w-]+\./.test(js) || leaks.some((v) => js.includes(v))) {
  console.error("✗ demo bundle references a real Supabase project");
  process.exit(1);
}
const html = `<title>Floorcast Demo</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
writeFileSync(path.join(dir, "vans-warehouse-demo.html"), html);
console.log(`✓ dist-demo/vans-warehouse-demo.html (${(html.length / 1e6).toFixed(2)} MB)`);
