import { useRef, useState } from "react";
import { Archive, Lock, Upload } from "lucide-react";
import { CopySql } from "@/components/Gate";
import { PageTitle } from "@/components/Shell";
import { Button, Confirm, cx, errorText, toast } from "@/components/ui";
import { buildBackup, restoreBackup } from "@/lib/backup";
import { notifyChanged } from "@/lib/live";
import { lock } from "@/lib/pin";
import { downloadBlob } from "@/lib/sticker";
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
  return [table, await bucketOk(BARCODES_BUCKET), await bucketOk(PHOTOS_BUCKET)];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b-2 border-line pb-7">
      <h2 className="font-cond text-[24px] font-bold uppercase">{title}</h2>
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
    <div className="flex flex-col gap-7">
      <PageTitle>Backup & setup</PageTitle>

      <Section title="Export backup">
        <p className="text-[18px] text-dim">One zip with every record (JSON + CSV), every sticker, and every photo.</p>
        {IS_DEMO ? <p className="text-[17px] text-dim">Downloads are blocked in this preview. Export works on the live site.</p> : null}
        <Button big variant="primary" disabled={!!exporting || IS_DEMO} onClick={() => void doExport()}>
          <Archive className="size-7" /> {exporting ? `Packing ${exporting}` : "Export backup"}
        </Button>
      </Section>

      <Section title="Restore">
        <p className="text-[18px] text-dim">Loads a backup zip into the live list. Entries with the same code are overwritten. Nothing else is deleted.</p>
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
          <Upload className="size-6" /> {restoring ? `Restoring ${restoring}` : "Choose backup zip"}
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
              <li key={c.label} className={cx("rounded-[var(--radius-box)] border-2 px-4 py-3", c.ok ? "border-line" : "border-danger")}>
                <p className="font-semibold">
                  {c.ok ? "✓" : "✗"} {c.label}
                </p>
                <p className={cx("text-[16px]", c.ok ? "text-dim" : "text-danger")}>{c.detail}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {checks?.some((c) => !c.ok) ? <CopySql /> : null}
      </Section>

      <Section title="This phone">
        <Button
          onClick={() => {
            lock();
            if (IS_DEMO) window.location.reload();
            else window.location.assign("/");
          }}
        >
          <Lock className="size-6" /> Lock with PIN
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
