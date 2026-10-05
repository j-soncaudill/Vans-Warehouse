import { useEffect, useRef } from "react";
import { isPlausibleCode, normalizeCode } from "@/lib/codes";

/**
 * USB / Bluetooth wedge scanners "type" a code fast and press Enter.
 * When focus is in a text field the field gets the code (that is how the
 * Scan and Receive code fields work). Anywhere else, a fast burst + Enter is
 * treated as a scan.
 */
export function useWedgeScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    let last = 0;
    const GAP = 60;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t?.isContentEditable;
      const now = Date.now();
      if (inField || e.ctrlKey || e.metaKey || e.altKey) {
        buf = "";
        return;
      }
      if (e.key === "Enter") {
        const code = normalizeCode(buf);
        const fast = now - last < GAP * 2;
        buf = "";
        if (fast && code.length >= 3 && isPlausibleCode(code)) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > GAP) buf = "";
      last = now;
      buf = (buf + e.key).slice(-64);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
