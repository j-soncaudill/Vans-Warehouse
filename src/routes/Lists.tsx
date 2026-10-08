import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { History, ListChecks, MapPin, PackagePlus, X } from "lucide-react";
import { BatchCheckoutSheet } from "@/components/BatchCheckout";
import { PackageCard } from "@/components/Package";
import { PageTitle } from "@/components/Shell";
import { Button, btn, cx } from "@/components/ui";
import { COLOR_HEX, COLOR_TAGS } from "@/lib/form";
import { useLiveQuery } from "@/lib/live";
import { listPackages, type Pkg, type PkgStatus } from "@/lib/packages";

function matches(p: Pkg, q: string) {
  if (!q) return true;
  return [p.jobName, p.code, p.poNumber, p.vendor, p.pm, p.deliveredBy, p.receivedBy, p.quantities, p.notes, p.checkedOutTo, p.colorTag, p.lastLocation, p.legacy ? "legacy" : null]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function PackageList({ status }: { status: PkgStatus }) {
  const { data, error, loading, reload } = useLiveQuery(`list:${status}`, () => listPackages(status));
  const [q, setQ] = useState("");
  const [color, setColor] = useState("");
  const [place, setPlace] = useState("");
  const [legacyOnly, setLegacyOnly] = useState(false);
  // Batch check-out: tick boxes on the floor list, then check them all out at once.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [batch, setBatch] = useState(false);
  const toggle = (code: string) =>
    setPicked((cur) => {
      const next = new Set(cur ?? []);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  const all = data ?? [];
  const shown = useMemo(
    () =>
      all.filter(
        (p) =>
          matches(p, q.trim().toLowerCase()) && (!color || p.colorTag === color) && (!place || p.lastLocation === place) && (!legacyOnly || p.legacy),
      ),
    [all, q, color, place, legacyOnly],
  );
  const legacyCount = useMemo(() => all.filter((p) => p.legacy).length, [all]);
  const usedColors = COLOR_TAGS.filter((t) => all.some((p) => p.colorTag === t));
  // Only places something is actually at, busiest first.
  const usedPlaces = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of all) if (p.lastLocation) counts.set(p.lastLocation, (counts.get(p.lastLocation) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);
  const floor = status === "on_floor";
  // Rows present on first load cascade in; rows that show up later (another
  // phone, over realtime) glow once so the change is noticed.
  const seen = useRef<Set<number> | null>(null);
  if (data && !seen.current) seen.current = new Set(data.map((p) => p.id));
  const isNew = (id: number) => {
    if (!seen.current || seen.current.has(id)) return false;
    seen.current.add(id);
    return true;
  };

  return (
    <>
      <PageTitle count={data ? all.length : undefined}>{floor ? "On floor" : "Checked out"}</PageTitle>
      {floor && all.length > 0 ? (
        <div className="-mt-2 mb-3 flex items-center justify-end gap-2">
          {picked ? (
            <>
              <span className="mr-auto text-[13px] text-dim">tap boxes to check out together</span>
              <button type="button" onClick={() => setPicked(new Set(shown.map((p) => p.code)))} className="vw-press min-h-10 rounded-[8px] border border-line bg-panel px-3 text-[13px] text-dim lowercase">
                all {shown.length}
              </button>
              <button type="button" onClick={() => setPicked(null)} className="vw-press min-h-10 rounded-[8px] border border-line bg-panel px-3 text-[13px] text-ink lowercase">
                cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="vw-press flex min-h-10 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-3 text-[13px] text-cyan lowercase"
            >
              <ListChecks aria-hidden className="size-4" /> select
            </button>
          )}
        </div>
      ) : null}

      {all.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-cyan">/</span>
            <input
              type="search"
              aria-label="Search"
              className="field pr-12 pl-8"
              placeholder="search job, code, po, vendor, place"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="vw-press absolute top-0 right-0 flex size-12 items-center justify-center text-dim">
                <X className="size-[18px]" />
              </button>
            ) : null}
          </div>
          {usedPlaces.length > 1 || (usedPlaces.length === 1 && place) || legacyCount > 0 ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by location">
              {legacyCount > 0 ? (
                <button
                  type="button"
                  aria-pressed={legacyOnly}
                  aria-label={`Legacy only, ${legacyCount}`}
                  onClick={() => setLegacyOnly((v) => !v)}
                  className={cx(
                    "vw-press flex min-h-10 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] lowercase",
                    legacyOnly ? "border-amber bg-amber/10 text-amber" : "border-amber/40 bg-panel text-dim",
                  )}
                >
                  <History aria-hidden className="size-3.5 text-amber" />
                  legacy
                  <span className="rounded-[4px] bg-raised px-1.5 text-[11px] text-faint tabular-nums">{legacyCount}</span>
                </button>
              ) : null}
              {usedPlaces.map(([name, n]) => {
                const on = place === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlace(on ? "" : name)}
                    className={cx(
                      "vw-press flex min-h-10 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] lowercase",
                      on ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
                    )}
                  >
                    <MapPin aria-hidden className="size-3.5" />
                    {name}
                    <span className="rounded-[4px] bg-raised px-1.5 text-[11px] text-faint tabular-nums">{n}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {usedColors.length > 0 ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by color tag">
              {usedColors.map((t) => {
                const on = color === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setColor(on ? "" : t)}
                    className={cx(
                      "vw-press flex min-h-10 shrink-0 items-center gap-2 rounded-[8px] border px-3 text-[13px] lowercase",
                      on ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
                    )}
                  >
                    <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: COLOR_HEX[t] }} />
                    {t}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[var(--radius-box)] border border-danger p-4">
          <p className="mb-3 text-[15px]">{error}</p>
          <Button onClick={reload}>Try again</Button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="vw-skeleton h-[80px] border-b border-hair" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : data && all.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[12px] border border-dashed border-line p-5">
          <p className="font-sans text-[20px] font-semibold">{floor ? "Floor is empty" : "Nothing is out"}</p>
          <p className="text-[15px] text-dim">
            {floor ? "Receive a delivery and it shows up here on every phone." : "Boxes you check out from the floor land here."}
          </p>
          {floor ? (
            <Link to="/receive" className={btn("primary", true)}>
              <PackagePlus className="size-[18px]" /> Receive
            </Link>
          ) : null}
        </div>
      ) : data && shown.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-dim">No match.</p>
      ) : (
        <ul className="flex flex-col border-t border-hair">
          {shown.map((p, i) => (
            <li key={p.id} className={isNew(p.id) ? "vw-new" : "vw-row"} style={{ "--i": i } as CSSProperties}>
              <PackageCard pkg={p} select={picked ? { on: picked.has(p.code), toggle: () => toggle(p.code) } : undefined} />
            </li>
          ))}
        </ul>
      )}

      {picked && picked.size > 0 ? (
        <div className="fixed inset-x-0 bottom-[calc(92px+env(safe-area-inset-bottom))] z-40 px-4">
          <div className="mx-auto max-w-2xl">
            <Button big variant="primary" onClick={() => setBatch(true)}>
              Check out {picked.size} {picked.size === 1 ? "box" : "boxes"}
            </Button>
          </div>
        </div>
      ) : null}
      {batch && picked ? (
        <BatchCheckoutSheet
          pkgs={all.filter((p) => picked.has(p.code))}
          onCancel={() => setBatch(false)}
          onDone={() => {
            setBatch(false);
            setPicked(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function FloorPage() {
  return <PackageList status="on_floor" />;
}

export function OutPage() {
  return <PackageList status="checked_out" />;
}
