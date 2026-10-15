import { useEffect, useState, type FormEvent } from "react";
import { Check, IdCard, Plus, Printer, RefreshCw, Share2, ShieldCheck, Trash2 } from "lucide-react";
import { Button, Confirm, Overlay, cx, errorText, toast } from "@/components/ui";
import { addEmployee, badgePayload, listEmployees, reissueBadge, removeEmployee, setEmployeeRole, type BadgeRole, type Employee } from "@/lib/badges";
import { useRole } from "@/lib/role";
import { type BadgeStyle } from "@/lib/badgeArt";
import { AVERY_SPOTS, drawBadge, renderAverySheet, renderAveryTest, renderBadgeTall } from "@/lib/badgeTall";
import { downloadBlob, printLabel } from "@/lib/sticker";
import { DEMO_UI } from "@/lib/supabase";

async function badgeBlob(e: Employee, style: BadgeStyle) {
  return renderBadgeTall(e.name, badgePayload(e.badge), style, e.role);
}

/** Badges print on Avery 5392 sheets: a full letter page. */
const LETTER = { w: "8.5in", h: "11in" };

const STYLES: Array<{ style: BadgeStyle; label: string; hint: string }> = [
  { style: "color", label: "full color", hint: "3×4 in · Avery 5392 sheets, color printer" },
  { style: "label", label: "black & white", hint: "3×4 in · Avery 5392 sheets, any printer" },
];

/** Share sheet on phones (Save Image / Print), download elsewhere. */
async function saveBadge(e: Employee, style: BadgeStyle) {
  const blob = await badgeBlob(e, style);
  const filename = `badge-${e.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}${style === "label" ? "-bw" : ""}.png`;
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${e.name} badge` });
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  downloadBlob(blob, filename);
}

/** Backup & setup → Check-out station: the people with badges, and turning this device into the station. */
export function BadgesSection() {
  const { enterStation } = useRole();
  const [people, setPeople] = useState<Employee[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<BadgeRole>("crew");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ e: Employee; url: string; style: BadgeStyle } | null>(null);
  const [reissue, setReissue] = useState<Employee | null>(null);
  const [remove, setRemove] = useState<Employee | null>(null);
  const [goStation, setGoStation] = useState(false);
  const [sheet, setSheet] = useState<{ ids: number[]; style: BadgeStyle } | null>(null);

  const load = () =>
    void listEmployees().then(
      (l) => {
        setPeople(l);
        setError("");
      },
      (err) => setError(errorText(err, "Could not load badges.")),
    );
  useEffect(load, []);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  async function show(e: Employee, style: BadgeStyle = "color") {
    const blob = await badgeBlob(e, style);
    setPreview({ e, url: URL.createObjectURL(blob), style });
  }

  async function add(ev: FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const e = await addEmployee(name, role);
      setName("");
      setRole("crew");
      load();
      toast(`${e.role === "admin" ? "Admin badge" : "Badge"} ready: ${e.name}`);
      await show(e);
    } catch (err) {
      toast(errorText(err, "Could not add that person."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function switchRole(e: Employee, style: BadgeStyle) {
    setBusy(true);
    try {
      const next = await setEmployeeRole(e.id, e.role === "admin" ? "crew" : "admin");
      load();
      toast(next.role === "admin" ? `${next.name} is an admin. Reprint the badge for the admin design.` : `${next.name} is crew now. Reprint the badge.`);
      await show(next, style);
    } catch (err) {
      toast(errorText(err, "Could not change that."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">

      <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2">
        <div className="flex gap-2" role="group" aria-label="New badge for">
          {(["crew", "admin"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={cx(
                "vw-press flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-3 text-[13px] lowercase",
                role === r ? (r === "admin" ? "border-danger bg-danger/10 text-danger" : "border-cyan bg-cyan/10 text-cyan") : "border-line bg-panel text-dim",
              )}
            >
              {r === "admin" ? <ShieldCheck aria-hidden className="size-4" /> : <IdCard aria-hidden className="size-4" />}
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label htmlFor="badge-name" className="sr-only">
            Name for a new badge
          </label>
          <input
            id="badge-name"
            className="field min-w-0 flex-1"
            placeholder="Name, e.g. Dana R."
            maxLength={80}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="w-auto! shrink-0 px-4">
            <Plus className="size-[18px]" /> add
          </Button>
        </div>
      </form>

      {error ? <p className="text-[14px] text-danger">{error}</p> : null}
      {people && people.length === 0 ? <p className="text-[14px] text-dim">No badges yet.</p> : null}
      {people && people.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Badges">
          {people.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-hair py-1.5">
              {e.role === "admin" ? <ShieldCheck aria-hidden className="size-4 shrink-0 text-danger" /> : <IdCard aria-hidden className="size-4 shrink-0 text-cyan" />}
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{e.name}</span>
              {e.role === "admin" ? <span className="rounded-[4px] border border-danger/50 px-1.5 text-[11px] text-danger lowercase">admin</span> : null}
              <button type="button" onClick={() => void show(e)} className="vw-press min-h-10 rounded-[8px] border border-line bg-panel px-3 text-[13px] text-cyan lowercase">
                badge
              </button>
              <button
                type="button"
                aria-label={`Remove ${e.name}`}
                onClick={() => setRemove(e)}
                className="vw-press flex size-10 items-center justify-center rounded-[8px] border border-line bg-panel text-dim"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {people && people.length > 0 ? (
        <Button onClick={() => setSheet({ ids: [], style: "color" })}>
          <Printer className="size-[18px]" /> print a sheet of badges
        </Button>
      ) : null}

      <div className="mt-2 flex flex-col gap-2 rounded-[12px] border border-line bg-panel p-3.5">
        <p className="text-[14px] text-ink">Make this device the check-out station</p>
        <Button variant="primary" onClick={() => setGoStation(true)}>
          <IdCard className="size-[18px]" /> Start station mode
        </Button>
      </div>

      {preview ? (
        <Confirm
          title={`${preview.e.name}'s badge`}
          body={
            <span className="flex flex-col gap-3">
              <span className="flex gap-2" role="group" aria-label="Badge style">
                {STYLES.map((o) => (
                  <button
                    key={o.style}
                    type="button"
                    aria-pressed={preview.style === o.style}
                    onClick={() => void show(preview.e, o.style)}
                    className={cx(
                      "vw-press min-h-10 flex-1 rounded-[8px] border px-3 text-[13px] lowercase",
                      preview.style === o.style ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </span>
              <img src={preview.url} alt={`Badge for ${preview.e.name}, ${preview.style === "color" ? "full color" : "black and white"}`} className="mx-auto max-h-[36dvh] w-auto max-w-full rounded-[8px] border border-line bg-white" />
              <span className="text-[13px] text-dim">{STYLES.find((o) => o.style === preview.style)?.hint}</span>
              {DEMO_UI ? <span className="text-[13px] text-faint">Printing and saving are blocked in this preview.</span> : null}
              <span className="flex gap-2">
                <Button
                  disabled={DEMO_UI}
                  onClick={() => {
                    setSheet({ ids: [preview.e.id], style: preview.style });
                    setPreview(null);
                  }}
                >
                  <Printer className="size-[18px]" /> print
                </Button>
                <Button disabled={DEMO_UI} onClick={() => void saveBadge(preview.e, preview.style)}>
                  <Share2 className="size-[18px]" /> save
                </Button>
              </span>
              <Button variant="ghost" disabled={busy} onClick={() => void switchRole(preview.e, preview.style)}>
                {preview.e.role === "admin" ? <IdCard className="size-[18px]" /> : <ShieldCheck className="size-[18px]" />}
                {preview.e.role === "admin" ? "change to crew" : "make admin"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setReissue(preview.e);
                  setPreview(null);
                }}
              >
                <RefreshCw className="size-[18px]" /> lost it? make a new badge
              </Button>
            </span>
          }
          confirmLabel="Done"
          onCancel={() => setPreview(null)}
          onConfirm={() => setPreview(null)}
        />
      ) : null}

      {sheet && people ? <PrintSheet people={people} initial={sheet} onClose={() => setSheet(null)} /> : null}

      {reissue ? (
        <Confirm
          title={`New badge for ${reissue.name}?`}
          body="The old badge stops working right away."
          confirmLabel="Make new badge"
          busy={busy}
          onCancel={() => setReissue(null)}
          onConfirm={() => {
            setBusy(true);
            void reissueBadge(reissue.id)
              .then(async (e) => {
                setReissue(null);
                load();
                toast(`${e.name} has a new badge. The old one no longer works.`);
                await show(e);
              })
              .catch((err) => toast(errorText(err, "Could not make a new badge."), "error"))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}

      {remove ? (
        <Confirm
          title={`Remove ${remove.name}?`}
          body="Their badge stops working."
          confirmLabel="Remove"
          danger
          busy={busy}
          onCancel={() => setRemove(null)}
          onConfirm={() => {
            setBusy(true);
            void removeEmployee(remove.id)
              .then(() => {
                toast(`${remove.name} removed.`);
                setRemove(null);
                load();
              })
              .catch((err) => toast(errorText(err, "Could not remove."), "error"))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}

      {goStation ? (
        <Confirm
          title="Start station mode on this device?"
          body="Shows only the station screen. Leaving needs the shop PIN."
          confirmLabel="Start station"
          onCancel={() => setGoStation(false)}
          onConfirm={() => {
            setGoStation(false);
            enterStation?.();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Print badges on an Avery 5392 sheet (six 3×4 in spots). Pick up to six
 * people and the first free spot, so a half-used sheet can go back in the tray.
 */
function PrintSheet({ people, initial, onClose }: { people: Employee[]; initial: { ids: number[]; style: BadgeStyle }; onClose: () => void }) {
  const [ids, setIds] = useState<number[]>(initial.ids);
  const [style, setStyle] = useState<BadgeStyle>(initial.style);
  const [start, setStart] = useState(1);
  const [busy, setBusy] = useState(false);
  const room = AVERY_SPOTS - start + 1;
  const picked = ids.map((id) => people.find((p) => p.id === id)).filter((p): p is Employee => Boolean(p)).slice(0, room);
  const full = picked.length >= room;

  const toggle = (id: number) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : full ? cur : [...cur, id]));

  async function print() {
    setBusy(true);
    try {
      const items = await Promise.all(picked.map(async (p, i) => ({ badge: await drawBadge(p.name, badgePayload(p.badge), style, p.role), spot: start + i })));
      await printLabel(await renderAverySheet(items), "Avery 5392 badge sheet", LETTER);
    } catch (err) {
      toast(errorText(err, "Could not print."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay title="Print badges" onClose={onClose} closeLabel="Close">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h2 className="font-sans text-[24px] leading-tight font-bold tracking-[-0.02em]">Avery 5392 sheet</h2>

        <span className="flex gap-2" role="group" aria-label="Badge style">
          {STYLES.map((o) => (
            <button
              key={o.style}
              type="button"
              aria-pressed={style === o.style}
              onClick={() => setStyle(o.style)}
              className={cx(
                "vw-press min-h-10 flex-1 rounded-[8px] border px-3 text-[13px] lowercase",
                style === o.style ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
              )}
            >
              {o.label}
            </button>
          ))}
        </span>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-dim">Start at spot (skip spots already used)</span>
          <div className="grid w-40 grid-cols-2 gap-1.5 self-center" role="group" aria-label="Start at spot">
            {Array.from({ length: AVERY_SPOTS }, (_, i) => i + 1).map((n) => {
              const who = n >= start ? picked[n - start] : undefined;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={start === n}
                  aria-label={`Start at spot ${n}`}
                  onClick={() => setStart(n)}
                  className={cx(
                    "vw-press flex aspect-[4/3] flex-col items-center justify-center rounded-[6px] border px-1 text-[11px] leading-tight",
                    n < start ? "border-line/50 bg-transparent text-faint line-through" : who ? "border-cyan bg-cyan/15 text-ink" : "border-line bg-panel text-dim",
                    start === n && "ring-2 ring-cyan",
                  )}
                >
                  <span className="code text-[12px]">{n}</span>
                  {who ? <span className="max-w-full truncate">{who.name}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="m-0 flex list-none flex-col p-0" aria-label="Who to print">
          {people.map((p) => {
            const on = picked.some((x) => x.id === p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={!on && full}
                  onClick={() => toggle(p.id)}
                  className="vw-press flex min-h-11 w-full items-center gap-3 border-b border-hair text-left disabled:opacity-40"
                >
                  <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-[5px] border", on ? "border-cyan bg-cyan text-cyan-ink" : "border-line")}>
                    {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{p.name}</span>
                  {p.role === "admin" ? <span className="rounded-[4px] border border-danger/50 px-1.5 text-[11px] text-danger lowercase">admin</span> : null}
                </button>
              </li>
            );
          })}
        </ul>

        {DEMO_UI ? <p className="text-[13px] text-faint">Printing is blocked in this preview.</p> : null}
        <Button big variant="primary" disabled={busy || DEMO_UI || picked.length === 0} onClick={() => void print()}>
          <Printer className="size-5" /> {busy ? "Preparing…" : `print ${picked.length || ""} ${picked.length === 1 ? "badge" : "badges"}`}
        </Button>
        <p className="text-[12px] text-faint">Print at 100% (actual size) from the tray with the Avery sheet, paper type heavy.</p>
        <Button variant="ghost" disabled={DEMO_UI} onClick={() => void renderAveryTest().then((b) => printLabel(b, "Avery 5392 alignment test", LETTER))}>
          print alignment test on plain paper
        </Button>
      </div>
    </Overlay>
  );
}
