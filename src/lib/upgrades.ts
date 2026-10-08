import sql002 from "../../supabase/migrations/002_locations_returns.sql?raw";
import sql003 from "../../supabase/migrations/003_legacy.sql?raw";
import { pendingUpgrades } from "@/lib/supabase";

/** Database updates in the order they must run. Each is safe to run twice. */
export const UPGRADES = [
  { id: "002", label: "locations + returns (update 002)", adds: "locations and returns", sql: sql002 },
  { id: "003", label: "legacy boxes (update 003)", adds: "legacy boxes", sql: sql003 },
] as const;

/** What the last schema probe found missing; all of them if it found none. */
export function neededUpgrades() {
  const ids = pendingUpgrades();
  const list = UPGRADES.filter((u) => ids.includes(u.id));
  return list.length ? list : [...UPGRADES];
}

export function upgradeSql(list = neededUpgrades()): string {
  return list.map((u) => u.sql.trim()).join("\n\n-- ----------------------------------------------------------------\n\n");
}
