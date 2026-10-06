import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, ChevronRight, MapPin } from "lucide-react";
import { PhotoViewer } from "@/components/PhotoCamera";
import { cx } from "@/components/ui";
import { colorHex } from "@/lib/form";
import type { Pkg } from "@/lib/packages";
import { photoUrl } from "@/lib/photo";
import { ago } from "@/lib/time";

/** 1:1 center crop everywhere. Tap opens the full compressed photo. */
export function Thumb({ pkg, size = 56 }: { pkg: Pkg; size?: number }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const thumb = photoUrl(pkg.thumbPath) ?? photoUrl(pkg.photoPath);
  const full = photoUrl(pkg.photoPath) ?? thumb;
  const style = { width: size, height: size };
  if (!thumb || broken) {
    return (
      <span style={style} className="flex shrink-0 items-center justify-center rounded-[8px] border border-dashed border-line text-faint" aria-label="No photo">
        <Camera className="size-5" />
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
        className="shrink-0 overflow-hidden rounded-[8px] transition-opacity duration-150 border border-[#1b3a42] bg-raised active:opacity-80"
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
    <span className={cx("inline-flex items-center gap-2 lowercase", large ? "text-[14px]" : "text-[12px] text-dim")}>
      {large ? <span className="text-dim">color tag</span> : null}
      <span aria-hidden className={cx("inline-block rounded-[2px]", large ? "size-2.5" : "size-2")} style={{ background: hex }} />
      {tag}
    </span>
  );
}

export function DamageChip() {
  return <span className="text-[12px] text-danger">!damaged</span>;
}

export function PackageCard({ pkg }: { pkg: Pkg }) {
  const out = pkg.status === "checked_out";
  const line = out
    ? pkg.lastLocation
      ? [`taken from ${pkg.lastLocation}`, pkg.checkedOutTo ? `by ${pkg.checkedOutTo}` : null]
      : [pkg.checkedOutTo ? `taken by ${pkg.checkedOutTo}` : null]
    : [pkg.vendor?.toLowerCase(), pkg.poNumber ? `po ${pkg.poNumber}` : null];
  const when = ago(out ? pkg.checkedOutAt : pkg.receivedAt);
  const hex = colorHex(pkg.colorTag);
  return (
    <div className="flex items-center gap-3.5 border-b border-hair py-3">
      <Thumb pkg={pkg} />
      <Link to="/p/$code" params={{ code: pkg.code }} className="group flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-150 active:opacity-70">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-sans text-[17px] font-semibold text-white">{pkg.jobName}</span>
            <span className="shrink-0 text-[12px] text-faint">{when}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
            <span className="text-cyan">{pkg.code}</span>
            {hex ? <span aria-label={`${pkg.colorTag} tag`} className="inline-block size-2 rounded-[2px]" style={{ background: hex }} /> : null}
            {pkg.damaged ? <DamageChip /> : null}
            {pkg.lastLocation && !out ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-dim">
                <MapPin aria-hidden className="size-3" />
                {pkg.lastLocation.toLowerCase()}
              </span>
            ) : null}
          </span>
          {line.some(Boolean) ? <span className="truncate text-[12px] text-dim">{line.filter(Boolean).join(" · ")}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-faint transition-transform duration-200 group-active:translate-x-1" />
      </Link>
    </div>
  );
}
