import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "plain" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber text-amber-ink active:bg-[#e09b00]",
  plain: "bg-raised text-ink border-2 border-line active:bg-line",
  ghost: "bg-transparent text-ink active:bg-raised",
  danger: "bg-transparent text-danger border-2 border-danger/70 active:bg-danger/15",
};

export function btn(variant: Variant = "plain", big = false) {
  return cx(
    "inline-flex w-full items-center justify-center gap-3 rounded-[var(--radius-box)] px-5 font-cond font-bold tracking-[0.03em] uppercase select-none disabled:opacity-45",
    big ? "min-h-[68px] text-[22px]" : "min-h-14 text-[18px]",
    VARIANTS[variant],
  );
}

export function Button({
  variant = "plain",
  big,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(btn(variant, big), className)}
    >
      {children}
    </button>
  );
}

/** Square 56px icon button for headers and overlays. */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex size-14 shrink-0 items-center justify-center rounded-[var(--radius-box)] text-ink active:bg-raised disabled:opacity-45",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {hint ? <span className="ml-2 normal-case tracking-normal text-dim/80">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Yes / No / blank. Tapping the selected answer again clears it. */
export function YesNoBlank({
  id,
  value,
  onChange,
}: {
  id: string;
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
}) {
  const opts: Array<["yes" | "no" | "", string]> = [
    ["yes", "Yes"],
    ["no", "No"],
    ["", "—"],
  ];
  return (
    <div id={id} role="radiogroup" className="grid grid-cols-3 gap-2">
      {opts.map(([v, text]) => {
        const on = value === v;
        return (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={v ? text : "Not answered"}
            onClick={() => onChange(on ? "" : v)}
            className={cx(
              "min-h-14 rounded-[var(--radius-box)] border-2 font-cond text-[19px] font-bold uppercase",
              on ? "border-amber bg-amber text-amber-ink" : "border-line bg-panel text-ink active:bg-raised",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ overlay

/** Full-screen layer. Used for camera, scanner, photo, and sheets. */
export function Overlay({
  onClose,
  title,
  dark,
  children,
  closeLabel = "Close",
}: {
  onClose: () => void;
  title?: ReactNode;
  dark?: boolean;
  children: ReactNode;
  closeLabel?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" className={cx("fixed inset-0 z-50 flex flex-col", dark ? "bg-black" : "bg-bg")}>
      <div className="relative z-10 flex items-center gap-2 px-2 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <div className="min-w-0 flex-1 truncate px-2 font-cond text-[22px] font-bold tracking-[0.02em] uppercase">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="inline-flex h-14 items-center gap-2 rounded-[var(--radius-box)] border-2 border-ink/80 bg-black/70 px-4 font-cond text-[18px] font-bold uppercase active:bg-raised"
        >
          <X className="size-6" strokeWidth={3} />
          {closeLabel}
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Overlay onClose={onCancel} closeLabel="Cancel">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-end gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h2 className="font-cond text-[30px] leading-tight font-bold">{title}</h2>
        <div className="text-[18px] text-dim">{body}</div>
        <Button big variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
          {busy ? "Working…" : confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Overlay>
  );
}

// ------------------------------------------------------------------ toast

type Toast = { id: number; text: string; tone: "ok" | "error" };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
const emit = () => toastListeners.forEach((l) => l());

export function toast(text: string, tone: Toast["tone"] = "ok") {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, text, tone }];
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, tone === "error" ? 6000 : 3000);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+80px)]">
      {list.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto w-full max-w-lg rounded-[var(--radius-box)] border-2 px-4 py-3 text-[17px] font-semibold shadow-lg",
            t.tone === "error" ? "border-danger bg-[#2a1614] text-ink" : "border-amber bg-panel text-ink",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}
