// Builds docs/Floorcast-User-Guide.pdf from the screenshots capture.mjs took.
// Two passes: the first finds which page each chapter landed on, the second
// prints those page numbers in the contents.
//   node scripts/manual/build.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const shotsDir = path.join(root, "test-results", "manual");
const { viewport, shots } = JSON.parse(readFileSync(path.join(shotsDir, "shots.json"), "utf8"));
const byId = Object.fromEntries(shots.map((s) => [s.id, s]));
const outPdf = path.join(root, "docs", "Floorcast-User-Guide.pdf");
mkdirSync(path.dirname(outPdf), { recursive: true });

const font = (pkg, file) => pathToFileURL(path.join(root, "node_modules/@fontsource", pkg, "files", file)).href;
const logo = `data:image/png;base64,${readFileSync(path.join(root, "src/assets/vans-logo.png")).toString("base64")}`;
const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// ------------------------------------------------------------ building blocks
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pct = (v, of) => `${Math.max(0, Math.min(100, (v / of) * 100)).toFixed(2)}%`;

/** A screenshot in a phone frame with numbered callouts. */
function phone(id, { width = 1.85, numbers = true, start = 1 } = {}) {
  const s = byId[id];
  if (!s) throw new Error(`no screenshot "${id}"`);
  const marks = numbers
    ? s.marks
        .map((m, i) => {
          const bx = Math.max(10, Math.min(viewport.width - 10, m.x));
          const by = Math.max(10, Math.min(viewport.height - 10, m.y));
          return `<span class="box" style="left:${pct(m.x - 3, viewport.width)};top:${pct(m.y - 3, viewport.height)};width:${pct(m.w + 6, viewport.width)};height:${pct(m.h + 6, viewport.height)}"></span>
          <span class="badge" style="left:${pct(bx, viewport.width)};top:${pct(by, viewport.height)}">${i + start}</span>`;
        })
        .join("")
    : "";
  return `<div class="phone" style="width:${width}in"><div class="screen"><img src="${pathToFileURL(path.join(shotsDir, s.file)).href}" alt="">${marks}</div></div>`;
}

/** Numbered legend for a screenshot's callouts. Extra text per number is optional. */
function legend(id, extra = {}, start = 1) {
  const s = byId[id];
  return `<ol class="legend">${s.marks
    .map((m, i) => `<li><span class="n">${i + start}</span><span><b>${esc(m.label)}</b>${extra[i + 1] ? `<br>${extra[i + 1]}` : ""}</span></li>`)
    .join("")}</ol>`;
}

/** Phone on the left; legend and any extra notes on the right. */
const figure = (id, { title, extra, after = "", width } = {}) => `
  <div class="figure">
    ${phone(id, { width })}
    <div class="figtext">
      ${title ? `<h4>${title}</h4>` : ""}
      ${byId[id].marks.length ? legend(id, extra) : ""}
      ${after}
    </div>
  </div>`;

/** Two phones side by side, each with its own caption and legend. */
const pair = (a, b, capA, capB, { extraA, extraB } = {}) => `
  <div class="pair">
    <div>${phone(a, { width: 1.75 })}<p class="cap">${capA}</p>${byId[a].marks.length ? legend(a, extraA) : ""}</div>
    <div>${phone(b, { width: 1.75 })}<p class="cap">${capB}</p>${byId[b].marks.length ? legend(b, extraB) : ""}</div>
  </div>`;

const steps = (...items) => `<ol class="steps">${items.map((t) => `<li>${t}</li>`).join("")}</ol>`;
const tip = (t, kind = "tip") => `<div class="note ${kind}"><b>${{ tip: "Tip", admin: "Administrator", warn: "Careful", field: "Field phones" }[kind]}</b> ${t}</div>`;
const ui = (t) => `<span class="ui">${t}</span>`;
const code = (t) => `<span class="code">${t}</span>`;

const chapters = [];
function chapter(id, title, lede, body) {
  chapters.push({ id, title });
  const n = chapters.length;
  return `<section class="chapter" id="${id}">
    <span class="mk">MK${id}MK</span>
    <div class="chead"><span class="cnum">${String(n).padStart(2, "0")}</span><h2>${title}</h2></div>
    <p class="lede">${lede}</p>
    ${body}
  </section>`;
}

// ------------------------------------------------------------ chapters
const body = [
  chapter(
    "welcome",
    "Welcome to Floorcast",
    "Floorcast is the shop's live list of every box on the warehouse floor: what it is, which job it's for, where it sits, and who took it. Every phone sees the same list, and changes show up on every phone within a second or two.",
    `
    <h3>The main screen</h3>
    ${figure("floor", {
      extra: {
        1: "From any screen, tap the VANS logo to come back to the floor list.",
        2: `${ui("live")} means changes from other phones appear by themselves. ${ui("connecting")} or a red ${ui("offline")} means check the Wi-Fi or signal.`,
        3: "Only on Administrator phones. Field phones show a <b>field</b> badge here instead.",
        4: "Type any part of a job name, code, PO, vendor, PM, or place.",
        5: "Each chip shows how many boxes are at that place. Tap to show only those.",
        6: "Photo, job, code, color tag, place, vendor and PO. Tap the photo to see it full size.",
        7: "The five tabs, always at the bottom.",
      },
    })}
    <h3>The five tabs</h3>
    <table class="grid">
      <tr><th>Tab</th><th>What it's for</th></tr>
      <tr><td>${ui("floor")}</td><td>Every box that's in the warehouse now. Search, filter, open.</td></tr>
      <tr><td>${ui("scan")}</td><td>Point the camera at a sticker (or type a code) to open that box or return.</td></tr>
      <tr><td>${ui("receive")}</td><td>Log a new delivery and make its sticker.</td></tr>
      <tr><td>${ui("out")}</td><td>Boxes that have been checked out: who took them, when, and where from.</td></tr>
      <tr><td>${ui("returns")}</td><td>Items coming back: to a vendor, to stock, under warranty, or not sure yet.</td></tr>
    </table>
    ${tip("Codes are the heart of Floorcast. Boxes get a " + code("VW-") + " code on a QR sticker (or keep the code already printed on the box). Returns get a four-digit code like " + code("VRS-7854") + " written on the item.")}
    `,
  ),

  chapter(
    "start",
    "Getting started on a phone",
    "Floorcast is a website, so there's nothing to install from an app store. Open it once, add it to the home screen, and choose who is using the phone.",
    `
    <h3>1 · Open Floorcast</h3>
    ${steps(
      `Scan the <b>Floorcast poster</b> posted in the warehouse with the phone's camera, or type ${code("floorcast.pages.dev")} into the browser.`,
      "Allow the camera when the phone asks. Floorcast needs it for scanning stickers and taking box photos.",
    )}
    <h3>2 · Add it to the home screen</h3>
    <table class="grid">
      <tr><th>iPhone (Safari)</th><th>Android (Chrome)</th></tr>
      <tr><td>Tap the <b>Share</b> button (square with an arrow), scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.</td>
          <td>Tap the <b>⋮</b> menu, then <b>Add to Home screen</b> or <b>Install app</b>, then <b>Add</b>.</td></tr>
    </table>
    <p>Floorcast then opens full screen from its own icon, like any other app.</p>
    <h3>3 · Choose who's using this phone</h3>
    <p>The first time Floorcast opens on a phone, it asks once. The phone remembers the choice.</p>
    ${pair("role-chooser", "pin", "Pick a role", "Administrator only: enter the shop PIN", {
      extraA: { 1: "For the crew. No PIN. Can receive, scan, check out and move boxes, print stickers, and start returns." },
      extraB: { 1: "The PIN is the same one the shop has always used.", 3: "Changed your mind? Go back and pick Field." },
    })}
    <h3>4 · Switching roles later</h3>
    ${pair("field-switch", "more-phone", "On a Field phone: tap the <b>field</b> badge (top right), then <b>Switch</b>", "On an Administrator phone: Backup &amp; setup → <b>Switch role</b>")}
    ${tip("Switching sends the phone back to the Field / Administrator choice. Nothing on the list is changed. If the shop PIN is ever changed, Administrator phones are sent back to the choice automatically.")}
    `,
  ),

  chapter(
    "roles",
    "Who can do what",
    "Field phones can do the everyday work but can't change or delete anything that's already saved. Administrator phones can do everything.",
    `
    <table class="grid roles">
      <tr><th>Action</th><th>Field</th><th>Administrator</th></tr>
      ${[
        ["See the floor, Out and Returns lists, search and filter", 1, 1],
        ["Open any box or return and see all its details and photos", 1, 1],
        ["Receive a new delivery (with photo and sticker)", 1, 1],
        ["Scan stickers with the camera or a handheld scanner", 1, 1],
        ["Check a box out", 1, 1],
        ["Move a box (update its last known location)", 1, 1],
        ["Save or print a sticker", 1, 1],
        ["Add a photo to a box that has none", 1, 1],
        ["Mark a box as legacy while receiving it", 1, 1],
        ["Start a return at the returns station", 1, 1],
        ["Return a checked-out box to the floor", 0, 1],
        ["Edit a box's details or retake its photo, or change whether it's legacy", 0, 1],
        ["Remove a box", 0, 1],
        ["Close out, reopen, change type, edit or remove a return", 0, 1],
        ["Backup &amp; setup: export, restore, system check, posters", 0, 1],
      ]
        .map(([a, f, ad]) => `<tr><td>${a}</td><td class="c">${f ? "✓" : "—"}</td><td class="c">${ad ? "✓" : "—"}</td></tr>`)
        .join("")}
    </table>
    ${pair("field-entry", "field-more", "A box on a Field phone: Move, Check out and the sticker. No Edit or Remove.", "Backup &amp; setup on a Field phone")}
    ${tip("Roles keep the floor crew from changing or deleting things by accident. They're a lock on the app's screens, not a password on the database, so keep the shop PIN among administrators.", "warn")}
    `,
  ),

  chapter(
    "receive",
    "Receiving a delivery",
    "Every box that comes in gets an entry, a photo, and a sticker. It takes about a minute. Only the job name and location are required; fill in what you know.",
    `
    <h3>At a glance</h3>
    ${steps(
      `Tap ${ui("receive")}. Keep ${ui("New VW- code")} unless the box already has a code you want to use.`,
      "Type the job name. Add the PO and vendor from the packing slip.",
      "Fill in who delivered it and who signed, the PM, and quantities if you have them.",
      "Answer packing slip and damage, and pick a color tag if there is one.",
      "Check the last known location, add notes, and take a photo of the box.",
      `Tap ${ui("Receive to floor")}, print the sticker, and put it on the box where it's easy to scan.`,
    )}
    <h3>Step 1 · Code and job</h3>
    ${figure("receive-top", {
      extra: {
        1: `${ui("New VW- code")}: Floorcast makes a code and a QR sticker for you. Use this for almost everything.<br>${ui("Code on the box")}: keep a barcode or QR that's already on the box. Scan it with the camera button or a handheld scanner, or type it.`,
        2: "The job the material is for. This is the big name everyone sees in the list.",
        3: "From the packing slip, if there is one.",
        4: "Opens a list: Etna, Behler-Young, Williams, Ferguson, or <b>Other…</b>",
      },
    })}
    <h3>Step 2 · Vendor and who handled it</h3>
    ${figure("receive-vendor", {
      extra: {
        1: "Pick the vendor from the list. On iPhone this opens the picker wheel.",
        2: "For any vendor not on the list, choose <b>Other…</b> and type the name here.",
        3: "Carrier or driver: UPS, FedEx Freight, vendor truck…",
        4: "Who signed for it.",
      },
      after: `<p class="small">Below these: <b>PM</b> (project manager) and <b>Quantities / attributes</b> (cartons, pieces, sizes, anything useful).</p>`,
    })}
    <h3>Step 3 · Checks, color and place</h3>
    ${figure("receive-middle", {
      extra: {
        1: `${ui("yes")}, ${ui("no")}, or ${ui("—")} if you don't know.`,
        2: "Mark damage here, then say what's damaged in the notes and take a photo. Damaged boxes show a red <b>!damaged</b> on the list.",
        3: "Match the colored tape or tag on the box, if the shop uses one for this job.",
        4: "Where the box is going. Tap a place, or <b>other</b> and type it (for example, Trailer 7).",
      },
    })}
    <h3>Step 4 · Notes, photo, save</h3>
    ${figure("receive-bottom", {
      extra: {
        1: "Required. Warehouse is picked for you; change it if the box goes elsewhere.",
        2: "Anything the next person should know.",
        3: "Optional but strongly recommended. A photo makes the box easy to find.",
        4: "Saves the entry for every phone and makes the sticker.",
      },
    })}
    ${pair("photo-camera", "photo-review", "Frame the whole box, label side up, and tap the shutter", "Check it, then <b>Use photo</b> (or <b>Retake</b>)")}
    <h3>Step 5 · Sticker the box</h3>
    ${figure("receive-done", {
      extra: {
        1: "The box is on the floor list now, at the place you picked.",
        2: "The sticker shows the job, the QR code, the code in big letters, and the date received.",
        3: "Sends the sticker to the label printer or any printer.",
        4: "Saves the sticker as an image, to print later or text to someone.",
        5: "Clears the form for the next box.",
        6: "Opens the box's page.",
      },
    })}
    ${tip("If you leave the Receive tab in the middle of an entry, what you typed is kept until you come back or save.")}
    ${tip("Receiving a code that's already in the warehouse is blocked, so nothing gets entered twice. Scan it instead to open the existing box.", "warn")}
    `,
  ),

  chapter(
    "legacy",
    "Legacy boxes (here before Floorcast)",
    "Boxes that were on the floor before Floorcast started go in once, with the <b>Legacy box</b> switch on Receive. Only the job name and where it sits are needed; the rest is optional. Field phones can do it, so the whole crew can help with the sweep.",
    `
    ${figure("legacy-receive", {
      extra: {
        1: "Turn it on for anything that was already here. It stays on for the next box when you tap <b>Receive another</b>, along with the month and place.",
        2: "If anyone knows roughly when it came in, pick the month. Leave it blank if nobody knows; today is used.",
        3: "What it's for. If nobody knows, use something searchable like “Unknown, check with PM”.",
        4: "Where it's sitting right now.",
      },
    })}
    ${figure("legacy-receive-more", {
      extra: {
        1: "PO, vendor, quantities, notes and the rest are tucked under <b>more details</b>. Fill in what you know; skip the rest.",
        2: "Then take a photo, print the sticker and stick it on, as for any delivery.",
      },
    })}
    <h3>Running the sweep</h3>
    ${steps(
      "Split the warehouse by place (Warehouse, Metal shop, Conex 1–4) and give each area a person or pair.",
      "Turn on <b>Legacy box</b>, pick the place, and enter each box: job, photo, sticker. Add colored tape if it has a color tag.",
      "Mark finished boxes (a dot of tape) so nobody enters one twice.",
      "When an area is done, use the floor list's place filter to check the count against what's on the shelves.",
    )}
    ${pair("legacy-floor", "legacy-entry", "On the floor list: the <b>legacy</b> filter shows only old stock", "On a box's page: the tag and the approximate month")}
    ${tip("The <b>legacy</b> chip makes PM claim days easy: filter to legacy, then search a job or a place. Missing details on a legacy box are expected; an Administrator can fill them in later with Edit details.")}
    ${tip("Only an Administrator can turn legacy on or off for a box that's already in Floorcast, from <b>Edit details</b>.", "admin")}
    `,
  ),

  chapter(
    "floor",
    "Finding boxes on the floor",
    "The floor list shows every box in the warehouse, newest first. Search and the filters narrow it down. Changes from other phones appear without refreshing.",
    `
    ${pair("floor-search", "floor-filters", "Type to search. Tap ✕ to clear.", "Filter by place and by color tag", {
      extraA: { 1: "Searching “ferguson” finds every box from Ferguson. Search also matches job, code, PO, PM, notes, and place." },
      extraB: { 1: "The number is how many boxes are there. Tap again to turn the filter off.", 2: "Shows only boxes with that color tag." },
    })}
    <h3>Reading a row</h3>
    <ul class="bullets">
      <li><b>Job name</b> in white, with how long ago it was received on the right.</li>
      <li>The <b>code</b> in blue, the color tag square, a red <b>!damaged</b> if marked, and a pin with its <b>place</b>.</li>
      <li>The <b>vendor</b> and <b>PO</b> underneath.</li>
      <li>Tap the <b>photo</b> to see it full size. Tap anywhere else on the row to open the box.</li>
    </ul>
    <h3>The Out list</h3>
    ${figure("out-list", {
      extra: {
        1: "Boxes that have been checked out, newest first. Same search and filters as the floor.",
        2: "<b>Taken from</b> is the box's last known location; <b>by</b> is who took it.",
      },
    })}
    `,
  ),

  chapter(
    "box",
    "A box's page",
    "Open a box from the list, a scan, or a typed code. Its page has everything about it, plus the actions for it.",
    `
    ${figure("entry-admin", {
      extra: {
        1: "Goes back to wherever you came from.",
        2: "<b>On the floor</b>, or <b>Checked out</b> with who and when.",
        3: "Job name, then its code.",
        4: "Where the box was last marked, and how long ago.",
        5: "Use this whenever the box is moved. See “Moving a box” below.",
      },
    })}
    ${pair("entry-admin-actions", "entry-admin-bottom", "Photo, Check out, and every detail", "Sticker, and Administrator tools", {
      extraA: { 1: "Administrators only. A Field phone sees <b>Add photo</b> only when the box has no photo." },
      extraB: { 1: "Print or save the sticker again if it's lost or damaged.", 2: "Fix any detail. Only while the box is on the floor.", 3: "Deletes the box, its sticker and photos for every phone. Cannot be undone." },
    })}
    <h3>Moving a box</h3>
    <p>Every time a box changes places, mark it, so the next person looks in the right spot. Old places are kept as history.</p>
    ${pair("move-sheet", "move-history", "Tap <b>Move</b>, pick the place, sign, save", "The new place, and the history underneath")}
    <h3>Checking a box out</h3>
    ${steps(
      `Open the box (scan its sticker is fastest) and tap ${ui("Check out")}.`,
      "Type who's taking it: a name, a truck, a crew.",
      `Tap ${ui("Check out")} again. The box moves from the floor list to the <b>Out</b> list.`,
    )}
    ${pair("checkout-sheet", "checked-out", "Who's taking it", "Checked out: who, when, and where from", {
      extraB: { 3: "Administrators only. Puts the box back on the floor list." },
    })}
    ${tip("Checked-out boxes always show <b>Taken from</b> and their last known location, so you know where they left from.")}
    `,
  ),

  chapter(
    "scan",
    "Scanning",
    "Scanning is the fastest way to open a box or a return. Floorcast reads its own QR stickers, return codes, and most barcodes already on boxes.",
    `
    ${figure("scan", {
      extra: {
        1: "Opens the camera full screen. Hold the sticker inside the frame; it reads by itself.",
        2: "If a sticker won't scan, type the code and tap <b>Look up</b>. Dashes and capitals don't matter.",
      },
    })}
    ${pair("scan-camera", "scan-found", "The camera scanner. Tap <b>close</b> to stop, or <b>type code</b>.", "It opens the box it read")}
    <h3>What happens after a scan</h3>
    <table class="grid">
      <tr><th>You scan…</th><th>Floorcast…</th></tr>
      <tr><td>A box that's in Floorcast</td><td>Opens that box's page.</td></tr>
      <tr><td>A return code (${code("VVR-")}, ${code("VRS-")}, ${code("VWR-")}, ${code("VRR-")})</td><td>Opens that return.</td></tr>
      <tr><td>A code Floorcast has never seen</td><td>Opens <b>Receive</b> with that code filled in, ready to log it.</td></tr>
    </table>
    <h3>Handheld and Bluetooth scanners</h3>
    <p>A scanner gun that types like a keyboard works anywhere in the app. Scan on any screen and Floorcast opens the box or return. On the Receive screen, a scan fills in the box's code instead.</p>
    ${tip("Scanning dark or shiny stickers: tilt the sticker slightly to kill glare, and move back a little if it's too close to focus.")}
    `,
  ),

  chapter(
    "returns",
    "Returns",
    "Anything coming back (wrong parts, leftovers, warranty items) gets a return code written on it. A return can only be started at the warehouse, by scanning the returns station poster, so whoever drops it off has to be there.",
    `
    <h3>The four kinds of return</h3>
    <table class="grid">
      <tr><th>Code</th><th>Kind</th><th>Use it for</th></tr>
      <tr><td>${code("VVR-####")}</td><td>Return to vendor</td><td>Goes back to the supplier.</td></tr>
      <tr><td>${code("VRS-####")}</td><td>Return to stock</td><td>Goes back on our shelves.</td></tr>
      <tr><td>${code("VWR-####")}</td><td>Warranty return</td><td>Defective, under warranty.</td></tr>
      <tr><td>${code("VRR-####")}</td><td>Not sure</td><td>General return; the office sorts it out.</td></tr>
    </table>
    <h3>Starting a return (any phone)</h3>
    ${steps(
      `Go to ${ui("returns")} → ${ui("Start a return")}. The camera opens.`,
      "Scan the <b>returns station</b> QR poster on the warehouse wall.",
      "Type your name. Then pick the kind of return.",
      "Floorcast shows the new code. <b>Write it on the item</b> with a marker, big and clear.",
      `Optionally add a photo, the vendor, the job it came from, and a note. Tap ${ui("Done")}.`,
    )}
    ${pair("return-scan", "return-type", "After the station scan", "Name first, then the kind")}
    ${pair("return-code", "return-code-details", "Write the code on the item", "Add what you know, then Done", {
      extraB: { 1: "If you know who it goes back to.", 2: "Why it's coming back, or what's wrong." },
    })}
    <h3>The returns list</h3>
    ${figure("returns-list", {
      extra: {
        1: "The station scan starts here.",
        2: "<b>open</b>: still to be handled. <b>closed</b>: done.",
        3: "Show only one kind.",
        4: "Code, kind, vendor, job, and who brought it.",
      },
    })}
    <h3>Handling a return (Administrator)</h3>
    ${pair("return-admin", "return-close", "A return's page", "Closing it out", {
      extraA: { 3: "Changes the kind. The code written on the item stays the same." },
      extraB: { 2: "RMA number, “restocked to bin 4”, “shipped back”…" },
    })}
    ${tip("Closed returns move to the <b>closed</b> tab with who closed them, when, and the note. An Administrator can <b>Reopen</b> one if needed.", "admin")}
    ${tip("Field phones can start returns and look them up, but can't close, change, or remove them.", "field")}
    `,
  ),

  chapter(
    "setup",
    "Backup &amp; setup (Administrator)",
    "Tap the database icon at the top right of an Administrator phone. This is where backups, the system check, and the posters live.",
    `
    ${figure("more-top", {
      extra: {
        1: "Downloads one zip with every box, return and move history (as JSON and CSV), every sticker, and every photo. Do this regularly and keep a copy off the phone.",
        2: "Loads a backup zip. Entries with the same code are overwritten; nothing else is deleted.",
        3: "Confirms the database and photo storage are set up. Green checks mean all good.",
      },
    })}
    ${tip("Restore overwrites boxes and returns that share a code with the backup. Export a fresh backup first if you're not sure.", "warn")}
    <h3>Posters</h3>
    ${pair("more-posters", "more-station", "Open-the-app poster", "Returns station poster", {
      extraA: { 1: "Anyone who scans it opens Floorcast. Post it by the door or the time clock." },
      extraB: { 1: "Post it where returns are dropped off. Starting a return requires scanning this exact poster." },
    })}
    <h3>Retiring a returns station poster</h3>
    <p>If a printed station poster gets copied or goes somewhere it shouldn't, change its secret code and print a new one. In Supabase, open <b>SQL Editor</b> and run:</p>
    <pre>update public.settings set value = encode(extensions.gen_random_bytes(9), 'hex')
where key = 'return_station_token';</pre>
    <p>Old posters stop working right away. Save and print the new poster from this page.</p>
    `,
  ),

  chapter(
    "help",
    "Troubleshooting &amp; questions",
    "Most problems are signal, camera permission, or a phone that needs its role picked again.",
    `
    <dl class="faq">
      <dt>The top says “connecting” or a red “offline”.</dt>
      <dd>The phone lost signal or Wi-Fi. Lists may be out of date and saves will fail with a message. Move toward the door or Wi-Fi and try again; nothing is lost from the list.</dd>
      <dt>“That did not save.”</dt>
      <dd>Usually signal. Wait a moment and tap the same button again. Your typing is still there.</dd>
      <dt>The camera is black or won't open.</dt>
      <dd>The browser was denied the camera. iPhone: Settings → Safari → Camera → Allow. Android: tap the lock icon by the address → Permissions → Camera → Allow. Then reload Floorcast.</dd>
      <dt>A sticker won't scan.</dt>
      <dd>Kill the glare, step back a little, or tap <b>type code</b> and enter the code printed under the QR.</dd>
      <dt>“Not in the warehouse.”</dt>
      <dd>That code isn't on the list. It may have been removed, or never received. Tap <b>Receive</b> on that screen to log it now.</dd>
      <dt>“… is already in the warehouse.”</dt>
      <dd>You're receiving a code that already has an entry. Scan it to open the existing box instead.</dd>
      <dt>Wrong PIN.</dt>
      <dd>Ask an administrator. If you only need everyday work, go <b>back</b> and choose Field.</dd>
      <dt>An Administrator phone suddenly shows “Who's using this phone?”</dt>
      <dd>The shop PIN was changed. Choose Administrator and enter the new PIN.</dd>
      <dt>I need to edit or remove something, but the button isn't there.</dt>
      <dd>The phone is set to Field. Ask an administrator, or switch role with the PIN.</dd>
      <dt>A screen says “One database update” or “Database setup needed”.</dt>
      <dd>A new version of Floorcast needs a one-time database change. An administrator copies the SQL shown on that screen, runs it in Supabase → SQL Editor, then taps <b>check again</b>. Existing entries are kept.</dd>
      <dt>Setting up a new phone.</dt>
      <dd>Scan the Open-the-app poster, add Floorcast to the home screen, and choose Field (or Administrator with the PIN). That's all.</dd>
    </dl>
    `,
  ),
];

const quickCard = `
  <section class="chapter card" id="card">
    <span class="mk">MKcardMK</span>
    <div class="cardhead"><img src="${logo}" alt=""><div><h2>Floorcast · Field quick card</h2><p>Print me and post me by the receiving door.</p></div></div>
    <div class="cardgrid">
      <div class="cbox"><h3>Receive a delivery</h3><ol>
        <li>Tap <b>receive</b>.</li>
        <li>Job name. PO and vendor if there's a slip.</li>
        <li>Packing slip? Damage? Color tag.</li>
        <li>Last known location (Warehouse is picked).</li>
        <li><b>Open camera</b> → photo of the box.</li>
        <li><b>Receive to floor</b> → <b>Print</b> → stick it on.</li></ol></div>
      <div class="cbox"><h3>Find a box</h3><ol>
        <li><b>scan</b> → <b>open camera</b> → point at the sticker.</li>
        <li>Or <b>floor</b> → search a job, PO, vendor or place.</li>
        <li>No sticker? Type the code under <b>or type the code</b>.</li></ol></div>
      <div class="cbox"><h3>Check a box out</h3><ol>
        <li>Scan the box.</li>
        <li><b>Check out</b> → who's taking it → <b>Check out</b>.</li>
        <li>It moves to the <b>out</b> tab, “taken from” its spot.</li></ol></div>
      <div class="cbox"><h3>Move a box</h3><ol>
        <li>Scan the box.</li>
        <li><b>Move</b> → pick the new place → your name → save.</li></ol></div>
      <div class="cbox"><h3>Drop off a return</h3><ol>
        <li><b>returns</b> → <b>Start a return</b>.</li>
        <li>Scan the <b>returns station</b> poster.</li>
        <li>Your name → pick the kind.</li>
        <li><b>Write the code on the item.</b> Add a note → <b>Done</b>.</li></ol></div>
      <div class="cbox"><h3>Return codes</h3><table>
        <tr><td>${code("VVR")}</td><td>back to vendor</td></tr>
        <tr><td>${code("VRS")}</td><td>back to stock</td></tr>
        <tr><td>${code("VWR")}</td><td>warranty</td></tr>
        <tr><td>${code("VRR")}</td><td>not sure</td></tr></table></div>
    </div>
    <p class="cardfoot">Need to edit, remove, return a box to the floor, or close a return? Ask an administrator. · ${code("floorcast.pages.dev")}</p>
  </section>`;
chapters.push({ id: "card", title: "Field quick card" });

// ------------------------------------------------------------ page
function html(pages) {
  const toc = chapters
    .map((c, i) => `<li><a href="#${c.id}"><span class="tn">${String(i + 1).padStart(2, "0")}</span><span class="tt">${c.title}</span><span class="dots"></span><span class="tp">${pages[c.id] ?? ""}</span></a></li>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Floorcast User Guide</title><style>
  @font-face { font-family: Geist; font-weight: 400; src: url(${font("geist-sans", "geist-sans-latin-400-normal.woff2")}); }
  @font-face { font-family: Geist; font-weight: 600; src: url(${font("geist-sans", "geist-sans-latin-600-normal.woff2")}); }
  @font-face { font-family: Geist; font-weight: 700; src: url(${font("geist-sans", "geist-sans-latin-700-normal.woff2")}); }
  @font-face { font-family: GeistMono; font-weight: 400; src: url(${font("geist-mono", "geist-mono-latin-400-normal.woff2")}); }
  @font-face { font-family: GeistMono; font-weight: 600; src: url(${font("geist-mono", "geist-mono-latin-600-normal.woff2")}); }
  :root { --ink: #0d1a1f; --dim: #4b5b61; --line: #d9e2e5; --cyan: #1b93a8; --cyan-soft: #e6f5f8; --red: #c52c2e; --mark: #ffc21a; }
  @page { size: letter; margin: 0.5in 0.65in 0.6in;
    @bottom-left { content: "Floorcast user guide"; font: 8.5pt GeistMono; color: #8a999e; }
    @bottom-right { content: counter(page); font: 9pt GeistMono; color: #8a999e; } }
  @page :first { margin: 0; @bottom-left { content: none } @bottom-right { content: none } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10.5pt/1.5 Geist, sans-serif; color: var(--ink); }
  h2, h3, h4 { font-family: Geist; letter-spacing: -0.01em; margin: 0; }
  h3 { font-size: 13.5pt; margin: 12pt 0 6pt; break-after: avoid; }
  h4 { font-size: 11pt; margin-bottom: 6pt; }
  p { margin: 0 0 8pt; }
  a { color: inherit; text-decoration: none; }
  .mk { font-size: 1px; color: #fff; position: absolute; }
  .ui { font: 600 9.5pt GeistMono; background: #0f2228; color: #7fe0ee; padding: 1px 6px; border-radius: 4px; white-space: nowrap; }
  .code { font: 600 9.5pt GeistMono; color: var(--cyan); white-space: nowrap; }
  pre { font: 8.5pt/1.45 GeistMono; background: #0f2228; color: #d6eef2; padding: 10pt 12pt; border-radius: 6pt; white-space: pre-wrap; }
  .small { font-size: 9.5pt; color: var(--dim); }

  /* cover */
  .cover { height: 11in; width: 8.5in; background: radial-gradient(120% 70% at 0% 0%, #0f3a44 0%, #071216 55%, #0a0a0b 75%, #2a0d0f 100%); color: #e9f3f5;
    padding: 1in 0.9in; display: flex; flex-direction: column; break-after: page; position: relative; overflow: hidden; }
  .cover img.logo { height: 0.55in; width: auto; align-self: flex-start; }
  .cover .kicker { margin-top: 2.1in; font: 11pt GeistMono; color: #7fe0ee; letter-spacing: 0.08em; text-transform: lowercase; }
  .cover h1 { font: 700 54pt/1 Geist; margin: 10pt 0 14pt; letter-spacing: -0.03em;
    background: linear-gradient(90deg, #ffffff, #9fe7f2 60%, #ff8a8c); -webkit-background-clip: text; color: transparent; }
  .cover .sub { font-size: 14pt; color: #a8bec3; max-width: 4.6in; }
  .cover .rule { height: 3px; width: 2.4in; margin: 26pt 0; background: linear-gradient(90deg, #2dc6dd, #c52c2e); border-radius: 2px; }
  .cover .meta { margin-top: auto; font: 9.5pt GeistMono; color: #7d9298; display: flex; justify-content: space-between; }
  .cover .shots { position: absolute; right: -0.55in; top: 2.35in; display: flex; gap: 0.18in; transform: rotate(-8deg); opacity: 0.95; }
  .cover .shots .phone { box-shadow: 0 20px 50px rgb(0 0 0 / 0.6); }

  /* contents */
  .toc { break-after: page; padding-top: 0.2in; }
  .toc h2 { font-size: 26pt; margin-bottom: 18pt; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li a { display: flex; align-items: baseline; gap: 10pt; padding: 9pt 0; border-bottom: 1px solid var(--line); font-size: 13pt; }
  .toc .tn { font: 600 10pt GeistMono; color: var(--cyan); width: 22pt; }
  .toc .dots { flex: 1; }
  .toc .tp { font: 10pt GeistMono; color: var(--dim); }
  .toc .howto { margin-top: 24pt; display: grid; grid-template-columns: auto 1fr; gap: 10pt 14pt; align-items: center; color: var(--dim); font-size: 10pt; }

  /* chapters */
  .chapter { break-before: page; position: relative; }
  .chead { display: flex; align-items: baseline; gap: 12pt; border-bottom: 3px solid; border-image: linear-gradient(90deg, #2dc6dd, #c52c2e) 1; padding-bottom: 6pt; margin-bottom: 10pt; }
  .cnum { font: 600 13pt GeistMono; color: var(--cyan); }
  .chead h2 { font-size: 24pt; }
  .lede { font-size: 11.5pt; color: var(--dim); margin-bottom: 12pt; }
  .steps { padding-left: 18pt; margin: 4pt 0 10pt; } .steps li { margin-bottom: 4pt; padding-left: 4pt; }
  .steps li::marker { font: 600 10pt GeistMono; color: var(--cyan); }
  .bullets { padding-left: 16pt; } .bullets li { margin-bottom: 3pt; }

  /* figures */
  .figure { display: flex; gap: 0.3in; align-items: flex-start; break-inside: avoid; margin: 6pt 0 10pt; }
  .figtext { flex: 1; min-width: 0; padding-top: 4pt; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3in; break-inside: avoid; margin: 6pt 0 10pt; }
  .pair > div { display: flex; flex-direction: column; align-items: center; }
  .pair .legend, .pair .cap { align-self: stretch; }
  .cap { font-size: 9.5pt; color: var(--dim); margin: 7pt 0 4pt; text-align: center; }
  .phone { flex: none; background: #0b0f11; border-radius: 0.3in; padding: 0.07in; box-shadow: 0 6px 18px rgb(0 0 0 / 0.18); }
  .screen { position: relative; border-radius: 0.24in; overflow: hidden; line-height: 0; }
  .screen img { width: 100%; display: block; }
  .box { position: absolute; border: 2px solid var(--mark); border-radius: 6px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.5), 0 0 10px rgb(255 194 26 / 0.45); }
  .badge { position: absolute; transform: translate(-45%, -45%); width: 17px; height: 17px; border-radius: 50%; background: var(--mark); color: #111;
    font: 700 9.5px/17px Geist; text-align: center; box-shadow: 0 0 0 1.5px #111; }
  .legend { list-style: none; padding: 0; margin: 0; font-size: 9.8pt; line-height: 1.4; }
  .legend li { display: flex; gap: 8pt; margin-bottom: 7pt; }
  .legend .n { flex: none; width: 17px; height: 17px; border-radius: 50%; background: var(--mark); color: #111; font: 700 9.5px/17px Geist; text-align: center; margin-top: 1px; box-shadow: 0 0 0 1px #111; }
  .pair .legend { font-size: 9.2pt; }

  /* tables, notes */
  table.grid { width: 100%; border-collapse: collapse; margin: 6pt 0 12pt; font-size: 10pt; break-inside: avoid; }
  table.grid th { text-align: left; font: 600 8.5pt GeistMono; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); border-bottom: 2px solid var(--ink); padding: 5pt 8pt; }
  table.grid td { border-bottom: 1px solid var(--line); padding: 6pt 8pt; vertical-align: top; }
  table.roles td.c { text-align: center; font-weight: 700; width: 1in; }
  table.roles td.c:not(:empty) { color: var(--cyan); }
  .note { border-left: 4px solid var(--cyan); background: var(--cyan-soft); padding: 8pt 11pt; border-radius: 0 6pt 6pt 0; margin: 8pt 0 12pt; font-size: 10pt; break-inside: avoid; }
  .note b:first-child { font: 600 8.5pt GeistMono; text-transform: uppercase; letter-spacing: 0.06em; color: var(--cyan); margin-right: 6pt; }
  .note.warn { border-color: var(--red); background: #fbeeee; } .note.warn b:first-child { color: var(--red); }
  .note.admin { border-color: #6b4fd8; background: #f1eefc; } .note.admin b:first-child { color: #6b4fd8; }
  .note.field { border-color: #c28a00; background: #fff6df; } .note.field b:first-child { color: #9a6d00; }
  .faq dt { font-weight: 600; margin-top: 10pt; break-after: avoid; }
  .faq dd { margin: 2pt 0 0; color: var(--dim); }

  /* quick card */
  .card .cardhead { display: flex; gap: 16pt; align-items: center; background: #071216; color: #e9f3f5; border-radius: 10pt; padding: 14pt 18pt; margin-bottom: 14pt; }
  .card .cardhead img { height: 0.42in; }
  .card .cardhead h2 { font-size: 20pt; } .card .cardhead p { margin: 2pt 0 0; color: #9fb5ba; }
  .cardgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
  .cbox { border: 1.5px solid var(--line); border-radius: 8pt; padding: 10pt 12pt; break-inside: avoid; }
  .cbox h3 { margin: 0 0 6pt; font-size: 12.5pt; color: var(--cyan); }
  .cbox ol { margin: 0; padding-left: 16pt; font-size: 10.5pt; } .cbox li { margin-bottom: 3pt; }
  .cbox table td { padding: 2pt 10pt 2pt 0; font-size: 10.5pt; }
  .cardfoot { margin-top: 14pt; text-align: center; color: var(--dim); font-size: 10pt; }
  </style></head><body>
  <section class="cover">
    <img class="logo" src="${logo}" alt="VANS">
    <div class="kicker">warehouse floor app</div>
    <h1>Floorcast<br>user guide</h1>
    <p class="sub">Receiving, finding, checking out, moving and returning material, for the floor crew and administrators.</p>
    <div class="rule"></div>
    <div class="shots">${phone("floor", { width: 1.9, numbers: false })}${phone("entry-admin", { width: 1.9, numbers: false })}</div>
    <div class="meta"><span>floorcast.pages.dev</span><span>${today}</span></div>
  </section>
  <section class="toc">
    <h2>Contents</h2>
    <ol>${toc}</ol>
    <div class="howto">
      <span class="legend"><span class="n">1</span></span><span>Yellow numbers on a screenshot match the numbered notes beside it.</span>
      <span class="ui">receive</span><span>Words in this style are buttons or labels exactly as they appear in the app.</span>
      <span class="code">VW-EX4M7P</span><span>Codes look like this.</span>
    </div>
    <div class="note admin" style="margin-top:18pt"><b>Administrator</b> marks steps only Administrator phones can do.</div>
    <div class="note field"><b>Field phones</b> marks what's different on Field phones.</div>
  </section>
  ${body.join("\n")}
  ${quickCard}
  </body></html>`;
}

// ------------------------------------------------------------ render
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
async function render(pages, file) {
  const htmlFile = path.join(shotsDir, "manual.html");
  // The page markers are only needed to find chapter pages in the draft.
  const doc = html(pages);
  writeFileSync(htmlFile, file === outPdf ? doc.replace(/<span class="mk">\w+<\/span>/g, "") : doc);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  await page.close();
}

const draft = path.join(shotsDir, "draft.pdf");
await render({}, draft);
const text = execFileSync("pdftotext", ["-layout", draft, "-"], { encoding: "utf8", maxBuffer: 64e6 });
const pages = {};
text.split("\f").forEach((t, i) => {
  for (const m of t.matchAll(/MK(\w+)MK/g)) pages[m[1]] ??= i + 1;
});
const missing = chapters.filter((c) => !pages[c.id]).map((c) => c.id);
if (missing.length) console.warn(`! no page found for: ${missing.join(", ")}`);
await render(pages, outPdf);
await browser.close();

const info = execFileSync("pdfinfo", [outPdf], { encoding: "utf8" });
const count = /Pages:\s+(\d+)/.exec(info)?.[1];
console.log(`✓ ${path.relative(root, outPdf)} · ${count} pages · ${(readFileSync(outPdf).length / 1e6).toFixed(1)} MB`);
