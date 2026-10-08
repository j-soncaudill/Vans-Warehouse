import { DEFAULT_LOCATION } from "@/lib/locations";
import type { Pkg } from "@/lib/packages";
import { monthToIso } from "@/lib/time";

/** Most-used vendors, in the order they show in the dropdown. */
export const VENDORS = ["Etna", "Behler-Young", "Williams", "Ferguson"] as const;

export const COLOR_TAGS = ["Red", "Orange", "Yellow", "Green", "Blue", "White", "Pink", "Black"] as const;
export type ColorTag = (typeof COLOR_TAGS)[number];

/** Swatch colors tuned to read on charcoal under poor light. */
export const COLOR_HEX: Record<ColorTag, string> = {
  Red: "#e5484d",
  Orange: "#f76b15",
  Yellow: "#ffe629",
  Green: "#46a758",
  Blue: "#3e8ed0",
  White: "#f4f4f2",
  Pink: "#f27bb6",
  Black: "#0b0b0c",
};

export function colorHex(tag: string | null | undefined): string | null {
  return tag && tag in COLOR_HEX ? COLOR_HEX[tag as ColorTag] : null;
}

export type YesNo = "" | "yes" | "no";

export type FormValues = {
  jobName: string;
  poNumber: string;
  vendor: string;
  deliveredBy: string;
  receivedBy: string;
  pm: string;
  packingSlip: YesNo;
  quantities: string;
  damaged: YesNo;
  colorTag: string;
  notes: string;
  /** Receive only. After that, location changes go through Move. */
  location: string;
  /** Here before Floorcast. */
  legacy: boolean;
  /** About when a legacy box arrived, "YYYY-MM"; "" = date unknown. */
  legacyMonth: string;
};

export function emptyForm(): FormValues {
  return {
    jobName: "",
    poNumber: "",
    vendor: "",
    deliveredBy: "",
    receivedBy: "",
    pm: "",
    packingSlip: "",
    quantities: "",
    damaged: "",
    colorTag: "",
    notes: "",
    location: DEFAULT_LOCATION,
    legacy: false,
    legacyMonth: "",
  };
}

export function toYesNo(value: boolean | null): YesNo {
  if (value == null) return "";
  return value ? "yes" : "no";
}

export function fromYesNo(value: YesNo): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export function formFromPkg(pkg: Pkg): FormValues {
  return {
    jobName: pkg.jobName,
    poNumber: pkg.poNumber ?? "",
    vendor: pkg.vendor ?? "",
    deliveredBy: pkg.deliveredBy ?? "",
    receivedBy: pkg.receivedBy ?? "",
    pm: pkg.pm ?? "",
    packingSlip: toYesNo(pkg.packingSlip),
    quantities: pkg.quantities ?? "",
    damaged: toYesNo(pkg.damaged),
    colorTag: pkg.colorTag ?? "",
    notes: pkg.notes ?? "",
    location: pkg.lastLocation ?? "",
    legacy: pkg.legacy,
    legacyMonth: pkg.legacy && !pkg.arrivalUnknown ? pkg.receivedAt.slice(0, 7) : "",
  };
}

const text = (value: string, max: number) => {
  const t = value.trim().slice(0, max);
  return t ? t : null;
};

/** Column values for insert/update. Throws when the job is blank. */
export function formToRow(values: FormValues) {
  const job = values.jobName.trim();
  if (!job) throw new Error("Job is required.");
  // A legacy box with a month gets that as its (approximate) received date;
  // with no month it is "date unknown" and received_at stays when it was logged.
  const arrived = values.legacy ? monthToIso(values.legacyMonth) : null;
  return {
    legacy: values.legacy,
    arrival_unknown: values.legacy && !arrived,
    ...(arrived ? { received_at: arrived } : {}),
    job_name: job.slice(0, 120),
    po_number: text(values.poNumber, 60),
    vendor: text(values.vendor, 200),
    delivered_by: text(values.deliveredBy, 120),
    received_by: text(values.receivedBy, 120),
    pm: text(values.pm, 120),
    packing_slip_received: fromYesNo(values.packingSlip),
    quantities: text(values.quantities, 1000),
    damaged: fromYesNo(values.damaged),
    color_tag: values.colorTag && values.colorTag in COLOR_HEX ? values.colorTag : null,
    notes: text(values.notes, 2000),
  };
}
