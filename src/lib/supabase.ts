import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_URL, demoFetch, seedDemo } from "@/lib/demo";

export const IS_DEMO: boolean = typeof __DEMO__ === "boolean" && __DEMO__;

export const BARCODES_BUCKET = "barcodes";
export const PHOTOS_BUCKET = "package-photos";

export function supabaseUrl(): string {
  if (IS_DEMO) return DEMO_URL;
  const raw = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  // A bare project ref also works.
  return `https://${raw}.supabase.co`;
}

function anonKey(): string {
  if (IS_DEMO) return "demo";
  return (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

export function isConfigured(): boolean {
  return Boolean(supabaseUrl() && anonKey());
}

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (client) return client;
  if (!isConfigured()) throw new Error("Supabase is not configured.");
  client = createClient(supabaseUrl(), anonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(IS_DEMO ? { global: { fetch: demoFetch } } : {}),
  });
  return client;
}

type PgError = { message?: string; code?: string } | null | undefined;

export function isTableMissing(error: PgError): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /could not find the table/i.test(error.message ?? "") ||
    /relation .* does not exist/i.test(error.message ?? "")
  );
}

export function isColumnMissing(error: PgError): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

export type SchemaState = "unconfigured" | "missing" | "outdated" | "upgrade" | "ready" | "offline";

/** One cheap REST call to see whether schema.sql has been run. */
export async function probeSchema(): Promise<SchemaState> {
  if (!isConfigured()) return "unconfigured";
  if (IS_DEMO) await seedDemo();
  try {
    const { error } = await sb().from("packages").select("id, photo_path, thumb_path").limit(1);
    if (error) {
      if (isTableMissing(error)) return "missing";
      if (isColumnMissing(error)) return "outdated";
      return "offline";
    }
    // Locations and returns came later (migrations/002). Older databases
    // keep working once that migration runs; nothing is dropped.
    const [loc, ret] = await Promise.all([
      sb().from("packages").select("last_location").limit(1),
      sb().from("returns").select("id").limit(1),
    ]);
    if (isColumnMissing(loc.error) || isTableMissing(ret.error)) return "upgrade";
    if (loc.error || ret.error) return "offline";
    return "ready";
  } catch {
    return "offline";
  }
}
