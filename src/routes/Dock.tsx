import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Camera, Check, ClipboardList, FileText, IdCard, PackageCheck, RotateCcw, Truck, X } from "lucide-react";
import { PhotoCamera, PhotoViewer } from "@/components/PhotoCamera";
import { Scanner } from "@/components/Scanner";
import { DrawCheck } from "@/components/motion";
import { Button, Confirm, btn, cx, errorText, toast, useOnline } from "@/components/ui";
import { badgeToken, isBadgeScan, whoseBadge } from "@/lib/badges";
import { DOCK_NOTE_MAX, closeDockReceipt, listWaitingDock, logDockReceipt, type DockReceipt } from "@/lib/dock";
import { notifyChanged, useLiveQuery } from "@/lib/live";
import { photoUrl, type CapturedPhoto, type PhotoKind } from "@/lib/photo";
import { useIsAdmin } from "@/lib/role";
import { ago } from "@/lib/time";

/**
 * Log a dock receipt: for a delivery that came in with no admin around.
 * Badge (phone camera), box photo, packing slip photo, optional note.
 * Works without a role, so office phones never need the shop PIN.
 */
export function DockLogForm({ onExit }: { onExit?: () => void }) {
  const online = useOnline();
  const [who, setWho] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [box, setBox] = useState<CapturedPhoto | null>(null);
  const [slip, setSlip] = useState<CapturedPhoto | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DockReceipt | null>(null);

  async function onBadge(raw: string) {
    setScanning(false);
    if (!isBadgeScan(raw)) return toast("That isn't a Floorcast badge. Scan the QR on your badge.", "error");
    const token = badgeToken(raw);
    if (!token) return toast("That badge didn't read. Try again.", "error");
    setChecking(true);
    try {
      const name = await whoseBadge(token);
      if (!name) return toast("Badge not recognized. Ask an admin for a new one.", "error");
      navigator.vibrate?.(30);
      setWho(name);
    } catch (err) {
      toast(errorText(err, "Could not check the badge."), "error");
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!who || !box || !slip) return;
    setBusy(true);
    try {
      const r = await logDockReceipt({ loggedBy: who, note, box, slip });
      notifyChanged();
      setDone(r);
      window.scrollTo(0, 0);
    } catch (err) {
      toast(errorText(err, "Could not log the delivery."), "error");
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setDone(null);
    setBox(null);
    setSlip(null);
    setNote("");
    // Same person usually logs the next one too; they can rescan to switch.
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <DrawCheck className="size-8 shrink-0 text-cyan drop-shadow-[0_0_10px_rgb(45_174_196/0.6)]" />
          <div>
            <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-[-0.03em]">
              <span className="grad-title">Delivery logged</span>
            </h1>
            <p className="mt-1 text-[15px] text-dim">Thanks, {done.loggedBy.split(" ")[0]}. An admin will receive it into Floorcast.</p>
          </div>
        </div>
        <p className="text-[14px] text-dim">Leave the box where it is. No need to drop the packing slip on the shop desk.</p>
        <Button big variant="primary" onClick={again}>
          Log another delivery
        </Button>
        {onExit ? (
          <Button big onClick={onExit}>
            Done
          </Button>
        ) : null}
      </div>
    );
  }

  const ready = Boolean(who && box && slip);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[28px] leading-tight font-semibold tracking-[-0.03em]">
          <span className="grad-title">Log a delivery</span>
        </h1>
        <p className="mt-1.5 text-[14px] text-dim">For a delivery that came in with no admin around. An admin receives it later.</p>
      </div>

      <Step n={1} done={Boolean(who)} title="Scan your badge">
        {who ? (
          <div className="flex items-center justify-between gap-3 rounded-[12px] border border-cyan/40 bg-cyan/10 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5 text-[17px] font-semibold text-ink">
              <BadgeCheck className="size-5 shrink-0 text-cyan" /> <span className="truncate">{who}</span>
            </span>
            <button type="button" onClick={() => setScanning(true)} className="vw-press shrink-0 font-mono text-[13px] text-cyan lowercase">
              not you?
            </button>
          </div>
        ) : (
          <Button big variant="primary" disabled={checking} onClick={() => setScanning(true)}>
            <IdCard className="size-5" /> {checking ? "Checking badge…" : "Scan badge"}
          </Button>
        )}
      </Step>

      <Step n={2} done={Boolean(box)} title="Photo of the package">
        <PhotoStep kind="box" photo={box} onChange={setBox} />
      </Step>

      <Step n={3} done={Boolean(slip)} title="Photo of the packing slip">
        <PhotoStep kind="slip" photo={slip} onChange={setSlip} />
      </Step>

      <Step n={4} done={Boolean(note.trim())} title="Note" optional>
        <label htmlFor="dock-note" className="sr-only">
          Note
        </label>
        <textarea
          id="dock-note"
          className="field min-h-24 text-[16px] leading-snug"
          placeholder="e.g. Left by the overhead door. Two boxes, one dented."
          maxLength={DOCK_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Step>

      {!online ? <p className="text-[13px] text-danger">No signal. Logging a delivery needs a connection.</p> : null}
      <Button big variant="primary" disabled={!ready || busy || !online} onClick={() => void submit()}>
        <Truck className="size-5" /> {busy ? "Uploading photos…" : "Log delivery"}
      </Button>
      {!ready ? (
        <p className="-mt-2 text-center text-[13px] text-faint">
          {!who ? "Scan your badge to start." : !box ? "Next: photo of the package." : "Next: photo of the packing slip."}
        </p>
      ) : null}

      {scanning ? <Scanner title="Scan your badge" raw hint="point at the QR on your badge" onScan={(c) => void onBadge(c)} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}

function Step({ n, title, done, optional, children }: { n: number; title: string; done: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <span className="flex items-center gap-2">
        <span
          className={cx(
            "flex size-6 items-center justify-center rounded-full border font-mono text-[12px]",
            done ? "border-cyan bg-cyan text-cyan-ink" : "border-line text-dim",
          )}
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <span className="section-label">{title}</span>
        {optional ? <span className="text-[12px] text-faint">optional</span> : null}
      </span>
      {children}
    </section>
  );
}

function PhotoStep({ kind, photo, onChange }: { kind: PhotoKind; photo: CapturedPhoto | null; onChange: (p: CapturedPhoto | null) => void }) {
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const slip = kind === "slip";
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo.thumb);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  return (
    <>
      {preview ? (
        <div className="flex items-center gap-3">
          <img src={preview} alt={slip ? "Packing slip photo" : "Package photo"} className="size-20 rounded-[8px] border border-line object-cover" />
          <Button className="flex-1" onClick={() => setCamera(true)}>
            <RotateCcw className="size-[18px]" /> Retake
          </Button>
        </div>
      ) : (
        <Button big onClick={() => setCamera(true)}>
          {slip ? <FileText className="size-5" /> : <Camera className="size-5" />} {slip ? "Photo of packing slip" : "Photo of package"}
        </Button>
      )}
      {camera ? (
        <PhotoCamera
          kind={kind}
          onClose={() => setCamera(false)}
          onUse={(p) => {
            onChange(p);
            setCamera(false);
          }}
        />
      ) : null}
    </>
  );
}

/** In-app page at /dock (any role). */
export function DockPage() {
  const navigate = useNavigate();
  return <DockLogForm onExit={() => void navigate({ to: "/" })} />;
}

// ------------------------------------------------------------------ admin side

/**
 * Waiting dock receipts, at the top of the floor list for admins. Nothing at
 * all when there are none (or before the database update is run).
 */
export function DockWaiting() {
  const admin = useIsAdmin();
  // An error (no signal, or the database update not run yet) just hides it.
  const { data } = useLiveQuery("dock:waiting", () => (admin ? listWaitingDock() : Promise.resolve([])));
  const [open, setOpen] = useState(true);
  if (!admin || !data?.length) return null;
  return (
    <section aria-label="Dock receipts" className="mb-5 rounded-[14px] border border-cyan/35 bg-cyan/[0.06] p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="vw-press flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2.5">
          <ClipboardList className="size-5 text-cyan" />
          <span className="text-[16px] font-semibold text-ink">
            {data.length} dock {data.length === 1 ? "receipt" : "receipts"} to receive
          </span>
        </span>
        <span className="font-mono text-[12px] text-cyan lowercase">{open ? "hide" : "show"}</span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          {data.map((r) => (
            <DockCard key={r.id} r={r} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DockCard({ r }: { r: DockReceipt }) {
  const [view, setView] = useState<{ src: string; alt: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const thumbs: Array<[string, string, string]> = [
    [r.thumbPath, r.photoPath, "Package"],
    [r.slipThumbPath, r.slipPhotoPath, "Packing slip"],
  ];
  async function close() {
    setBusy(true);
    try {
      await closeDockReceipt(r.id);
      notifyChanged();
      toast("Dock receipt closed.");
    } catch (err) {
      toast(errorText(err, "Could not close it."), "error");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  return (
    <article className="rounded-[12px] border border-line bg-panel p-3">
      <div className="flex gap-3">
        {thumbs.map(([thumb, full, alt]) => {
          const src = photoUrl(thumb);
          return (
            <button
              key={alt}
              type="button"
              aria-label={`View ${alt.toLowerCase()} photo`}
              onClick={() => {
                const big = photoUrl(full);
                if (big) setView({ src: big, alt });
              }}
              className="vw-press flex flex-col items-center gap-1"
            >
              {src ? <img src={src} alt={alt} className="size-20 rounded-[8px] border border-line object-cover" /> : <span className="size-20 rounded-[8px] border border-line" />}
              <span className="text-[11px] text-faint">{alt.toLowerCase()}</span>
            </button>
          );
        })}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-ink">{r.loggedBy}</span>
          <span className="text-[13px] text-dim">{ago(r.createdAt)}</span>
          {r.note ? <p className="m-0 line-clamp-3 text-[13px] leading-snug text-ink">“{r.note}”</p> : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <Link to="/receive" search={{ dock: r.id }} className={btn("primary")}>
          <PackageCheck className="size-[18px]" /> Receive
        </Link>
        <Button variant="ghost" aria-label="Close without receiving" disabled={busy} onClick={() => setConfirm(true)} className="w-auto px-4">
          <X className="size-[18px]" />
        </Button>
      </div>
      {view ? <PhotoViewer src={view.src} alt={view.alt} onClose={() => setView(null)} /> : null}
      {confirm ? (
        <Confirm
          title="Close this dock receipt?"
          body="Use this for a duplicate or a delivery that wasn't ours. It won't become a box on the floor."
          confirmLabel="Close it"
          busy={busy}
          onConfirm={() => void close()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </article>
  );
}
