import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, PackageCheck, X } from "lucide-react";
import { PhotoViewer } from "@/components/PhotoCamera";
import { PhotoField } from "@/components/PhotoField";
import { NamePicker } from "@/components/VendorPicker";
import { DrawCheck } from "@/components/motion";
import { Button, Confirm, Field, btn, errorText, toast, useOnline } from "@/components/ui";
import { DOCK_NOTE_MAX, closeDockReceipt, listWaitingDock, logDockReceipt, type DockReceipt } from "@/lib/dock";
import { notifyChanged, useLiveQuery } from "@/lib/live";
import { photoUrl, type CapturedPhoto } from "@/lib/photo";
import { useIsAdmin } from "@/lib/role";
import { ago } from "@/lib/time";

/**
 * Log a dock receipt: a delivery that came in with no admin around. Name, box
 * photo, packing slip photo and an optional note. An admin receives it later.
 */
export function DockLogForm() {
  const online = useOnline();
  const [name, setName] = useState("");
  const [box, setBox] = useState<CapturedPhoto | null>(null);
  const [slip, setSlip] = useState<CapturedPhoto | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!name.trim() || !box || !slip) return;
    setBusy(true);
    try {
      await logDockReceipt({ loggedBy: name, note, box, slip });
      notifyChanged();
      setDone(true);
      window.scrollTo(0, 0);
    } catch (err) {
      toast(errorText(err, "Could not save the dock receipt."), "error");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <DrawCheck className="size-8 shrink-0 text-cyan drop-shadow-[0_0_10px_rgb(45_174_196/0.6)]" />
          <h1 className="m-0 text-[26px] leading-tight font-semibold tracking-[-0.03em]">
            <span className="grad-title">Dock receipt saved</span>
          </h1>
        </div>
        <Button
          big
          variant="primary"
          onClick={() => {
            setDone(false);
            setBox(null);
            setSlip(null);
            setNote("");
          }}
        >
          Log another
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Your name" htmlFor="dock-name">
        <NamePicker id="dock-name" value={name} onChange={setName} />
      </Field>
      <PhotoField kind="box" label="package photo" photo={box} onChange={setBox} />
      <PhotoField kind="slip" photo={slip} onChange={setSlip} />
      <Field label="Note" htmlFor="dock-note" hint="optional">
        <textarea
          id="dock-note"
          className="field min-h-24 text-[16px] leading-snug"
          maxLength={DOCK_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {!online ? <p className="text-[13px] text-danger">No signal.</p> : null}
      <Button big variant="primary" disabled={!name.trim() || !box || !slip || busy || !online} onClick={() => void submit()}>
        {busy ? "Saving…" : "Save dock receipt"}
      </Button>
    </div>
  );
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
