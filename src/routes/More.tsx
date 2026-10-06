import { useEffect, useRef, useState } from "react";
import { Archive, Download, Lock, Upload } from "lucide-react";
import { CopySql } from "@/components/Gate";
import upgradeSql from "../../supabase/migrations/002_locations_returns.sql?raw";
import { PageTitle } from "@/components/Shell";
import { Button, Confirm, cx, errorText, toast } from "@/components/ui";
import { buildBackup, restoreBackup } from "@/lib/backup";
import { notifyChanged } from "@/lib/live";
import { lock } from "@/lib/pin";
import { stationPayload, stationToken } from "@/lib/returns";
import { downloadBlob, renderAppPoster, renderStationPoster } from "@/lib/sticker";
import { BARCODES_BUCKET, IS_DEMO, PHOTOS_BUCKET, probeSchema, sb } from "@/lib/supabase";

type Check = { label: string; ok: boolean; detail: string };

async function bucketOk(id: string): Promise<Check> {
  const { error } = await sb().storage.from(id).list("", { limit: 1 });
  return { label: `Storage bucket “${id}”`, ok: !error, detail: error ? error.message : "Ready" };
}

async function systemCheck(): Promise<Check[]> {
  const schema = await probeSchema();
  const table: Check = {
    label: "packages table + photo columns",
    ok: schema === "ready",
    detail: schema === "ready" ? "Ready" : schema === "outdated" ? "Old table. Run the setup SQL." : schema === "missing" ? "Missing. Run the setup SQL." : "Unreachable",
  };
  const extra: Check = {
    label: "locations + returns (update 002)",
    ok: schema === "ready",
    detail: schema === "ready" ? "Ready" : schema === "upgrade" ? "Not added yet. Run the update SQL below." : "Waiting on the packages table.",
  };
  const token = schema === "ready" ? await stationToken() : null;
  const station: Check = { label: "Returns station code", ok: Boolean(token), detail: token ? "Ready" : "Missing. Run the update SQL below." };
  return [table, extra, station, await bucketOk(BARCODES_BUCKET), await bucketOk(PHOTOS_BUCKET)];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-hair pb-6">
      <h2 className="m-0 text-[12px] font-normal text-faint">{title.toLowerCase()}</h2>
      {children}
    </section>
  );
}

export function MorePage() {
  const [exporting, setExporting] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState("");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport() {
    setExporting("Starting…");
    try {
      const r = await buildBackup((d, t) => setExporting(`${d} of ${t}`));
      if (r.count === 0) toast("Nothing to back up yet.");
      downloadBlob(r.blob, r.filename);
      toast(`Backup saved: ${r.count} package${r.count === 1 ? "" : "s"}.`);
    } catch (err) {
      toast(errorText(err, "Backup failed."), "error");
    } finally {
      setExporting("");
    }
  }

  async function doRestore() {
    if (!restoreFile) return;
    setRestoring("Reading…");
    try {
      const r = await restoreBackup(restoreFile, (d, t) => setRestoring(`${d} of ${t}`));
      notifyChanged();
      toast(`Restored ${r.restored} package${r.restored === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped}` : ""}.`);
    } catch (err) {
      toast(errorText(err, "Restore failed."), "error");
    } finally {
      setRestoring("");
      setRestoreFile(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Backup & setup</PageTitle>

      <Section title="Export backup">
        <p className="text-[15px] text-dim">One zip with every record (JSON + CSV), every sticker, and every photo.</p>
        {IS_DEMO ? <p className="text-[15px] text-dim">Downloads are blocked in this preview. Export works on the live site.</p> : null}
        <Button big variant="primary" disabled={!!exporting || IS_DEMO} onClick={() => void doExport()}>
          <Archive className="size-5" /> {exporting ? `Packing ${exporting}` : "Export backup"}
        </Button>
      </Section>

      <Section title="Restore">
        <p className="text-[15px] text-dim">Loads a backup zip into the live list. Entries with the same code are overwritten. Nothing else is deleted.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            setRestoreFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button disabled={!!restoring} onClick={() => fileRef.current?.click()}>
          <Upload className="size-[18px]" /> {restoring ? `Restoring ${restoring}` : "Choose backup zip"}
        </Button>
      </Section>

      <Section title="System check">
        <Button
          disabled={checking}
          onClick={() => {
            setChecking(true);
            void systemCheck()
              .then(setChecks)
              .catch((err) => toast(errorText(err, "Check failed."), "error"))
              .finally(() => setChecking(false));
          }}
        >
          {checking ? "Checking…" : "Check database & storage"}
        </Button>
        {checks ? (
          <ul className="flex flex-col gap-2">
            {checks.map((c) => (
              <li key={c.label} className={cx("rounded-[var(--radius-box)] border bg-panel px-4 py-3 text-[14px]", c.ok ? "border-line" : "border-danger/60")}>
                <p className="font-semibold">
                  <span className={c.ok ? "text-cyan" : "text-danger"}>{c.ok ? "✓" : "✗"}</span> {c.label}
                </p>
                <p className={cx("text-[13px]", c.ok ? "text-dim" : "text-danger")}>{c.detail}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {checks?.some((c) => !c.ok) ? (
          checks[0].ok ? <CopySql sql={upgradeSql} label="Copy update SQL" /> : <CopySql />
        ) : null}
      </Section>

      <Section title="Open the app">
        <AppPoster />
      </Section>

      <Section title="Returns station">
        <StationPoster />
      </Section>

      <Section title="This phone">
        <Button
          onClick={() => {
            lock();
            if (IS_DEMO) window.location.reload();
            else window.location.assign("/");
          }}
        >
          <Lock className="size-[18px]" /> Lock with PIN
        </Button>
      </Section>

      {restoreFile ? (
        <Confirm
          title="Restore this backup?"
          body={
            <>
              <span className="code text-ink">{restoreFile.name}</span> will be merged into the live list on every phone.
            </>
          }
          confirmLabel="Restore"
          onCancel={() => setRestoreFile(null)}
          onConfirm={() => void doRestore()}
          busy={!!restoring}
        />
      ) : null}
    </div>
  );
}

/** The QR posted in the warehouse. Starting a return requires scanning it. */
function StationPoster() {
  const [url, setUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    void stationToken()
      .then(async (token) => {
        if (!token) {
          if (alive) setMissing(true);
          return;
        }
        const b = await renderStationPoster(stationPayload(token));
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, []);
  if (missing)
    return <p className="text-[15px] text-dim">The returns station code isn't set up yet. Run the update SQL from the system check.</p>;
  return (
    <>
      <p className="text-[15px] text-dim">
        Print this and post it in the warehouse. A return can only be started by scanning it, so whoever drops one off has to be there.
      </p>
      <div className="overflow-hidden rounded-[12px] border border-line bg-white">
        {url ? <img src={url} alt="Returns station poster with QR code" className="mx-auto block max-h-[60vh] w-auto" /> : <div className="aspect-[17/22] w-full" />}
      </div>
      {IS_DEMO ? <p className="text-[13px] text-faint">Downloads are blocked in this preview. Save the poster from the live site.</p> : null}
      <Button variant="primary" disabled={!blob || IS_DEMO} onClick={() => blob && downloadBlob(blob, "returns-station-poster.png")}>
        <Download className="size-[18px]" /> Save poster to print
      </Button>
    </>
  );
}

/** A QR that opens this site. Post it wherever the crew needs the app. */
function AppPoster() {
  const url = `${window.location.origin}/`;
  const [img, setImg] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let alive = true;
    void renderAppPoster(url).then((b) => {
      if (!alive) return;
      made = URL.createObjectURL(b);
      setBlob(b);
      setImg(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);
  return (
    <>
      <p className="text-[15px] text-dim">
        Print this and post it where the crew will see it. Scanning it with a phone camera opens Floorcast at{" "}
        <span className="code text-cyan">{url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>.
      </p>
      <div className="overflow-hidden rounded-[12px] border border-line bg-white">
        {img ? <img src={img} alt="Poster with a QR code that opens Floorcast" className="mx-auto block max-h-[60vh] w-auto" /> : <div className="aspect-[17/22] w-full" />}
      </div>
      {IS_DEMO ? <p className="text-[13px] text-faint">Downloads are blocked in this preview. Save the poster from the live site.</p> : null}
      <Button variant="primary" disabled={!blob || IS_DEMO} onClick={() => blob && downloadBlob(blob, "floorcast-app-poster.png")}>
        <Download className="size-[18px]" /> Save poster to print
      </Button>
    </>
  );
}
