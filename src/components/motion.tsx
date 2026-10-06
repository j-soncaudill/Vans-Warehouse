import { useEffect, useRef, useState } from "react";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/**
 * Text that resolves from scrambled characters, left to right, like data
 * coming in. Runs once per value. Screen readers get the real text.
 */
export function Decode({ text, ms = 520, className }: { text: string; ms?: number; className?: string }) {
  const [shown, setShown] = useState(text);
  const raf = useRef(0);
  useEffect(() => {
    if (reduced() || !text) {
      setShown(text);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const settled = Math.floor(t * text.length);
      let out = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) {
        const c = text[i];
        out += c === " " || c === "-" || c === "·" ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setShown(out);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [text, ms]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

/** A number whose digits roll into place when it changes, like an odometer. */
export function Ticker({ value, pad = 2 }: { value: number; pad?: number }) {
  const digits = String(value).padStart(pad, "0").split("");
  return (
    <span className="inline-flex overflow-hidden tabular-nums" aria-label={String(value)}>
      {digits.map((d, i) => (
        <span key={`${digits.length - i}-${d}`} aria-hidden className="vw-roll inline-block" style={{ animationDelay: `${i * 60}ms` }}>
          {d}
        </span>
      ))}
    </span>
  );
}

/** A check in a circle that draws itself, then settles with a glow. */
export function DrawCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10" pathLength={1} className="vw-draw" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" pathLength={1} className="vw-draw" style={{ animationDelay: "0.32s" }} />
    </svg>
  );
}
