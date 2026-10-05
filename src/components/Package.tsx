import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ChevronRight } from "lucide-react";
import { PhotoViewer } from "@/components/PhotoCamera";
import { cx } from "@/components/ui";
import { colorHex } from "@/lib/form";
import type { Pkg } from "@/lib/packages";
import { photoUrl } from "@/lib/photo";
import { ago } from "@/lib/time";

/** 1:1 center crop everywhere. Tap opens the full compressed photo. */
export function Thumb({ pkg, size = 84 }: { pkg: Pkg; size?: number }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const thumb = photoUrl(pkg.thumbPath) ?? photoUrl(pkg.photoPath);
  const full = photoUrl(pkg.photoPath) ?? thumb;
  const style = { width: size, height: size };
  if (!thumb || broken) {
    return (
      <span style={style} className="flex shrink-0 items-center justify-center rounded-[8px] border-2 border-dashed border-line text-dim" aria-label="No photo">
        <Camera className="size-7" />
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        style={style}
        onClick={() => setOpen(true)}
        aria-label={`Open photo of ${pkg.jobName}`}
        className="shrink-0 overflow-hidden rounded-[8px] bg-raised active:opacity-80"
      >
        <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="aspect-square h-full w-full object-cover object-center" />
      </button>
      {open && full ? <PhotoViewer src={full} alt={pkg.jobName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function ColorChip({ tag, large }: { tag: string | null; large?: boolean }) {
  const hex = colorHex(tag);
  if (!hex || !tag) return null;
  return (
    <span className={cx("inline-flex items-center gap-2 font-cond font-bold uppercase", large ? "text-[19px]" : "text-[15px]")}>
      <span aria-hidden className={cx("inline-block rounded-[4px] border-2 border-ink/60", large ? "size-6" : "size-4")} style={{ background: hex }} />
      {tag}
    </span>
  );
}

export function DamageChip() {
  return <span className="rounded-[4px] border-2 border-danger px-1.5 font-cond text-[14px] font-bold tracking-[0.05em] text-danger uppercase">Damaged</span>;
}

export function PackageCard({ pkg }: { pkg: Pkg }) {
  const out = pkg.status === "checked_out";
  const line = out
    ? [pkg.checkedOutTo ? `Taken by ${pkg.checkedOutTo}` : null, ago(pkg.checkedOutAt)]
    : [pkg.poNumber ? `PO ${pkg.poNumber}` : null, pkg.vendor, ago(pkg.receivedAt)];
  const hex = colorHex(pkg.colorTag);
  return (
    <div className="flex items-stretch gap-3 rounded-[var(--radius-box)] border-2 border-line bg-panel p-2.5">
      <Thumb pkg={pkg} />
      <Link
        to="/p/$code"
        params={{ code: pkg.code }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[6px] active:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-cond text-[24px] leading-[1.1] font-bold">{pkg.jobName}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="code text-[15px] text-amber">{pkg.code}</span>
            {hex ? <ColorChip tag={pkg.colorTag} /> : null}
            {pkg.damaged ? <DamageChip /> : null}
          </span>
          <span className="mt-1 block truncate text-[16px] text-dim">{line.filter(Boolean).join(" · ")}</span>
        </span>
        <ChevronRight className="size-6 shrink-0 text-dim" />
      </Link>
    </div>
  );
}
