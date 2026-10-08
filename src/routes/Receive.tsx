import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, ScanLine, Trash2 } from "lucide-react";
import { PackageForm } from "@/components/PackageForm";
import { PhotoCamera } from "@/components/PhotoCamera";
import { Scanner } from "@/components/Scanner";
import { Decode, DrawCheck } from "@/components/motion";
import { PageTitle } from "@/components/Shell";
import { StickerButtons, StickerPreview } from "@/components/Sticker";
import { Button, btn, cx, errorText, toast } from "@/components/ui";
import { CODE_PREFIX, normalizeCode } from "@/lib/codes";
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

export function ReceivePage({ code: incoming }: { code?: string }) {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(loadForm);
  const [mode, setMode] = useState<"new" | "existing">(incoming ? "existing" : "new");
  const [existing, setExisting] = useState(incoming ? normalizeCode(incoming) : "");
  const [photo, setPhoto] = useState<CapturedPhoto | null>(() => loadPhotoDraft());
  const [preview, setPreview] = useState<string | null>(null);
  const [scanner, setScanner] = useState(false);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ pkg: Pkg; warnings: string[] } | null>(null);
  const jobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (incoming) {
      setMode("existing");
      setExisting(normalizeCode(incoming));
    }
  }, [incoming]);

  useEffect(() => saveForm(values), [values]);

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo.thumb);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

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
      toast("Scan or type the code on the box, or switch to a new code.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await receivePackage(values, mode === "existing" ? existing : null, photo);
      notifyChanged();
      saveForm(null);
      await savePhotoDraft(null);
      setDone(result);
      window.scrollTo(0, 0);
      for (const w of result.warnings) toast(w, "error");
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
      <PageTitle>New delivery</PageTitle>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6">
        <section aria-label="Barcode" className="flex flex-col gap-2.5">
          <span className="section-label">barcode</span>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(
              [
                ["new", `New ${CODE_PREFIX} code`],
                ["existing", "Code on the box"],
              ] as const
            ).map(([m, text]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cx(
                  "vw-press min-h-12 rounded-[var(--radius-box)] border px-2 text-[13px] leading-tight",
                  mode === m ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim active:bg-raised",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          {mode === "new" ? (
            <p className="text-[12px] text-faint">a new {CODE_PREFIX} code and sticker are made when you save</p>
          ) : (
            <div className="flex gap-2">
              <label htmlFor="existing-code" className="sr-only">
                Code on the box
              </label>
              <input
                id="existing-code"
                className="field code min-w-0 flex-1 text-[17px] text-cyan uppercase"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Scan or type"
                value={existing}
                onChange={(e) => setExisting(e.target.value)}
                onKeyDown={(e) => {
                  // A wedge scanner ends with Enter: go to Job instead of submitting.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setExisting(normalizeCode(e.currentTarget.value));
                    focusJob();
                  }
                }}
              />
              <button
                type="button"
                aria-label="Scan the code with the camera"
                onClick={() => setScanner(true)}
                className="grad-cyan flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-box)] text-cyan-ink"
              >
                <ScanLine className="size-5" strokeWidth={2.5} />
              </button>
            </div>
          )}
        </section>

        <div ref={jobRef}>
          <PackageForm values={values} onChange={patch} withLocation />
        </div>

        <section aria-label="Box photo" className="flex flex-col gap-2.5">
          <span className="section-label">box photo</span>
          {preview ? (
            <div className="flex items-center gap-3">
              <img src={preview} alt="Box photo" className="size-24 rounded-[8px] border border-line object-cover" />
              <div className="flex flex-1 flex-col gap-2">
                <Button onClick={() => setCamera(true)}>
                  <Camera className="size-[18px]" /> Retake
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPhoto(null);
                    void savePhotoDraft(null);
                  }}
                >
                  <Trash2 className="size-[18px]" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setCamera(true)}>
              <Camera className="size-[18px]" /> Open camera
            </Button>
          )}
        </section>

        <Button big variant="primary" type="submit" disabled={busy || !values.location.trim()}>
          {busy ? "Saving…" : "Receive to floor"}
        </Button>
      </form>

      {scanner ? (
        <Scanner
          title="Scan code on box"
          onClose={() => setScanner(false)}
          onScan={(c) => {
            setScanner(false);
            setExisting(c);
            setTimeout(focusJob, 50);
          }}
        />
      ) : null}
      {camera ? (
        <PhotoCamera
          onClose={() => setCamera(false)}
          onUse={(p) => {
            setPhoto(p);
            void savePhotoDraft(p);
            setCamera(false);
          }}
        />
      ) : null}
    </>
  );
}
