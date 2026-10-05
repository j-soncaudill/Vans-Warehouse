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
    <div className="flex flex-col gap-5">
      <Field label="Job" htmlFor="f-job" hint="required">
        <input
          id="f-job"
          required
          className="field font-cond text-[24px] font-bold"
          maxLength={120}
          autoComplete="off"
          placeholder="Job name"
          value={values.jobName}
          onChange={(e) => onChange({ jobName: e.target.value })}
        />
      </Field>
      {text("poNumber", "f-po", "PO number", { placeholder: "PO #", max: 60, mono: true })}
      {text("vendor", "f-vendor", "Vendor", { placeholder: "Supplier", max: 200 })}
      <div className="grid gap-5 sm:grid-cols-2">
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Packing slip" htmlFor="f-slip">
          <YesNoBlank id="f-slip" value={values.packingSlip} onChange={(v) => onChange({ packingSlip: v })} />
        </Field>
        <Field label="Damage" htmlFor="f-damage">
          <YesNoBlank id="f-damage" value={values.damaged} onChange={(v) => onChange({ damaged: v })} />
        </Field>
      </div>

      <Field label="Color tag" htmlFor="f-color" hint={values.colorTag ? "tap again to clear" : "optional"}>
        <div id="f-color" role="radiogroup" className="grid grid-cols-4 gap-2">
          {COLOR_TAGS.map((tag) => {
            const on = values.colorTag === tag;
            return (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ colorTag: on ? "" : tag })}
                className={cx(
                  "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[var(--radius-box)] border-2 bg-panel px-1 font-cond text-[15px] font-bold uppercase",
                  on ? "border-amber bg-raised" : "border-line active:bg-raised",
                )}
              >
                <span
                  aria-hidden
                  className="flex size-7 items-center justify-center rounded-[5px] border-2 border-ink/50"
                  style={{ background: COLOR_HEX[tag] }}
                >
                  {on ? <Check className={cx("size-5", tag === "White" || tag === "Yellow" ? "text-black" : "text-white")} strokeWidth={4} /> : null}
                </span>
                {tag}
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
