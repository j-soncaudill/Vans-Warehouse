import { sb } from "@/lib/supabase";

const KEY = "vw.unlocked";
const ROLE_KEY = "vw.role";

/** Field phones need no PIN and can't change or delete. Admin is the shop PIN. */
export type Role = "admin" | "field";

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash of VITE_SHOP_PIN, injected at build time. Empty when unset. */
const BUILD_HASH: string = typeof __SHOP_PIN_HASH__ === "string" ? __SHOP_PIN_HASH__ : "";

/** Optional override: settings row key = 'shop_pin_hash'. */
async function remoteHash(): Promise<string | null> {
  try {
    const { data } = await sb().from("settings").select("value").eq("key", "shop_pin_hash").maybeSingle();
    return data?.value ? String(data.value).trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function acceptedHashes(): Promise<string[]> {
  const remote = await remoteHash();
  return [BUILD_HASH, remote].filter((h): h is string => Boolean(h));
}

/** Changing the PIN re-locks every device: we keep the hash, not a flag. */
export async function isUnlocked(): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (!stored) return false;
  if (stored === BUILD_HASH) return true;
  return (await acceptedHashes()).includes(stored);
}

/** Admin while the stored PIN hash is still valid; field if chosen; otherwise ask. */
export async function currentRole(): Promise<Role | null> {
  if (await isUnlocked()) return "admin";
  try {
    return localStorage.getItem(ROLE_KEY) === "field" ? "field" : null;
  } catch {
    return null;
  }
}

export function chooseField() {
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(ROLE_KEY, "field");
  } catch {
    /* private mode: field for this tab only */
  }
}

/** Forget this phone's role; the chooser shows next. */
export function lock() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ROLE_KEY);
  } catch {
    /* ignore */
  }
}

export async function unlock(pin: string): Promise<"ok" | "wrong" | "unset"> {
  const hashes = await acceptedHashes();
  if (hashes.length === 0) return "unset";
  const entered = await sha256Hex(pin.trim());
  if (!hashes.includes(entered)) return "wrong";
  try {
    localStorage.setItem(KEY, entered);
    localStorage.setItem(ROLE_KEY, "admin");
  } catch {
    /* private mode: unlocked for this tab only */
  }
  return "ok";
}
