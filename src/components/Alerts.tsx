import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button, Overlay, cx, errorText, toast } from "@/components/ui";
import { ALERT_NOTES, alertStatus, disableAlerts, enableAlerts, finishAlertsSetup, sendTestAlert, type AlertStatus } from "@/lib/alerts";

/** Right after an admin unlocks: one tap to allow the daily alerts (a tap is needed for the permission prompt). */
export function AlertsPrompt({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void alertStatus().then((s) => {
      // Nothing to ask: already on, or this browser / setup can't do alerts yet.
      if (s === "on" || s === "unsupported" || s === "not-ready") onDone();
      else setStatus(s);
    });
  }, [onDone]);

  if (!status) return null;
  const canAsk = status === "off";

  async function allow() {
    setBusy(true);
    try {
      const s = await enableAlerts();
      if (s === "on") {
        toast("Alerts are on for this phone.");
        onDone();
      } else setStatus(s);
    } catch (err) {
      toast(errorText(err, "Could not turn on alerts."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay title="Daily alerts" onClose={onDone} closeLabel="Not now">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-end gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Bell aria-hidden className="size-9 text-cyan" strokeWidth={1.8} />
        <h2 className="font-sans text-[26px] leading-tight font-bold tracking-[-0.02em]">Get a morning alert when things are waiting?</h2>
        <p className="text-[15px] text-dim">
          One summary at 7 AM Eastern: boxes sitting 30+ days in Warehouse or Metal shop, and returns open 14+ days. Administrator phones only.
        </p>
        {canAsk ? null : <p className="rounded-[var(--radius-box)] border border-amber/50 bg-amber/10 px-3 py-2.5 text-[14px] text-ink">{ALERT_NOTES[status]}</p>}
        {canAsk ? (
          <Button big variant="primary" disabled={busy} onClick={() => void allow()}>
            {busy ? "Turning on…" : "Allow alerts"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            if (canAsk) void disableAlerts(true);
            onDone();
          }}
        >
          {canAsk ? "Not now" : "OK"}
        </Button>
      </div>
    </Overlay>
  );
}

/** Backup & setup → Alerts: on/off for this phone, the reason when it can't, and a test send. */
export function AlertsSection() {
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => void alertStatus().then(setStatus);
  useEffect(refresh, []);
  const on = status === "on";

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disableAlerts(true);
        toast("Alerts are off for this phone.");
        setStatus("off");
      } else {
        const s = await enableAlerts();
        setStatus(s);
        if (s === "on") toast("Alerts are on for this phone.");
      }
    } catch (err) {
      toast(errorText(err, "That did not work."), "error");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await sendTestAlert();
      toast("Test alert sent. It should arrive in a few seconds.");
    } catch (err) {
      toast(errorText(err, "The test alert did not send."), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <p className="text-[14px] text-dim">Checking…</p>;
  const usable = status === "on" || status === "off";
  return (
    <div className="flex flex-col gap-3">
      <button
        id="alerts-switch"
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Alerts"
        disabled={busy || !usable}
        onClick={() => void toggle()}
        className="vw-press flex items-center gap-3 rounded-[var(--radius-box)] border border-line bg-panel px-3.5 py-3 text-left disabled:opacity-60"
      >
        {on ? <Bell aria-hidden className="size-5 text-cyan" /> : <BellOff aria-hidden className="size-5 text-dim" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] text-ink">Alerts</span>
          <span className="text-[12px] text-dim">Daily 7 AM summary on this phone</span>
        </span>
        <span aria-hidden className={cx("relative h-7 w-12 shrink-0 rounded-full border transition-colors", on ? "border-cyan bg-cyan" : "border-line bg-raised")}>
          <span className={cx("absolute top-[3px] size-5 rounded-full bg-white shadow transition-[left]", on ? "left-[23px]" : "left-[3px]")} />
        </span>
      </button>
      <p className={cx("text-[13px]", usable ? "text-dim" : "rounded-[var(--radius-box)] border border-amber/50 bg-amber/10 px-3 py-2.5 text-ink")}>{ALERT_NOTES[status]}</p>
      {on ? (
        <Button disabled={busy} onClick={() => void test()}>
          Send a test alert
        </Button>
      ) : null}
      {status === "not-ready" ? (
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void finishAlertsSetup()
              .then(() => toast("Alerts are set up. Turn them on for this phone."), (err) => toast(errorText(err, "Setup did not finish."), "error"))
              .finally(() => {
                setBusy(false);
                refresh();
              });
          }}
        >
          Finish alerts setup
        </Button>
      ) : null}
    </div>
  );
}
