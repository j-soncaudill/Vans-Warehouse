import { useEffect, useState, type FormEvent } from "react";
import { IdCard, Plus, Printer, RefreshCw, Share2, Trash2 } from "lucide-react";
import { Button, Confirm, cx, errorText, toast } from "@/components/ui";
import { addEmployee, badgePayload, listEmployees, reissueBadge, removeEmployee, type Employee } from "@/lib/badges";
import { useRole } from "@/lib/role";
import { renderBadge, type BadgeStyle } from "@/lib/badgeArt";
import { downloadBlob, printLabel } from "@/lib/sticker";
import { DEMO_UI } from "@/lib/supabase";

async function badgeBlob(e: Employee, style: BadgeStyle) {
  return renderBadge(e.name, badgePayload(e.badge), style);
}

const STYLES: Array<{ style: BadgeStyle; label: string; hint: string }> = [
  { style: "color", label: "full color", hint: "For a color printer on cardstock. Cut to 4×3 in for a badge holder." },
  { style: "label", label: "black & white", hint: "For the Brother label printer (4×3 labels). Thermal labels print black only." },
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
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ e: Employee; url: string; style: BadgeStyle } | null>(null);
  const [reissue, setReissue] = useState<Employee | null>(null);
  const [remove, setRemove] = useState<Employee | null>(null);
  const [goStation, setGoStation] = useState(false);

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
      const e = await addEmployee(name);
      setName("");
      load();
      toast(`Badge ready: ${e.name}`);
      await show(e);
    } catch (err) {
      toast(errorText(err, "Could not add that person."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[15px] text-dim">
        Each person gets a QR badge for their lanyard. At the station they scan it ("Hi Dana. Start scanning your items."), then scan their boxes. Each box
        is checked out under their name.
      </p>

      <form onSubmit={(e) => void add(e)} className="flex gap-2">
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
      </form>

      {error ? <p className="text-[14px] text-danger">{error}</p> : null}
      {people && people.length === 0 ? <p className="text-[14px] text-dim">No badges yet. Add the first person above.</p> : null}
      {people && people.length > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0" aria-label="Badges">
          {people.map((e) => (
            <li key={e.id} className="flex items-center gap-2 border-b border-hair py-1.5">
              <IdCard aria-hidden className="size-4 shrink-0 text-cyan" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{e.name}</span>
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

      <div className="mt-2 flex flex-col gap-2 rounded-[12px] border border-line bg-panel p-3.5">
        <p className="text-[14px] text-ink">Make this device the check-out station</p>
        <p className="text-[13px] text-dim">
          For the handheld scanner by the door. It will show only the station screen. Getting back to the full app needs the shop PIN.
        </p>
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
              <img src={preview.url} alt={`Badge for ${preview.e.name}, ${preview.style === "color" ? "full color" : "black and white"}`} className="w-full rounded-[8px] border border-line bg-white" />
              <span className="text-[13px] text-dim">{STYLES.find((o) => o.style === preview.style)?.hint}</span>
              {DEMO_UI ? <span className="text-[13px] text-faint">Printing and saving are blocked in this preview.</span> : null}
              <span className="flex gap-2">
                <Button disabled={DEMO_UI} onClick={() => void badgeBlob(preview.e, preview.style).then((b) => printLabel(b, `${preview.e.name} badge`))}>
                  <Printer className="size-[18px]" /> print
                </Button>
                <Button disabled={DEMO_UI} onClick={() => void saveBadge(preview.e, preview.style)}>
                  <Share2 className="size-[18px]" /> save
                </Button>
              </span>
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

      {reissue ? (
        <Confirm
          title={`New badge for ${reissue.name}?`}
          body="The old badge stops working right away. Print the new one before the next shift."
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
          body="Their badge stops working. Boxes they already checked out keep their name."
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
          body="It will show only the check-out station. Admin alerts turn off on this device. To leave, tap exit and enter the shop PIN."
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
