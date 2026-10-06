import { sb } from "@/lib/supabase";

/** One-tap places. Anything else is typed in under "Other". */
export const LOCATIONS = ["Warehouse", "Metal shop", "Conex 1", "Conex 2", "Conex 3", "Conex 4"] as const;
export const DEFAULT_LOCATION = LOCATIONS[0];

export type Move = {
  id: number;
  from: string | null;
  to: string;
  by: string | null;
  at: string;
};

type MoveRow = { id: number; package_code: string; from_location: string | null; to_location: string; moved_by: string | null; moved_at: string };

export function cleanLocation(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function moveRow(code: string, from: string | null, to: string, by: string | null) {
  return { package_code: code, from_location: from, to_location: to, moved_by: by?.trim().slice(0, 80) || null };
}

export async function listMoves(code: string): Promise<Move[]> {
  const { data, error } = await sb()
    .from("package_moves")
    .select("id, package_code, from_location, to_location, moved_by, moved_at")
    .eq("package_code", code)
    .order("moved_at", { ascending: false });
  if (error) throw new Error(error.message || "Could not load the location history.");
  return ((data ?? []) as MoveRow[]).map((r) => ({ id: Number(r.id), from: r.from_location, to: r.to_location, by: r.moved_by, at: r.moved_at }));
}

export async function listAllMoves(): Promise<Array<Move & { code: string }>> {
  const { data, error } = await sb()
    .from("package_moves")
    .select("id, package_code, from_location, to_location, moved_by, moved_at")
    .order("moved_at", { ascending: true });
  if (error) throw new Error(error.message || "Could not load the location history.");
  return ((data ?? []) as MoveRow[]).map((r) => ({ id: Number(r.id), code: r.package_code, from: r.from_location, to: r.to_location, by: r.moved_by, at: r.moved_at }));
}
