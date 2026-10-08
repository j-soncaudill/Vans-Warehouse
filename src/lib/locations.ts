import * as offline from "@/lib/offline";
import type { MoveOp } from "@/lib/offline";
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
  await offline.loaded;
  // Offline: the history as last seen, plus moves made on this phone since.
  const local = () => {
    const pending = offline
      .pendingFor(code)
      .filter((o): o is MoveOp => o.kind === "move")
      .map((o, i) => ({ id: -1 - i, from: o.from, to: o.to, by: o.by, at: o.at }));
    return [...pending, ...(offline.cachedMoves(code) ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  };
  if (offline.isOffline()) return local();
  const { data, error } = await sb()
    .from("package_moves")
    .select("id, package_code, from_location, to_location, moved_by, moved_at")
    .eq("package_code", code)
    .order("moved_at", { ascending: false });
  if (error) {
    if (offline.isNetworkError(error)) return local();
    throw new Error(error.message || "Could not load the location history.");
  }
  const list = ((data ?? []) as MoveRow[]).map((r) => ({ id: Number(r.id), from: r.from_location, to: r.to_location, by: r.moved_by, at: r.moved_at }));
  offline.rememberMoves(code, list);
  return list;
}

export async function listAllMoves(): Promise<Array<Move & { code: string }>> {
  const { data, error } = await sb()
    .from("package_moves")
    .select("id, package_code, from_location, to_location, moved_by, moved_at")
    .order("moved_at", { ascending: true });
  if (error) throw new Error(error.message || "Could not load the location history.");
  return ((data ?? []) as MoveRow[]).map((r) => ({ id: Number(r.id), code: r.package_code, from: r.from_location, to: r.to_location, by: r.moved_by, at: r.moved_at }));
}
