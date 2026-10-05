import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Camera, Pencil, Trash2, Undo2 } from "lucide-react";
import { ColorChip, DamageChip } from "@/components/Package";
import { PackageForm } from "@/components/PackageForm";
import { PhotoCamera, PhotoViewer } from "@/components/PhotoCamera";
import { StickerButtons, StickerPreview } from "@/components/Sticker";
import { Button, Confirm, Overlay, btn, errorText, toast } from "@/components/ui";
import { normalizeCode } from "@/lib/codes";
import { formFromPkg, type FormValues } from "@/lib/form";
import { notifyChanged, useLiveQuery } from "@/lib/live";
import { checkOut, editPackage, getPackage, removePackage, replacePhoto, returnToFloor, type Pkg } from "@/lib/packages";
import { photoUrl, type CapturedPhoto } from "@/lib/photo";
import { stamp } from "@/lib/time";

const RECENT_KEY = "vw.recentTakers";

function recentTakers(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberTaker(name: string) {
  try {
    const list = [name, ...recentTakers().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
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

const yn = (v: boolean | null) => (v == null ? "—" : v ? "yes" : "no");

export function DetailPage({ code: rawCode }: { code: string }) {
  const code = normalizeCode(rawCode);
  const { data: pkg, error, loading, reload } = useLiveQuery(`pkg:${code}`, () => getPackage(code));

  if (loading && pkg === undefined) return <p className="py-10 text-center text-[15px] text-dim">Loading…</p>;
  if (error && !pkg)
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px]">{error}</p>
        <Button onClick={reload}>Try again</Button>
      </div>
    );
  if (!pkg)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">Not in the warehouse</h1>
        <p className="text-[15px] text-dim">
          <span className="code text-ink">{code}</span> is not on the list. It may have been removed.
        </p>
        <Link to="/receive" search={{ code }} className={btn("primary", true)}>
          Receive {code}
        </Link>
        <Link to="/" className={btn("ghost")}>
          Back to floor
        </Link>
      </div>
    );
  return <Entry pkg={pkg} />;
}

function Entry({ pkg }: { pkg: Pkg }) {
  const navigate = useNavigate();
  const router = useRouter();
  const onFloor = pkg.status === "on_floor";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormValues>(() => formFromPkg(pkg));
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [camera, setCamera] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const full = photoUrl(pkg.photoPath);

  useEffect(() => {
    if (!editing) setForm(formFromPkg(pkg));
  }, [pkg, editing]);
  useEffect(() => setImgBroken(false), [pkg.photoPath]);

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

  const back = () => (router.history.length > 1 ? router.history.back() : void navigate({ to: onFloor ? "/" : "/out" }));

  if (editing) {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void act(() => editPackage(pkg.code, form), "Saved.").then((ok) => ok && setEditing(false));
        }}
        className="flex flex-col gap-6"
      >
        <div className="flex items-center justify-between">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em]"><span className="grad-title">Edit</span><span className="text-cyan">_</span></h1>
          <span className="code text-[15px] text-cyan">{pkg.code}</span>
        </div>
        <PackageForm values={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        <div className="flex flex-col gap-2">
          <Button big variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <article className="flex flex-col gap-5">
      <div className="-mt-1 flex items-center gap-2">
        <button type="button" onClick={back} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[14px] text-cyan lowercase active:opacity-70">
          <ArrowLeft className="size-[18px]" /> Back
        </button>
        <span className="flex-1" />
        <span className="text-[12px] text-faint">recv {stamp(pkg.receivedAt)}</span>
      </div>

      <div
        className={
          onFloor
            ? "self-start rounded-[6px] border border-cyan bg-cyan/10 px-2 py-0.5 text-[12px] text-cyan uppercase"
            : "self-start rounded-[6px] border border-line bg-raised px-2 py-0.5 text-[12px] text-ink"
        }
      >
        {onFloor ? "On the floor" : `Checked out · ${pkg.checkedOutTo ?? "?"} · ${stamp(pkg.checkedOutAt)}`}
      </div>

      <div>
        <h1 className="m-0 font-sans text-[32px] leading-[1.1] font-bold tracking-[-0.02em] break-words text-white">{pkg.jobName}</h1>
        <span className="grad-code mt-1 block text-[19px] font-semibold tracking-[0.02em]">{pkg.code}</span>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <ColorChip tag={pkg.colorTag} large />
          {pkg.damaged ? <DamageChip /> : null}
        </div>
      </div>

      {full && !imgBroken ? (
        <button type="button" onClick={() => setViewer(true)} aria-label="Open full photo" className="block overflow-hidden rounded-[12px] border border-line bg-black">
          <img src={full} alt={`Photo of ${pkg.jobName}`} onError={() => setImgBroken(true)} className="mx-auto max-h-[60vh] w-full object-contain" />
        </button>
      ) : null}
      {onFloor ? (
        <Button onClick={() => setCamera(true)} disabled={busy}>
          <Camera className="size-[18px]" /> {full ? "Retake photo" : "Add photo"}
        </Button>
      ) : null}

      {onFloor ? (
        <Button big variant="primary" disabled={busy} onClick={() => setCheckout(true)}>
          Check out
        </Button>
      ) : (
        <Button big variant="primary" disabled={busy} onClick={() => void act(() => returnToFloor(pkg.code), "Back on the floor.")}>
          <Undo2 className="size-5" /> Return to floor
        </Button>
      )}

      <dl className="m-0 border-t border-hair">
        <Row label="Received" value={stamp(pkg.receivedAt)} />
        <Row label="PO number" value={pkg.poNumber && <span className="code">{pkg.poNumber}</span>} />
        <Row label="Vendor" value={pkg.vendor} />
        <Row label="Delivered by" value={pkg.deliveredBy} />
        <Row label="Received by" value={pkg.receivedBy} />
        <Row label="PM" value={pkg.pm} />
        <Row label="Quantities / attributes" value={pkg.quantities} />
        <Row label="Packing slip" value={yn(pkg.packingSlip)} />
        <Row label="Damage" value={yn(pkg.damaged)} />
        <Row label="Notes" value={pkg.notes} />
        {!onFloor ? <Row label="Taken by" value={`${pkg.checkedOutTo ?? ""} · ${stamp(pkg.checkedOutAt)}`} /> : null}
      </dl>

      <section aria-label="Sticker" className="flex flex-col gap-3">
        <span className="section-label">// sticker</span>
        <StickerPreview info={pkg} />
        <StickerButtons info={pkg} />
      </section>

      <div className="mt-2 flex flex-col gap-3 border-t-2 border-line pt-5">
        {onFloor ? (
          <Button onClick={() => setEditing(true)} disabled={busy}>
            <Pencil className="size-5" /> Edit details
          </Button>
        ) : null}
        <Button variant="danger" onClick={() => setConfirmRemove(true)} disabled={busy}>
          <Trash2 className="size-5" /> Remove
        </Button>
      </div>

      {checkout ? (
        <CheckoutSheet
          pkg={pkg}
          busy={busy}
          onCancel={() => setCheckout(false)}
          onConfirm={(who) =>
            void act(() => checkOut(pkg.code, who), `Checked out to ${who}.`).then((ok) => {
              if (ok) {
                rememberTaker(who);
                setCheckout(false);
              }
            })
          }
        />
      ) : null}

      {confirmRemove ? (
        <Confirm
          title={`Remove ${pkg.code}?`}
          body="Deletes this entry, its sticker file, and its photos for every phone. This cannot be undone. Export a backup first if you need a record."
          confirmLabel="Remove for good"
          danger
          busy={busy}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() =>
            void act(() => removePackage(pkg.code), "Removed.").then((ok) => {
              if (ok) void navigate({ to: onFloor ? "/" : "/out", replace: true });
            })
          }
        />
      ) : null}

      {camera ? (
        <PhotoCamera
          saving={busy}
          onClose={() => setCamera(false)}
          onUse={(p: CapturedPhoto) =>
            act(() => replacePhoto(pkg.code, p), "Photo saved.").then((ok) => {
              if (ok) setCamera(false);
            })
          }
        />
      ) : null}
      {viewer && full ? <PhotoViewer src={full} alt={pkg.jobName} onClose={() => setViewer(false)} /> : null}
    </article>
  );
}

function CheckoutSheet({
  pkg,
  busy,
  onCancel,
  onConfirm,
}: {
  pkg: Pkg;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (who: string) => void;
}) {
  const [who, setWho] = useState("");
  const recent = recentTakers();
  return (
    <Overlay title="Check out" onClose={onCancel} closeLabel="Cancel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (who.trim()) onConfirm(who.trim());
        }}
        className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <p className="text-[15px] text-dim">
          {pkg.jobName} · <span className="code text-cyan">{pkg.code}</span>
        </p>
        <label htmlFor="taken-by" className="font-sans text-[28px] leading-tight font-bold tracking-[-0.02em]">
          Who took it?
        </label>
        <input
          id="taken-by"
          autoFocus
          required
          maxLength={80}
          autoComplete="off"
          className="field h-14 text-[17px]"
          placeholder="Name, crew, or truck"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        {recent.length ? (
          <div className="flex flex-wrap gap-2">
            {recent.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setWho(n)}
                className="min-h-12 rounded-[var(--radius-box)] border border-line bg-panel px-4 text-[15px] font-semibold active:bg-raised"
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}
        <span className="flex-1" />
        <Button big variant="primary" type="submit" disabled={busy || !who.trim()}>
          {busy ? "Saving…" : "Check out"}
        </Button>
      </form>
    </Overlay>
  );
}
