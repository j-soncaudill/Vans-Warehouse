import { useCallback, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, DatabaseBackup, LayoutGrid, Plus, ScanLine } from "lucide-react";
import { cx, errorText, toast, useOnline } from "@/components/ui";
import logo from "@/assets/vans-logo.png";
import { useWedgeScanner } from "@/lib/hid";
import { useRealtime, type LiveStatus } from "@/lib/live";
import { getPackage } from "@/lib/packages";
import { IS_DEMO } from "@/lib/supabase";

export function Brand({ large }: { large?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <img src={logo} alt="VANS" className={large ? "h-9 w-auto" : "h-6 w-auto"} />
      <span className={cx("text-faint lowercase", large ? "text-[15px]" : "hidden text-[12px] min-[360px]:inline")}>warehouse</span>
    </span>
  );
}

function LiveDot({ status }: { status: LiveStatus }) {
  const online = useOnline();
  const s = online ? status : "offline";
  const text = s === "live" ? "live" : s === "connecting" ? "connecting" : "offline";
  return (
    <span className={cx("flex items-center gap-1.5 text-[12px]", s === "offline" ? "text-danger" : s === "live" ? "text-cyan" : "text-dim")} aria-live="polite">
      <span
        aria-hidden
        className={cx(
          "size-1.5 rounded-full",
          s === "live" ? "bg-cyan shadow-[0_0_8px_var(--color-cyan)]" : s === "connecting" ? "border border-cyan" : "bg-danger",
        )}
      />
      {text}
    </span>
  );
}

const TABS = [
  { to: "/", label: "floor", icon: LayoutGrid },
  { to: "/scan", label: "scan", icon: ScanLine },
  { to: "/receive", label: "receive", icon: Plus },
  { to: "/out", label: "out", icon: ArrowRight },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const status = useRealtime();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const onWedge = useCallback(
    async (code: string) => {
      try {
        const found = await getPackage(code);
        if (found) await navigate({ to: "/p/$code", params: { code: found.code } });
        else await navigate({ to: "/receive", search: { code } });
      } catch (err) {
        toast(errorText(err, "Lookup failed."), "error");
      }
    },
    [navigate],
  );
  // Receive keeps scans in its own code field.
  useWedgeScanner(onWedge, path !== "/receive");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {IS_DEMO ? (
        <p className="grad-cyan px-4 py-1 text-center text-[12px] text-cyan-ink">demo · sample data · nothing is saved</p>
      ) : null}
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-[#071216]/80 px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2 backdrop-blur-md">
        <Link to="/" className="min-w-0 flex-1" aria-label="On floor">
          <Brand />
        </Link>
        <LiveDot status={status} />
        <Link
          to="/more"
          aria-label="Backup and restore"
          className={cx(
            "inline-flex size-11 items-center justify-center rounded-[var(--radius-box)] border bg-panel active:bg-raised",
            path === "/more" ? "border-cyan text-cyan" : "border-line text-ink",
          )}
        >
          <DatabaseBackup className="size-5" strokeWidth={1.9} />
        </Link>
      </header>
      <main className="flex-1 px-4 pt-3 pb-[calc(104px+env(safe-area-inset-bottom))]">{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 bg-[linear-gradient(180deg,rgb(18_9_11/0)_0%,rgb(12_8_10/0.92)_30%)] px-2 pb-[max(env(safe-area-inset-bottom),14px)]"
      >
        <div aria-hidden className="brand-rule mx-auto mb-1 max-w-2xl opacity-80" />
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {TABS.map(({ to, label, icon: Icon }) => {
            const on = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] whitespace-nowrap active:bg-panel",
                  on ? "text-cyan [text-shadow:0_0_10px_rgb(45_174_196/0.6)]" : "text-dim",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={on ? 2.1 : 1.8} />
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
          <span className="grad-title">{children}</span>
        </h1>
        {typeof count === "number" ? <span className="text-[13px] text-faint tabular-nums">{String(count).padStart(2, "0")} {count === 1 ? "item" : "items"}</span> : aside}
      </div>
    </div>
  );
}
