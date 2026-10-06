import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { PackagePlus, X } from "lucide-react";
import { PackageCard } from "@/components/Package";
import { PageTitle } from "@/components/Shell";
import { Button, btn, cx } from "@/components/ui";
import { COLOR_HEX, COLOR_TAGS } from "@/lib/form";
import { useLiveQuery } from "@/lib/live";
import { listPackages, type Pkg, type PkgStatus } from "@/lib/packages";

function matches(p: Pkg, q: string) {
  if (!q) return true;
  return [p.jobName, p.code, p.poNumber, p.vendor, p.pm, p.deliveredBy, p.receivedBy, p.quantities, p.notes, p.checkedOutTo, p.colorTag]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function PackageList({ status }: { status: PkgStatus }) {
  const { data, error, loading, reload } = useLiveQuery(`list:${status}`, () => listPackages(status));
  const [q, setQ] = useState("");
  const [color, setColor] = useState("");
  const all = data ?? [];
  const shown = useMemo(() => all.filter((p) => matches(p, q.trim().toLowerCase()) && (!color || p.colorTag === color)), [all, q, color]);
  const usedColors = COLOR_TAGS.filter((t) => all.some((p) => p.colorTag === t));
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

      {all.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-cyan">/</span>
            <input
              type="search"
              aria-label="Search"
              className="field pr-12 pl-8"
              placeholder="search job, code, po, vendor"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="vw-press absolute top-0 right-0 flex size-12 items-center justify-center text-dim">
                <X className="size-[18px]" />
              </button>
            ) : null}
          </div>
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
              <PackageCard pkg={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function FloorPage() {
  return <PackageList status="on_floor" />;
}

export function OutPage() {
  return <PackageList status="checked_out" />;
}
