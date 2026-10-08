// Floorcast — daily admin alerts (Supabase Edge Function "daily-alerts").
//
// Once a day at 7 AM New York time it sends one summary to every Administrator
// phone that turned alerts on:
//   • boxes sitting in Warehouse or Metal shop for 30+ days (any Conex never counts)
//   • returns open for 14+ days
// The day counts live in the settings table (alert_box_days, alert_return_days).
//
// Free: Supabase Edge Functions + Supabase Cron, standard Web Push (no paid
// push service), and only the Web Crypto built into the runtime (no libraries).
// The database key it uses (SUPABASE_SERVICE_ROLE_KEY) is provided by Supabase
// inside the function; it is never in the app or this repo.
//
// Setup is in README.md ("Admin alerts"). Paste this whole file as the
// function's index.ts. The scheduler calls it at 11:00 and 12:00 UTC; it only
// sends when it is 7 AM in New York, so daylight saving needs no changes.

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Response | Promise<Response>): void };

// ------------------------------------------------------------------ encoding

const enc = new TextEncoder();
const newBytes = (n: number) => new Uint8Array(new ArrayBuffer(n));
/** A byte array backed by a plain ArrayBuffer (what Web Crypto wants). No generic syntax, so older TypeScript reads it too. */
type Bytes = ReturnType<typeof newBytes>;

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(text: string): Bytes {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = newBytes(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = newBytes(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

// ------------------------------------------------------------------ keys

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

/** A new signing key pair for this server (RFC 8292). Public key is base64url, uncompressed point. */
export async function makeVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return { publicKey: b64url(raw), privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) };
}

/** VAPID Authorization header for one push service origin. */
export async function vapidHeader(endpoint: string, keys: VapidKeys, contact: string, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: contact };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey("jwk", { ...keys.privateJwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  // Web Crypto returns the raw r||s signature JWTs use.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${body}`));
  return `vapid t=${header}.${body}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ------------------------------------------------------------------ encryption (RFC 8291, aes128gcm)

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Server's one-time ECDH key; tests pass a fixed one to check against the RFC example. */
export type Ephemeral = { privateJwk: JsonWebKey; publicRaw: Bytes };

async function newEphemeral(): Promise<Ephemeral> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return {
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
    publicRaw: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
  };
}

/** Encrypts a push message body for one phone. Returns the aes128gcm request body. */
export async function encryptPayload(
  plaintext: string,
  sub: { p256dh: string; auth: string },
  fixed?: { ephemeral: Ephemeral; salt: Bytes },
): Promise<Bytes> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const eph = fixed?.ephemeral ?? (await newEphemeral());
  const salt = fixed?.salt ?? crypto.getRandomValues(newBytes(16));

  const asPrivate = await crypto.subtle.importKey("jwk", { ...eph.privateJwk, key_ops: ["deriveBits"] }, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asPrivate, 256));

  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, eph.publicRaw);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const record = concat(enc.encode(plaintext), new Uint8Array([2])); // 2 = last record, no padding
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, record));

  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([eph.publicRaw.length]), eph.publicRaw, cipher);
}

export type Subscription = { endpoint: string; p256dh: string; auth: string };

/** Sends one message. Returns the push service's HTTP status (404/410 = phone gone). */
export async function sendPush(sub: Subscription, message: unknown, keys: VapidKeys, contact: string, fetcher: typeof fetch = fetch): Promise<number> {
  const body = await encryptPayload(JSON.stringify(message), sub);
  const res = await fetcher(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys, contact),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(20 * 3600),
      Urgency: "normal",
    },
    body,
  });
  return res.status;
}

// ------------------------------------------------------------------ the rules

const ALERT_PLACES = ["warehouse", "metal shop"];
const DAY = 86_400_000;

export type BoxRow = { code: string; job_name: string; status: string; last_location: string | null; location_at: string | null; received_at: string };
export type ReturnRow = { code: string; status: string; created_at: string };

/**
 * Boxes on the floor in Warehouse or Metal shop for `boxDays`+ days (counted
 * from when they were marked there), and returns open `returnDays`+ days.
 * Any Conex, or a typed place, never counts.
 */
export function findWaiting(boxes: BoxRow[], returns: ReturnRow[], boxDays: number, returnDays: number, now = Date.now()) {
  const old = (iso: string | null, days: number) => !!iso && now - Date.parse(iso) >= days * DAY;
  const waitingBoxes = boxes.filter(
    (b) => b.status === "on_floor" && ALERT_PLACES.includes((b.last_location ?? "").trim().toLowerCase()) && old(b.location_at ?? b.received_at, boxDays),
  );
  const waitingReturns = returns.filter((r) => r.status === "open" && old(r.created_at, returnDays));
  return { boxes: waitingBoxes, returns: waitingReturns };
}

/** One short summary. Null when there is nothing to say. */
export function summary(w: ReturnType<typeof findWaiting>, boxDays: number, returnDays: number) {
  const nb = w.boxes.length;
  const nr = w.returns.length;
  if (!nb && !nr) return null;
  const byPlace = new Map<string, number>();
  for (const b of w.boxes) {
    const place = (b.last_location ?? "").trim();
    byPlace.set(place, (byPlace.get(place) ?? 0) + 1);
  }
  const parts: string[] = [];
  if (nb) parts.push(`${[...byPlace].map(([p, n]) => `${p} ${n}`).join(" · ")}: ${nb === 1 ? "1 box" : `${nb} boxes`} sitting ${boxDays}+ days.`);
  if (nr) parts.push(`${nr === 1 ? "1 return" : `${nr} returns`} open ${returnDays}+ days.`);
  const title = [nb ? `${nb} ${nb === 1 ? "box" : "boxes"} waiting` : "", nr ? `${nr} ${nr === 1 ? "return" : "returns"} waiting` : ""].filter(Boolean).join(", ");
  return { title: `Floorcast: ${title}`, body: parts.join(" "), url: "/reports", tag: "floorcast-daily" };
}

/** The hour and date in New York, so "7 AM" follows daylight saving. */
export function newYorkClock(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: Number(get("hour")), day: `${get("year")}-${get("month")}-${get("day")}` };
}

export const SEND_HOUR = 7;

// ------------------------------------------------------------------ database (PostgREST with the function's own key)

type Env = { url: string; key: string; contact: string };

function db(env: Env, fetcher: typeof fetch) {
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" };
  const rest = `${env.url.replace(/\/$/, "")}/rest/v1`;
  return {
    async get<T>(path: string): Promise<T> {
      const res = await fetcher(`${rest}/${path}`, { headers });
      if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
      return (await res.json()) as T;
    },
    async upsert(table: string, rows: unknown) {
      const res = await fetcher(`${rest}/${table}?on_conflict=key`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    },
    async remove(table: string, filter: string) {
      await fetcher(`${rest}/${table}?${filter}`, { method: "DELETE", headers });
    },
  };
}

type Db = ReturnType<typeof db>;

async function loadKeys(d: Db): Promise<VapidKeys> {
  const state = await d.get<Array<{ key: string; value: string }>>("alert_state?select=key,value");
  const get = (k: string) => state.find((r) => r.key === k)?.value;
  let keys: VapidKeys;
  if (get("vapid_public") && get("vapid_private")) {
    keys = { publicKey: get("vapid_public")!, privateJwk: JSON.parse(get("vapid_private")!) as JsonWebKey };
  } else {
    keys = await makeVapidKeys();
    await d.upsert("alert_state", [
      { key: "vapid_public", value: keys.publicKey },
      { key: "vapid_private", value: JSON.stringify(keys.privateJwk) },
    ]);
  }
  // Phones read the public key from settings when they turn alerts on.
  await d.upsert("settings", [{ key: "alerts_public_key", value: keys.publicKey }]);
  return keys;
}

async function setting(d: Db, key: string, fallback: number): Promise<number> {
  const rows = await d.get<Array<{ value: string }>>(`settings?select=value&key=eq.${key}`);
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function deliver(d: Db, env: Env, keys: VapidKeys, subs: Subscription[], message: unknown, fetcher: typeof fetch) {
  let sent = 0;
  let gone = 0;
  for (const s of subs) {
    try {
      const status = await sendPush(s, message, keys, env.contact, fetcher);
      if (status === 404 || status === 410) {
        gone += 1;
        await d.remove("push_subscriptions", `endpoint=eq.${encodeURIComponent(s.endpoint)}`);
      } else if (status < 300) sent += 1;
    } catch {
      /* one phone failing never stops the rest */
    }
  }
  return { sent, gone };
}

/**
 * POST {} from the scheduler: sends the daily summary at 7 AM New York, once a day.
 * POST {"test": true, "endpoint": "..."} from Backup & setup: one test alert to that phone.
 * POST {"setup": true}: makes the keys now so phones can turn alerts on before 7 AM.
 */
export async function handle(req: Request, env: Env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" } });
  if (req.method === "OPTIONS") return json({ ok: true });
  if (!env.url || !env.key) return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, 500);
  const d = db(env, fetcher);
  const input = (await req.json().catch(() => ({}))) as { test?: boolean; endpoint?: string; setup?: boolean };
  const keys = await loadKeys(d);
  if (input.setup) return json({ ok: true, publicKey: keys.publicKey });

  if (input.test) {
    if (!input.endpoint) return json({ error: "No phone given." }, 400);
    const subs = await d.get<Subscription[]>(`push_subscriptions?select=endpoint,p256dh,auth&endpoint=eq.${encodeURIComponent(input.endpoint)}`);
    if (!subs.length) return json({ error: "This phone is not signed up for alerts." }, 404);
    const r = await deliver(d, env, keys, subs, { title: "Floorcast test alert", body: "Alerts work on this phone. The daily summary comes at 7 AM Eastern.", url: "/reports", tag: "floorcast-test" }, fetcher);
    return json({ ok: r.sent > 0, ...r });
  }

  const clock = newYorkClock(now);
  if (clock.hour !== SEND_HOUR) return json({ skipped: `It is ${clock.hour}:00 in New York; alerts go out at ${SEND_HOUR}:00.` });
  const state = await d.get<Array<{ value: string }>>("alert_state?select=value&key=eq.last_sent");
  if (state[0]?.value === clock.day) return json({ skipped: `Already sent for ${clock.day}.` });

  const boxDays = await setting(d, "alert_box_days", 30);
  const returnDays = await setting(d, "alert_return_days", 14);
  const boxes = await d.get<BoxRow[]>("packages?select=code,job_name,status,last_location,location_at,received_at&status=eq.on_floor");
  const returns = await d.get<ReturnRow[]>("returns?select=code,status,created_at&status=eq.open");
  const message = summary(findWaiting(boxes, returns, boxDays, returnDays, now), boxDays, returnDays);
  await d.upsert("alert_state", [{ key: "last_sent", value: clock.day }]);
  if (!message) return json({ sent: 0, note: "Nothing waiting today." });
  const subs = await d.get<Subscription[]>("push_subscriptions?select=endpoint,p256dh,auth");
  return json({ ...(await deliver(d, env, keys, subs, message, fetcher)), message });
}

if (typeof Deno !== "undefined") {
  Deno.serve((req) =>
    handle(req, {
      url: Deno.env.get("SUPABASE_URL") ?? "",
      key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      contact: Deno.env.get("ALERTS_CONTACT") ?? "https://floorcast.pages.dev",
    }),
  );
}
