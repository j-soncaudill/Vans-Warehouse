// Screenshots for the user guide, taken from the "manual" build: the demo's
// sample data (no real project) without the preview notes. Writes
// test-results/manual/*.jpg and shots.json with the box of every element a
// callout points at.
//   npx vite build --mode manual && node scripts/manual/capture.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist-manual");
const out = path.join(root, "test-results", "manual");
mkdirSync(out, { recursive: true });
if (!existsSync(path.join(dist, "index.html"))) throw new Error("Run npx vite build --mode manual first.");

// ------------------------------------------------------------ site
// The browser is told the build lives at the real address, so the posters
// print floorcast.pages.dev. Nothing leaves this machine.
const BASE = "https://floorcast.pages.dev/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
function serve(route) {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  let file = path.join(dist, p === "/" ? "index.html" : p);
  if (!file.startsWith(dist) || !existsSync(file)) file = path.join(dist, "index.html");
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
}

// ------------------------------------------------------------ fake cameras
async function video(name, text) {
  const png = path.join(out, `${name}.png`);
  const y4m = path.join(out, `${name}.y4m`);
  await QRCode.toFile(png, text, { width: 480, margin: 6, errorCorrectionLevel: "Q" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-vf", "pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "1", "-r", "10", y4m]);
  return y4m;
}
const boxCam = await video("cam-box", "VW-EX9K2R");
const stationCam = await video("cam-station", "VW-RETURN-STATION:demo");

// Toasts fade on their own; keep them out of the pictures.
const CLEAN = `div[aria-live="polite"].fixed { display: none !important; }`;

const shots = [];
const launch = (cam) =>
  chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${cam}`],
  });

async function session(cam) {
  const browser = await launch(cam);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"], reducedMotion: "reduce" });
  await ctx.route(`${BASE}**`, serve);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("page error:", String(e)));
  await page.goto(BASE);
  await page.addStyleTag({ content: CLEAN });
  return { browser, page };
}

/** Navigate inside the app without reloading, so the in-memory demo data stays. */
const go = (page, hash) => page.evaluate((h) => (location.hash = h), hash).then(() => page.waitForTimeout(450));

/**
 * Screenshot plus callouts. marks: [locator, label, side?] — the box of each
 * locator (as seen in this screenshot) is saved with its label.
 */
async function shot(page, id, marks = [], { scrollTo, settle = 350 } = {}) {
  if (scrollTo) await scrollTo.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(settle);
  const boxes = [];
  for (const [loc, label] of marks) {
    const b = await loc.first().boundingBox({ timeout: 5000 }).catch(() => null);
    if (!b) {
      await page.screenshot({ path: path.join(out, `zz-${id}.png`) });
      throw new Error(`${id}: no box for "${label}". Buttons: ${(await page.getByRole("button").allInnerTexts()).join(" | ")}`);
    }
    boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height, label });
  }
  await page.screenshot({ path: path.join(out, `${id}.jpg`), type: "jpeg", quality: 82 });
  shots.push({ id, file: `${id}.jpg`, marks: boxes });
  process.stdout.write(`  ${id}\n`);
}

const role = (page, r, name, o = {}) => page.getByRole(r, { name, ...o });

// ============================================================ admin phone
{
  const { browser, page } = await session(boxCam);
  try {
    await page.getByText("Who's using this phone?").waitFor();
    await shot(page, "role-chooser", [
      [role(page, "button", /Field/), "Field — no PIN"],
      [role(page, "button", /Administrator/), "Administrator — shop PIN"],
    ]);
    await role(page, "button", /Administrator/).click();
    await page.locator("#pin").fill("0000");
    await shot(page, "pin", [
      [page.locator("#pin"), "Type the shop PIN"],
      [role(page, "button", "Unlock"), "Unlock"],
      [role(page, "button", "back"), "Back to the role choice"],
    ]);
    await role(page, "button", "Unlock").click();
    await page.getByText("Example: Maple St remodel").first().waitFor();
    await page.waitForTimeout(600);

    await shot(page, "floor", [
      [page.locator("header img").first(), "Tap the logo for the floor"],
      [page.locator("header [aria-live]").first(), "Live: changes from other phones show up by themselves"],
      [role(page, "link", "Backup and restore"), "Backup & setup (admin)"],
      [page.locator("input[aria-label='Search']"), "Search anything"],
      [role(page, "group", "Filter by location"), "Filter by place"],
      [page.locator("main a[href*='/p/']").first(), "Tap a box to open it"],
      [role(page, "navigation", "Main"), "Main tabs"],
    ]);
    await page.locator("input[aria-label='Search']").fill("ferguson");
    await shot(page, "floor-search", [[page.locator("input[aria-label='Search']"), "Matches job, code, PO, vendor, place…"]]);
    await page.locator("input[aria-label='Search']").fill("");
    await role(page, "group", "Filter by color tag").scrollIntoViewIfNeeded();
    await shot(page, "floor-filters", [
      [role(page, "group", "Filter by location"), "Location chips with counts"],
      [role(page, "group", "Filter by color tag"), "Color tag chips"],
    ]);

    // ---------------------------------------------------- receive
    await role(page, "link", "receive", { exact: true }).click();
    await page.locator("#f-job").waitFor();
    await shot(page, "receive-top", [
      [role(page, "radiogroup").first(), "New VW- code, or use the code already on the box"],
      [page.locator("#f-job"), "Job name (required)"],
      [page.locator("#f-po"), "PO number"],
      [page.locator("#f-vendor"), "Vendor list"],
    ]);
    await page.locator("#f-job").fill("Elm St lofts");
    await page.locator("#f-po").fill("40310");
    await page.selectOption("#f-vendor", "__other__");
    await page.locator("#f-vendor-other").fill("Graybar");
    await page.locator("#f-delivered").fill("FedEx Freight");
    await page.locator("#f-received").fill("Dana");
    await page.locator("#f-pm").fill("Rick");
    await page.locator("#f-qty").fill("1 pallet, 6 boxes of breakers");
    await shot(page, "receive-vendor", [
      [page.locator("#f-vendor"), "Pick Etna, Behler-Young, Williams, Ferguson — or Other…"],
      [page.locator("#f-vendor-other"), "Other: type the vendor"],
      [page.locator("#f-delivered"), "Who dropped it off"],
      [page.locator("#f-received"), "Who signed"],
    ], { scrollTo: page.locator("#f-vendor") });
    await page.locator("#f-slip").getByRole("radio", { name: "Yes", exact: true }).click();
    await page.locator("#f-damage").getByRole("radio", { name: "No", exact: true }).click();
    await role(page, "radio", "Green").click();
    await page.locator("#f-notes").fill("Breakers for unit 4");
    await shot(page, "receive-middle", [
      [page.locator("#f-slip"), "Packing slip?"],
      [page.locator("#f-damage"), "Any damage?"],
      [role(page, "radio", "Green"), "Color tag"],
      [page.locator("#f-location"), "Last known location (required)"],
    ], { scrollTo: page.locator("#f-slip") });
    await shot(page, "receive-bottom", [
      [page.locator("#f-location"), "Where it's being put"],
      [page.locator("#f-notes"), "Notes"],
      [role(page, "button", "Open camera"), "Box photo"],
      [role(page, "button", "Receive to floor"), "Save it"],
    ], { scrollTo: role(page, "button", "Receive to floor") });
    await role(page, "button", "Open camera").click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2);
    await shot(page, "photo-camera", [[role(page, "button", "Take photo", { exact: true }), "Take photo"]], { settle: 700 });
    await role(page, "button", "Take photo", { exact: true }).click();
    await shot(page, "photo-review", [
      [role(page, "button", "Use photo", { exact: true }), "Use it"],
      [role(page, "button", /Retake/), "Try again"],
    ]);
    await role(page, "button", "Use photo", { exact: true }).click();
    await role(page, "button", "Receive to floor").click();
    await page.getByText("put this sticker on the box").waitFor();
    await shot(page, "receive-done", [
      [page.getByText("On the floor").first(), "Saved: its code and place"],
      [page.getByText("put this sticker on the box"), "The sticker"],
      [role(page, "button", "Print"), "Print the sticker"],
      [role(page, "button", "Save"), "Save it as an image"],
      [role(page, "button", "Receive another"), "Next delivery"],
      [role(page, "link", "Open this entry"), "Open the box's page"],
    ], { settle: 900 });

    // ---------------------------------------------------- legacy boxes
    await role(page, "button", "Receive another").click();
    await page.locator("#f-legacy").click();
    await page.locator("#f-legacy-month").fill("2025-03");
    await page.locator("#f-job").fill("Copper fittings, shelf B");
    await page.locator("#f-location").getByRole("radio", { name: "Conex 3" }).click();
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, "legacy-receive", [
      [page.locator("#f-legacy"), "Legacy box switch"],
      [page.locator("#f-legacy-month"), "About when it arrived (optional)"],
      [page.locator("#f-job"), "Job name"],
      [page.locator("#f-location"), "Where it sits now"],
    ], { scrollTo: page.locator("#f-legacy") });
    await shot(page, "legacy-receive-more", [
      [page.locator("summary").filter({ hasText: "more details" }), "Everything else, folded away"],
      [role(page, "button", "Receive to floor"), "Save it"],
    ], { scrollTo: role(page, "button", "Receive to floor") });
    await page.locator("#f-legacy").click();
    await go(page, "#/");
    const legacyChip = page.getByRole("button", { name: /^Legacy only/ });
    await legacyChip.click();
    await shot(page, "legacy-floor", [
      [legacyChip, "Legacy filter, with its count"],
      [page.locator("main").getByText("legacy", { exact: true }).first(), "Legacy tag on the row"],
      [page.getByText(/^~\w{3} \d{4}$/).first(), "Approximate arrival month"],
    ]);
    await go(page, "#/p/VW-EXL9Q4");
    await role(page, "button", "Check out").waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, "legacy-entry", [
      [page.getByText(/^recv ~/), "Approximate arrival month"],
      [page.locator("main").getByText("legacy", { exact: true }).first(), "Legacy tag"],
    ]);

    // ---------------------------------------------------- entry (admin)
    await go(page, "#/p/VW-EX4M7P");
    await role(page, "button", "Check out").waitFor();
    await shot(page, "entry-admin", [
      [role(page, "button", "back"), "Back"],
      [page.getByText("On the floor", { exact: true }), "Status"],
      [page.locator("main h1"), "Job and code"],
      [role(page, "region", "Location"), "Last known location"],
      [role(page, "button", "Move", { exact: true }), "Mark where it is now"],
    ]);
    await shot(page, "entry-admin-actions", [
      [role(page, "button", "Retake photo"), "Retake photo (admin)"],
      [role(page, "button", "Check out"), "Check out"],
      [page.locator("main dl"), "All the details"],
    ], { scrollTo: role(page, "button", "Check out") });
    await shot(page, "entry-admin-bottom", [
      [role(page, "region", "Sticker"), "Reprint or save the sticker"],
      [role(page, "button", "Edit details"), "Edit (admin)"],
      [role(page, "button", "Remove"), "Remove for good (admin)"],
    ], { scrollTo: role(page, "button", "Remove") });

    await role(page, "button", "Move", { exact: true }).click();
    await page.locator("#move-to").getByRole("radio", { name: "Metal shop" }).click();
    await page.locator("#moved-by").fill("Dana");
    await shot(page, "move-sheet", [
      [page.locator("#move-to"), "Pick the new place, or Other"],
      [page.locator("#moved-by"), "Who moved it"],
      [page.getByRole("dialog").getByRole("button", { name: /Mark|Save|Move/ }).last(), "Save the move"],
    ]);
    await page.getByRole("dialog").getByRole("button", { name: /Mark|Save|Move/ }).last().click();
    await page.waitForTimeout(600);
    await shot(page, "move-history", [
      [role(page, "region", "Location"), "Now at Metal shop"],
      [role(page, "region", "Location history"), "Every move, newest first"],
    ], { scrollTo: role(page, "region", "Location history") });

    await role(page, "button", "Check out").first().scrollIntoViewIfNeeded();
    await role(page, "button", "Check out").first().click();
    await page.locator("#taken-by").fill("Truck 3");
    await shot(page, "checkout-sheet", [
      [page.locator("#taken-by"), "Who's taking it"],
      [page.getByRole("dialog").getByRole("button", { name: "Check out" }), "Confirm"],
    ]);
    await page.getByRole("dialog").getByRole("button", { name: "Check out" }).click();
    await page.getByText(/Checked out · Truck 3/).waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, "checked-out", [
      [page.getByText(/Checked out · Truck 3/), "Who took it and when"],
      [page.getByText("Taken from").first(), "Where it was taken from"],
      [role(page, "button", /Return to floor/), "Return to floor (admin)"],
    ], { scrollTo: role(page, "button", /Return to floor/) });

    await role(page, "link", "out", { exact: true }).click();
    await page.getByText("Truck 3").first().waitFor();
    await shot(page, "out-list", [
      [page.locator("main a[href*='/p/']").first(), "Checked-out boxes"],
      [page.getByText(/taken from .* · by Truck 3/).first(), "Taken from / by"],
    ]);

    // ---------------------------------------------------- scan
    await role(page, "link", "scan", { exact: true }).click();
    await role(page, "button", /open camera/i).first().waitFor();
    await shot(page, "scan", [
      [role(page, "button", /open camera/i).first(), "Open the camera scanner"],
      [page.locator("#scan-code"), "Or type a code"],
    ]);
    await role(page, "button", /open camera/i).first().click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 15000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(out, "scan-camera.jpg"), type: "jpeg", quality: 82 });
    shots.push({ id: "scan-camera", file: "scan-camera.jpg", marks: [] });
    // Whatever it reads opens by itself.
    await page.waitForURL(/#\/p\//, { timeout: 15000 });
    await page.waitForTimeout(500);
    await shot(page, "scan-found", [[page.locator("main h1"), "The box it read"]]);
    await go(page, "#/scan");
    await page.locator("#scan-code").waitFor().catch(() => undefined);
    if (await page.locator("#scan-code").count()) {
      await page.locator("#scan-code").fill("VW-EX9K2R");
      await shot(page, "scan-typed", [
        [page.locator("#scan-code"), "Or type a code"],
        [role(page, "button", "Look up"), "Look it up"],
      ], { scrollTo: page.locator("#scan-code") });
    }

    // ---------------------------------------------------- returns (admin)
    await role(page, "link", "returns", { exact: true }).click();
    await page.getByText("VVR-4127").first().waitFor();
    await shot(page, "returns-list", [
      [role(page, "link", "Start a return"), "Start a return"],
      [role(page, "tablist", "Return status"), "Open / closed"],
      [role(page, "group", "Filter by return type"), "Filter by type"],
      [page.locator("main a[href*='/r/']").first(), "Tap one to open it"],
    ]);
    await go(page, "#/r/VVR-4127");
    await role(page, "button", "Close out").first().waitFor();
    await shot(page, "return-admin", [
      [page.getByText("VVR-4127").first(), "The code written on the item"],
      [role(page, "button", "Close out").first(), "Close out when it's handled"],
      [role(page, "button", "Change type"), "Change type (code stays)"],
      [role(page, "button", /^(Photo|Retake)$/), "Photo"],
    ]);
    await role(page, "button", "Close out").first().click();
    await page.locator("#closed-by").fill("Ana");
    await page.locator("#close-note").fill("RMA 5512, shipped back");
    await shot(page, "return-close", [
      [page.locator("#closed-by"), "Who closed it"],
      [page.locator("#close-note"), "What happened (RMA, restocked…)"],
      [page.getByRole("dialog").getByRole("button", { name: "Close out" }), "Close out"],
    ]);
    await page.getByRole("dialog").getByRole("button", { name: "Close out" }).click();
    await page.waitForTimeout(500);

    // ---------------------------------------------------- backup & setup
    await go(page, "#/more");
    await role(page, "button", "Export backup").waitFor();
    await role(page, "button", /Check database/).click();
    await page.waitForTimeout(900);
    await shot(page, "more-top", [
      [role(page, "button", "Export backup"), "Download everything as a zip"],
      [role(page, "button", "Choose backup zip"), "Restore from a zip"],
      [role(page, "button", /Check database/), "Check database & storage"],
    ]);
    const appPoster = page.getByRole("img", { name: /opens Floorcast/ });
    await shot(page, "more-posters", [
      [appPoster, "Open-the-app poster"],
      [role(page, "button", "Save poster to print").first(), "Save it, then print"],
    ], { scrollTo: appPoster, settle: 900 });
    const station = page.getByRole("img", { name: /Returns station poster/ });
    await shot(page, "more-station", [
      [station, "Returns station poster"],
      [role(page, "button", "Save poster to print").last(), "Save it, then print"],
    ], { scrollTo: station, settle: 900 });
    await shot(page, "more-phone", [[role(page, "button", "Switch role"), "Switch role on this phone"]], { scrollTo: role(page, "button", "Switch role") });
  } finally {
    await browser.close();
  }
}

// ============================================================ field phone + returns station
{
  const { browser, page } = await session(stationCam);
  try {
    await role(page, "button", /Field/).click();
    await page.getByText("Example: Maple St remodel").first().waitFor();
    await page.waitForTimeout(500);
    await shot(page, "field-floor", [[role(page, "button", "Field phone. Switch role"), "Field badge — tap to switch role"]]);
    await go(page, "#/p/VW-EX4M7P");
    await role(page, "button", "Check out").waitFor();
    await shot(page, "field-entry", [
      [role(page, "button", "Move", { exact: true }), "Move"],
      [role(page, "button", "Check out"), "Check out"],
    ], { scrollTo: role(page, "button", "Check out") });
    await shot(page, "field-entry-bottom", [[role(page, "region", "Sticker"), "Sticker — no edit or remove on Field"]], { scrollTo: role(page, "region", "Sticker") });
    await go(page, "#/more");
    await page.getByText("Administrators only").waitFor();
    await shot(page, "field-more", [[role(page, "button", "Switch to Administrator"), "Needs the shop PIN"]]);

    await role(page, "link", "returns", { exact: true }).click();
    await role(page, "link", "Start a return").click();
    await page.waitForFunction(() => document.querySelector("video")?.readyState >= 2, null, { timeout: 15000 }).catch(() => undefined);
    await page.getByText("What kind of return?").first().waitFor({ timeout: 15000 });
    await shot(page, "return-scan", [
      [page.locator("#r-who"), "After the station scan: your name"],
      [role(page, "button", /Return to vendor/), "Locked until a name is in"],
    ]);
    await page.locator("#r-who").fill("Marco");
    await shot(page, "return-type", [
      [page.locator("#r-who"), "Your name first"],
      [role(page, "button", /Return to vendor/), "Then pick the kind"],
    ]);
    await role(page, "button", /Return to stock/).click();
    await page.getByText("Write this on the item").first().waitFor();
    await page.waitForTimeout(900);
    await shot(page, "return-code", [
      [page.getByText("Write this on the item").first(), "Write the code on the item"],
      [role(page, "button", "Done"), "Done saves it"],
    ]);
    await shot(page, "return-code-details", [
      [page.locator("#r-vendor"), "Vendor, if you know it"],
      [page.locator("#r-note"), "What's wrong"],
      [role(page, "button", "Done"), "Done"],
    ], { scrollTo: role(page, "button", "Done") });
    await role(page, "button", "Field phone. Switch role").click();
    await shot(page, "field-switch", [[role(page, "button", "Switch", { exact: true }), "Back to the role choice"]]);
  } finally {
    await browser.close();
  }
}

writeFileSync(path.join(out, "shots.json"), JSON.stringify({ viewport: { width: 390, height: 844 }, shots }, null, 1));
console.log(`✓ ${shots.length} screenshots in ${path.relative(root, out)}/`);
