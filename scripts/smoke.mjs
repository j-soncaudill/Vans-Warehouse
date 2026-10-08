// End-to-end smoke test of the built dist/ against an in-memory fake of
// Supabase REST + Storage. No real project is touched.
//   npm run build && npm run smoke
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import QRCode from "qrcode";
import { chromium } from "playwright";
import { loadEnv } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = path.join(root, "test-results");
mkdirSync(shots, { recursive: true });
const env = loadEnv("production", root, "");
const PIN = env.VITE_SHOP_PIN;
const PORT = 4321;

// ------------------------------------------------------------ fake supabase
let nextId = 1;
const rows = [];
const moves = [];
const returnsRows = [];
const TABLES = { packages: rows, package_moves: moves, returns: returnsRows };
const BY_CODE = new Set(["packages", "returns"]);
const STATION_TOKEN = "smoke-station-token";
const files = new Map(); // "bucket/path" -> { body, type }
// Admin alert calls the phones make (database functions and the daily-alerts job).
const alertCalls = [];
const ALERTS_PUBLIC_KEY = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
// Starts as a database without update 003, so the app has to ask for it.
let legacyColumn = false;

function filterRows(url, list = rows) {
  let out = list;
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) out = out.filter((r) => String(r[k]) === decodeURIComponent(m[1]));
  }
  return out;
}

function newRow(table, item) {
  const now = new Date().toISOString();
  if (table === "package_moves") return { id: nextId++, from_location: null, moved_by: null, moved_at: now, ...item };
  if (table === "returns") {
    return {
      id: nextId++, status: "open", returned_by: null, vendor: null, job_name: null, notes: null, photo_path: null, thumb_path: null,
      created_at: now, updated_at: now, closed_at: null, closed_by: null, close_note: null, ...item,
    };
  }
  return {
    id: nextId++, po_number: null, vendor: null, delivered_by: null, received_by: null, pm: null,
    packing_slip_received: null, quantities: null, damaged: null, color_tag: null, notes: null,
    status: "on_floor", received_at: now, checked_out_to: null, checked_out_at: null,
    barcode_path: null, photo_path: null, thumb_path: null, last_location: null, location_at: null,
    legacy: false, created_at: now, updated_at: now, ...item,
  };
}

async function rest(route, req, url) {
  const table = url.pathname.split("/").pop();
  const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
  const reply = (data, status = 200) => {
    if (single) {
      if (data.length !== 1) return route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "no rows" }) });
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data[0]) });
    }
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  };
  if (url.pathname.includes("/rpc/")) {
    alertCalls.push({ fn: table, args: JSON.parse(req.postData() ?? "{}") });
    return route.fulfill({ status: 204, body: "" });
  }
  if (table === "settings") {
    const all = [{ key: "return_station_token", value: STATION_TOKEN }, { key: "alerts_public_key", value: ALERTS_PUBLIC_KEY }];
    return reply(filterRows(url, all));
  }
  const list = TABLES[table];
  if (!list) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST205", message: "no table" }) });
  const method = req.method();
  const now = () => new Date().toISOString();
  if (method === "GET" || method === "HEAD") {
    if (table === "packages" && !legacyColumn && /\blegacy\b/.test(url.searchParams.get("select") ?? "")) {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "42703", message: "column packages.legacy does not exist" }) });
    }
    let out = [...filterRows(url, list)];
    const [col, dir] = (url.searchParams.get("order") ?? "").split(",")[0].split(".");
    if (col) out.sort((a, b) => (String(a[col] ?? "") > String(b[col] ?? "") ? 1 : -1) * (dir === "desc" ? -1 : 1));
    return reply(out);
  }
  if (method === "POST") {
    const body = JSON.parse(req.postData() ?? "{}");
    const items = Array.isArray(body) ? body : [body];
    const made = [];
    for (const item of items) {
      const existing = BY_CODE.has(table) ? list.find((r) => r.code === item.code) : undefined;
      if (existing && !url.searchParams.get("on_conflict")) {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505", message: "duplicate key" }) });
      }
      if (existing) {
        Object.assign(existing, item, { updated_at: now() });
        made.push(existing);
      } else {
        const row = newRow(table, item);
        list.push(row);
        made.push(row);
      }
    }
    return reply(made, 201);
  }
  if (method === "PATCH") {
    const body = JSON.parse(req.postData() ?? "{}");
    const hit = filterRows(url, list);
    for (const r of hit) Object.assign(r, body, table === "package_moves" ? {} : { updated_at: now() });
    return reply(hit);
  }
  if (method === "DELETE") {
    const hit = filterRows(url, list);
    for (const r of hit) {
      list.splice(list.indexOf(r), 1);
      if (table === "packages") for (const m of moves.filter((x) => x.package_code === r.code)) moves.splice(moves.indexOf(m), 1);
    }
    return reply(hit);
  }
  return route.fulfill({ status: 405 });
}

async function storage(route, req, url) {
  const p = decodeURIComponent(url.pathname.replace(/^.*\/storage\/v1\//, ""));
  const method = req.method();
  const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  let m;
  if ((m = /^object\/list\/([^/]+)$/.exec(p)) && method === "POST") {
    const { prefix = "" } = JSON.parse(req.postData() ?? "{}");
    const bucket = m[1];
    const names = [...files.keys()]
      .filter((k) => k.startsWith(`${bucket}/`))
      .map((k) => k.slice(bucket.length + 1))
      .filter((k) => (prefix ? k.startsWith(`${prefix}/`) : true))
      .map((k) => (prefix ? k.slice(prefix.length + 1) : k));
    return json(names.map((name) => ({ name, id: name, metadata: {} })));
  }
  if ((m = /^object\/([^/]+)$/.exec(p)) && method === "DELETE") {
    const { prefixes = [] } = JSON.parse(req.postData() ?? "{}");
    for (const k of prefixes) files.delete(`${m[1]}/${k}`);
    return json(prefixes.map((name) => ({ name })));
  }
  if ((m = /^object\/(?:public\/|authenticated\/)?(.+)$/.exec(p))) {
    const key = m[1];
    if (method === "POST" || method === "PUT") {
      files.set(key, { body: req.postDataBuffer(), type: req.headers()["content-type"] ?? "application/octet-stream" });
      return json({ Key: key, Id: key });
    }
    if (method === "GET") {
      const f = files.get(key);
      if (!f) return json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
      let body = f.body;
      // supabase-js uploads Blobs as multipart form data; unwrap the part.
      if (/multipart\/form-data/.test(f.type)) {
        const s = body.toString("latin1");
        const start = s.indexOf("\r\n\r\n", s.indexOf("Content-Type")) + 4;
        const end = s.lastIndexOf("\r\n--");
        body = Buffer.from(s.slice(start, end), "latin1");
      }
      return route.fulfill({ status: 200, body, contentType: key.endsWith(".png") ? "image/png" : "image/jpeg" });
    }
  }
  return json({ message: `unhandled ${method} ${p}` }, 400);
}

// ------------------------------------------------------------ run
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"], { cwd: root, stdio: "pipe" });
await new Promise((resolve) => {
  server.stdout.on("data", (d) => String(d).includes(String(PORT)) && resolve());
  setTimeout(resolve, 5000);
});

// The fake camera shows a QR sticker for SCAN_CODE, so the live scanner has
// something real to decode (needs ffmpeg; falls back to Chrome's test pattern).
const SCAN_CODE = "AB-778899";
const fakeVideo = path.join(shots, "fake-camera.y4m");
// A second camera that sees the returns station poster.
const stationVideo = path.join(shots, "fake-station.y4m");
let liveQr = false;
try {
  mkdirSync(shots, { recursive: true });
  const png = path.join(shots, "fake-camera.png");
  await QRCode.toFile(png, SCAN_CODE, { width: 480, margin: 6, errorCorrectionLevel: "Q" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-vf", "pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "1", "-r", "10", fakeVideo]);
  const stationPng = path.join(shots, "fake-station.png");
  await QRCode.toFile(stationPng, `VW-RETURN-STATION:${STATION_TOKEN}`, { width: 480, margin: 6, errorCorrectionLevel: "M" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", stationPng, "-vf", "pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "1", "-r", "10", stationVideo]);
  liveQr = true;
} catch {
  /* no ffmpeg */
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...(liveQr ? [`--use-file-for-fake-video-capture=${fakeVideo}`] : [])],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"], acceptDownloads: true });
// Headless Chromium has no push service; stand one in so the app can subscribe.
const fakePush = ({ permission = "default", ua } = {}) => {
  const perm = { value: permission };
  const key = "__fakePushSub";
  const make = (endpoint) => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } }),
    unsubscribe: async () => (localStorage.removeItem(key), true),
  });
  Object.defineProperty(Notification, "permission", { get: () => perm.value });
  Notification.requestPermission = async () => (perm.value = perm.value === "default" ? "granted" : perm.value);
  PushManager.prototype.subscribe = async function () {
    localStorage.setItem(key, "https://push.example/phone-1");
    return make("https://push.example/phone-1");
  };
  PushManager.prototype.getSubscription = async function () {
    const ep = localStorage.getItem(key);
    return ep ? make(ep) : null;
  };
  if (ua) Object.defineProperty(navigator, "userAgent", { get: () => ua });
};
await ctx.addInitScript(fakePush);
await ctx.route(/\/functions\/v1\/daily-alerts/, (route, req) => {
  alertCalls.push({ fn: "daily-alerts", args: JSON.parse(req.postData() ?? "{}") });
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, sent: 1 }) });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await ctx.route(/\/rest\/v1\//, (route, req) => rest(route, req, new URL(req.url())));
await ctx.route(/\/storage\/v1\//, (route, req) => storage(route, req, new URL(req.url())));
const sockets = [];
/** Simulates another phone writing a row: Postgres change pushed over realtime. */
function pushChange(type, record) {
  for (const { ws, topic } of sockets) {
    ws.send(JSON.stringify([null, null, topic, "postgres_changes", {
      ids: [1],
      data: { type, schema: "public", table: "packages", commit_timestamp: new Date().toISOString(), record, old_record: {}, columns: [], errors: null },
    }]));
  }
}
await ctx.routeWebSocket(/\/realtime\/v1\//, (ws) => {
  // Phoenix serializer v2: [join_ref, ref, topic, event, payload]
  ws.onMessage((msg) => {
    const [joinRef, ref, topic, event, payload] = JSON.parse(String(msg));
    if (event === "phx_join") {
      const changes = (payload?.config?.postgres_changes ?? []).map((c, i) => ({ ...c, id: i + 1 }));
      ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: changes } }]));
      if (changes.length) sockets.push({ ws, topic });
    } else if (event === "heartbeat" || event === "access_token") {
      ws.send(JSON.stringify([null, ref, topic, "phx_reply", { status: "ok", response: {} }]));
    }
  });
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log("ok");
};
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const expect = async (locator, what) => {
  await locator.first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {
    throw new Error(`not visible: ${what}`);
  });
};

let mintedCode = "";
let locCode = "";
let retCode = "";
try {
  await step("Missing legacy column: the app asks for update 003 only", async () => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.getByText("One database update"), "update screen");
    await expect(page.getByText(/adds legacy boxes/), "names what it adds");
    await page.getByRole("button", { name: "Show SQL" }).click();
    const sql = await page.locator("textarea").inputValue();
    if (!sql.includes("add column if not exists legacy")) throw new Error("update SQL is not 003");
    if (sql.includes("create table if not exists public.returns")) throw new Error("update SQL repeats 002");
    await shot("00a-update-003");
    legacyColumn = true;
    await page.getByRole("button", { name: /check again/ }).click();
    await expect(page.getByText("Who's using this phone?"), "app opens once updated");
  });

  await step("PIN gate rejects wrong PIN, accepts right one", async () => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.getByText("Who's using this phone?"), "role chooser");
    await shot("00-role");
    await page.getByRole("button", { name: /Administrator/ }).click();
    await expect(page.getByText("Shop PIN"), "pin screen");
    await shot("01-pin");
    await page.fill("#pin", "000");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Wrong PIN."), "wrong pin");
    await page.fill("#pin", PIN);
    await page.getByRole("button", { name: "Unlock" }).click();
    // Right after an admin unlock: offer the daily alerts.
    await expect(page.getByText("Get a morning alert when things are waiting?"), "alerts prompt");
    await shot("01b-alerts-prompt");
    await page.getByRole("button", { name: "Allow alerts" }).click();
    await expect(page.getByText("Alerts are on for this phone."), "alerts on");
    const sub = alertCalls.find((c) => c.fn === "alerts_subscribe");
    if (!sub || sub.args.p_endpoint !== "https://push.example/phone-1" || !/^[0-9a-f]{64}$/.test(sub.args.p_pin_hash)) throw new Error(`subscribe call wrong: ${JSON.stringify(sub)}`);
    if (!alertCalls.some((c) => c.fn === "alerts_prune" && c.args.p_pin_hash === sub.args.p_pin_hash)) throw new Error("old-PIN phones were not pruned");
    await expect(page.getByText("Floor is empty"), "empty floor");
    await expect(page.getByText("live", { exact: true }), "realtime live");
    await shot("02-floor-empty");
    if ((await page.locator("header").innerText()).toLowerCase().indexOf("floorcast") < 0) throw new Error("header does not say floorcast");
    if ((await page.title()) !== "Floorcast") throw new Error(`title is ${await page.title()}`);
  });

  await step("Receive with new VW- code, all fields, in-app photo", async () => {
    await page.getByRole("link", { name: "receive", exact: true }).click();
    await page.fill("#f-job", "Maple St Remodel");
    await page.fill("#f-po", "PO-4471");
    await page.selectOption("#f-vendor", "Ferguson");
    await page.fill("#f-delivered", "UPS");
    await page.fill("#f-received", "Dana");
    await page.fill("#f-pm", "Rick");
    await page.fill("#f-qty", "2 cartons, 14 pcs");
    await page.locator("#f-slip").getByRole("radio", { name: "Yes", exact: true }).click();
    await page.locator("#f-damage").getByRole("radio", { name: "No", exact: true }).click();
    await page.getByRole("radio", { name: "Blue" }).click();
    await page.fill("#f-notes", "Keep dry");
    const order = await page.evaluate(() => ["#f-qty", "#f-location", "#f-notes"].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1));
    if (!(order[0] < order[1] && order[1] < order[2])) throw new Error(`location not between quantities and notes: ${order}`);
    await shot("03-receive-form");
    await page.getByRole("button", { name: "Open camera" }).click();
    await page.getByRole("button", { name: "Take photo", exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await shot("04-photo-camera");
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await page.getByRole("button", { name: "Use photo", exact: true }).click();
    await expect(page.getByRole("img", { name: "Box photo" }), "photo preview");
    await page.getByRole("button", { name: "Photo of packing slip" }).click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await expect(page.getByText("Packing slip photo").first(), "slip camera title");
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await page.getByRole("button", { name: "Use photo", exact: true }).click();
    await expect(page.getByRole("img", { name: "Packing slip photo" }), "slip preview");
    await page.getByRole("button", { name: "Receive to floor" }).click();
    await expect(page.getByText("On the floor"), "receive done");
    mintedCode = rows[0].code;
    if (!/^VW-[A-Z0-9]{6}$/.test(mintedCode)) throw new Error(`bad code ${mintedCode}`);
    const r = rows[0];
    if (!r.photo_path || !r.thumb_path || !r.barcode_path) throw new Error(`files missing ${JSON.stringify(r)}`);
    if (r.packing_slip_received !== true || r.damaged !== false || r.color_tag !== "Blue" || r.vendor !== "Ferguson") throw new Error("fields wrong");
    if (!files.has(`package-photos/${r.photo_path}`) || !files.has(`barcodes/${r.barcode_path}`)) throw new Error("storage missing");
    if (!/^slips\//.test(r.slip_photo_path ?? "") || !files.has(`package-photos/${r.slip_photo_path}`)) throw new Error(`slip photo missing: ${r.slip_photo_path}`);
    if (r.photo_path.startsWith("slips/")) throw new Error("box photo stored with slips");
    await page.waitForTimeout(400);
    await shot("05-received-sticker");
  });

  await step("Floor list shows thumbnail; thumbnail opens full photo", async () => {
    await page.getByRole("link", { name: "floor", exact: true }).click();
    await expect(page.getByText("Maple St Remodel"), "row");
    await page.waitForTimeout(300);
    await shot("06-floor-list");
    await page.getByRole("button", { name: "Open photo of Maple St Remodel" }).click();
    await expect(page.getByRole("dialog").getByRole("img"), "full photo");
    const src = await page.getByRole("dialog").getByRole("img").getAttribute("src");
    if (!src.includes(rows[0].photo_path)) throw new Error("viewer did not load full photo");
    await shot("07-photo-viewer");
    await page.getByRole("button", { name: "Close" }).click();
  });

  await step("Entry: check out asks who, return puts it back", async () => {
    await page.getByRole("link", { name: /Maple St Remodel/ }).click();
    await expect(page.getByRole("button", { name: "Check out" }), "detail");
    await shot("08-entry");
    if (await page.locator(".vw-comet").count()) throw new Error("zipping light still on the page");
    await page.getByRole("button", { name: "back", exact: true }).click();
    await expect(page.getByText("Maple St Remodel"), "back to list");
    await page.getByRole("link", { name: /Maple St Remodel/ }).click();
    await expect(page.getByRole("button", { name: "Check out" }), "detail again");
    await page.getByRole("button", { name: "Check out" }).click();
    await page.fill("#taken-by", "Truck 3");
    await shot("09-checkout");
    await page.getByRole("dialog").getByRole("button", { name: "Check out" }).click();
    await expect(page.getByText(/Checked out · Truck 3/), "checked out banner");
    await expect(page.getByText("Taken from Warehouse"), "taken from on entry");
    if (await page.getByRole("button", { name: /Retake photo/ }).count()) throw new Error("retake allowed after checkout");
    await page.getByRole("link", { name: "out", exact: true }).click();
    await expect(page.getByText("taken from Warehouse · by Truck 3"), "out list");
    await shot("10-out-list");
    await page.getByRole("link", { name: /Maple St Remodel/ }).click();
    await page.getByRole("button", { name: "Return to floor" }).click();
    await expect(page.getByText("On the floor", { exact: true }), "returned");
  });

  await step("Edit details and retake photo while on floor", async () => {
    const oldPhoto = rows[0].photo_path;
    await page.getByRole("button", { name: "Edit details" }).click();
    await page.fill("#f-job", "Maple St Remodel – Phase 2");
    if ((await page.inputValue("#f-vendor")) !== "Ferguson") throw new Error("edit did not preselect Ferguson");
    await page.selectOption("#f-vendor", "__other__");
    await page.fill("#f-vendor-other", "Graybar");
    await shot("08b-vendor-other");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("heading", { name: "Maple St Remodel – Phase 2" }), "edited");
    if (rows[0].vendor !== "Graybar") throw new Error(`vendor saved as ${rows[0].vendor}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    if ((await page.inputValue("#f-vendor")) !== "__other__" || (await page.inputValue("#f-vendor-other")) !== "Graybar") throw new Error("Other vendor not restored in edit");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Retake photo" }).click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await page.getByRole("button", { name: "Use photo", exact: true }).click();
    await expect(page.getByText("Photo saved."), "retake saved");
    if (rows[0].photo_path === oldPhoto) throw new Error("photo path unchanged");
    if (files.has(`package-photos/${oldPhoto}`)) throw new Error("old photo not cleaned up");
    if (!files.has(`package-photos/${rows[0].slip_photo_path}`)) throw new Error("retaking the box photo deleted the slip photo");
    const oldSlip = rows[0].slip_photo_path;
    await page.getByRole("button", { name: "Open packing slip photo" }).click();
    await expect(page.getByRole("dialog").getByRole("img"), "slip full size");
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Replace slip photo" }).click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await page.getByRole("button", { name: "Take photo", exact: true }).click();
    await page.getByRole("button", { name: "Use photo", exact: true }).click();
    await expect(page.getByText("Slip photo saved."), "slip replaced");
    if (rows[0].slip_photo_path === oldSlip || files.has(`package-photos/${oldSlip}`)) throw new Error("slip photo not replaced cleanly");
    if (!files.has(`package-photos/${rows[0].photo_path}`)) throw new Error("replacing the slip deleted the box photo");
  });

  await step("Scan page: typed unknown code goes to Receive with that code", async () => {
    await page.getByRole("link", { name: "scan", exact: true }).click();
    await page.fill("#scan-code", "ab-778899");
    await page.getByRole("button", { name: "Look up" }).click();
    await expect(page.getByRole("radio", { name: "Code on the box" }), "receive existing");
    if ((await page.inputValue("#existing-code")) !== "AB-778899") throw new Error("code not carried over");
    await page.fill("#f-job", "Oak Ave");
    await page.getByRole("button", { name: "Receive to floor" }).click();
    await expect(page.getByText("On the floor"), "received existing");
    if (!rows.find((r) => r.code === "AB-778899")) throw new Error("existing code not saved");
  });

  await step("Wedge scanner burst on the floor opens the entry", async () => {
    await page.getByRole("link", { name: "floor", exact: true }).click();
    await expect(page.getByText("Oak Ave"), "list");
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.type(mintedCode, { delay: 10 });
    await page.keyboard.press("Enter");
    await page.waitForURL(`**/p/${mintedCode}`);
  });

  await step("Scanner camera fills the screen and reads a live QR code", async () => {
    await page.getByRole("link", { name: "scan", exact: true }).click();
    // html5-qrcode sets the region to position:relative, which once collapsed
    // it to 0px tall (black camera on iPhone). Record the region's size while
    // the scanner is open; with the fake QR feed the scan finishes quickly.
    await page.evaluate(() => {
      window.__regionBox = { w: 0, h: 0 };
      window.__regionPoll = setInterval(() => {
        const el = document.getElementById("vw-scan-region");
        if (!el?.querySelector("video")) return;
        const r = el.getBoundingClientRect();
        window.__regionBox = { w: Math.max(window.__regionBox.w, r.width), h: Math.max(window.__regionBox.h, r.height) };
      }, 10);
    });
    await page.getByRole("button", { name: /open camera/i }).click();
    if (liveQr) {
      await page.waitForURL(`**/p/${SCAN_CODE}`, { timeout: 15000 });
    } else {
      await page.waitForFunction(() => document.querySelector("#vw-scan-region video")?.readyState >= 2);
      await shot("12b-scanner");
    }
    const box = await page.evaluate(() => (clearInterval(window.__regionPoll), window.__regionBox));
    const vp = page.viewportSize();
    if (box.h < vp.height * 0.4 || box.w < vp.width * 0.9) throw new Error(`scanner area too small: ${JSON.stringify(box)}`);
    if (!liveQr) await page.getByRole("button", { name: /close/i }).click();
  });

  await step("Realtime: a box received on another phone appears without reload", async () => {
    await page.getByRole("link", { name: "floor", exact: true }).click();
    await expect(page.getByText("Oak Ave"), "list");
    const t = new Date().toISOString();
    const row = {
      id: nextId++, code: "VW-OTHER1", job_name: "From another phone", po_number: null, vendor: null, delivered_by: null,
      received_by: null, pm: null, packing_slip_received: null, quantities: null, damaged: true, color_tag: "Red", notes: null,
      status: "on_floor", received_at: t, checked_out_to: null, checked_out_at: null, barcode_path: null, photo_path: null,
      thumb_path: null, created_at: t, updated_at: t,
    };
    rows.push(row);
    pushChange("INSERT", row);
    await expect(page.getByText("From another phone"), "realtime row");
    await shot("13-floor-realtime");
    rows.splice(rows.indexOf(row), 1);
    pushChange("DELETE", row);
    await page.getByText("From another phone").waitFor({ state: "detached", timeout: 8000 });
  });

  let backup;
  await step("Receive: location defaults to Warehouse; Other needs text", async () => {
    await page.getByRole("link", { name: "receive", exact: true }).click();
    await page.fill("#f-job", "Loc Test");
    const wh = page.locator("#f-location").getByRole("radio", { name: "Warehouse" });
    if ((await wh.getAttribute("aria-checked")) !== "true") throw new Error("Warehouse not preselected");
    await page.locator("#f-location").getByRole("radio", { name: "other" }).click();
    const go = page.getByRole("button", { name: "Receive to floor" });
    if (!(await go.isDisabled())) throw new Error("receive allowed with an empty Other location");
    await page.fill("#f-location-other", "Trailer 7");
    await shot("14-location-other");
    await go.click();
    await expect(page.getByText("On the floor"), "received with location");
    const r = rows.find((x) => x.job_name === "Loc Test");
    if (!r || r.last_location !== "Trailer 7" || !r.location_at) throw new Error(`location not saved: ${JSON.stringify(r)}`);
    locCode = r.code;
    const m = moves.filter((x) => x.package_code === locCode);
    if (m.length !== 1 || m[0].to_location !== "Trailer 7" || m[0].from_location !== null) throw new Error(`first move wrong: ${JSON.stringify(m)}`);
  });

  await step("Move records the new location and its history", async () => {
    await page.goto(`http://localhost:${PORT}/p/${locCode}`);
    await expect(page.getByText("Trailer 7"), "location card");
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.locator("#move-to").getByRole("radio", { name: "Conex 2" }).click();
    const save = page.getByRole("button", { name: "Save location" });
    if (!(await save.isDisabled())) throw new Error("move allowed without a name");
    await page.fill("#moved-by", "Luis");
    await shot("15-move-sheet");
    await save.click();
    await expect(page.getByText("Marked at Conex 2."), "moved toast");
    const hist = page.getByRole("region", { name: "Location history" });
    await expect(hist.getByText("Trailer 7"), "history from");
    await expect(hist.getByText(/Luis/), "history by");
    const m = moves.filter((x) => x.package_code === locCode);
    if (m.length !== 2 || m[1].from_location !== "Trailer 7" || m[1].to_location !== "Conex 2" || m[1].moved_by !== "Luis") throw new Error(`move history wrong: ${JSON.stringify(m)}`);
    if (rows.find((x) => x.code === locCode).last_location !== "Conex 2") throw new Error("last_location not updated");
    await shot("16-location-history");
  });

  await step("Floor filters by location; search finds the place", async () => {
    await page.getByRole("link", { name: "floor", exact: true }).click();
    await page.getByRole("group", { name: "Filter by location" }).getByRole("button", { name: /conex 2/i }).click();
    await expect(page.getByText("Loc Test"), "filtered row");
    if (await page.getByText("Oak Ave").count()) throw new Error("location filter let other rows through");
    await page.getByRole("group", { name: "Filter by location" }).getByRole("button", { name: /conex 2/i }).click();
    await page.fill('input[aria-label="Search"]', "conex 2");
    await expect(page.getByText("Loc Test"), "search by place");
    if (await page.getByText("Oak Ave").count()) throw new Error("place search let other rows through");
    await shot("17-floor-locations");
  });

  let legacyCode = "";
  await step("Legacy box: quick entry with an arrival month, filter, badge", async () => {
    await page.getByRole("link", { name: "receive", exact: true }).click();
    await page.locator("#f-legacy").click();
    if ((await page.locator("#f-legacy").getAttribute("aria-checked")) !== "true") throw new Error("legacy switch did not turn on");
    if (await page.locator("#f-po").isVisible()) throw new Error("extra fields should fold away for legacy");
    await page.fill("#f-legacy-month", "2025-03");
    await page.fill("#f-job", "Old copper");
    await page.locator("#f-location").getByRole("radio", { name: "Conex 3" }).click();
    await shot("17a-legacy-receive");
    await page.getByRole("button", { name: "Receive to floor" }).click();
    await expect(page.getByText("put this sticker on the box"), "legacy received");
    const r = rows.find((x) => x.job_name === "Old copper");
    if (!r || r.legacy !== true || !String(r.received_at).startsWith("2025-03-15")) throw new Error(`legacy row wrong: ${JSON.stringify(r)}`);
    legacyCode = r.code;
    await page.getByRole("button", { name: "Receive another" }).click();
    if ((await page.locator("#f-legacy").getAttribute("aria-checked")) !== "true") throw new Error("Receive another dropped legacy");
    if ((await page.inputValue("#f-legacy-month")) !== "2025-03") throw new Error("Receive another dropped the month");
    if ((await page.locator("#f-location").getByRole("radio", { name: "Conex 3" }).getAttribute("aria-checked")) !== "true") throw new Error("Receive another dropped the place");
    await page.locator("#f-legacy").click();
    if (!(await page.locator("#f-po").isVisible())) throw new Error("fields did not come back with legacy off");
    await page.getByRole("link", { name: "floor", exact: true }).click();
    const chip = page.getByRole("button", { name: "Legacy only, 1" });
    await expect(chip, "legacy chip with count");
    await chip.click();
    await expect(page.getByText("Old copper"), "legacy row");
    if (await page.getByText("Oak Ave").count()) throw new Error("legacy filter let other rows through");
    await expect(page.locator("main").getByText("legacy", { exact: true }), "legacy badge on row");
    await shot("17b-legacy-filter");
    await page.getByRole("link", { name: /Old copper/ }).click();
    await expect(page.getByText(/~Mar 2025/), "approximate date on entry");
    await shot("17c-legacy-entry");
  });

  await step("Batch check-out from the floor list skips a box another phone took", async () => {
    await page.getByRole("link", { name: "floor", exact: true }).click();
    await page.getByRole("button", { name: "select", exact: true }).click();
    await page.getByRole("checkbox", { name: /Select Old copper/ }).click();
    await page.getByRole("checkbox", { name: /Select Loc Test/ }).click();
    await expect(page.getByRole("button", { name: "Check out 2 boxes" }), "batch bar");
    await shot("17d-batch-select");
    await page.getByRole("button", { name: "Check out 2 boxes" }).click();
    await page.fill("#batch-by", "Crew 2");
    // Meanwhile another phone takes Loc Test.
    const taken = rows.find((x) => x.code === locCode);
    Object.assign(taken, { status: "checked_out", checked_out_to: "Truck 7", checked_out_at: new Date().toISOString() });
    await page.getByRole("dialog").getByRole("button", { name: "Check out 2 boxes" }).click();
    await expect(page.getByText("1 box checked out, 1 skipped"), "batch result");
    await expect(page.getByText(/already out to Truck 7/), "skip reason");
    await shot("17e-batch-result");
    if (rows.find((x) => x.code === legacyCode)?.checked_out_to !== "Crew 2") throw new Error("batch did not check out the legacy box");
    if (taken.checked_out_to !== "Truck 7") throw new Error("batch overwrote another phone's check out");
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).last().click();
    await page.getByRole("button", { name: "select", exact: true }).waitFor();
  });

  await step("Scan several: camera and typed codes build a list, then one check out", async () => {
    await page.goto(`http://localhost:${PORT}/scan/batch`);
    if (liveQr) {
      await expect(page.getByText(/Added Oak Ave/), "camera read added a box");
      await shot("17f-batch-scanning");
      await page.getByRole("button", { name: /^Done · 1$/ }).click();
    } else {
      await page.getByRole("button", { name: "Close" }).click();
      await page.fill("#batch-code", "AB-778899");
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }
    await page.fill("#batch-code", locCode);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(/already out to Truck 7/), "already-out note");
    await page.fill("#batch-code", "ZZ-000000");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("ZZ-000000 is not in the warehouse."), "unknown note");
    await expect(page.getByRole("button", { name: "Remove AB-778899 from the list" }), "listed");
    await page.getByRole("button", { name: "Check out 1 box" }).click();
    await page.fill("#batch-by", "Crew 3");
    await page.getByRole("dialog").getByRole("button", { name: "Check out 1 box" }).click();
    await page.waitForURL("**/out");
    if (rows.find((x) => x.code === "AB-778899")?.checked_out_to !== "Crew 3") throw new Error("scan-several check out not saved");
  });

  await step("Reports: longest on floor, out by job, old open returns", async () => {
    const old = new Date(Date.now() - 20 * 86_400_000).toISOString();
    returnsRows.push(newRow("returns", { code: "VVR-0420", type: "vendor", returned_by: "Sam", vendor: "Etna", created_at: old }));
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page.getByRole("heading", { name: "Longest on the floor" }), "floor section");
    await expect(page.getByText("Crew 2").first(), "checked out group shows who");
    await expect(page.getByText("VVR-0420"), "old return listed at 14 days");
    await shot("17g-reports");
    await page.fill("#return-days", "30");
    await page.getByText("VVR-0420").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "7", exact: true }).click();
    await expect(page.getByText("VVR-0420"), "back at 7 days");
    returnsRows.splice(returnsRows.findIndex((r) => r.code === "VVR-0420"), 1);
  });

  await step("Returns: a QR that isn't the station is rejected", async () => {
    await page.getByRole("link", { name: "returns", exact: true }).click();
    await page.getByRole("link", { name: "Start a return" }).click();
    if (liveQr) {
      await expect(page.getByText("That's not the returns station code"), "wrong QR rejected");
      if (returnsRows.length) throw new Error("a return was created from the wrong QR");
    }
  });

  await step("Returns: station QR, pick type, get a VRS-#### code", async () => {
    if (liveQr) {
      const b2 = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
        args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${stationVideo}`],
      });
      try {
        const c2 = await b2.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"] });
        await c2.route(/\/rest\/v1\//, (route, req) => rest(route, req, new URL(req.url())));
        await c2.route(/\/storage\/v1\//, (route, req) => storage(route, req, new URL(req.url())));
        await c2.routeWebSocket(/\/realtime\/v1\//, () => undefined);
        const p2 = await c2.newPage();
        p2.on("pageerror", (e) => errors.push(String(e)));
        await p2.goto(`http://localhost:${PORT}/`);
        // A Field phone can start a return, no PIN.
        await p2.getByRole("button", { name: /Field/ }).click();
        await p2.getByRole("link", { name: "returns", exact: true }).click();
        await p2.getByRole("link", { name: "Start a return" }).click();
        await p2.getByText("What kind of return?").first().waitFor({ timeout: 15000 });
        const stock = p2.getByRole("button", { name: /Return to stock/ });
        if (!(await stock.isDisabled())) throw new Error("return type allowed before a name");
        await p2.fill("#r-who", "Marco");
        await p2.screenshot({ path: path.join(shots, "18-return-types.png") });
        await stock.click();
        await p2.getByText("Write this on the item").first().waitFor();
        await p2.waitForTimeout(900);
        await p2.screenshot({ path: path.join(shots, "19-return-code.png") });
        const made = returnsRows[returnsRows.length - 1];
        if (!made || !/^VRS-\d{4}$/.test(made.code) || made.type !== "stock" || made.status !== "open") throw new Error(`return wrong: ${JSON.stringify(made)}`);
        if (made.returned_by !== "Marco") throw new Error("name not saved with the new code");
        retCode = made.code;
        await p2.getByLabel(retCode).first().waitFor();
        for (const gone of ["Open this return", "Save details"]) {
          if (await p2.getByText(gone).count()) throw new Error(`"${gone}" should be gone`);
        }
        await p2.fill("#r-vendor", "Ferguson");
        await p2.getByRole("button", { name: "Done" }).click();
        await p2.waitForURL(`**/returns`);
        if (made.vendor !== "Ferguson") throw new Error("Done did not save the optional details");
      } finally {
        await b2.close();
      }
    } else {
      const now = new Date().toISOString();
      returnsRows.push(newRow("returns", { code: "VRS-1234", type: "stock", returned_by: "Marco", created_at: now }));
      retCode = "VRS-1234";
    }
  });

  await step("Returns: change type keeps the code; close out moves it to Closed", async () => {
    await page.goto(`http://localhost:${PORT}/r/${retCode}`);
    await page.getByRole("button", { name: "Change type" }).click();
    await page.getByRole("button", { name: /Return to vendor/ }).click();
    await expect(page.getByText("Now return to vendor."), "reclassified");
    const r = returnsRows.find((x) => x.code === retCode);
    if (!r || r.type !== "vendor") throw new Error("type not changed");
    await expect(page.getByText("started as return to stock"), "original type shown");
    await page.getByRole("button", { name: "Close out" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.locator("#closed-by").fill("Ana");
    await sheet.locator("#close-note").fill("RMA 5512");
    await sheet.getByRole("button", { name: "Close out" }).click();
    await expect(page.getByText("Closed out."), "closed toast");
    if (r.status !== "closed" || r.closed_by !== "Ana" || r.close_note !== "RMA 5512") throw new Error("close-out not saved");
    await shot("20-return-closed");
    await page.getByRole("link", { name: "returns", exact: true }).click();
    await page.getByRole("tab", { name: "closed" }).click();
    await expect(page.getByText(retCode), "listed under closed");
    await shot("21-returns-list");
  });

  await step("Typed return code on Scan opens the return", async () => {
    await page.getByRole("link", { name: "scan", exact: true }).click();
    await page.fill("#scan-code", retCode.toLowerCase());
    await page.getByRole("button", { name: "Look up" }).click();
    await page.waitForURL(`**/r/${retCode}`);
  });

  await step("Backup & setup: Open the app poster saves a QR of this site", async () => {
    await page.getByRole("link", { name: "Backup and restore" }).click();
    const poster = page.getByAltText("Poster with a QR code that opens Floorcast");
    await poster.waitFor();
    await expect(page.getByText(`localhost:${PORT}`), "address shown");
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save poster to print" }).first().click();
    const d = await dl;
    if (d.suggestedFilename() !== "floorcast-app-poster.png") throw new Error(`poster file ${d.suggestedFilename()}`);
    await d.saveAs(path.join(shots, "app-poster.png"));
    const res = await page.request.get(`http://localhost:${PORT}/manifest.webmanifest`);
    const man = await res.json();
    if (man.name !== "Floorcast" || !man.icons?.length) throw new Error("manifest wrong");
    for (const icon of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
      const r = await page.request.get(`http://localhost:${PORT}${icon}`);
      if (!r.ok() || !(r.headers()["content-type"] ?? "").includes("png")) throw new Error(`${icon} not served`);
    }
    await shot("22-app-poster");
  });

  await step("Export backup includes records, stickers, photos", async () => {
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export backup" }).click();
    const d = await dl;
    if (!/^floorcast-backup-\d{8}-\d{4}\.zip$/.test(d.suggestedFilename())) throw new Error(`backup named ${d.suggestedFilename()}`);
    backup = path.join(shots, d.suggestedFilename());
    await d.saveAs(backup);
    const zip = await JSZip.loadAsync(await import("node:fs").then((fs) => fs.readFileSync(backup)));
    const names = Object.keys(zip.files);
    for (const n of ["packages.json", "packages.csv", `stickers/${mintedCode}.png`, `photos/${mintedCode}.jpg`, `slip-photos/${mintedCode}.jpg`, "stickers/AB-778899.png", "moves.json", "returns.json", "returns.csv"]) {
      if (!names.includes(n)) throw new Error(`backup missing ${n}: ${names.join(", ")}`);
    }
    const pj = JSON.parse(await zip.file("packages.json").async("string"));
    if (!pj.packages.some((x) => x.code === legacyCode && x.legacy === true)) throw new Error("packages.json lost the legacy flag");
    const rj = JSON.parse(await zip.file("returns.json").async("string"));
    if (!rj.returns.some((x) => x.code === retCode && x.status === "closed")) throw new Error("returns.json missing the return");
    const mj = JSON.parse(await zip.file("moves.json").async("string"));
    if (mj.moves.filter((x) => x.code === locCode).length !== 2) throw new Error("moves.json missing location history");
    await shot("12-more");
  });

  await step("Remove deletes the row and its files", async () => {
    await page.goto(`http://localhost:${PORT}/p/${mintedCode}`);
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove for good" }).click();
    await page.waitForURL(`http://localhost:${PORT}/`);
    if (rows.find((r) => r.code === mintedCode)) throw new Error("row still there");
    const left = [...files.keys()].filter((k) => k.includes(mintedCode));
    if (left.length) throw new Error(`files left: ${left}`);
  });

  await step("Restore brings it back with photo and thumbnail", async () => {
    await page.getByRole("link", { name: "Backup and restore" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Choose backup zip" }).click();
    // Lose the returns and the history first, so restore has to bring them back.
    returnsRows.length = 0;
    moves.length = 0;
    await (await chooser).setFiles(backup);
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.getByText(/Restored \d+ packages/), "restored toast");
    const back = returnsRows.find((x) => x.code === retCode);
    if (!back || back.status !== "closed" || back.type !== "vendor") throw new Error("return not restored");
    const hist = moves.filter((x) => x.package_code === locCode);
    if (hist.length !== 2 || hist[1].to_location !== "Conex 2") throw new Error(`location history not restored: ${JSON.stringify(hist)}`);
    const r = rows.find((x) => x.code === mintedCode);
    if (!r || !r.photo_path || !r.thumb_path || !r.barcode_path) throw new Error("restore incomplete");
    if (!r.slip_photo_path || !files.has(`package-photos/${r.slip_photo_path}`)) throw new Error("restore lost the slip photo");
    if (r.job_name !== "Maple St Remodel – Phase 2" || r.color_tag !== "Blue") throw new Error("restore fields wrong");
  });

  await step("Field phone: no PIN, check out only, no edits, no backup page", async () => {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    try {
      await c3.route(/\/rest\/v1\//, (route, req) => rest(route, req, new URL(req.url())));
      await c3.route(/\/storage\/v1\//, (route, req) => storage(route, req, new URL(req.url())));
      await c3.routeWebSocket(/\/realtime\/v1\//, () => undefined);
      const f = await c3.newPage();
      f.on("pageerror", (e) => errors.push(String(e)));
      await f.goto(`http://localhost:${PORT}/`);
      await f.getByRole("button", { name: /Field/ }).click();
      await f.getByRole("link", { name: "floor", exact: true }).waitFor();
      if (await f.locator("#pin").count()) throw new Error("field asked for a PIN");
      if (await f.getByText("Get a morning alert when things are waiting?").count()) throw new Error("field phone was offered alerts");
      if (await f.getByRole("link", { name: "Backup and restore" }).count()) throw new Error("field sees backup link");
      if (await f.getByRole("link", { name: "Reports" }).count()) throw new Error("field sees reports link");
      await f.goto(`http://localhost:${PORT}/p/${mintedCode}`);
      await f.getByRole("button", { name: "Check out" }).waitFor();
      await f.getByRole("button", { name: "Move" }).waitFor();
      await f.getByRole("button", { name: "Print" }).waitFor();
      for (const gone of ["Edit details", "Remove", "Retake photo", "Replace slip photo", "Add slip photo"]) {
        if (await f.getByRole("button", { name: gone }).count()) throw new Error(`field sees ${gone}`);
      }
      await f.screenshot({ path: path.join(shots, "23-field-entry.png") });
      await f.getByRole("button", { name: "Check out" }).click();
      await f.fill("#taken-by", "Truck 9");
      await f.getByRole("dialog").getByRole("button", { name: "Check out" }).click();
      await f.getByText(/Checked out · Truck 9/).waitFor();
      await f.getByText("Taken from").first().waitFor();
      if (await f.getByRole("button", { name: /Return to floor/ }).count()) throw new Error("field can return to floor");
      await f.screenshot({ path: path.join(shots, "24-field-checked-out.png") });
      if (rows.find((x) => x.code === mintedCode)?.checked_out_to !== "Truck 9") throw new Error("field check out not saved");
      await f.goto(`http://localhost:${PORT}/reports`);
      await f.getByText("Administrators only").waitFor();
      await f.goto(`http://localhost:${PORT}/more`);
      await f.getByText("Administrators only").waitFor();
      if (await f.getByRole("button", { name: "Export backup" }).count()) throw new Error("field sees backup");
      await f.goto(`http://localhost:${PORT}/r/${retCode}`);
      await f.getByText(retCode).first().waitFor();
      for (const gone of ["Close out", "Reopen", "Remove", "Edit details", "Change type"]) {
        if (await f.getByRole("button", { name: gone }).count()) throw new Error(`field sees ${gone} on a return`);
      }
      await f.getByRole("button", { name: "Field phone. Switch role" }).click();
      await f.getByRole("button", { name: "Switch", exact: true }).click();
      await f.getByText("Who's using this phone?").waitFor();
    } finally {
      await c3.close();
    }
  });

  await step("Alerts switch in Backup & setup: test alert, off, on", async () => {
    await page.getByRole("link", { name: "Backup and restore" }).click();
    const sw = page.getByRole("switch", { name: "Alerts" });
    await expect(sw, "alerts switch");
    if ((await sw.getAttribute("aria-checked")) !== "true") throw new Error("alerts not on after the unlock prompt");
    await page.getByRole("button", { name: "Send a test alert" }).click();
    await expect(page.getByText(/Test alert sent/), "test sent");
    const t = alertCalls.find((c) => c.fn === "daily-alerts");
    if (!t || t.args.test !== true || t.args.endpoint !== "https://push.example/phone-1") throw new Error(`test call wrong: ${JSON.stringify(t)}`);
    await shot("21b-alerts-section");
    await sw.click();
    await expect(page.getByText("Alerts are off for this phone."), "alerts off");
    if (!alertCalls.some((c) => c.fn === "alerts_unsubscribe")) throw new Error("turning alerts off did not unsubscribe");
    await sw.click();
    await expect(page.getByText("Alerts are on for this phone."), "alerts on again");
  });

  await step("Switch role returns to the chooser and drops this phone's alerts", async () => {
    const before = alertCalls.filter((c) => c.fn === "alerts_unsubscribe").length;
    await page.getByRole("button", { name: "Switch role" }).click();
    await expect(page.getByText("Who's using this phone?"), "chooser");
    await page.waitForFunction(() => !localStorage.getItem("__fakePushSub"));
    if (alertCalls.filter((c) => c.fn === "alerts_unsubscribe").length <= before) throw new Error("switching role kept alerts");
  });

  await step("Alert notes: blocked in settings, and iPhone not on the Home Screen", async () => {
    for (const [opts, note] of [
      [{ permission: "denied" }, "Alerts are blocked in this phone's settings."],
      [{ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }, "add Floorcast to the Home Screen"],
    ]) {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        await c.addInitScript(fakePush, opts);
        await c.route(/\/rest\/v1\//, (route, req) => rest(route, req, new URL(req.url())));
        await c.route(/\/storage\/v1\//, (route, req) => storage(route, req, new URL(req.url())));
        await c.routeWebSocket(/\/realtime\/v1\//, () => undefined);
        const p = await c.newPage();
        p.on("pageerror", (e) => errors.push(String(e)));
        await p.goto(`http://localhost:${PORT}/`);
        await p.getByRole("button", { name: /Administrator/ }).click();
        await p.fill("#pin", PIN);
        await p.getByRole("button", { name: "Unlock" }).click();
        await p.getByText(note).first().waitFor();
        if (await p.getByRole("button", { name: "Allow alerts" }).count()) throw new Error("offered alerts where they can't work");
        if (opts.ua) await p.screenshot({ path: path.join(shots, "21c-alerts-iphone-note.png") });
      } finally {
        await c.close();
      }
    }
  });

  if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
  console.log(`\nAll smoke steps passed. Screenshots in ${path.relative(root, shots)}/`);
} catch (err) {
  await shot("zz-failure").catch(() => undefined);
  console.error(`\nFAILED: ${err.message}`);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
writeFileSync(path.join(shots, ".gitkeep"), "");
process.exit(process.exitCode ?? 0);
