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
export const STATION_IDLE_MS = 30_000;

let audio: AudioContext | null = null;

/** Short beeps: one high for a good scan, two low for a problem. */
export function beep(kind: "ok" | "bad" | "hello") {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    void ctx.resume();
    const tones = kind === "ok" ? [[1760, 0, 0.09]] : kind === "hello" ? [[1320, 0, 0.08], [1760, 0.1, 0.1]] : [[330, 0, 0.16], [330, 0.22, 0.16]];
    for (const [freq, start, len] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "bad" ? "square" : "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  } catch {
    /* no sound on this device */
  }
  navigator.vibrate?.(kind === "bad" ? [120, 80, 120] : 40);
}
