import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Camera, ChevronRight, PenLine, RotateCcw, ScanLine, Trash2, Undo2, X } from "lucide-react";
import { Decode, DrawCheck } from "@/components/motion";
import { PhotoCamera, PhotoViewer } from "@/components/PhotoCamera";
import { Scanner } from "@/components/Scanner";
import { PageTitle } from "@/components/Shell";
import { BackButton, Button, Confirm, Field, Overlay, btn, cx, errorText, toast } from "@/components/ui";
import { RETURN_TYPES, normalizeCode, returnTypeInfo, type ReturnType } from "@/lib/codes";
import { notifyChanged, useLiveQuery } from "@/lib/live";
import { photoUrl, type CapturedPhoto } from "@/lib/photo";
import { IS_DEMO } from "@/lib/supabase";
import {
  closeReturn,
  detailsFrom,
  getReturn,
  isStationScan,
  listReturns,
  reclassifyReturn,
  removeReturn,
  reopenReturn,
  saveReturnDetails,
  setReturnPhoto,
  startReturn,
  type Ret,
  type ReturnDetails,
  type ReturnStatus,
} from "@/lib/returns";
import { ago, stamp } from "@/lib/time";

/** The type the code was minted as (its prefix), which never changes. */
const typeFromCode = (code: string): ReturnType => RETURN_TYPES.find((t) => code.startsWith(`${t.prefix}-`))?.type ?? "general";

function TypeChip({ type, large }: { type: ReturnType; large?: boolean }) {
  const info = returnTypeInfo(type);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-[6px] border border-line bg-raised px-2 text-ink lowercase",
        large ? "py-1 text-[13px]" : "py-0.5 text-[11px]",
      )}
    >
      <span className="text-cyan">{info.prefix}</span>
      {info.label}
    </span>
  );
}

// ------------------------------------------------------------------ list

function matches(r: Ret, q: string) {
  if (!q) return true;
  return [r.code, returnTypeInfo(r.type).label, r.returnedBy, r.vendor, r.jobName, r.notes, r.closedBy, r.closeNote]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function ReturnsPage() {
  const [status, setStatus] = useState<ReturnStatus>("open");
  const { data, error, loading, reload } = useLiveQuery(`returns:${status}`, () => listReturns(status));
  const [q, setQ] = useState("");
  const [type, setType] = useState<ReturnType | "">("");
  const all = data ?? [];
  const shown = useMemo(() => all.filter((r) => matches(r, q.trim().toLowerCase()) && (!type || r.type === type)), [all, q, type]);
  const usedTypes = RETURN_TYPES.filter((t) => all.some((r) => r.type === t.type));

  return (
    <>
      <PageTitle count={data ? all.length : undefined}>Returns</PageTitle>

      <Link to="/returns/new" className={cx(btn("primary", true), "mb-5 min-h-[64px]! text-[17px]!")}>
        <ScanLine className="size-5" strokeWidth={2.2} /> Start a return
      </Link>

      <div role="tablist" aria-label="Return status" className="mb-3 grid grid-cols-2 gap-2">
        {(["open", "closed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setType("");
            }}
            className={cx(
              "vw-press min-h-11 rounded-[var(--radius-box)] border text-[14px] lowercase",
              status === s ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {all.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-cyan">/</span>
            <input
              type="search"
              aria-label="Search returns"
              className="field pr-12 pl-8"
              placeholder="search code, vendor, job, name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="vw-press absolute top-0 right-0 flex size-12 items-center justify-center text-dim">
                <X className="size-[18px]" />
              </button>
            ) : null}
          </div>
          {usedTypes.length > 1 || type ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filter by return type">
              {usedTypes.map((t) => {
                const on = type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setType(on ? "" : t.type)}
                    className={cx(
                      "vw-press flex min-h-10 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] lowercase",
                      on ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
                    )}
                  >
                    <span className="text-cyan">{t.prefix}</span>
                    {t.label}
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
            <div key={i} className="vw-skeleton h-[72px] border-b border-hair" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      ) : data && all.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-dim">{status === "open" ? "No open returns." : "Nothing closed out yet."}</p>
      ) : data && shown.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-dim">No match.</p>
      ) : (
        <ul className="flex flex-col border-t border-hair">
          {shown.map((r, i) => (
            <li key={r.id} className="vw-row" style={{ "--i": i } as CSSProperties}>
              <Link to="/r/$code" params={{ code: r.code }} className="flex items-center gap-3 border-b border-hair py-3 transition-opacity duration-150 active:opacity-70">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="code text-[19px] font-semibold tracking-[0.04em] text-cyan">{r.code}</span>
                    <span className="shrink-0 text-[12px] text-faint">{ago(r.status === "closed" ? r.closedAt : r.createdAt)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <TypeChip type={r.type} />
                    {r.vendor ? <span className="truncate text-[12px] text-dim">{r.vendor}</span> : null}
                  </span>
                  {r.returnedBy || r.jobName || r.closedBy ? (
                    <span className="truncate text-[12px] text-dim">
                      {[r.jobName, r.returnedBy ? `from ${r.returnedBy}` : null, r.status === "closed" && r.closedBy ? `closed by ${r.closedBy}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ------------------------------------------------------------------ start a return

type Step = { kind: "demo" } | { kind: "scan" } | { kind: "wrong" } | { kind: "type" } | { kind: "made"; ret: Ret };

export function ReturnNewPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(IS_DEMO ? { kind: "demo" } : { kind: "scan" });
  const [scanKey, setScanKey] = useState(0);
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  async function onScan(text: string) {
    setBusy(true);
    const ok = await isStationScan(text).catch(() => false);
    setBusy(false);
    setStep(ok ? { kind: "type" } : { kind: "wrong" });
  }

  async function pick(type: ReturnType) {
    setBusy(true);
    try {
      const ret = await startReturn(type, who);
      notifyChanged();
      navigator.vibrate?.([40, 60, 40]);
      setStep({ kind: "made", ret });
      window.scrollTo(0, 0);
    } catch (err) {
      toast(errorText(err, "Could not start the return."), "error");
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "demo") {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>Start a return</PageTitle>
        <p className="text-[15px] text-dim">
          On the live site this opens the camera to scan the returns QR posted in the warehouse. This preview has no poster to scan.
        </p>
        <Button big variant="primary" onClick={() => setStep({ kind: "type" })}>
          Skip the station scan (demo only)
        </Button>
        <Button onClick={() => setStep({ kind: "scan" })}>
          <ScanLine className="size-[18px]" /> Try the scanner anyway
        </Button>
      </div>
    );
  }

  if (step.kind === "scan") {
    return (
      <>
        <PageTitle>Start a return</PageTitle>
        <p className="text-[15px] text-dim">{busy ? "Checking…" : "Opening the camera…"}</p>
        <Scanner
          key={scanKey}
          raw
          title="Scan the returns QR"
          hint="scan the returns QR posted in the warehouse"
          onClose={() => void navigate({ to: "/returns" })}
          onScan={(t) => void onScan(t)}
        />
      </>
    );
  }

  if (step.kind === "wrong") {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>Start a return</PageTitle>
        <p className="rounded-[12px] border border-danger/60 bg-[#1c0c0d] px-4 py-3 text-[15px]">
          That's not the returns station code. Scan the QR posted in the warehouse.
        </p>
        <Button
          big
          variant="primary"
          onClick={() => {
            setScanKey((k) => k + 1);
            setStep({ kind: "scan" });
          }}
        >
          <ScanLine className="size-5" /> Scan again
        </Button>
        <Link to="/returns" className={btn("ghost")}>
          Cancel
        </Link>
      </div>
    );
  }

  if (step.kind === "type") {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>Start a return</PageTitle>
        <label htmlFor="r-who" className="font-sans text-[22px] leading-tight font-bold tracking-[-0.02em] text-white">
          Who's returning it?
        </label>
        <input
          id="r-who"
          autoFocus
          required
          maxLength={80}
          autoComplete="off"
          className="field h-14 text-[17px]"
          placeholder="Sign your name"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="font-sans text-[22px] leading-tight font-bold tracking-[-0.02em] text-white">What kind of return?</span>
        </div>
        {!who.trim() ? <p className="-mt-2 text-[13px] text-faint">Enter your name first.</p> : null}
        <div className="flex flex-col gap-2.5">
          {RETURN_TYPES.map((t, i) => (
            <button
              key={t.type}
              type="button"
              disabled={busy || !who.trim()}
              onClick={() => void pick(t.type)}
              className="vw-press vw-row flex min-h-[72px] items-center gap-4 rounded-[14px] border border-line bg-panel px-4 text-left disabled:opacity-50"
              style={{ "--i": i } as CSSProperties}
            >
              <span className="code w-14 shrink-0 text-[17px] font-semibold text-cyan">{t.prefix}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-sans text-[18px] font-semibold text-white">{t.label}</span>
                <span className="text-[13px] text-dim">{t.hint}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-faint" />
            </button>
          ))}
        </div>
        <Link to="/returns" className={btn("ghost")}>
          Cancel
        </Link>
      </div>
    );
  }

  return <ReturnMade ret={step.ret} />;
}

function ReturnMade({ ret }: { ret: Ret }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState<ReturnDetails>(() => detailsFrom(ret));
  const [current, setCurrent] = useState(ret);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumb = photoUrl(current.thumbPath);
  const info = returnTypeInfo(ret.type);
  const start = detailsFrom(ret);
  const changed = details.vendor !== start.vendor || details.jobName !== start.jobName || details.notes !== start.notes;

  /** One button: save anything optional that was filled in, then back to the list. */
  async function done(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (changed) {
        await saveReturnDetails(ret.code, details);
        notifyChanged();
      }
      toast("Saved.");
      await navigate({ to: "/returns" });
    } catch (err) {
      toast(errorText(err, "That did not save."), "error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <DrawCheck className="size-8 shrink-0 text-cyan drop-shadow-[0_0_10px_rgb(45_174_196/0.6)]" />
        <div className="flex flex-col">
          <span className="text-[13px] text-faint lowercase">{info.label}</span>
          <span className="font-sans text-[20px] font-semibold text-white">Write this on the item</span>
        </div>
      </div>

      <div className="vw-pop flex flex-col items-center gap-2 rounded-[16px] border border-cyan/50 bg-[radial-gradient(circle_at_50%_0%,rgb(45_174_196/0.18),transparent_70%)] px-4 py-8">
        <Decode text={ret.code} ms={700} className="code text-[clamp(44px,15vw,72px)] leading-none font-bold tracking-[0.06em] text-white" />
        <span className="text-[13px] text-dim">with a sharpie, big and clear</span>
        {ret.returnedBy ? <span className="text-[13px] text-faint">returned by {ret.returnedBy}</span> : null}
      </div>

      <form onSubmit={(e) => void done(e)} className="flex flex-col gap-4">
        <span className="section-label">optional · helps whoever processes it</span>
        {thumb ? (
          <div className="flex items-center gap-3">
            <img src={thumb} alt="Return photo" className="size-20 rounded-[8px] border border-line object-cover" />
            <Button onClick={() => setCamera(true)} disabled={busy}>
              <Camera className="size-[18px]" /> Retake photo
            </Button>
          </div>
        ) : (
          <Button onClick={() => setCamera(true)} disabled={busy}>
            <Camera className="size-[18px]" /> Add a photo
          </Button>
        )}
        <DetailsFields details={details} onChange={(p) => setDetails((d) => ({ ...d, ...p }))} showName={false} />
        <Button big variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Done"}
        </Button>
      </form>

      {camera ? (
        <PhotoCamera
          saving={busy}
          onClose={() => setCamera(false)}
          onUse={async (p: CapturedPhoto) => {
            setBusy(true);
            try {
              setCurrent(await setReturnPhoto(ret.code, p));
              notifyChanged();
              setCamera(false);
              toast("Photo saved.");
            } catch (err) {
              toast(errorText(err, "Photo did not save."), "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function DetailsFields({
  details,
  onChange,
  showName = true,
}: {
  details: ReturnDetails;
  onChange: (p: Partial<ReturnDetails>) => void;
  /** The name is asked before the code is made; later edits show it as required. */
  showName?: boolean;
}) {
  const input = (key: keyof ReturnDetails, id: string, label: string, placeholder: string, max = 120, required = false) => (
    <Field label={label} htmlFor={id} hint={required ? "required" : "optional"}>
      <input
        id={id}
        className="field"
        required={required}
        maxLength={max}
        autoComplete="off"
        placeholder={placeholder}
        value={details[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <>
      {showName ? input("returnedBy", "r-by", "Returned by", "Sign your name", 80, true) : null}
      <div className="grid grid-cols-2 gap-2.5">
        {input("vendor", "r-vendor", "Vendor", "If you know it", 200)}
        {input("jobName", "r-job", "From job", "Job name")}
      </div>
      <Field label="Note" htmlFor="r-note" hint="optional">
        <textarea
          id="r-note"
          rows={2}
          className="field resize-y"
          maxLength={2000}
          placeholder="Why it's coming back, what's wrong"
          value={details.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
    </>
  );
}

// ------------------------------------------------------------------ one return

export function ReturnDetailPage({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const { data: ret, error, loading, reload } = useLiveQuery(`ret:${code}`, () => getReturn(code));
  if (loading && ret === undefined) return <p className="py-10 text-center text-[15px] text-dim">Loading…</p>;
  if (error && !ret)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px]">{error}</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  if (!ret)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">No such return</h1>
        <p className="text-[15px] text-dim">
          <span className="code text-ink">{code}</span> is not in the returns list. It may have been removed.
        </p>
        <Link to="/returns" className={btn("primary", true)}>
          Go to returns
        </Link>
      </div>
    );
  return <ReturnEntry ret={ret} />;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid grid-cols-[124px_minmax(0,1fr)] gap-3 border-b border-hair py-2.5">
      <dt className="text-[13px] text-dim lowercase">{label}</dt>
      <dd className="text-[14px] break-words whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function ReturnEntry({ ret }: { ret: Ret }) {
  const navigate = useNavigate();
  const router = useRouter();
  const open = ret.status === "open";
  const minted = typeFromCode(ret.code);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState<ReturnDetails>(() => detailsFrom(ret));
  const [sheet, setSheet] = useState<"" | "type" | "close" | "remove">("");
  const [camera, setCamera] = useState(false);
  const [viewer, setViewer] = useState(false);
  const full = photoUrl(ret.photoPath);

  useEffect(() => {
    if (!editing) setDetails(detailsFrom(ret));
  }, [ret, editing]);

  async function act<T>(fn: () => Promise<T>, ok: string) {
    setBusy(true);
    try {
      await fn();
      notifyChanged();
      if (ok) toast(ok);
      return true;
    } catch (err) {
      toast(errorText(err, "That did not save."), "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const back = () => (router.history.length > 1 ? router.history.back() : void navigate({ to: "/returns" }));

  return (
    <article className="flex flex-col gap-5">
      <div className="-mt-1 flex items-center gap-2">
        <BackButton onClick={back} />
        <span className="flex-1" />
        <span className="text-[12px] text-faint">started {stamp(ret.createdAt)}</span>
      </div>

      <div
        className={
          open
            ? "self-start rounded-[6px] border border-cyan bg-cyan/10 px-2 py-0.5 text-[12px] text-cyan uppercase"
            : "self-start rounded-[6px] border border-line bg-raised px-2 py-0.5 text-[12px] text-ink"
        }
      >
        {open ? "Open return" : `Closed · ${ret.closedBy ?? "?"} · ${stamp(ret.closedAt)}`}
      </div>

      <div className="flex flex-col gap-2">
        <Decode text={ret.code} className="code text-[44px] leading-none font-bold tracking-[0.05em] text-white" />
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip type={ret.type} large />
          {minted !== ret.type ? <span className="text-[12px] text-faint">started as {returnTypeInfo(minted).label.toLowerCase()}</span> : null}
        </div>
      </div>

      {full ? (
        <button type="button" onClick={() => setViewer(true)} aria-label="Open full photo" className="block overflow-hidden rounded-[12px] border border-line bg-black">
          <img src={full} alt={`Photo of ${ret.code}`} className="mx-auto max-h-[50vh] w-full object-contain" />
        </button>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-2.5">
          <Button big variant="primary" disabled={busy} onClick={() => setSheet("close")}>
            Close out
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button disabled={busy} onClick={() => setSheet("type")}>
              <RotateCcw className="size-[18px]" /> Change type
            </Button>
            <Button disabled={busy} onClick={() => setCamera(true)}>
              <Camera className="size-[18px]" /> {full ? "Retake" : "Photo"}
            </Button>
          </div>
        </div>
      ) : (
        <Button big disabled={busy} onClick={() => void act(() => reopenReturn(ret.code), "Reopened.")}>
          <Undo2 className="size-5" /> Reopen
        </Button>
      )}

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => saveReturnDetails(ret.code, details), "Saved.").then((ok) => ok && setEditing(false));
          }}
          className="flex flex-col gap-4"
        >
          <DetailsFields details={details} onChange={(p) => setDetails((d) => ({ ...d, ...p }))} />
          <Button variant="primary" type="submit" disabled={busy || !details.returnedBy.trim()}>
            {busy ? "Saving…" : "Save details"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <dl className="m-0 border-t border-hair">
          <Row label="Type" value={returnTypeInfo(ret.type).label} />
          <Row label="Returned by" value={ret.returnedBy} />
          <Row label="Vendor" value={ret.vendor} />
          <Row label="From job" value={ret.jobName} />
          <Row label="Note" value={ret.notes} />
          <Row label="Started" value={stamp(ret.createdAt)} />
          {!open ? <Row label="Closed by" value={`${ret.closedBy ?? ""} · ${stamp(ret.closedAt)}`} /> : null}
          {!open ? <Row label="Close note" value={ret.closeNote} /> : null}
        </dl>
      )}

      <div className="mt-2 flex flex-col gap-3 border-t-2 border-line pt-5">
        {!editing ? (
          <Button onClick={() => setEditing(true)} disabled={busy}>
            <PenLine className="size-5" /> Edit details
          </Button>
        ) : null}
        <Button variant="danger" onClick={() => setSheet("remove")} disabled={busy}>
          <Trash2 className="size-5" /> Remove
        </Button>
      </div>

      {sheet === "type" ? (
        <Overlay title="Change type" onClose={() => setSheet("")} closeLabel="Cancel">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <p className="text-[14px] text-dim">
              The code on the item stays <span className="code text-cyan">{ret.code}</span>. Only the type changes.
            </p>
            {RETURN_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                disabled={busy || t.type === ret.type}
                onClick={() =>
                  void act(() => reclassifyReturn(ret.code, t.type), `Now ${t.label.toLowerCase()}.`).then((ok) => ok && setSheet(""))
                }
                className={cx(
                  "vw-press flex min-h-[64px] items-center gap-4 rounded-[14px] border px-4 text-left",
                  t.type === ret.type ? "border-cyan bg-cyan/10" : "border-line bg-panel",
                )}
              >
                <span className="code w-12 shrink-0 text-[15px] font-semibold text-cyan">{t.prefix}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-sans text-[17px] font-semibold text-white">{t.label}</span>
                  <span className="text-[12px] text-dim">{t.type === ret.type ? "current type" : t.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Overlay>
      ) : null}

      {sheet === "close" ? (
        <CloseSheet ret={ret} busy={busy} onCancel={() => setSheet("")} onConfirm={(who, note) => void act(() => closeReturn(ret.code, who, note), "Closed out.").then((ok) => ok && setSheet(""))} />
      ) : null}

      {sheet === "remove" ? (
        <Confirm
          title={`Remove ${ret.code}?`}
          body="Deletes this return and its photo for every phone. This cannot be undone."
          confirmLabel="Remove for good"
          danger
          busy={busy}
          onCancel={() => setSheet("")}
          onConfirm={() =>
            void act(() => removeReturn(ret.code), "Removed.").then((ok) => {
              if (ok) void navigate({ to: "/returns", replace: true });
            })
          }
        />
      ) : null}

      {camera ? (
        <PhotoCamera
          saving={busy}
          onClose={() => setCamera(false)}
          onUse={(p: CapturedPhoto) =>
            act(() => setReturnPhoto(ret.code, p), "Photo saved.").then((ok) => {
              if (ok) setCamera(false);
            })
          }
        />
      ) : null}
      {viewer && full ? <PhotoViewer src={full} alt={ret.code} onClose={() => setViewer(false)} /> : null}
    </article>
  );
}

function CloseSheet({ ret, busy, onCancel, onConfirm }: { ret: Ret; busy: boolean; onCancel: () => void; onConfirm: (who: string, note: string) => void }) {
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  return (
    <Overlay title="Close out" onClose={onCancel} closeLabel="Cancel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (who.trim()) onConfirm(who.trim(), note);
        }}
        className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <p className="text-[15px] text-dim">
          <span className="code text-cyan">{ret.code}</span> · {returnTypeInfo(ret.type).label.toLowerCase()}
        </p>
        <label htmlFor="closed-by" className="font-sans text-[28px] leading-tight font-bold tracking-[-0.02em]">
          Closed out by:
        </label>
        <input
          id="closed-by"
          autoFocus
          required
          maxLength={80}
          autoComplete="off"
          className="field h-14 text-[17px]"
          placeholder="Sign your name"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        <Field label="What happened" htmlFor="close-note" hint="optional">
          <textarea
            id="close-note"
            rows={2}
            className="field resize-y"
            maxLength={500}
            placeholder="Shipped back, RMA #, restocked to bin…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <span className="flex-1" />
        <Button big variant="primary" type="submit" disabled={busy || !who.trim()}>
          {busy ? "Saving…" : "Close out"}
        </Button>
      </form>
    </Overlay>
  );
}
