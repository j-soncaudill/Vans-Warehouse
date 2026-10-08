import { describe, expect, it } from "vitest";
import { recordToRow, toCsv } from "@/lib/backup";
import { isMintedCode, isPlausibleCode, mintCode, normalizeCode, pickCode, isReturnCode, mintReturnCode } from "@/lib/codes";
import { emptyForm, formToRow, fromYesNo, toYesNo } from "@/lib/form";
import { monthToIso, receivedText } from "@/lib/time";

describe("codes", () => {
  it("mints VW- codes only", () => {
    for (let i = 0; i < 200; i += 1) {
      const c = mintCode();
      expect(c).toMatch(/^VW-[2-9A-HJ-NP-Z]{6}$/);
      expect(isMintedCode(c)).toBe(true);
    }
    expect(isMintedCode("SM-ABC123")).toBe(false);
  });
  it("normalizes typed and scanned codes", () => {
    expect(normalizeCode("  vw-ab 12 ")).toBe("VW-AB12");
    expect(isPlausibleCode("ab")).toBe(false);
    expect(isPlausibleCode("012345678905")).toBe(true);
    expect(isPlausibleCode("a/b")).toBe(false);
    expect(pickCode("https://example.com/p/vw-xyz789")).toBe("VW-XYZ789");
    expect(pickCode("")).toBeNull();
  });
});

describe("form", () => {
  it("requires a job and maps blanks to null", () => {
    expect(() => formToRow(emptyForm())).toThrow(/Job/);
    const row = formToRow({ ...emptyForm(), jobName: "  Oak ", packingSlip: "yes", damaged: "", colorTag: "Pink" });
    expect(row.job_name).toBe("Oak");
    expect(row.po_number).toBeNull();
    expect(row.packing_slip_received).toBe(true);
    expect(row.damaged).toBeNull();
    expect(row.color_tag).toBe("Pink");
    expect(formToRow({ ...emptyForm(), jobName: "x", colorTag: "Purple" }).color_tag).toBeNull();
  });
  it("round-trips yes / no / blank", () => {
    for (const v of ["yes", "no", ""] as const) expect(toYesNo(fromYesNo(v))).toBe(v);
  });
});

describe("backup", () => {
  it("restores only valid records", () => {
    expect(recordToRow({ code: "", jobName: "x" })).toBeNull();
    expect(recordToRow({ code: "VW-AAAAAA" })).toBeNull();
    const r = recordToRow({ code: "vw-aaaaaa", jobName: "Job", status: "checked_out", checkedOutTo: "Al", damaged: false, colorTag: "Teal" });
    expect(r).toMatchObject({ code: "VW-AAAAAA", status: "checked_out", checked_out_to: "Al", damaged: false, color_tag: null });
  });
  it("escapes CSV cells", () => {
    const csv = toCsv([
      {
        code: "VW-1", jobName: 'A, "B"', poNumber: null, vendor: null, deliveredBy: null, receivedBy: null, pm: null,
        packingSlip: null, quantities: "1\n2", damaged: null, colorTag: null, notes: null, status: "on_floor",
        receivedAt: "2026-01-01T00:00:00Z", checkedOutTo: null, checkedOutAt: null,
      lastLocation: null,
      locationAt: null, legacy: false, stickerFile: null, photoFile: null, slipPhotoFile: null,
      },
    ]);
    expect(csv).toContain('"A, ""B"""');
    expect(csv).toContain('"1\n2"');
  });
});

describe("return codes", () => {
  it("mints PREFIX-dddd for each type", () => {
    expect(mintReturnCode("vendor", () => 0)).toBe("VVR-0000");
    expect(mintReturnCode("stock", () => 0.8342)).toBe("VRS-8342");
    expect(mintReturnCode("warranty", () => 0.99999)).toBe("VWR-9999");
    expect(mintReturnCode("general", () => 0.05)).toBe("VRR-0500");
  });
  it("recognizes only the four return formats", () => {
    expect(isReturnCode("vrs-8342")).toBe(true);
    expect(isReturnCode("VVR-1234")).toBe(true);
    expect(isReturnCode("VRX-1234")).toBe(false);
    expect(isReturnCode("VRS-834")).toBe(false);
    expect(isReturnCode("VW-ABC123")).toBe(false);
  });
});

describe("legacy boxes", () => {
  it("turns an arrival month into a mid-month date, never in the future", () => {
    const now = Date.UTC(2026, 9, 8, 12);
    expect(monthToIso("2025-03", now)).toBe("2025-03-15T12:00:00.000Z");
    expect(monthToIso("2026-10", now)).toBe(new Date(now).toISOString());
    expect(monthToIso("", now)).toBeNull();
    expect(monthToIso("March", now)).toBeNull();
  });
  it("saves the flag, and the month only for legacy boxes", () => {
    const base = { ...emptyForm(), jobName: "Old stock" };
    expect(formToRow({ ...base, legacy: true, legacyMonth: "2025-03" })).toMatchObject({ legacy: true, received_at: "2025-03-15T12:00:00.000Z" });
    expect(formToRow({ ...base, legacy: true, legacyMonth: "" })).not.toHaveProperty("received_at");
    const plain = formToRow({ ...base, legacy: false, legacyMonth: "2025-03" });
    expect(plain.legacy).toBe(false);
    expect(plain).not.toHaveProperty("received_at");
  });
  it("shows a legacy date as an approximate month", () => {
    expect(receivedText({ receivedAt: "2025-03-15T12:00:00Z", legacy: true })).toMatch(/^~Mar 2025$/);
  });
  it("restores the flag, and treats older backups as not legacy", () => {
    expect(recordToRow({ code: "VW-AAAAAA", jobName: "J", legacy: true })).toMatchObject({ legacy: true });
    expect(recordToRow({ code: "VW-AAAAAA", jobName: "J" })).toMatchObject({ legacy: false });
  });
});
