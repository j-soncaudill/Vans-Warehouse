import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { HardHat, Lock, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/Shell";
import { BackButton, Button, cx } from "@/components/ui";
import { chooseField, currentRole, lock, unlock, type Role } from "@/lib/pin";
import { RoleContext } from "@/lib/role";
import { IS_DEMO, probeSchema, type SchemaState } from "@/lib/supabase";
import schemaSql from "../../supabase/schema.sql?raw";
import upgradeSql from "../../supabase/migrations/002_locations_returns.sql?raw";

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),24px)] pb-8">
      <Brand large />
      <div className="mt-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export function CopySql({ sql = schemaSql, label = "Copy setup SQL" }: { sql?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        onClick={() =>
          navigator.clipboard.writeText(sql).then(
            () => setCopied(true),
            () => setShow(true),
          )
        }
      >
        {copied ? "Copied" : label}
      </Button>
      <Button variant="ghost" onClick={() => setShow((s) => !s)}>
        {show ? "Hide SQL" : "Show SQL"}
      </Button>
      {show ? (
        <textarea readOnly value={sql} className="field h-64 font-mono text-[12px] leading-snug" onFocus={(e) => e.currentTarget.select()} />
      ) : null}
    </div>
  );
}

function RoleCard({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vw-press flex items-center gap-4 rounded-[14px] border border-line bg-panel px-4 py-5 text-left active:bg-raised"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] border border-cyan/40 bg-cyan/10 text-cyan">{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-[20px] font-semibold text-white">{title}</span>
        <span className="text-[13px] text-dim">{body}</span>
      </span>
    </button>
  );
}

/** Supabase config → schema present → role (Field, or Administrator with the shop PIN). Then the app. */
export function Gate({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<SchemaState | "checking">("checking");
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [askPin, setAskPin] = useState(false);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const check = () => {
    setSchema("checking");
    void probeSchema().then(setSchema);
  };
  useEffect(check, []);
  useEffect(() => {
    if (schema === "ready") void currentRole().then(setRole);
  }, [schema]);

  if (schema === "checking" || (schema === "ready" && role === undefined)) {
    return (
      <Screen>
        <p className="text-[14px] text-dim">Connecting…</p>
      </Screen>
    );
  }

  if (schema === "unconfigured") {
    return (
      <Screen>
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">Not connected</h1>
        <p className="mt-3 text-[14px] text-dim">
          This build has no Supabase settings. Set <span className="code text-ink">VITE_SUPABASE_URL</span> and{" "}
          <span className="code text-ink">VITE_SUPABASE_ANON_KEY</span>, rebuild, and upload again.
        </p>
      </Screen>
    );
  }

  if (schema === "offline") {
    return (
      <Screen>
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">Can't reach the database</h1>
        <p className="mt-3 mb-6 text-[14px] text-dim">Check the Wi-Fi or signal, then try again.</p>
        <Button big variant="primary" onClick={check}>
          Try again
        </Button>
      </Screen>
    );
  }

  if (schema === "upgrade") {
    return (
      <Screen>
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">One database update</h1>
        <p className="mt-3 mb-6 text-[14px] text-dim">
          This version adds locations and returns. In Supabase, open SQL Editor, paste this update, and press Run. It only adds new
          columns and tables. Every existing entry is kept.
        </p>
        <CopySql sql={upgradeSql} label="Copy update SQL" />
        <div className="mt-6">
          <Button big onClick={check}>
            I ran it, check again
          </Button>
        </div>
      </Screen>
    );
  }

  if (schema === "missing" || schema === "outdated") {
    return (
      <Screen>
        <h1 className="font-sans text-[28px] font-bold tracking-[-0.02em]">Database setup needed</h1>
        <p className="mt-3 mb-6 text-[14px] text-dim">
          {schema === "outdated" ? "The packages table is from an older version. " : ""}
          In Supabase, open SQL Editor, paste the setup SQL, and press Run. It replaces the packages and settings tables.
        </p>
        <CopySql />
        <div className="mt-6">
          <Button big onClick={check}>
            I ran it — check again
          </Button>
        </div>
      </Screen>
    );
  }

  if (role) {
    const switchRole = () => {
      lock();
      setPin("");
      setMsg("");
      setAskPin(false);
      setRole(null);
    };
    return <RoleContext.Provider value={{ role, switchRole }}>{children}</RoleContext.Provider>;
  }

  if (!askPin) {
    return (
      <Screen>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.03em]">
          <span className="grad-title">Who's using this phone?</span>
        </h1>
        <div className="mt-6 flex flex-col gap-3">
          <RoleCard
            icon={<HardHat className="size-6" strokeWidth={2} />}
            title="Field"
            body="Receive, scan, check out. No PIN."
            onClick={() => {
              chooseField();
              setRole("field");
            }}
          />
          <RoleCard
            icon={<ShieldCheck className="size-6" strokeWidth={2} />}
            title="Administrator"
            body="Everything, including edits and backup. Needs PIN."
            onClick={() => setAskPin(true)}
          />
        </div>
      </Screen>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await unlock(pin).catch(() => "wrong" as const);
    setBusy(false);
    if (r === "ok") setRole("admin");
    else if (r === "unset") setMsg("No shop PIN is set for this build. Set VITE_SHOP_PIN and rebuild.");
    else {
      setMsg("Wrong PIN.");
      setPin("");
      setShake(true);
    }
  }

  return (
    <Screen>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <div className="-mt-4 mb-2">
          <BackButton
            onClick={() => {
              setAskPin(false);
              setPin("");
              setMsg("");
            }}
          />
        </div>
        <h1 className="m-0 flex items-center gap-3 text-[30px] font-semibold tracking-[-0.03em]">
          <Lock className="size-6 text-cyan" strokeWidth={2.2} />
          <span className="grad-title">Shop PIN</span>
        </h1>
        <label htmlFor="pin" className="sr-only">
          Shop PIN
        </label>
        <input
          id="pin"
          type="password"
          autoComplete="off"
          autoFocus
          className={cx("field code h-16 text-center text-[28px] tracking-[0.4em] text-cyan", shake && "vw-shake border-danger!")}
          onAnimationEnd={() => setShake(false)}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setMsg("");
          }}
        />
        {IS_DEMO ? <p className="text-[13px] text-dim">demo pin: <span className="text-cyan">0000</span></p> : null}
        {msg ? <p className="text-[13px] text-danger">{msg}</p> : null}
        <Button big variant="primary" type="submit" disabled={busy || !pin.trim()}>
          {busy ? "Checking…" : "Unlock"}
        </Button>
      </form>
    </Screen>
  );
}
