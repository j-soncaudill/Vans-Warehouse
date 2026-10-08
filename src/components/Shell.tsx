import { useCallback, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, ChartColumn, DatabaseBackup, HardHat, LayoutGrid, Plus, ScanLine, Undo2 } from "lucide-react";
import { Confirm, cx, errorText, toast, useOnline } from "@/components/ui";
import { useRole } from "@/lib/role";
import { AlertsPrompt } from "@/components/Alerts";
import logo from "@/assets/vans-logo.png";
import { useWedgeScanner } from "@/lib/hid";
import { useChangeVersion, useRealtime, type LiveStatus } from "@/lib/live";
import { Decode, Ticker } from "@/components/motion";
import { isReturnCode } from "@/lib/codes";
import { getPackage } from "@/lib/packages";
import { DEMO_UI } from "@/lib/supabase";

export function Brand({ large }: { large?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <img src={logo} alt="VANS" className={large ? "h-9 w-auto" : "h-6 w-auto"} />
      <span className={cx("text-faint lowercase", large ? "text-[15px]" : "hidden text-[12px] min-[360px]:inline")}>floorcast</span>
    </span>
  );
}

function LiveDot({ status }: { status: LiveStatus }) {
  const online = useOnline();
  const s = online ? status : "offline";
  const text = s === "live" ? "live" : s === "connecting" ? "connecting" : "offline";
  // Each time data changes (another phone, or this one) the dot beats once.
  const beat = useChangeVersion();
  return (
    <span className={cx("flex items-center gap-1.5 text-[12px]", s === "offline" ? "text-danger" : s === "live" ? "text-cyan" : "text-dim")} aria-live="polite">
      <span aria-hidden className="relative flex size-1.5">
        {s === "live" ? <span className="vw-ping absolute inset-0 rounded-full bg-cyan" /> : null}
        {s === "live" && beat > 0 ? <span key={beat} className="vw-beat absolute inset-0 rounded-full bg-cyan" /> : null}
        <span
          className={cx(
            "relative size-1.5 rounded-full",
            s === "live" ? "bg-cyan shadow-[0_0_8px_var(--color-cyan)]" : s === "connecting" ? "animate-pulse border border-cyan" : "bg-danger",
          )}
        />
      </span>
      <span key={s === "live" ? beat : -1} className={cx(s === "live" && beat > 0 && "vw-glow-text")}>
        {text}
      </span>
    </span>
  );
}

const TABS = [
  { to: "/", label: "floor", icon: LayoutGrid, also: [] },
  { to: "/scan", label: "scan", icon: ScanLine, also: [] },
  { to: "/receive", label: "receive", icon: Plus, also: [] },
  { to: "/out", label: "out", icon: ArrowRight, also: [] },
  { to: "/returns", label: "returns", icon: Undo2, also: ["/r/"] },
] as const;

const tabOn = (tab: (typeof TABS)[number], path: string) =>
  tab.to === "/" ? path === "/" : path.startsWith(tab.to) || tab.also.some((p) => path.startsWith(p));

export function Shell({ children }: { children: ReactNode }) {
  const status = useRealtime();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = TABS.findIndex((t) => tabOn(t, path));
  const { role, switchRole, freshAdmin, doneFreshAdmin } = useRole();
  const [askSwitch, setAskSwitch] = useState(false);

  const onWedge = useCallback(
    async (code: string) => {
      try {
        if (isReturnCode(code)) {
          await navigate({ to: "/r/$code", params: { code } });
          return;
        }
        const found = await getPackage(code);
        if (found) await navigate({ to: "/p/$code", params: { code: found.code } });
        else await navigate({ to: "/receive", search: { code } });
      } catch (err) {
        toast(errorText(err, "Lookup failed."), "error");
      }
    },
    [navigate],
  );
  // Receive keeps scans in its own code field; Scan several adds them to its list.
  useWedgeScanner(onWedge, path !== "/receive" && path !== "/scan/batch");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {DEMO_UI ? (
        <p className="grad-cyan px-4 py-1 text-center text-[12px] text-cyan-ink">demo · sample data · nothing is saved</p>
      ) : null}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-[#071216]/80 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2 backdrop-blur-md">
        <Link to="/" className="min-w-0 flex-1" aria-label="On floor">
          <Brand />
        </Link>
        <LiveDot status={status} />
        {role === "admin" ? (
          <Link
            to="/reports"
            aria-label="Reports"
            className={cx(
              "vw-press inline-flex size-11 items-center justify-center rounded-[var(--radius-box)] border bg-panel active:bg-raised",
              path === "/reports" ? "border-cyan text-cyan" : "border-line text-ink",
            )}
          >
            <ChartColumn className="size-5" strokeWidth={1.9} />
          </Link>
        ) : null}
        {role === "admin" ? (
          <Link
            to="/more"
            aria-label="Backup and restore"
            className={cx(
              "vw-press inline-flex size-11 items-center justify-center rounded-[var(--radius-box)] border bg-panel active:bg-raised",
              path === "/more" ? "border-cyan text-cyan" : "border-line text-ink",
            )}
          >
            <DatabaseBackup className="size-5" strokeWidth={1.9} />
          </Link>
        ) : (
          <button
            type="button"
            aria-label="Field phone. Switch role"
            onClick={() => setAskSwitch(true)}
            className="vw-press inline-flex h-11 items-center gap-1.5 rounded-[var(--radius-box)] border border-line bg-panel px-3 text-[13px] text-cyan lowercase active:bg-raised"
          >
            <HardHat className="size-4" strokeWidth={2} /> field
          </button>
        )}
      </header>
      {freshAdmin && doneFreshAdmin ? <AlertsPrompt onDone={doneFreshAdmin} /> : null}
      {askSwitch ? (
        <Confirm
          title="Switch role?"
          body="This phone goes back to the Field / Administrator choice. Administrator needs the shop PIN."
          confirmLabel="Switch"
          onCancel={() => setAskSwitch(false)}
          onConfirm={() => {
            setAskSwitch(false);
            void navigate({ to: "/" });
            switchRole();
          }}
        />
      ) : null}
      <main className="flex-1 px-4 pt-3 pb-[calc(104px+env(safe-area-inset-bottom))]">
        <div key={path} className="vw-page">
          {children}
        </div>
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(180deg,rgb(18_9_11/0)_0%,rgb(12_8_10/0.92)_30%)] px-2 pb-[max(env(safe-area-inset-bottom),14px)]"
      >
        <div aria-hidden className="brand-rule vw-flow mx-auto mb-1 max-w-2xl opacity-80" />
        <div className="relative mx-auto grid max-w-2xl grid-cols-5">
          <span
            aria-hidden
            className="vw-tab-ind"
            style={{ transform: `translateX(${Math.max(active, 0) * 100}%)`, opacity: active < 0 ? 0 : 1 }}
          >
            <span key={active} />
          </span>
          {TABS.map((tab) => {
            const { to, label, icon: Icon } = tab;
            const on = tabOn(tab, path);
            return (
              <Link
                key={to}
                to={to}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "vw-press relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-[12px] text-[11px] whitespace-nowrap",
                  on ? "text-cyan [text-shadow:0_0_10px_rgb(45_174_196/0.6)]" : "text-dim active:text-ink",
                )}
              >
                <Icon className={cx("size-[22px]", on && "vw-lift")} strokeWidth={on ? 2.1 : 1.8} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Page title with the item count on the right. */
export function PageTitle({ children, count, aside }: { children: ReactNode; count?: number; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1.5 pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="m-0 text-[30px] leading-tight font-semibold tracking-[-0.03em]">
          <span className="grad-title">{typeof children === "string" ? <Decode text={children} ms={420} /> : children}</span>
        </h1>
        {typeof count === "number" ? <span className="text-[13px] text-faint tabular-nums"><Ticker value={count} /> {count === 1 ? "item" : "items"}</span> : aside}
      </div>
    </div>
  );
}
