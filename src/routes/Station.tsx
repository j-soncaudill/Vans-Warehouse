import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Check, IdCard, Lock, LogOut, TriangleAlert, X } from "lucide-react";
import { Brand } from "@/components/Shell";
import { Scanner } from "@/components/Scanner";
import { Button, Overlay, cx } from "@/components/ui";
import { badgePayload, badgeToken, isBadgeScan, listEmployees, refreshBadgeCache, whoseBadge, type Employee } from "@/lib/badges";
import { pickCode } from "@/lib/codes";
import { notifyChanged } from "@/lib/live";
import { checkOut, getPackage, listPackages, type Pkg } from "@/lib/packages";
import { unlock } from "@/lib/pin";
import { STATION_IDLE_MS, beep, setStationMode } from "@/lib/station";
import { DEMO_UI } from "@/lib/supabase";
import { ago } from "@/lib/time";

type Tone = "ok" | "bad" | "warn";
type Line = { id: number; tone: Tone; title: string; detail?: string; code?: string };
type Person = { name: string; token: string };

let lineId = 0;

/**
 * The check-out station. Scan your badge ("Hi Dana. Start scanning your
 * items."), then scan boxes: each one is checked out to you right away.
 * Scanning your badge again, or 30 s with no scans, signs you out.
 * Works with a scanner that types (Zebra DataWedge, Bluetooth / USB scanners)
 * and with the camera on a phone.
 */
export function StationScreen({ onExit }: { onExit: () => void }) {
  const [who, setWho] = useState<Person | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notice, setNotice] = useState<Line | null>(null);
  const [left, setLeft] = useState(STATION_IDLE_MS / 1000);
  const [camera, setCamera] = useState(false);
  const [exiting, setExiting] = useState(false);
  const whoRef = useRef<Person | null>(null);
  const lastAt = useRef(Date.now());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const recent = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const doneCount = useRef(0);

  useEffect(() => void refreshBadgeCache(), []);

  const signOut = useCallback((title: string) => {
    const p = whoRef.current;
    whoRef.current = null;
    lastAt.current = Date.now();
    setWho(null);
    setLines([]);
    if (p) {
      const n = doneCount.current;
      setNotice({ id: ++lineId, tone: "ok", title, detail: `${p.name} · ${n} ${n === 1 ? "box" : "boxes"} checked out` });
    }
  }, []);

  const handle = useCallback(
    async (raw: string) => {
      lastAt.current = Date.now();
      const person = whoRef.current;
      const say = (tone: Tone, title: string, detail?: string, code?: string) => {
        beep(tone === "ok" ? "ok" : "bad");
        const line = { id: ++lineId, tone, title, detail, code };
        if (whoRef.current) setLines((l) => [line, ...l].slice(0, 30));
        else setNotice(line);
      };

      if (isBadgeScan(raw)) {
        const token = badgeToken(raw);
        if (!token) return say("bad", "That badge didn't read", "Try scanning it again.");
        if (person?.token === token) return signOut("Signed out");
        const name = await whoseBadge(token).catch(() => null);
        if (!name) return say("bad", "Badge not recognized", "It may have been replaced. Ask an admin for a new one.");
        beep("hello");
        whoRef.current = { name, token };
        doneCount.current = 0;
        setWho({ name, token });
        setLines([]);
        setNotice(null);
        return;
      }

      if (!person) return say("bad", "Scan your badge first", "Then scan the boxes you're taking.");
      const code = pickCode(raw);
      if (!code) return say("bad", "That code didn't read", "Try scanning it again.");
      try {
        const pkg = await checkOut(code, person.name);
        notifyChanged();
        doneCount.current += 1;
        say("ok", pkg.jobName || code, "checked out to you", code);
      } catch {
        const now = await getPackage(code).catch(() => undefined);
        if (now === null) say("bad", "Not in Floorcast", "This box hasn't been received. Nothing changed.", code);
        else if (now?.status === "checked_out" && now.checkedOutTo === person.name) say("warn", now.jobName, "already checked out to you", code);
        else if (now?.status === "checked_out")
          say("bad", `Already out to ${now.checkedOutTo ?? "someone"}`, `${now.jobName}${now.checkedOutAt ? ` · ${ago(now.checkedOutAt)}` : ""}. Nothing changed.`, code);
        else say("bad", "Didn't save", "Scan it again.", code);
      }
      lastAt.current = Date.now();
    },
    [signOut],
  );

  /** Scans run one at a time, in order; a double read of the same code is dropped. */
  const scan = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      const now = Date.now();
      if (recent.current.raw === text && now - recent.current.at < 1500) return;
      recent.current = { raw: text, at: now };
      chain.current = chain.current.then(() => handle(text)).catch(() => undefined);
    },
    [handle],
  );

  // A scanner that "types": characters then Enter (or Tab).
  useEffect(() => {
    let buf = "";
    let last = 0;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - last > 800) buf = "";
      last = now;
      if (e.key === "Enter" || e.key === "Tab") {
        if (buf.trim()) {
          e.preventDefault();
          scan(buf);
        }
        buf = "";
        return;
      }
      if (e.key.length === 1) buf = (buf + e.key).slice(-200);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scan]);

  // Idle sign-out, and the "signed out" note fades back to the badge prompt.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastAt.current;
      if (whoRef.current) {
        const s = Math.max(0, Math.ceil((STATION_IDLE_MS - idle) / 1000));
        setLeft(s);
        if (s === 0) signOut("Signed out");
      } else if (idle > 8000) setNotice(null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [signOut]);

  const latest = lines[0];
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]">
      <header className="flex items-center justify-between gap-2">
        <Brand />
        <span className="flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1 text-[12px] text-dim lowercase">
          <IdCard aria-hidden className="size-3.5 text-cyan" /> check-out station
        </span>
      </header>

      {who ? (
        <main className="mt-6 flex flex-1 flex-col gap-4">
          <div>
            <h1 className="m-0 font-sans text-[34px] leading-tight font-bold tracking-[-0.02em] text-white">Hi {who.name}.</h1>
            <p className="mt-1 text-[18px] text-cyan">Start scanning your items.</p>
          </div>

          {latest ? (
            <div
              key={latest.id}
              role="status"
              className={cx(
                "vw-fade flex items-start gap-3 rounded-[16px] border-2 px-4 py-4",
                latest.tone === "ok" ? "border-cyan bg-cyan/10" : latest.tone === "warn" ? "border-amber bg-amber/10" : "border-danger bg-danger/10",
              )}
            >
              <Mark tone={latest.tone} big />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[22px] leading-tight font-bold text-white">{latest.title}</p>
                {latest.detail ? <p className={cx("mt-1 text-[15px]", latest.tone === "bad" ? "text-danger" : "text-ink")}>{latest.detail}</p> : null}
                {latest.code ? <p className="code mt-1 text-[13px] text-dim">{latest.code}</p> : null}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-[16px] border-2 border-dashed border-line px-4 py-6 text-[16px] text-dim">
              <IdCard aria-hidden className="size-6 text-cyan" /> Point the scanner at a box sticker.
            </div>
          )}

          {lines.length > 1 ? (
            <ul className="m-0 flex list-none flex-col p-0" aria-label="Scanned this time">
              {lines.slice(1).map((l) => (
                <li key={l.id} className="flex items-center gap-2 border-b border-hair py-2 text-[14px]">
                  <Mark tone={l.tone} />
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {l.code ? <span className="code text-[12px] text-dim">{l.code}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-auto flex flex-col gap-2 pt-4">
            <p className="text-center text-[13px] text-faint">
              {doneCount.current} checked out · signs out in {left}s, or scan your badge again
            </p>
            <Button big onClick={() => signOut("Signed out")}>
              <LogOut className="size-5" /> Done, sign me out
            </Button>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
          {notice ? (
            <div
              key={notice.id}
              role="status"
              className={cx(
                "vw-fade flex w-full items-start gap-3 rounded-[16px] border-2 px-4 py-4 text-left",
                notice.tone === "ok" ? "border-cyan bg-cyan/10" : "border-danger bg-danger/10",
              )}
            >
              <Mark tone={notice.tone} big />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[22px] leading-tight font-bold text-white">{notice.title}</p>
                {notice.detail ? <p className="mt-1 text-[15px] text-ink">{notice.detail}</p> : null}
              </div>
            </div>
          ) : null}
          <span className="flex size-24 items-center justify-center rounded-[24px] border border-cyan/40 bg-cyan/10 text-cyan">
            <IdCard className="size-12" strokeWidth={1.6} />
          </span>
          <h1 className="m-0 font-sans text-[32px] leading-tight font-bold tracking-[-0.02em] text-white">Scan your badge</h1>
          <p className="max-w-xs text-[16px] text-dim">Then scan each box you're taking. It's checked out to you right away.</p>
        </main>
      )}

      <footer className="flex flex-col gap-2 pt-2">
        {DEMO_UI ? <DemoScans onScan={scan} signedIn={Boolean(who)} /> : null}
        <div className="flex gap-2">
          <Button onClick={() => setCamera(true)}>
            <Camera className="size-[18px]" /> Use camera
          </Button>
          <button
            type="button"
            onClick={() => setExiting(true)}
            className="vw-press flex min-h-[50px] shrink-0 items-center gap-1.5 rounded-[12px] px-3 text-[13px] text-faint lowercase"
          >
            <Lock aria-hidden className="size-4" /> exit
          </button>
        </div>
      </footer>

      {camera ? (
        <Scanner
          title="Check-out station"
          raw
          continuous
          hint={who ? "point at a box sticker" : "point at your badge"}
          onScan={scan}
          onClose={() => setCamera(false)}
          footer={who ? <p className="text-center text-[14px] text-ink">{who.name} · {doneCount.current} checked out</p> : null}
        />
      ) : null}
      {exiting ? <ExitStation onCancel={() => setExiting(false)} onExit={onExit} /> : null}
    </div>
  );
}

function Mark({ tone, big }: { tone: Tone; big?: boolean }) {
  const size = big ? "size-7" : "size-4";
  if (tone === "ok") return <Check aria-label="checked out" className={cx(size, "shrink-0 text-cyan")} strokeWidth={2.8} />;
  if (tone === "warn") return <TriangleAlert aria-label="note" className={cx(size, "shrink-0 text-amber")} strokeWidth={2.4} />;
  return <X aria-label="problem" className={cx(size, "shrink-0 text-danger")} strokeWidth={2.8} />;
}

/** Leaving station mode needs the shop PIN, so the crew can't wander into the rest of the app. */
function ExitStation({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await unlock(pin).catch(() => "wrong" as const);
    setBusy(false);
    if (r === "ok") {
      setStationMode(false);
      onExit();
    } else {
      setMsg(r === "unset" ? "No shop PIN is set for this build." : "Wrong PIN.");
      setPin("");
    }
  }
  return (
    <Overlay title="Exit station" onClose={onCancel} closeLabel="Cancel">
      <form onSubmit={(e) => void submit(e)} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h2 className="font-sans text-[26px] leading-tight font-bold tracking-[-0.02em]">Exit check-out station?</h2>
        <p className="text-[15px] text-dim">Enter the shop PIN. This device goes back to the full app as an Administrator.</p>
        <label htmlFor="station-pin" className="sr-only">
          Shop PIN
        </label>
        <input
          id="station-pin"
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
        {msg ? <p className="text-[13px] text-danger">{msg}</p> : null}
        <Button big variant="primary" type="submit" disabled={busy || !pin.trim()}>
          {busy ? "Checking…" : "Exit station"}
        </Button>
      </form>
    </Overlay>
  );
}

/** Preview only: there's no scanner here, so these buttons stand in for one. */
function DemoScans({ onScan, signedIn }: { onScan: (raw: string) => void; signedIn: boolean }) {
  const [people, setPeople] = useState<Employee[]>([]);
  const [boxes, setBoxes] = useState<Pkg[]>([]);
  useEffect(() => {
    void listEmployees().then(setPeople, () => undefined);
  }, []);
  useEffect(() => {
    void listPackages("all").then(setBoxes, () => undefined);
  }, [signedIn]);
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] border border-dashed border-line p-2.5">
      <p className="text-[12px] text-faint">preview: tap to pretend-scan</p>
      <div className="flex flex-wrap gap-1.5">
        {people.slice(0, 2).map((p) => (
          <button key={p.id} type="button" onClick={() => onScan(badgePayload(p.badge))} className="vw-press rounded-[8px] border border-cyan/50 bg-cyan/10 px-2.5 py-1.5 text-[12px] text-cyan">
            {p.name}'s badge
          </button>
        ))}
        {boxes.slice(0, 4).map((b) => (
          <button key={b.code} type="button" onClick={() => onScan(b.code)} className="vw-press rounded-[8px] border border-line bg-panel px-2.5 py-1.5 text-[12px] text-dim">
            {b.jobName.replace(/^Example: /, "")}
          </button>
        ))}
      </div>
    </div>
  );
}
