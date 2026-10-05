import { useCallback, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, PackagePlus, ScanLine, Truck, Warehouse } from "lucide-react";
import { cx, errorText, toast, useOnline } from "@/components/ui";
import logo from "@/assets/vans-logo.png";
import { useWedgeScanner } from "@/lib/hid";
import { useRealtime, type LiveStatus } from "@/lib/live";
import { getPackage } from "@/lib/packages";
import { IS_DEMO } from "@/lib/supabase";

export function Brand({ large }: { large?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <img src={logo} alt="VANS" className={large ? "h-11 w-auto" : "h-8 w-auto"} />
      <span
        className={cx(
          "font-cond font-bold tracking-[0.08em] text-dim uppercase",
          large ? "text-[22px]" : "hidden text-[17px] min-[360px]:inline",
        )}
      >
        Warehouse
      </span>
    </span>
  );
}

function LiveDot({ status }: { status: LiveStatus }) {
  const online = useOnline();
  const s = online ? status : "offline";
  const text = s === "live" ? "Live" : s === "connecting" ? "Connecting" : "Offline";
  return (
    <span className="flex items-center gap-2 font-cond text-[15px] font-bold tracking-[0.06em] uppercase" aria-live="polite">
      <span
        aria-hidden
        className={cx("size-3 rounded-full", s === "live" ? "bg-amber" : s === "connecting" ? "border-2 border-amber" : "bg-danger")}
      />
      <span className={s === "offline" ? "text-danger" : "text-dim"}>{text}</span>
    </span>
  );
}

const TABS = [
  { to: "/", label: "On floor", icon: Warehouse },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/receive", label: "Receive", icon: PackagePlus },
  { to: "/out", label: "Checked out", icon: Truck },
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
        <p className="bg-amber px-4 py-1.5 text-center font-cond text-[15px] font-bold tracking-[0.04em] text-amber-ink uppercase">
          Demo · sample data · nothing is saved
        </p>
      ) : null}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b-2 border-line bg-bg/95 px-4 pt-[max(env(safe-area-inset-top),8px)] pb-2 backdrop-blur">
        <Link to="/" className="min-w-0 flex-1" aria-label="On floor">
          <Brand />
        </Link>
        <LiveDot status={status} />
        <Link
          to="/more"
          aria-label="Backup, restore, lock"
          className={cx("inline-flex size-14 items-center justify-center rounded-[var(--radius-box)] active:bg-raised", path === "/more" && "text-amber")}
        >
          <Menu className="size-7" />
        </Link>
      </header>
      <main className="flex-1 px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))]">{children}</main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-panel pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {TABS.map(({ to, label, icon: Icon }) => {
            const on = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "relative flex min-h-[76px] flex-col items-center justify-center gap-1 font-cond text-[15px] leading-none font-bold whitespace-nowrap uppercase active:bg-raised",
                  on ? "text-amber" : "text-dim",
                )}
              >
                {on ? <span aria-hidden className="absolute inset-x-3 top-0 h-1 rounded-b bg-amber" /> : null}
                <Icon className="size-8" strokeWidth={on ? 2.5 : 2} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageTitle({ children, count, aside }: { children: ReactNode; count?: number; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h1 className="font-cond text-[34px] leading-none font-bold uppercase">
        {children}
        {typeof count === "number" ? <span className="ml-3 text-amber tabular-nums">{count}</span> : null}
      </h1>
      {aside}
    </div>
  );
}
