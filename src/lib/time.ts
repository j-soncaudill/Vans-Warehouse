export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / hr)} hr ago`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function stamp(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Mar 2025" — for legacy boxes, whose arrival is only known to the month. */
export function monthYear(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

/** When it was received, as precise as we know it. */
export function receivedText(pkg: { receivedAt: string; legacy?: boolean }): string {
  return pkg.legacy ? `~${monthYear(pkg.receivedAt)}` : stamp(pkg.receivedAt);
}

/** "2025-03" → mid-month ISO time (never in the future); "" → null. */
export function monthToIso(month: string, now = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 12);
  if (Number.isNaN(t)) return null;
  return new Date(Math.min(t, now)).toISOString();
}
