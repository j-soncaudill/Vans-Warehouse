const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_PREFIX = "VW-";

export function mintCode(random: () => number = Math.random): string {
  let body = "";
  for (let i = 0; i < 6; i += 1) body += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `${CODE_PREFIX}${body}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isPlausibleCode(raw: string): boolean {
  const code = normalizeCode(raw);
  return code.length >= 3 && code.length <= 64 && /^[A-Z0-9._+\-]+$/.test(code);
}

export function isMintedCode(code: string): boolean {
  return /^VW-[A-Z0-9]{4,12}$/.test(normalizeCode(code));
}

/** Scanners sometimes hand back a URL; keep the last path segment if so. */
export function pickCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = normalizeCode(raw);
  if (isPlausibleCode(code)) return code;
  try {
    const last = new URL(raw).pathname.split("/").filter(Boolean).pop();
    if (last && isPlausibleCode(last)) return normalizeCode(last);
  } catch {
    /* not a URL */
  }
  return null;
}

// ------------------------------------------------------------------ returns

export type ReturnType = "vendor" | "stock" | "warranty" | "general";

/** Order is the order the buttons show in. */
export const RETURN_TYPES: ReadonlyArray<{ type: ReturnType; prefix: string; label: string; hint: string }> = [
  { type: "vendor", prefix: "VVR", label: "Return to vendor", hint: "Goes back to the supplier" },
  { type: "stock", prefix: "VRS", label: "Return to stock", hint: "Goes back on our shelves" },
  { type: "warranty", prefix: "VWR", label: "Warranty return", hint: "Defective, under warranty" },
  { type: "general", prefix: "VRR", label: "Not sure", hint: "General return, office sorts it out" },
];

export function returnTypeInfo(type: string) {
  return RETURN_TYPES.find((t) => t.type === type) ?? RETURN_TYPES[3];
}

/** e.g. VRS-8342: the type's prefix, a dash, four digits. */
export function mintReturnCode(type: ReturnType, random: () => number = Math.random): string {
  const digits = String(Math.floor(random() * 10000)).padStart(4, "0");
  return `${returnTypeInfo(type).prefix}-${digits}`;
}

export function isReturnCode(raw: string): boolean {
  return /^V(VR|RS|WR|RR)-\d{4}$/.test(normalizeCode(raw));
}

/** The payload printed on the returns station poster. */
export const STATION_PREFIX = "VW-RETURN-STATION:";
