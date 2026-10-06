import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cx } from "@/components/ui";
import { LOCATIONS } from "@/lib/locations";

const isPreset = (v: string) => (LOCATIONS as readonly string[]).includes(v);

/**
 * One tap for the usual places; "Other" opens a required text box.
 * `value` is the location itself ("" while Other is empty).
 */
export function LocationPicker({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [other, setOther] = useState(() => Boolean(value) && !isPreset(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value && !isPreset(value)) setOther(true);
  }, [value]);

  const chip = (on: boolean) =>
    cx(
      "vw-press flex min-h-11 items-center justify-center rounded-[var(--radius-box)] border px-2 text-[13px] lowercase",
      on ? "border-cyan bg-cyan/10 text-cyan" : "border-line bg-panel text-dim",
    );

  return (
    <div className="flex flex-col gap-2">
      <div id={id} role="radiogroup" className="grid grid-cols-3 gap-1.5">
        {LOCATIONS.map((place) => {
          const on = !other && value === place;
          return (
            <button
              key={place}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setOther(false);
                onChange(place);
              }}
              className={chip(on)}
            >
              {on ? <MapPin aria-hidden className="vw-tap mr-1 size-3.5" strokeWidth={2.4} /> : null}
              {place}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          onClick={() => {
            if (!other) onChange("");
            setOther(true);
            setTimeout(() => inputRef.current?.focus(), 30);
          }}
          className={cx(chip(other), "col-span-3")}
        >
          other
        </button>
      </div>
      {other ? (
        <div className="vw-page flex flex-col gap-1">
          <label htmlFor={`${id}-other`} className="label">
            other location <span className="ml-1 text-cyan">*</span>
          </label>
          <input
            ref={inputRef}
            id={`${id}-other`}
            required
            maxLength={60}
            autoComplete="off"
            className="field"
            placeholder="Where is it?"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {!value.trim() ? <p className="text-[12px] text-danger">Type where it is, or pick a place above.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
