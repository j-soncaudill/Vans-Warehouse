import { Check } from "lucide-react";
import { Field, YesNoBlank, cx } from "@/components/ui";
import { COLOR_HEX, COLOR_TAGS, type FormValues } from "@/lib/form";

/** Every field the floor fills in by hand. Only Job is required. */
export function PackageForm({
  values,
  onChange,
}: {
  values: FormValues;
  onChange: (patch: Partial<FormValues>) => void;
}) {
  const text = (key: keyof FormValues, id: string, label: string, opts: { placeholder?: string; max?: number; mono?: boolean } = {}) => (
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

  return (
    <div className="flex flex-col gap-4">
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
      {text("poNumber", "f-po", "PO number", { placeholder: "PO #", max: 60, mono: true })}
      {text("vendor", "f-vendor", "Vendor", { placeholder: "Supplier", max: 200 })}
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
    </div>
  );
}
