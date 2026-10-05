import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { Brand } from "@/components/Shell";
import { Button } from "@/components/ui";
import { isUnlocked, unlock } from "@/lib/pin";
import { IS_DEMO, probeSchema, type SchemaState } from "@/lib/supabase";
import schemaSql from "../../supabase/schema.sql?raw";

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(env(safe-area-inset-top),24px)] pb-8">
      <Brand large />
      <div className="mt-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export function CopySql({ sql = schemaSql }: { sql?: string }) {
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
        {copied ? "Copied" : "Copy setup SQL"}
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

/** Supabase config → schema present → shop PIN. Then the app. */
export function Gate({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<SchemaState | "checking">("checking");
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const check = () => {
    setSchema("checking");
    void probeSchema().then(setSchema);
  };
  useEffect(check, []);
  useEffect(() => {
    if (schema === "ready") void isUnlocked().then(setUnlocked);
  }, [schema]);

  if (schema === "checking" || (schema === "ready" && unlocked === null)) {
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

  if (unlocked) return <>{children}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await unlock(pin).catch(() => "wrong" as const);
    setBusy(false);
    if (r === "ok") setUnlocked(true);
    else if (r === "unset") setMsg("No shop PIN is set for this build. Set VITE_SHOP_PIN and rebuild.");
    else {
      setMsg("Wrong PIN.");
      setPin("");
    }
  }

  return (
    <Screen>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
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
          className="field code h-16 text-center text-[28px] tracking-[0.4em] text-cyan"
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
