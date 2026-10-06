import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { VENDORS } from "@/lib/form";

const OTHER = "__other__";

/** The usual vendor, from a list (case-insensitive), or null. */
const match = (v: string) => VENDORS.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null;

/**
 * Most-used vendors in a native dropdown (the phone's own picker), plus
 * "Other…" which opens a text box. Vendor stays optional.
 */
export function VendorPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(() => Boolean(value.trim()) && !match(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // A saved vendor that isn't on the list opens as Other with the name filled in.
  useEffect(() => {
    if (value.trim() && !match(value)) setOther(true);
  }, [value]);

  const selected = other ? OTHER : (match(value) ?? "");

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <select
          id={id}
          className="field appearance-none pr-11"
          value={selected}
          onChange={(e) => {
            const v = e.target.value;
            if (v === OTHER) {
              setOther(true);
              onChange(match(value) ? "" : value);
              setTimeout(() => inputRef.current?.focus(), 30);
            } else {
              setOther(false);
              onChange(v);
            }
          }}
        >
          <option value="">Choose vendor</option>
          {VENDORS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-[18px] -translate-y-1/2 text-dim" />
      </div>
      {other ? (
        <input
          ref={inputRef}
          id={`${id}-other`}
          aria-label="Vendor name"
          className="field vw-page"
          maxLength={200}
          autoComplete="off"
          placeholder="Vendor name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}
