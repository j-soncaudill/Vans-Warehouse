import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, Overlay, cx } from "@/components/ui";
import { dismissFailed, useOffline } from "@/lib/offline";
import { syncOutbox } from "@/lib/packages";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const KIND = { receive: "Receive", move: "Move", checkout: "Check out" } as const;

/** "offline · 3 waiting to sync", "syncing…", and anything that couldn't sync. Also runs the sync. */
export function OfflineBar() {
  const { online, pending, syncing, failed } = useOffline();
  const [open, setOpen] = useState(false);

  // Sync when the app opens, when signal comes back, and every 20 s while something is waiting.
  useEffect(() => {
    void syncOutbox();
    const kick = () => void syncOutbox();
    window.addEventListener("online", kick);
    const timer = window.setInterval(() => {
      if (navigator.onLine) void syncOutbox();
    }, 20_000);
    return () => {
      window.removeEventListener("online", kick);
      window.clearInterval(timer);
    };
  }, []);

  if (online && !pending && !failed.length) return null;

  return (
    <>
      <div role="status" className="flex flex-col gap-1 px-4 pb-1">
        {!online || pending ? (
          <p
            className={cx(
              "flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-[12px]",
              online ? "border-cyan/40 bg-cyan/10 text-cyan" : "border-amber/50 bg-amber/10 text-amber",
            )}
          >
            {online ? <RefreshCw aria-hidden className={cx("size-3.5", syncing && "animate-spin")} /> : <CloudOff aria-hidden className="size-3.5" />}
            {online ? (syncing ? `syncing ${plural(pending, "change")}…` : `${plural(pending, "change")} waiting to sync`) : `offline${pending ? ` · ${plural(pending, "change")} waiting to sync` : " · showing the list as last seen"}`}
          </p>
        ) : null}
        {failed.length ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="vw-press flex items-center gap-2 rounded-[8px] border border-danger/60 bg-[#1c0c0d] px-3 py-1.5 text-left text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            {failed.length === 1 ? "1 change couldn't sync" : `${failed.length} changes couldn't sync`} · tap to see
          </button>
        ) : null}
      </div>

      {open ? (
        <Overlay title="Couldn't sync" onClose={() => setOpen(false)} closeLabel="Close">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <p className="text-[14px] text-dim">These were done on this phone with no signal, but another phone got there first. Nothing was overwritten.</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {failed.map((f) => (
                <li key={f.id} className="rounded-[12px] border border-line bg-panel px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-sans text-[15px] font-semibold text-white">
                      {KIND[f.kind]} · {f.jobName}
                    </span>
                    <span className="code text-[12px] text-cyan">{f.code}</span>
                  </div>
                  <p className="mt-1 text-[14px] text-ink">{f.message}</p>
                  <button type="button" onClick={() => dismissFailed(f.id)} className="vw-press mt-2 text-[13px] text-dim underline">
                    Got it
                  </button>
                </li>
              ))}
            </ul>
            <Button
              onClick={() => {
                dismissFailed();
                setOpen(false);
              }}
            >
              Clear all
            </Button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
