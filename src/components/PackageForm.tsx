import { Check } from "lucide-react";
import { LocationPicker } from "@/components/LocationPicker";
import { VendorPicker } from "@/components/VendorPicker";
import { Field, YesNoBlank, cx } from "@/components/ui";
import { COLOR_HEX, COLOR_TAGS, type FormValues } from "@/lib/form";

type TextKey = "poNumber" | "deliveredBy" | "receivedBy" | "pm";

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** "Legacy box": here before Floorcast. Its arrival month is a guess, and optional. */
function LegacySwitch({ values, onChange }: { values: FormValues; onChange: (patch: Partial<FormValues>) => void }) {
  return (
    <div className={cx("flex flex-col gap-3 rounded-[var(--radius-box)] border px-3.5 py-3", values.legacy ? "border-amber/60 bg-amber/10" : "border-line bg-panel")}>
      <button
        id="f-legacy"
        type="button"
        role="switch"
        aria-checked={values.legacy}
        onClick={() => onChange({ legacy: !values.legacy, ...(values.legacy ? { legacyMonth: "" } : {}) })}
        className="vw-press flex items-center gap-3 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] text-ink">Legacy box</span>
          <span className="text-[12px] text-dim">Here before Floorcast</span>
        </span>
        <span aria-hidden className={cx("relative h-7 w-12 shrink-0 rounded-full border transition-colors", values.legacy ? "border-amber bg-amber" : "border-line bg-raised")}>
          <span className={cx("absolute top-[3px] size-5 rounded-full bg-white shadow transition-[left]", values.legacy ? "left-[23px]" : "left-[3px]")} />
        </span>
      </button>
      {values.legacy ? (
        <Field label="About when did it arrive?" htmlFor="f-legacy-month" hint="optional">
          <input
            id="f-legacy-month"
            type="month"
            className="field"
            max={thisMonth()}
            value={values.legacyMonth}
            onChange={(e) => onChange({ legacyMonth: e.target.value })}
          />
          <span className="mt-1 block text-[12px] text-faint">Leave blank if nobody knows; today is used.</span>
        </Field>
      ) : null}
    </div>
  );
}

/** Every field the floor fills in by hand. Only Job is required. */
export function PackageForm({
  values,
  onChange,
  withLocation = false,
}: {
  values: FormValues;
  onChange: (patch: Partial<FormValues>) => void;
  /** Receive only. Later changes go through Move so the history stays complete. */
  withLocation?: boolean;
}) {
  const text = (key: TextKey, id: string, label: string, opts: { placeholder?: string; max?: number; mono?: boolean } = {}) => (
    <Field label={label} htmlFor={id} hint="optional">
      <input
        id={id}
        className={cx("field", opts.mono && "code")}
        maxLength={opts.max ?? 120}
        autoComplete="off"
        placeholder={opts.placeholder}
        value={values[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </Field>
  );

  const job = (
      <Field label="Job" htmlFor="f-job" hint="required">
        <input
          id="f-job"
          required
          className="field font-sans text-[17px] font-semibold text-white"
          maxLength={120}
          autoComplete="off"
          placeholder="Job name"
          value={values.jobName}
          onChange={(e) => onChange({ jobName: e.target.value })}
        />
      </Field>
  );
  const details = (
    <>
      {text("poNumber", "f-po", "PO number", { placeholder: "PO #", max: 60, mono: true })}
      <Field label="Vendor" htmlFor="f-vendor" hint="optional">
        <VendorPicker id="f-vendor" value={values.vendor} onChange={(vendor) => onChange({ vendor })} />
      </Field>
      <div className="grid grid-cols-2 gap-2.5">
        {text("deliveredBy", "f-delivered", "Delivered by", { placeholder: "Carrier or driver" })}
        {text("receivedBy", "f-received", "Received by", { placeholder: "Who signed" })}
      </div>
      {text("pm", "f-pm", "PM", { placeholder: "Project manager" })}

      <Field label="Quantities / attributes" htmlFor="f-qty" hint="optional">
        <textarea
          id="f-qty"
          rows={2}
          className="field resize-y"
          maxLength={1000}
          placeholder="Count, size, pieces, anything on the box"
          value={values.quantities}
          onChange={(e) => onChange({ quantities: e.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Packing slip" htmlFor="f-slip">
          <YesNoBlank id="f-slip" value={values.packingSlip} onChange={(v) => onChange({ packingSlip: v })} />
        </Field>
        <Field label="Damage" htmlFor="f-damage">
          <YesNoBlank id="f-damage" value={values.damaged} onChange={(v) => onChange({ damaged: v })} />
        </Field>
      </div>
    </>
  );
  const color = (
      <Field label={values.colorTag ? `color tag · ${values.colorTag.toLowerCase()}` : "color tag"} htmlFor="f-color">
        <div id="f-color" role="radiogroup" className="grid grid-cols-8 gap-1.5">
          {COLOR_TAGS.map((tag) => {
            const on = values.colorTag === tag;
            return (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={tag}
                title={tag}
                onClick={() => onChange({ colorTag: on ? "" : tag })}
                style={{ background: COLOR_HEX[tag] }}
                className={cx(
                  "vw-press flex h-11 items-center justify-center rounded-[6px]",
                  tag === "Black" && "border border-[#2a4a52]",
                  on && "vw-ring shadow-[0_0_0_2px_#05080a,0_0_0_4px_var(--color-cyan)]",
                )}
              >
                {on ? <Check aria-hidden className={cx("vw-tap size-5", tag === "White" || tag === "Yellow" ? "text-black" : "text-white")} strokeWidth={3.5} /> : null}
              </button>
            );
          })}
        </div>
      </Field>
  );
  const location = withLocation ? (
        <Field label="Last known location" htmlFor="f-location" hint="required">
          <LocationPicker id="f-location" value={values.location} onChange={(location) => onChange({ location })} />
        </Field>
      
  ) : null;
  const notes = (
      <Field label="Notes" htmlFor="f-notes" hint="optional">
        <textarea
          id="f-notes"
          rows={3}
          className="field resize-y"
          maxLength={2000}
          placeholder="Anything the floor should know"
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
  );

  // A legacy box (here before Floorcast) only needs job, place and photo; the rest folds away.
  if (values.legacy) {
    return (
      <div className="flex flex-col gap-4">
        <LegacySwitch values={values} onChange={onChange} />
        {job}
        {color}
        {location}
        <details className="vw-details group rounded-[var(--radius-box)] border border-line bg-panel/60">
          <summary className="vw-press flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-[14px] text-dim lowercase">
            more details <span className="text-[12px] text-faint">optional</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-hair px-3.5 pt-3.5 pb-4">
            {details}
            {notes}
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <LegacySwitch values={values} onChange={onChange} />
      {job}
      {details}
      {color}
      {location}
      {notes}
    </div>
  );
}
