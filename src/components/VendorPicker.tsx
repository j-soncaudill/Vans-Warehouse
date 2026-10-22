import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PMS, VENDORS } from "@/lib/form";

const OTHER = "__other__";

type PickerProps = { id: string; value: string; onChange: (v: string) => void };

/**
 * The usual names in a native dropdown (the phone's own picker), plus
 * "Other…" which opens a text box. The field stays optional.
 */
function ChoicePicker({
  id,
  value,
  onChange,
  options,
  placeholder,
  otherLabel,
  max,
}: PickerProps & { options: readonly string[]; placeholder: string; otherLabel: string; max: number }) {
  /** The usual name, from the list (case-insensitive), or null. */
  const match = (v: string) => options.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null;
  const [other, setOther] = useState(() => Boolean(value.trim()) && !match(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // A saved name that isn't on the list opens as Other with the name filled in.
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
          <option value="">{placeholder}</option>
          {options.map((v) => (
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
          aria-label={otherLabel}
          className="field vw-page"
          maxLength={max}
          autoComplete="off"
          placeholder={otherLabel}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
    </div>
  );
}

export function VendorPicker(props: PickerProps) {
  return <ChoicePicker {...props} options={VENDORS} placeholder="Choose vendor" otherLabel="Vendor name" max={200} />;
}

export function PmPicker(props: PickerProps) {
  return <ChoicePicker {...props} options={PMS} placeholder="Choose PM" otherLabel="PM name" max={120} />;
}
