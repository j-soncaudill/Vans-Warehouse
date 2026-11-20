import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { PackageForm } from "@/components/PackageForm";
import { PhotoField } from "@/components/PhotoField";
import { Decode, DrawCheck } from "@/components/motion";
import { StickerButtons, StickerPreview } from "@/components/Sticker";
import { Button, btn, cx, errorText, toast } from "@/components/ui";
import { normalizeCode } from "@/lib/codes";
import { DockLogForm } from "@/routes/Dock";
import { dockNoteForBox, dockPhotos, getDockReceipt, markDockReceived, type DockReceipt } from "@/lib/dock";
import { emptyForm, type FormValues } from "@/lib/form";
import { notifyChanged } from "@/lib/live";
import { receivePackage, type Pkg } from "@/lib/packages";
import { loadPhotoDraft, savePhotoDraft, type CapturedPhoto } from "@/lib/photo";

const FORM_KEY = "vw.receive.form";

function loadForm(): FormValues {
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    return raw ? { ...emptyForm(), ...(JSON.parse(raw) as Partial<FormValues>) } : emptyForm();
  } catch {
    return emptyForm();
  }
}

function saveForm(v: FormValues | null) {
  try {
    if (v) sessionStorage.setItem(FORM_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(FORM_KEY);
  } catch {
    /* ignore */
  }
}

/** `dock`: receiving a dock receipt. Its photos and note fill in the form, and saving marks it received. */
export function ReceivePage({ code: incoming, dock }: { code?: string; dock?: number }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(loadForm);
  const [mode, setMode] = useState<"new" | "existing">(incoming ? "existing" : "new");
  const [existing, setExisting] = useState(incoming ? normalizeCode(incoming) : "");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(() => loadPhotoDraft());
  const [slip, setSlip] = useState<CapturedPhoto | null>(() => loadPhotoDraft("slip"));
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"new" | "dock">("new");
  const [done, setDone] = useState<{ pkg: Pkg; warnings: string[] } | null>(null);
  const jobRef = useRef<HTMLDivElement>(null);
  const [fromDock, setFromDock] = useState<DockReceipt | null>(null);

  useEffect(() => {
    if (!dock) return;
    let alive = true;
    void (async () => {
      try {
        const r = await getDockReceipt(dock);
        if (!alive) return;
        if (!r || r.status !== "waiting") {
          toast(r ? "That dock receipt was already handled." : "That dock receipt is gone.", "error");
          return;
        }
        setFromDock(r);
        const extra = dockNoteForBox(r);
        setValues((v) =>
          v.notes.includes("Dock receipt")
            ? v
            : { ...v, pm: v.pm || r.pm, packingSlip: "yes", notes: [v.notes.trim(), extra].filter(Boolean).join("\n") },
        );
        const { box, slip } = await dockPhotos(r);
        if (!alive) return;
        if (box) {
          setPhoto(box);
          void savePhotoDraft(box);
        }
        if (slip) {
          setSlip(slip);
          void savePhotoDraft(slip, "slip");
        }
        if (!box || !slip) toast("Couldn't load the dock photos. Take them again if you need them.", "error");
      } catch (err) {
        if (alive) toast(errorText(err, "Could not load the dock receipt."), "error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [dock]);

  useEffect(() => {
    if (incoming) {
      setMode("existing");
      setExisting(normalizeCode(incoming));
    }
  }, [incoming]);

  useEffect(() => saveForm(values), [values]);

  const patch = (p: Partial<FormValues>) => setValues((v) => ({ ...v, ...p }));

  function focusJob() {
    jobRef.current?.querySelector<HTMLInputElement>("#f-job")?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.jobName.trim()) {
      toast("Job is required.", "error");
      focusJob();
      return;
    }
    if (mode === "existing" && !existing.trim()) {
      toast("No code on this box. Use a new code.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await receivePackage(values, mode === "existing" ? existing : null, photo, slip);
      if (fromDock) {
        await markDockReceived(fromDock.id, result.pkg.code).catch(() =>
          toast("Saved, but the dock receipt is still listed. Close it from the floor list.", "error"),
        );
        setFromDock(null);
      }
      notifyChanged();
      saveForm(null);
      await savePhotoDraft(null);
      await savePhotoDraft(null, "slip");
      setDone(result);
      window.scrollTo(0, 0);
      for (const w of result.warnings) toast(w, "error");
      if (result.queued) toast("No signal: saved on this phone. It syncs by itself when you're back online.");
    } catch (err) {
      toast(errorText(err, "Receive failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDone(null);
    // During a legacy sweep the next box is usually legacy too, from the same spot.
    setValues((v) => (v.legacy ? { ...emptyForm(), legacy: true, legacyMonth: v.legacyMonth, location: v.location } : emptyForm()));
    setPhoto(null);
    setSlip(null);
    setMode("new");
    setExisting("");
    void navigate({ to: "/receive", search: {} });
  }

  if (done) {
    const { pkg } = done;
    return (
      <>
        <div className="mb-4 flex items-center gap-3">
          <DrawCheck className="size-8 shrink-0 text-cyan drop-shadow-[0_0_10px_rgb(45_174_196/0.6)]" />
          <div>
            <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-[-0.03em]"><span className="grad-title"><Decode text="On the floor" ms={420} /></span></h1>
            <p className="mt-1 text-[15px] text-dim">
              {pkg.jobName} · <Decode text={pkg.code} className="code text-cyan" />
              {pkg.lastLocation ? <span className="block text-[13px] text-faint">at {pkg.lastLocation.toLowerCase()}</span> : null}
            </p>
          </div>
        </div>
        <p className="mb-3 text-[13px] text-faint">put this sticker on the box</p>
        <StickerPreview info={pkg} print />
        <div className="mt-4 flex flex-col gap-3">
          <StickerButtons info={pkg} primary />
          <Button big onClick={reset}>
            Receive another
          </Button>
          <Link to="/p/$code" params={{ code: pkg.code }} className={btn("ghost")}>
            Open this entry
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div role="tablist" aria-label="What are you logging?" className="mb-5 grid grid-cols-2 gap-1 rounded-[14px] border border-line bg-panel p-1">
        {(
          [
            ["new", "New delivery"],
            ["dock", "Dock receipt"],
          ] as const
        ).map(([t, text]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "vw-press min-h-12 rounded-[10px] text-[16px] font-semibold",
              tab === t ? "grad-cyan text-cyan-ink" : "text-dim active:bg-raised",
            )}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "dock" ? (
        <DockLogForm />
      ) : (
        <>
          {fromDock ? (
            <p className="-mt-1 mb-4 flex items-center gap-2 text-[14px] text-dim">
              <ClipboardList className="size-4 shrink-0 text-cyan" /> From dock receipt · {fromDock.pm}
            </p>
          ) : null}
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
            {mode === "existing" && existing ? (
              <div className="-mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-box)] border border-line bg-panel px-3.5 py-2.5">
                <span className="code text-[16px] text-cyan">{existing}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode("new");
                    setExisting("");
                  }}
                  className="vw-press font-mono text-[13px] text-dim lowercase"
                >
                  use new code
                </button>
              </div>
            ) : null}

            <div ref={jobRef}>
              <PackageForm values={values} onChange={patch} withLocation />
            </div>

            <PhotoField draft kind="box" photo={photo} onChange={setPhoto} />
            <PhotoField draft kind="slip" photo={slip} onChange={setSlip} />

            <Button big variant="primary" type="submit" disabled={busy || !values.location.trim()}>
              {busy ? "Saving…" : "Receive to floor"}
            </Button>
          </form>
        </>
      )}
    </>
  );
}
