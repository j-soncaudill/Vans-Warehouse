/**
 * Station mode: this device only shows the check-out station (badge, then
 * boxes). An admin turns it on from Backup & setup; turning it off needs the
 * shop PIN.
 */
const KEY = "vw.station";

export function isStationMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setStationMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: station for this tab only */
  }
}

/** Signs the person out after this long with no scans. */
export const STATION_IDLE_MS = 360_000;
export const STATION_IDLE_MIN = STATION_IDLE_MS / 60_000;

let audio: AudioContext | null = null;

export type Sound = "ok" | "bad" | "warn" | "in" | "out" | "undo";

type Note = { f: number; at: number; len: number; type?: OscillatorType; vol?: number };

/**
 * The station's sounds, made on the spot (no files to load):
 *   in   sign-in: a rising three-note chime with a sparkle on top
 *   out  sign-out: the same chime falling
 *   ok   a box checked out: a quick bright "ba-ding"
 *   undo a box put back: a short falling blip
 *   warn already yours: two soft mid notes
 *   bad  a problem: two low buzzes
 */
const SOUNDS: Record<Sound, Note[]> = {
  in: [
    { f: 659.25, at: 0, len: 0.45, type: "triangle" },
    { f: 987.77, at: 0.08, len: 0.45, type: "triangle" },
    { f: 1318.5, at: 0.16, len: 0.6, type: "triangle" },
    { f: 2637, at: 0.24, len: 0.5, type: "sine", vol: 0.12 },
  ],
  out: [
    { f: 1318.5, at: 0, len: 0.35, type: "triangle", vol: 0.25 },
    { f: 987.77, at: 0.09, len: 0.35, type: "triangle", vol: 0.25 },
    { f: 659.25, at: 0.18, len: 0.5, type: "triangle", vol: 0.25 },
  ],
  ok: [
    { f: 1567.98, at: 0, len: 0.07, type: "sine" },
    { f: 2093, at: 0.07, len: 0.16, type: "sine" },
  ],
  undo: [
    { f: 1046.5, at: 0, len: 0.08, type: "sine", vol: 0.25 },
    { f: 783.99, at: 0.08, len: 0.14, type: "sine", vol: 0.25 },
  ],
  warn: [
    { f: 880, at: 0, len: 0.12, type: "triangle" },
    { f: 880, at: 0.17, len: 0.12, type: "triangle" },
  ],
  bad: [
    { f: 220, at: 0, len: 0.16, type: "square", vol: 0.18 },
    { f: 220, at: 0.22, len: 0.16, type: "square", vol: 0.18 },
  ],
};

const BUZZ: Record<Sound, number | number[]> = { in: [30, 40, 60], out: 40, ok: 40, undo: 30, warn: [60, 60, 60], bad: [120, 80, 120] };

export function beep(kind: Sound) {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    void ctx.resume();
    for (const { f, at, len, type = "sine", vol = 0.32 } of SOUNDS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const t = ctx.currentTime + at;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  } catch {
    /* no sound on this device */
  }
  navigator.vibrate?.(BUZZ[kind]);
}
