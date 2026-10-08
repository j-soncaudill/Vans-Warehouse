import { storedPinHash } from "@/lib/pin";
import { DEMO_UI, IS_DEMO, sb } from "@/lib/supabase";

/**
 * Daily admin alerts (Web Push). Administrator phones only, on by default:
 * every admin unlock asks again. The daily job (supabase/functions/daily-alerts)
 * sends one summary at 7 AM Eastern.
 */

const OFF_KEY = "vw.alerts.off";

export type AlertStatus =
  | "unsupported" // this browser has no Web Push
  | "home-screen" // iPhone/iPad: only works when opened from the Home Screen icon
  | "blocked" // notifications denied in the phone's settings
  | "not-ready" // the daily job hasn't been installed yet (no public key)
  | "off"
  | "on";

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupported(): boolean {
  return !IS_DEMO && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function publicKey(): Promise<string | null> {
  const { data } = await sb().from("settings").select("value").eq("key", "alerts_public_key").maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

const b64urlToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i += 1) out[i] = b.charCodeAt(i);
  return out;
};

export async function alertStatus(): Promise<AlertStatus> {
  if (DEMO_UI || IS_DEMO) return "unsupported";
  if (isIOS() && !isStandalone()) return "home-screen";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (await currentSub()) return "on";
  if (!(await publicKey().catch(() => null))) return "not-ready";
  return "off";
}

/** Asks for permission (call from a tap), subscribes, and registers this phone. */
export async function enableAlerts(): Promise<AlertStatus> {
  const pre = await alertStatus();
  if (pre === "home-screen" || pre === "unsupported" || pre === "blocked" || pre === "not-ready") return pre;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  const key = await publicKey();
  if (!key) return "not-ready";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) }));
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const pin = storedPinHash() ?? "";
  const { error } = await sb().rpc("alerts_subscribe", { p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh ?? "", p_auth: json.keys?.auth ?? "", p_pin_hash: pin });
  if (error) {
    await sub.unsubscribe().catch(() => undefined);
    throw new Error("Could not turn on alerts. Check the signal and try again.");
  }
  try {
    localStorage.removeItem(OFF_KEY);
  } catch {
    /* ignore */
  }
  return "on";
}

/** Stops alerts on this phone, on the phone and in the database. */
export async function disableAlerts(remember = true): Promise<void> {
  try {
    if (remember) localStorage.setItem(OFF_KEY, "1");
  } catch {
    /* ignore */
  }
  const sub = await currentSub().catch(() => null);
  if (!sub) return;
  await sb().rpc("alerts_unsubscribe", { p_endpoint: sub.endpoint }).then(
    () => undefined,
    () => undefined,
  );
  await sub.unsubscribe().catch(() => undefined);
}

/** After an admin unlock: phones registered under an older PIN stop getting alerts. */
export async function pruneOldPinAlerts(): Promise<void> {
  const pin = storedPinHash();
  if (!pin || IS_DEMO) return;
  await sb().rpc("alerts_prune", { p_pin_hash: pin }).then(
    () => undefined,
    () => undefined,
  );
}

/** Field phones and phones whose PIN stopped working never keep alerts. */
export async function dropAlertsIfNotAdmin(isAdmin: boolean): Promise<void> {
  if (isAdmin || !pushSupported()) return;
  await disableAlerts(false);
}

/** Admin unlock turns alerts back on by default, even if this phone switched them off before. */
export function resetAlertsDefault() {
  try {
    localStorage.removeItem(OFF_KEY);
  } catch {
    /* ignore */
  }
}

export async function sendTestAlert(): Promise<void> {
  const sub = await currentSub();
  if (!sub) throw new Error("Turn alerts on first.");
  const { data, error } = await sb().functions.invoke("daily-alerts", { body: { test: true, endpoint: sub.endpoint } });
  if (error) throw new Error("The daily-alerts function did not answer. Check it is deployed in Supabase.");
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) throw new Error(r?.error ?? "The test alert was not delivered.");
}

/** First run of the daily-alerts job makes its keys; this does it now so phones can sign up right away. */
export async function finishAlertsSetup(): Promise<void> {
  const { data, error } = await sb().functions.invoke("daily-alerts", { body: { setup: true } });
  if (error || !(data as { ok?: boolean } | null)?.ok) throw new Error("The daily-alerts function did not answer. Check it is deployed in Supabase.");
}

export const ALERT_NOTES: Record<AlertStatus, string> = {
  unsupported: "This browser can't get alerts. Use Safari on iPhone or Chrome on Android.",
  "home-screen": "On iPhone, add Floorcast to the Home Screen (Share → Add to Home Screen) and open it from there to get alerts.",
  blocked: "Alerts are blocked in this phone's settings. Allow notifications for Floorcast, then turn them on here.",
  "not-ready": "Alerts aren't set up yet. The daily-alerts job needs to be installed in Supabase (see README → Admin alerts).",
  off: "Alerts are off on this phone.",
  on: "This phone gets a summary at 7 AM Eastern when boxes or returns are waiting.",
};
