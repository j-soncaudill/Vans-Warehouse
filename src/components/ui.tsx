import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "plain" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "grad-cyan text-cyan-ink font-semibold shadow-[0_10px_28px_rgb(45_174_196/0.28)] active:brightness-110",
  plain: "bg-panel text-ink border border-line active:bg-raised",
  ghost: "bg-transparent text-cyan active:bg-panel",
  danger: "bg-[linear-gradient(90deg,rgb(197_44_46/0.16),rgb(197_44_46/0.04))] text-danger border border-danger/45 active:bg-danger/15",
};

export function btn(variant: Variant = "plain", big = false) {
  return cx(
    "vw-press inline-flex w-full items-center justify-center gap-2.5 rounded-[12px] px-5 font-mono lowercase select-none disabled:opacity-45",
    big ? "min-h-14 text-[16px]" : "min-h-[50px] text-[15px]",
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
        "vw-press inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-box)] border border-line bg-panel text-ink active:bg-raised disabled:opacity-45",
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
        {hint === "required" ? <span className="ml-1 text-cyan">*</span> : null}
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
    <div id={id} role="radiogroup" className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-box)] border border-line">
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
              "vw-press min-h-12 border-l border-line font-mono text-[14px] lowercase first:border-l-0 active:scale-100!",
              on ? (v ? "grad-cyan font-semibold text-cyan-ink" : "bg-raised text-ink") : "bg-panel text-dim active:bg-raised",
            )}
          >
            <span className={cx("inline-block", on && "vw-tap")}>{text}</span>
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
  // Rendered on <body> so an animating page (a transform) can't trap it.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className={cx(
        "vw-fade fixed inset-0 z-50 flex flex-col",
        dark ? "bg-black" : "bg-[linear-gradient(160deg,#0b262c_0%,#07141a_30%,#0a0a0c_55%,#160a0c_78%,#2a0c0f_100%)]",
      )}
    >
      <div className="relative z-10 flex items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),10px)] pb-2">
        <div className="min-w-0 flex-1 truncate px-1 text-[13px] text-faint lowercase">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="vw-press inline-flex h-11 items-center gap-2 rounded-[var(--radius-box)] border border-ink/40 bg-black/60 px-4 text-[14px] lowercase active:bg-raised"
        >
          <X className="size-4" strokeWidth={2.5} />
          {closeLabel}
        </button>
      </div>
      <div className={cx("relative flex min-h-0 flex-1 flex-col", !dark && "vw-sheet")}>{children}</div>
    </div>,
    document.body,
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
        <h2 className="font-sans text-[28px] leading-tight font-bold tracking-[-0.02em]">{title}</h2>
        <div className="text-[15px] text-dim">{body}</div>
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
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+64px)]">
      {list.map((t) => (
        <div
          key={t.id}
          className={cx(
            "vw-drop pointer-events-auto w-full max-w-lg rounded-[var(--radius-box)] border px-4 py-3 text-[14px] shadow-[0_12px_30px_rgb(0_0_0/0.5)]",
            t.tone === "error" ? "border-danger/60 bg-[#1c0c0d] text-ink" : "border-cyan/60 bg-panel text-ink",
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
