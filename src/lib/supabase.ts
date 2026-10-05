import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BARCODES_BUCKET = "barcodes";
export const PHOTOS_BUCKET = "package-photos";

export function supabaseUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  // A bare project ref also works.
  return `https://${raw}.supabase.co`;
}

function anonKey(): string {
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

export type SchemaState = "unconfigured" | "missing" | "outdated" | "ready" | "offline";

/** One cheap REST call to see whether schema.sql has been run. */
export async function probeSchema(): Promise<SchemaState> {
  if (!isConfigured()) return "unconfigured";
  try {
    const { error } = await sb().from("packages").select("id, photo_path, thumb_path").limit(1);
    if (!error) return "ready";
    if (isTableMissing(error)) return "missing";
    if (isColumnMissing(error)) return "outdated";
    return "offline";
  } catch {
    return "offline";
  }
}
