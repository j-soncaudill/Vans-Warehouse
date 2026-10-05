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
