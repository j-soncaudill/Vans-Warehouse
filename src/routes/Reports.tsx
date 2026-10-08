import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { LegacyChip } from "@/components/Package";
import { PageTitle } from "@/components/Shell";
import { Button, cx } from "@/components/ui";
import { returnTypeInfo } from "@/lib/codes";
import { useLiveQuery } from "@/lib/live";
import { listPackages, type Pkg } from "@/lib/packages";
import { listReturns } from "@/lib/returns";
import { useIsAdmin } from "@/lib/role";
import { ago, receivedText } from "@/lib/time";

const DAY = 86_400_000;
export const daysSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / DAY)) : 0);

/** Checked-out boxes grouped by job, biggest group first. */
export function groupByJob(pkgs: Pkg[]): Array<{ job: string; boxes: Pkg[] }> {
  const map = new Map<string, Pkg[]>();
  for (const p of pkgs) map.set(p.jobName, [...(map.get(p.jobName) ?? []), p]);
  return [...map.entries()]
    .map(([job, boxes]) => ({ job, boxes: boxes.sort((a, b) => Date.parse(a.checkedOutAt ?? "") - Date.parse(b.checkedOutAt ?? "")) }))
    .sort((a, b) => b.boxes.length - a.boxes.length || a.job.localeCompare(b.job));
}

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-hair pb-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 font-sans text-[19px] font-semibold text-white">{title}</h2>
        {note ? <span className="text-[12px] text-faint">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

const Days = ({ n, warn }: { n: number; warn?: boolean }) => (
  <span className={cx("flex w-14 shrink-0 flex-col items-end leading-none", warn ? "text-amber" : "text-cyan")}>
    <span className="font-sans text-[22px] font-bold tabular-nums">{n}</span>
    <span className="text-[11px] text-faint">{n === 1 ? "day" : "days"}</span>
  </span>
);

const LIMIT = 12;

export function ReportsPage() {
  const admin = useIsAdmin();
  const { data, error, loading, reload } = useLiveQuery("reports", () => Promise.all([listPackages("all"), listReturns("open")]));
  const [allFloor, setAllFloor] = useState(false);
  const [returnDays, setReturnDays] = useState(14);
  const now = Date.now();

  const [pkgs, rets] = data ?? [[], []];
  // Oldest first; legacy boxes with no known arrival date go last.
  const floor = useMemo(
    () =>
      pkgs
        .filter((p) => p.status === "on_floor")
        .sort((a, b) => Number(a.arrivalUnknown) - Number(b.arrivalUnknown) || Date.parse(a.receivedAt) - Date.parse(b.receivedAt)),
    [pkgs],
  );
  const groups = useMemo(() => groupByJob(pkgs.filter((p) => p.status === "checked_out")), [pkgs]);
  const oldReturns = useMemo(
    () => rets.filter((r) => daysSince(r.createdAt, now) >= returnDays).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [rets, returnDays, now],
  );

  if (!admin) {
    return (
      <div className="flex flex-col gap-4 py-6">
        <h1 className="m-0 flex items-center gap-3 text-[28px] font-semibold tracking-[-0.03em]">
          <ShieldCheck className="size-6 text-cyan" strokeWidth={2.2} />
          <span className="grad-title">Administrators only</span>
        </h1>
        <p className="text-[15px] text-dim">Reports are for Administrator phones.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Reports</PageTitle>
      {error ? (
        <div className="rounded-[var(--radius-box)] border border-danger p-4">
          <p className="mb-3 text-[15px]">{error}</p>
          <Button onClick={reload}>Try again</Button>
        </div>
      ) : null}
      {loading && !data ? <p className="text-[15px] text-dim">Loading…</p> : null}

      {data ? (
        <>
          <Section title="Longest on the floor" note={`${floor.length} on the floor`}>
            {floor.length === 0 ? <p className="text-[14px] text-dim">The floor is empty.</p> : null}
            <ul className="m-0 flex list-none flex-col p-0">
              {(allFloor ? floor : floor.slice(0, LIMIT)).map((p) => {
                const n = daysSince(p.receivedAt, now);
                return (
                  <li key={p.code} className="border-b border-hair">
                    <Link to="/p/$code" params={{ code: p.code }} className="flex items-center gap-3 py-2.5 active:opacity-70">
                      {p.arrivalUnknown ? (
                        <span className="flex w-14 shrink-0 flex-col items-end text-[11px] leading-tight text-faint">
                          <span className="font-sans text-[22px] font-bold text-dim">?</span>
                          days
                        </span>
                      ) : (
                        <Days n={n} warn={n >= 30} />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-sans text-[16px] font-semibold text-white">{p.jobName}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-dim">
                          <span className="code text-cyan">{p.code}</span>
                          {p.lastLocation ? <span>{p.lastLocation.toLowerCase()}</span> : null}
                          {p.legacy ? (
                            <>
                              <LegacyChip /> <span>{receivedText(p)}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {floor.length > LIMIT ? (
              <Button variant="ghost" onClick={() => setAllFloor((v) => !v)}>
                {allFloor ? "Show fewer" : `Show all ${floor.length}`}
              </Button>
            ) : null}
          </Section>

          <Section title="Checked out, by job" note={`${groups.reduce((n, g) => n + g.boxes.length, 0)} out`}>
            {groups.length === 0 ? <p className="text-[14px] text-dim">Nothing is checked out.</p> : null}
            {groups.map((g) => (
              <div key={g.job} className="rounded-[12px] border border-line bg-panel px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-sans text-[16px] font-semibold text-white">{g.job}</span>
                  <span className="shrink-0 text-[13px] text-cyan tabular-nums">
                    {g.boxes.length} {g.boxes.length === 1 ? "box" : "boxes"}
                  </span>
                </div>
                <ul className="m-0 mt-1 flex list-none flex-col p-0">
                  {g.boxes.map((p) => (
                    <li key={p.code}>
                      <Link to="/p/$code" params={{ code: p.code }} className="flex items-center gap-2 py-1 text-[13px] active:opacity-70">
                        <span className="code text-cyan">{p.code}</span>
                        <span className="min-w-0 flex-1 truncate text-dim">
                          {p.checkedOutTo ?? "?"}
                          {p.lastLocation ? ` · from ${p.lastLocation.toLowerCase()}` : ""}
                        </span>
                        <span className="shrink-0 text-faint">{ago(p.checkedOutAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>

          <Section title="Open returns" note={`${rets.length} open`}>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="return-days" className="text-[13px] text-dim">
                open longer than
              </label>
              <input
                id="return-days"
                type="number"
                inputMode="numeric"
                min={0}
                max={365}
                className="field h-10 w-16! px-2 text-center"
                value={returnDays}
                onChange={(e) => setReturnDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
              />
              <span className="text-[13px] text-dim">days</span>
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={returnDays === d}
                  onClick={() => setReturnDays(d)}
                  className={cx(
                    "vw-press min-h-10 rounded-[8px] border px-3 text-[13px]",
                    returnDays === d ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
            {oldReturns.length === 0 ? <p className="text-[14px] text-dim">No open return is older than {returnDays} days.</p> : null}
            <ul className="m-0 flex list-none flex-col p-0">
              {oldReturns.map((r) => {
                const n = daysSince(r.createdAt, now);
                return (
                  <li key={r.code} className="border-b border-hair">
                    <Link to="/r/$code" params={{ code: r.code }} className="flex items-center gap-3 py-2.5 active:opacity-70">
                      <Days n={n} warn />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="code text-[16px] font-semibold text-white">{r.code}</span>
                        <span className="truncate text-[12px] text-dim">
                          {returnTypeInfo(r.type).label.toLowerCase()}
                          {r.vendor ? ` · ${r.vendor}` : ""}
                          {r.returnedBy ? ` · from ${r.returnedBy}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      ) : null}
    </div>
  );
}
