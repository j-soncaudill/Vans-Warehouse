import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PackagePlus, Search, X } from "lucide-react";
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

  return (
    <>
      <PageTitle count={data ? all.length : undefined}>{floor ? "On floor" : "Checked out"}</PageTitle>

      {all.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-dim" />
            <input
              type="search"
              aria-label="Search"
              className="field pr-14 pl-13"
              placeholder="Job, code, PO, vendor, person"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute top-0 right-0 flex size-14 items-center justify-center text-dim">
                <X className="size-6" />
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
                      "flex min-h-12 shrink-0 items-center gap-2 rounded-[var(--radius-box)] border-2 px-3 font-cond text-[16px] font-bold uppercase",
                      on ? "border-amber bg-raised" : "border-line bg-panel",
                    )}
                  >
                    <span aria-hidden className="size-5 rounded-[4px] border-2 border-ink/50" style={{ background: COLOR_HEX[t] }} />
                    {t}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-[var(--radius-box)] border-2 border-danger p-4">
          <p className="mb-3 text-[18px]">{error}</p>
          <Button onClick={reload}>Try again</Button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[108px] rounded-[var(--radius-box)] border-2 border-line bg-panel" />
          ))}
        </div>
      ) : data && all.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-[var(--radius-box)] border-2 border-dashed border-line p-6">
          <p className="font-cond text-[26px] font-bold uppercase">{floor ? "Floor is empty" : "Nothing is out"}</p>
          <p className="text-[18px] text-dim">
            {floor ? "Receive a delivery and it shows up here on every phone." : "Boxes you check out from the floor land here."}
          </p>
          {floor ? (
            <Link to="/receive" className={btn("primary", true)}>
              <PackagePlus className="size-7" /> Receive
            </Link>
          ) : null}
        </div>
      ) : data && shown.length === 0 ? (
        <p className="py-8 text-center text-[18px] text-dim">No match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((p) => (
            <li key={p.id}>
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
