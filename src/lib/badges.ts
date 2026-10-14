import { isNetworkError } from "@/lib/offline";
import { sb } from "@/lib/supabase";

/**
 * Lanyard badges for the check-out station. The QR on a badge holds
 * "VW-BADGE:<token>"; the token points at one person in the employees table.
 * Printing a new badge gives the person a new token, so a lost badge stops
 * working.
 */
export const BADGE_PREFIX = "VW-BADGE:";

export type BadgeRole = "crew" | "admin";
export type Employee = { id: number; name: string; badge: string; role: BadgeRole; createdAt: string };
type Row = { id: number; name: string; badge: string; role?: string | null; created_at: string };

const COLS = "id, name, badge, role, created_at";
const mapRow = (r: Row): Employee => ({ id: r.id, name: r.name, badge: r.badge, role: r.role === "admin" ? "admin" : "crew", createdAt: r.created_at });

const TOKEN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function mintBadge(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

export const badgePayload = (badge: string) => `${BADGE_PREFIX}${badge}`;

/** The token in a scanned badge, or null when the scan isn't a badge. */
export function badgeToken(raw: string): string | null {
  const t = raw.trim().toUpperCase();
  if (!t.startsWith(BADGE_PREFIX)) return null;
  const token = t.slice(BADGE_PREFIX.length).replace(/\s+/g, "");
  return /^[A-Z0-9]{8,24}$/.test(token) ? token : null;
}

export const isBadgeScan = (raw: string) => raw.trim().toUpperCase().startsWith(BADGE_PREFIX);

// ------------------------------------------------------------------ admin list

export async function listEmployees(): Promise<Employee[]> {
  const { data, error } = await sb().from("employees").select(COLS).order("name", { ascending: true });
  if (error) throw error;
  // Admins first, then crew; each by name.
  const list = (data as Row[]).map(mapRow).sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.name.localeCompare(b.name));
  rememberBadges(list);
  return list;
}

const cleanName = (name: string) => name.trim().replace(/\s+/g, " ").slice(0, 80);

export async function addEmployee(name: string, role: BadgeRole = "crew"): Promise<Employee> {
  const n = cleanName(name);
  if (!n) throw new Error("Enter a name.");
  const { data, error } = await sb().from("employees").insert({ name: n, badge: mintBadge(), role }).select(COLS).single();
  if (error) throw error;
  return mapRow(data as Row);
}

export async function renameEmployee(id: number, name: string): Promise<Employee> {
  const n = cleanName(name);
  if (!n) throw new Error("Enter a name.");
  const { data, error } = await sb().from("employees").update({ name: n }).eq("id", id).select(COLS).single();
  if (error) throw error;
  return mapRow(data as Row);
}

/** Crew ⇄ admin. The badge keeps working; reprint it to get the matching design. */
export async function setEmployeeRole(id: number, role: BadgeRole): Promise<Employee> {
  const { data, error } = await sb().from("employees").update({ role }).eq("id", id).select(COLS).single();
  if (error) throw error;
  return mapRow(data as Row);
}

/** A new badge for a lost or damaged one. The old badge stops working right away. */
export async function reissueBadge(id: number): Promise<Employee> {
  const { data, error } = await sb().from("employees").update({ badge: mintBadge() }).eq("id", id).select(COLS).single();
  if (error) throw error;
  return mapRow(data as Row);
}

export async function removeEmployee(id: number): Promise<void> {
  const { error } = await sb().from("employees").delete().eq("id", id);
  if (error) throw error;
}

// ------------------------------------------------------------------ station lookup

const CACHE = "vw.badges";

/** The station keeps the badge list so people can still sign in with no signal. */
function rememberBadges(list: Employee[]) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(list.map((e) => ({ name: e.name, badge: e.badge }))));
  } catch {
    /* ignore */
  }
}

function cachedBadge(token: string): string | null {
  try {
    const list = JSON.parse(localStorage.getItem(CACHE) ?? "[]") as Array<{ name: string; badge: string }>;
    return list.find((e) => e.badge === token)?.name ?? null;
  } catch {
    return null;
  }
}

/** The name on a badge, or null when the badge was replaced or removed. */
export async function whoseBadge(token: string): Promise<string | null> {
  try {
    const { data, error } = await sb().from("employees").select("name").eq("badge", token).maybeSingle();
    if (error) throw error;
    return (data as { name: string } | null)?.name ?? null;
  } catch (err) {
    if (isNetworkError(err)) return cachedBadge(token);
    throw err;
  }
}

/** Refresh the offline badge list (the station does this when it opens). */
export const refreshBadgeCache = () => listEmployees().then(() => undefined, () => undefined);
