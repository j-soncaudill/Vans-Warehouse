import { describe, expect, it } from "vitest";
import { b64url, encryptPayload, findWaiting, fromB64url, handle, newYorkClock, summary, vapidHeader, makeVapidKeys, type BoxRow } from "../../supabase/functions/daily-alerts/index";

// RFC 8291 section 5 example.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const jwk = (pub: string, d: string): JsonWebKey => {
  const raw = fromB64url(pub);
  return { kty: "EC", crv: "P-256", x: b64url(raw.slice(1, 33)), y: b64url(raw.slice(33, 65)), d };
};

/** Decrypts like a phone would (RFC 8291), to check our messages end to end. */
async function decrypt(body: Uint8Array, uaPublic: string, uaPrivate: string, auth: string): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const priv = await crypto.subtle.importKey("jwk", jwk(uaPublic, uaPrivate), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256));
  const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]), n * 8));
  const te = new TextEncoder();
  const ikm = await hk(fromB64url(auth), ecdh, new Uint8Array([...te.encode("WebPush: info\0"), ...fromB64url(uaPublic), ...asPublic]), 32);
  const cek = await hk(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hk(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, cipher as BufferSource));
  return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)));
}

describe("web push encryption", () => {
  it("matches the RFC 8291 example byte for byte", async () => {
    const body = await encryptPayload(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, {
      ephemeral: { privateJwk: jwk(RFC.asPublic, RFC.asPrivate), publicRaw: fromB64url(RFC.asPublic) },
      salt: fromB64url(RFC.salt),
    });
    expect(b64url(body)).toBe(RFC.body);
  });
  it("round-trips with a fresh key", async () => {
    const body = await encryptPayload('{"title":"hi"}', { p256dh: RFC.uaPublic, auth: RFC.auth });
    expect(await decrypt(body, RFC.uaPublic, RFC.uaPrivate, RFC.auth)).toBe('{"title":"hi"}');
  });
  it("signs a VAPID header that verifies", async () => {
    const keys = await makeVapidKeys();
    const h = await vapidHeader("https://web.push.apple.com/abc", keys, "https://floorcast.pages.dev", Date.parse("2026-10-08T11:00:00Z"));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, sig] = token.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64url(claims)))).toMatchObject({ aud: "https://web.push.apple.com", sub: "https://floorcast.pages.dev" });
    const pub = await crypto.subtle.importKey("raw", fromB64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(sig), new TextEncoder().encode(`${head}.${claims}`))).toBe(true);
  });
});

describe("alert rules", () => {
  const now = Date.parse("2026-10-08T11:00:00Z");
  const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const box = (code: string, place: string, days: number, status = "on_floor"): BoxRow => ({ code, job_name: code, status, last_location: place, location_at: ago(days), received_at: ago(days + 5) });
  it("counts Warehouse and Metal shop at 30+ days, never a Conex", () => {
    const w = findWaiting(
      [box("A", "Warehouse", 30), box("B", "Metal shop", 45), box("C", "Conex 2", 90), box("D", "Warehouse", 29), box("E", "Warehouse", 60, "checked_out"), box("F", "Trailer 7", 60)],
      [{ code: "VVR-1", status: "open", created_at: ago(14) }, { code: "VRS-2", status: "open", created_at: ago(13) }, { code: "VWR-3", status: "closed", created_at: ago(50) }],
      30,
      14,
      now,
    );
    expect(w.boxes.map((b) => b.code)).toEqual(["A", "B"]);
    expect(w.returns.map((r) => r.code)).toEqual(["VVR-1"]);
    expect(summary(w, 30, 14)).toMatchObject({ title: "Floorcast: 2 boxes waiting, 1 return waiting", url: "/reports" });
    expect(summary({ boxes: [], returns: [] }, 30, 14)).toBeNull();
  });
  it("sends at 7 AM New York in summer and winter", () => {
    expect(newYorkClock(Date.parse("2026-07-01T11:00:00Z"))).toEqual({ hour: 7, day: "2026-07-01" });
    expect(newYorkClock(Date.parse("2026-12-01T12:00:00Z"))).toEqual({ hour: 7, day: "2026-12-01" });
    expect(newYorkClock(Date.parse("2026-12-01T11:00:00Z")).hour).toBe(6);
  });
});

describe("daily job", () => {
  it("makes keys, sends one summary at 7 AM, never twice a day, and drops dead phones", async () => {
    const tables: Record<string, Array<Record<string, string>>> = { alert_state: [], settings: [{ key: "alert_box_days", value: "30" }, { key: "alert_return_days", value: "14" }] };
    const sent: Array<{ endpoint: string; body: Uint8Array; auth: string }> = [];
    const now = Date.parse("2026-10-08T11:00:00Z");
    const ago = (d: number) => new Date(now - d * 86_400_000).toISOString();
    const subs = [
      { endpoint: "https://push.example/live", p256dh: RFC.uaPublic, auth: RFC.auth },
      { endpoint: "https://push.example/gone", p256dh: RFC.uaPublic, auth: RFC.auth },
    ];
    const fake: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.host === "push.example") {
        sent.push({ endpoint: url.href, body: init!.body as Uint8Array, auth: String((init!.headers as Record<string, string>).Authorization) });
        return new Response("", { status: url.pathname === "/gone" ? 410 : 201 });
      }
      const table = url.pathname.split("/").pop()!;
      if (init?.method === "POST") {
        for (const row of JSON.parse(String(init.body)) as Array<Record<string, string>>) {
          const list = (tables[table] ??= []);
          const i = list.findIndex((r) => r.key === row.key);
          if (i >= 0) list[i] = row;
          else list.push(row);
        }
        return new Response(null, { status: 201 });
      }
      if (init?.method === "DELETE") {
        const ep = decodeURIComponent(url.searchParams.get("endpoint")!.replace(/^eq\./, ""));
        subs.splice(subs.findIndex((s) => s.endpoint === ep), 1);
        return new Response(null, { status: 204 });
      }
      if (table === "packages") return Response.json([{ code: "VW-AAAAAA", job_name: "Elm", status: "on_floor", last_location: "Warehouse", location_at: ago(31), received_at: ago(40) }]);
      if (table === "returns") return Response.json([{ code: "VVR-0001", status: "open", created_at: ago(20) }]);
      if (table === "push_subscriptions") return Response.json(subs);
      const key = url.searchParams.get("key")?.replace(/^eq\./, "");
      return Response.json((tables[table] ?? []).filter((r) => !key || r.key === key));
    };
    const env = { url: "https://proj.supabase.co", key: "service", contact: "https://floorcast.pages.dev" };
    const post = (body: unknown = {}) => new Request("https://fn/daily-alerts", { method: "POST", body: JSON.stringify(body) });

    const early = await (await handle(post(), env, fake, Date.parse("2026-10-08T10:00:00Z"))).json();
    expect(early.skipped).toMatch(/6:00/);
    expect(tables.settings.find((r) => r.key === "alerts_public_key")?.value).toMatch(/^B/);

    const first = await (await handle(post(), env, fake, now)).json();
    expect(first).toMatchObject({ sent: 1, gone: 1 });
    expect(sent).toHaveLength(2);
    const msg = JSON.parse(await decrypt(sent[0].body, RFC.uaPublic, RFC.uaPrivate, RFC.auth));
    expect(msg).toMatchObject({ title: "Floorcast: 1 box waiting, 1 return waiting", url: "/reports" });
    expect(sent[0].auth).toMatch(/^vapid t=.+, k=B/);
    expect(subs.map((s) => s.endpoint)).toEqual(["https://push.example/live"]);

    const again = await (await handle(post(), env, fake, now + 3_600_000 - 1)).json();
    expect(again.skipped).toMatch(/Already sent/);

    const test = await (await handle(post({ test: true, endpoint: "https://push.example/live" }), env, fake, now)).json();
    expect(test).toMatchObject({ ok: true, sent: 1 });
  });
});
