// Demo mode only (`npm run build:demo`). An in-browser stand-in for Supabase
// REST + Storage so the app can be tried without touching the real project.
// Everything lives in memory and is gone on reload.

export const DEMO_URL = "https://demo.invalid";
export const DEMO_PIN = "0000";

type Row = Record<string, unknown> & { id: number; code: string };

let nextId = 1;
const rows: Row[] = [];
const moves: Row[] = [];
const returns: Row[] = [];
const TABLES: Record<string, Row[]> = { packages: rows, package_moves: moves, returns };
/** Tables whose rows are unique by code. */
const BY_CODE = new Set(["packages", "returns"]);
const files = new Map<string, Blob>();
const urls = new Map<string, string>();

export function demoFileUrl(bucket: string, path: string): string | null {
  const key = `${bucket}/${path}`;
  const blob = files.get(key);
  if (!blob) return null;
  let url = urls.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(key, url);
  }
  return url;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

function filtered(url: URL, table: Row[] = rows): Row[] {
  let out = table;
  for (const [k, v] of url.searchParams) {
    if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) out = out.filter((r) => String(r[k]) === m[1]);
    const n = /^is\.null$/.exec(v);
    if (n) out = out.filter((r) => r[k] == null);
  }
  return out;
}

function sortRows(list: Row[], order: string | null): Row[] {
  if (!order) return list;
  const [col, dir] = order.split(",")[0].split(".");
  return [...list].sort((a, b) => {
    const x = String(a[col] ?? "");
    const y = String(b[col] ?? "");
    return dir === "desc" ? y.localeCompare(x) : x.localeCompare(y);
  });
}

async function bodyBlob(init: RequestInit | undefined): Promise<Blob> {
  const b = init?.body;
  if (b instanceof FormData) {
    for (const [, v] of b) if (v instanceof Blob && v.size) return v;
    return new Blob();
  }
  if (b instanceof Blob) return b;
  if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return new Blob([b as BlobPart]);
  return new Blob([String(b ?? "")]);
}

function makeRow(item: Record<string, unknown>): Row {
  const now = new Date().toISOString();
  return {
    id: nextId++,
    po_number: null, vendor: null, delivered_by: null, received_by: null, pm: null,
    packing_slip_received: null, quantities: null, damaged: null, color_tag: null, notes: null,
    status: "on_floor", received_at: now, checked_out_to: null, checked_out_at: null,
    barcode_path: null, photo_path: null, thumb_path: null, last_location: null, location_at: null,
    legacy: false, created_at: now, updated_at: now,
    ...item,
  } as unknown as Row;
}

function makeOther(table: string, item: Record<string, unknown>): Row {
  const now = new Date().toISOString();
  if (table === "package_moves") return { id: nextId++, from_location: null, moved_by: null, moved_at: now, ...item } as unknown as Row;
  return {
    id: nextId++, status: "open", returned_by: null, vendor: null, job_name: null, notes: null, photo_path: null, thumb_path: null,
    created_at: now, updated_at: now, closed_at: null, closed_by: null, close_note: null,
    ...item,
  } as unknown as Row;
}

async function rest(url: URL, init: RequestInit | undefined, headers: Headers): Promise<Response> {
  const table = url.pathname.split("/").pop();
  const single = (headers.get("accept") ?? "").includes("vnd.pgrst.object");
  const reply = (data: Row[], status = 200) => {
    if (!single) return json(data, status);
    return data.length === 1 ? json(data[0], status) : json({ code: "PGRST116", message: "no rows" }, 406);
  };
  if (table === "settings") return reply([]);
  const name = table ?? "packages";
  const list = TABLES[name];
  if (!list) return json({ code: "PGRST205", message: `Could not find the table '${name}'` }, 404);
  const method = (init?.method ?? "GET").toUpperCase();
  const now = new Date().toISOString();
  if (method === "GET" || method === "HEAD") return reply(sortRows(filtered(url, list), url.searchParams.get("order")));
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (method === "POST") {
    const made: Row[] = [];
    for (const item of Array.isArray(body) ? body : [body]) {
      const existing = BY_CODE.has(name) ? list.find((r) => r.code === item.code) : undefined;
      if (existing && !url.searchParams.get("on_conflict")) return json({ code: "23505", message: "duplicate key" }, 409);
      if (existing) {
        Object.assign(existing, item, { updated_at: now });
        made.push(existing);
      } else {
        const row = name === "packages" ? makeRow(item) : makeOther(name, item);
        list.push(row);
        made.push(row);
      }
    }
    return reply(made, 201);
  }
  if (method === "PATCH") {
    const hit = filtered(url, list);
    for (const r of hit) Object.assign(r, body, name === "package_moves" ? {} : { updated_at: now });
    return reply(hit);
  }
  if (method === "DELETE") {
    const hit = filtered(url, list);
    for (const r of hit) {
      list.splice(list.indexOf(r), 1);
      // The real schema cascades a package's moves when it is removed.
      if (name === "packages") for (const m of moves.filter((x) => x.package_code === r.code)) moves.splice(moves.indexOf(m), 1);
    }
    return reply(hit);
  }
  return json({ message: "unsupported" }, 405);
}

async function storage(url: URL, init: RequestInit | undefined): Promise<Response> {
  const p = decodeURIComponent(url.pathname.replace(/^.*\/storage\/v1\//, ""));
  const method = (init?.method ?? "GET").toUpperCase();
  let m: RegExpExecArray | null;
  if ((m = /^object\/list\/([^/]+)$/.exec(p)) && method === "POST") {
    const { prefix = "" } = JSON.parse(String(init?.body ?? "{}"));
    const bucket = m[1];
    const names = [...files.keys()]
      .filter((k) => k.startsWith(`${bucket}/`))
      .map((k) => k.slice(bucket.length + 1))
      .filter((k) => (prefix ? k.startsWith(`${prefix}/`) : true))
      .map((k) => (prefix ? k.slice(prefix.length + 1) : k));
    return json(names.map((name) => ({ name, id: name, metadata: {} })));
  }
  if ((m = /^object\/([^/]+)$/.exec(p)) && method === "DELETE") {
    const { prefixes = [] } = JSON.parse(String(init?.body ?? "{}"));
    for (const k of prefixes as string[]) {
      const key = `${m[1]}/${k}`;
      files.delete(key);
      const u = urls.get(key);
      if (u) URL.revokeObjectURL(u);
      urls.delete(key);
    }
    return json((prefixes as string[]).map((name) => ({ name })));
  }
  if ((m = /^object\/(?:public\/|authenticated\/)?(.+)$/.exec(p))) {
    const key = m[1];
    if (method === "POST" || method === "PUT") {
      files.set(key, await bodyBlob(init));
      const u = urls.get(key);
      if (u) URL.revokeObjectURL(u);
      urls.delete(key);
      return json({ Key: key, Id: key });
    }
    if (method === "GET") {
      const f = files.get(key);
      return f ? new Response(f, { status: 200 }) : json({ statusCode: "404", error: "not_found", message: "Object not found" }, 400);
    }
  }
  return json({ message: `unsupported ${method} ${p}` }, 400);
}

export const demoFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  const headers = new Headers(init?.headers ?? req?.headers);
  await new Promise((r) => setTimeout(r, 120)); // feel like a network
  if (url.pathname.includes("/rest/v1/")) return rest(url, init, headers);
  if (url.pathname.includes("/storage/v1/")) return storage(url, init);
  return json({ message: "offline demo" }, 404);
};

// ------------------------------------------------------------ example rows

function boxPhoto(label: string, tone: string): Promise<{ full: Blob; thumb: Blob }> {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 960;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3a3d42";
  g.fillRect(0, 0, 1280, 960);
  g.fillStyle = "#4a4e55";
  g.fillRect(0, 700, 1280, 260);
  g.fillStyle = tone;
  g.fillRect(320, 220, 640, 520);
  g.fillStyle = "rgba(0,0,0,.18)";
  g.fillRect(620, 220, 40, 520);
  g.fillStyle = "#fff";
  g.fillRect(380, 300, 220, 150);
  g.fillStyle = "#111";
  g.font = "bold 34px sans-serif";
  g.fillText(label, 395, 390, 190);
  const t = document.createElement("canvas");
  t.width = t.height = 320;
  t.getContext("2d")!.drawImage(c, 160, 0, 960, 960, 0, 0, 320, 320);
  const enc = (cv: HTMLCanvasElement, q: number) =>
    new Promise<Blob>((r) => cv.toBlob((b) => r(b ?? new Blob()), "image/jpeg", q));
  return Promise.all([enc(c, 0.72), enc(t, 0.7)]).then(([full, thumb]) => ({ full, thumb }));
}

let seeded = false;

export async function seedDemo() {
  if (seeded) return;
  seeded = true;
  const hour = 3_600_000;
  const at = (h: number) => new Date(Date.now() - h * hour).toISOString();
  const examples = [
    { code: "VW-EX4M7P", job_name: "Example: Maple St remodel", po_number: "40211", vendor: "Ferguson", delivered_by: "UPS", received_by: "Dana", pm: "Rick", packing_slip_received: true, quantities: "2 cartons, 14 fittings", damaged: false, color_tag: "Blue", notes: "Keep off the dock door", received_at: at(2), photo: ["PO 40211", "#b38b59"] },
    { code: "VW-EX9K2R", job_name: "Example: Harbor clinic", po_number: "40198", vendor: "Graybar", delivered_by: "Vendor truck", received_by: "Luis", pm: "Ana", packing_slip_received: false, quantities: "1 pallet wire", damaged: true, color_tag: "Red", notes: "Corner crushed, photo taken", received_at: at(26), photo: ["GRAYBAR", "#9c7a4e"] },
    { code: "012345678905", job_name: "Example: Oak Ave tenant", vendor: "Home Depot Pro", color_tag: "Green", received_at: at(70), photo: null },
    { code: "VW-EXL9Q4", job_name: "Example: Copper stub-outs", vendor: "Ferguson", color_tag: "Orange", notes: "From the old shelf count", received_at: at(24 * 240), legacy: true, photo: ["COPPER", "#a07b4c"] },
    { code: "VW-EXL2M8", job_name: "Unknown, check with PM", notes: "No paperwork. Grey totes, fittings.", received_at: at(1), legacy: true, photo: null },
    { code: "VW-EX3H8T", job_name: "Example: Ridge school", po_number: "40150", vendor: "Rexel", received_by: "Dana", color_tag: "Yellow", received_at: at(120), status: "checked_out", checked_out_to: "Truck 3", checked_out_at: at(5), photo: ["REXEL", "#a98552"] },
  ];
  const places: Record<string, Array<[string, number, string]>> = {
    "VW-EX4M7P": [["Warehouse", 2, "Dana"]],
    "VW-EX9K2R": [["Warehouse", 26, "Luis"], ["Conex 2", 6, "Luis"]],
    "012345678905": [["Warehouse", 70, "Dana"], ["Metal shop", 30, "Rick"]],
    "VW-EX3H8T": [["Warehouse", 120, "Dana"]],
    "VW-EXL9Q4": [["Conex 3", 1, "Dana"]],
    "VW-EXL2M8": [["Metal shop", 1, "Rick"]],
  };
  for (const { photo, ...item } of examples) {
    const trail = places[item.code] ?? [];
    let from: string | null = null;
    for (const [to, h, by] of trail) {
      moves.push(makeOther("package_moves", { package_code: item.code, from_location: from, to_location: to, moved_by: by, moved_at: at(h) }));
      from = to;
    }
    const last = trail[trail.length - 1];
    const row = makeRow({ ...item, last_location: last?.[0] ?? null, location_at: last ? at(last[1]) : null });
    if (photo) {
      const p = await boxPhoto(photo[0], photo[1]);
      row.photo_path = `${row.code}/ex.jpg`;
      row.thumb_path = `${row.code}/ex-t.jpg`;
      files.set(`package-photos/${row.photo_path}`, p.full);
      files.set(`package-photos/${row.thumb_path}`, p.thumb);
    }
    rows.push(row);
  }
  returns.push(
    makeOther("returns", { code: "VVR-4127", type: "vendor", returned_by: "Luis", vendor: "Ferguson", job_name: "Example: Harbor clinic", notes: "Wrong size couplings", created_at: at(3) }),
    makeOther("returns", { code: "VRR-0583", type: "general", returned_by: "Marco", notes: "Leftover from Oak Ave, not sure", created_at: at(20) }),
    makeOther("returns", { code: "VWR-9902", type: "warranty", vendor: "Rexel", status: "closed", created_at: at(90), closed_at: at(40), closed_by: "Ana", close_note: "RMA 55120 shipped" }),
  );
}
