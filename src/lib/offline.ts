import { useSyncExternalStore } from "react";
import type { FormValues } from "@/lib/form";
import { idbGet, idbSet } from "@/lib/idb";
import type { Move } from "@/lib/locations";
import type { Pkg, PkgStatus } from "@/lib/packages";
import type { CapturedPhoto } from "@/lib/photo";
import { IS_DEMO } from "@/lib/supabase";

/**
 * Offline mode. Two things live on the phone:
 *   • a copy of the box list as last seen, so lists, scans and box pages work with no signal;
 *   • an outbox of receive / move / check-out actions done offline, each with the time it happened.
 * The outbox syncs on its own when signal returns (packages.ts → syncOutbox). Actions another
 * phone made first are never overwritten; they land in "Couldn't sync" instead.
 */

type OpBase = { id: string; at: string; code: string; jobName: string };
export type ReceiveOp = OpBase & { kind: "receive"; values: FormValues; existing: boolean; photo: CapturedPhoto | null; slip: CapturedPhoto | null };
export type MoveOp = OpBase & { kind: "move"; from: string | null; to: string; by: string };
export type CheckoutOp = OpBase & { kind: "checkout"; who: string };
export type Op = ReceiveOp | MoveOp | CheckoutOp;
export type FailedOp = { id: string; at: string; code: string; jobName: string; kind: Op["kind"]; message: string };

const SNAP = "snapshot";
const MOVES = "moves";
const OUTBOX = "outbox";
const FAILED = "failed";
const READY = "vw.schemaReady";

let snapshot = new Map<string, Pkg>();
let moves: Record<string, Move[]> = {};
let outbox: Op[] = [];
let failed: FailedOp[] = [];
let syncing = false;
let online = typeof navigator === "undefined" ? true : navigator.onLine;

// ------------------------------------------------------------------ store for the UI

let tick = 0;
const listeners = new Set<() => void>();
function changed() {
  tick += 1;
  for (const l of listeners) l();
}
export function useOffline() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tick,
  );
  return { online, pending: outbox.length, syncing, failed };
}

export const loaded: Promise<void> = (async () => {
  if (IS_DEMO) return;
  const [s, m, o, f] = await Promise.all([idbGet<Pkg[]>(SNAP), idbGet<Record<string, Move[]>>(MOVES), idbGet<Op[]>(OUTBOX), idbGet<FailedOp[]>(FAILED)]);
  snapshot = new Map((s ?? []).map((p) => [p.code, p]));
  moves = m ?? {};
  outbox = o ?? [];
  failed = f ?? [];
  changed();
})();

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    online = true;
    changed();
  });
  window.addEventListener("offline", () => {
    online = false;
    changed();
  });
}

// ------------------------------------------------------------------ signal

export const isOffline = () => typeof navigator !== "undefined" && !navigator.onLine;

/** Supabase hands back "TypeError: Failed to fetch" (Chrome) / "Load failed" (Safari) when there's no signal. */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "object" && err ? String((err as { message?: unknown }).message ?? "") : String(err ?? "");
  return isOffline() || /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(msg);
}

/** Remembered so the app opens with no signal once it has opened with signal. */
export function rememberSchemaReady() {
  try {
    localStorage.setItem(READY, "1");
  } catch {
    /* ignore */
  }
}
export function schemaWasReady(): boolean {
  try {
    return localStorage.getItem(READY) === "1";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ last-known list

const saveSnap = () => void idbSet(SNAP, [...snapshot.values()]);

/** A fresh list from the server replaces what we knew about that list. */
export function rememberList(status: PkgStatus | "all", list: Pkg[]) {
  if (IS_DEMO) return;
  for (const [code, p] of snapshot) if (status === "all" || p.status === status) snapshot.delete(code);
  for (const p of list) snapshot.set(p.code, p);
  saveSnap();
}

export function rememberOne(code: string, pkg: Pkg | null) {
  if (IS_DEMO) return;
  if (pkg) snapshot.set(pkg.code, pkg);
  else snapshot.delete(code);
  saveSnap();
}

export function rememberMoves(code: string, list: Move[]) {
  if (IS_DEMO) return;
  moves[code] = list;
  void idbSet(MOVES, moves);
}

export const cachedMoves = (code: string): Move[] | undefined => moves[code];

/** Pending outbox actions shown as if they had already happened. */
function overlay(base: Map<string, Pkg>): Map<string, Pkg> {
  const out = new Map(base);
  for (const op of [...outbox].sort((a, b) => a.at.localeCompare(b.at))) {
    const cur = out.get(op.code);
    if (op.kind === "receive" && !cur) out.set(op.code, pendingPkg(op));
    else if (op.kind === "move" && cur && (!cur.locationAt || cur.locationAt < op.at)) out.set(op.code, { ...cur, lastLocation: op.to, locationAt: op.at });
    else if (op.kind === "checkout" && cur && cur.status === "on_floor") out.set(op.code, { ...cur, status: "checked_out", checkedOutTo: op.who, checkedOutAt: op.at });
  }
  return out;
}

export function withPending(list: Pkg[], status: PkgStatus | "all"): Pkg[] {
  if (!outbox.length) return list;
  const merged = overlay(new Map(list.map((p) => [p.code, p])));
  // A box received offline isn't on the server list yet.
  for (const op of outbox) if (op.kind === "receive" && !merged.has(op.code)) merged.set(op.code, pendingPkg(op));
  return [...merged.values()].filter((p) => status === "all" || p.status === status);
}

export function cachedList(status: PkgStatus | "all"): Pkg[] | null {
  if (!snapshot.size && !outbox.length) return null;
  const all = [...overlay(snapshot).values()];
  const list = all.filter((p) => status === "all" || p.status === status);
  return status === "checked_out"
    ? list.sort((a, b) => (b.checkedOutAt ?? "").localeCompare(a.checkedOutAt ?? ""))
    : list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function cachedGet(code: string): Pkg | null | undefined {
  const all = overlay(snapshot);
  return all.has(code) ? all.get(code)! : snapshot.size ? null : undefined;
}

export function pendingFor(code: string): Op[] {
  return outbox.filter((o) => o.code === code);
}

/** How a box received offline looks until it syncs. */
export function pendingPkg(op: ReceiveOp): Pkg {
  const v = op.values;
  const yn = (x: string) => (x === "yes" ? true : x === "no" ? false : null);
  const t = (x: string) => x.trim() || null;
  return {
    id: -1,
    code: op.code,
    jobName: v.jobName.trim(),
    poNumber: t(v.poNumber),
    vendor: t(v.vendor),
    deliveredBy: t(v.deliveredBy),
    receivedBy: t(v.receivedBy),
    pm: t(v.pm),
    packingSlip: yn(v.packingSlip),
    quantities: t(v.quantities),
    damaged: yn(v.damaged),
    colorTag: v.colorTag || null,
    notes: t(v.notes),
    status: "on_floor",
    receivedAt: op.at,
    checkedOutTo: null,
    checkedOutAt: null,
    barcodePath: null,
    photoPath: null,
    thumbPath: null,
    lastLocation: v.location.trim() || null,
    locationAt: op.at,
    updatedAt: op.at,
    legacy: v.legacy,
    slipPhotoPath: null,
    slipThumbPath: null,
  };
}

// ------------------------------------------------------------------ outbox

const saveOutbox = () => void idbSet(OUTBOX, outbox);
const saveFailed = () => void idbSet(FAILED, failed);

export const newOpId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function enqueue(op: Op) {
  await loaded;
  outbox.push(op);
  saveOutbox();
  changed();
}

export const pendingOps = () => [...outbox].sort((a, b) => a.at.localeCompare(b.at));

export function finish(op: Op, failure?: string) {
  outbox = outbox.filter((o) => o.id !== op.id);
  saveOutbox();
  if (failure) {
    failed = [...failed, { id: op.id, at: op.at, code: op.code, jobName: op.jobName, kind: op.kind, message: failure }];
    saveFailed();
  }
  changed();
}

/** A receive that couldn't sync takes the moves / check-outs done to that box offline with it. */
export function dropFollowers(code: string, why: string) {
  for (const o of outbox.filter((x) => x.code === code)) finish(o, why);
}

export function dismissFailed(id?: string) {
  failed = id ? failed.filter((f) => f.id !== id) : [];
  saveFailed();
  changed();
}

export function setSyncing(v: boolean) {
  syncing = v;
  changed();
}
