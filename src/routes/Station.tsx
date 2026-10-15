import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Check, ChevronRight, IdCard, Lock, LogOut, PackageX, TriangleAlert, Undo2, X } from "lucide-react";
import { Decode, DrawCheck } from "@/components/motion";
import { Brand } from "@/components/Shell";
import { VansMarkFill } from "@/components/VansMark";
import { Scanner } from "@/components/Scanner";
import { Button, Overlay, cx, errorText, toast } from "@/components/ui";
import { badgePayload, badgeToken, isBadgeScan, listEmployees, refreshBadgeCache, whoseBadge, type Employee } from "@/lib/badges";
import { RETURN_TYPES, pickCode, returnTypeInfo, type ReturnType } from "@/lib/codes";
import { notifyChanged } from "@/lib/live";
import { checkOut, getPackage, listPackages, returnToFloor, type Pkg } from "@/lib/packages";
import { unlock } from "@/lib/pin";
import { startReturn, type Ret } from "@/lib/returns";
import { STATION_IDLE_MS, beep, setStationMode } from "@/lib/station";
import { DEMO_UI } from "@/lib/supabase";
import { ago } from "@/lib/time";

type Tone = "ok" | "bad" | "warn";
type Line = {
  id: number;
  tone: Tone;
  title: string;
  detail?: string;
  code?: string;
  undone?: boolean;
  isReturn?: boolean;
  /** Bumped when the same box is scanned again, so its row lights up again. */
  pulse?: number;
  /** The row a scan card shrinks into, when it's an existing row. */
  target?: number;
};
type Person = { name: string; token: string };
type Hello = { id: number; mode: "in" | "out"; name: string; note?: string };

let lineId = 0;
const boxes = (n: number) => `${n} ${n === 1 ? "box" : "boxes"}`;
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The check-out station. Scan your badge (a big "Hi Dana" card), then scan
 * boxes: each one is checked out to you right away, pops up big, then shrinks
 * into the list, where a mistaken scan can be undone. Scanning your badge
 * again signs you out (a matching "Bye" card); so do 3 minutes with no scans.
 * Works with a scanner that types (Zebra DataWedge, Bluetooth / USB scanners)
 * and with the camera on a phone.
 */
export function StationScreen({ onExit }: { onExit: () => void }) {
  const [who, setWho] = useState<Person | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;
  const [flash, setFlash] = useState<Line | null>(null);
  const [camera, setCamera] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hello, setHello] = useState<Hello | null>(null);
  const [count, setCount] = useState(0);
  // Starting a return from the station: scans pause until it's done.
  const [returning, setReturning] = useState(false);
  const returningRef = useRef(false);
  const openReturn = (on: boolean) => {
    returningRef.current = on;
    setReturning(on);
    lastAt.current = Date.now();
  };
  const whoRef = useRef<Person | null>(null);
  const lastAt = useRef(Date.now());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const recent = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const countRef = useRef(0);
  const bump = (d: number) => {
    countRef.current = Math.max(0, countRef.current + d);
    setCount(countRef.current);
  };

  useEffect(() => void refreshBadgeCache(), []);

  const signOut = useCallback((note?: string) => {
    const p = whoRef.current;
    if (!p) return;
    whoRef.current = null;
    lastAt.current = Date.now();
    returningRef.current = false;
    setReturning(false);
    setWho(null);
    setLines([]);
    setFlash(null);
    beep("hello");
    setHello({ id: ++lineId, mode: "out", name: p.name, note: note ?? `${boxes(countRef.current)} checked out` });
  }, []);

  const handle = useCallback(
    async (raw: string) => {
      lastAt.current = Date.now();
      if (returningRef.current) return beep("bad");
      const person = whoRef.current;
      const say = (tone: Tone, title: string, detail?: string, code?: string) => {
        beep(tone === "ok" ? "ok" : "bad");
        const line: Line = { id: ++lineId, tone, title, detail, code };
        // A box already in this list (scanned twice): show the card, but don't add a second row.
        const dup = code && whoRef.current ? linesRef.current.find((l) => l.code === code && !l.undone && !l.isReturn) : undefined;
        if (dup) setLines((ls) => ls.map((l) => (l.id === dup.id ? { ...l, pulse: (l.pulse ?? 0) + 1 } : l)));
        else if (whoRef.current) setLines((l) => [line, ...l].slice(0, 40));
        setFlash(dup ? { ...line, target: dup.id } : line);
      };

      if (isBadgeScan(raw)) {
        const token = badgeToken(raw);
        if (!token) return say("bad", "That badge didn't read", "Try scanning it again.");
        if (person?.token === token) return signOut();
        const name = await whoseBadge(token).catch(() => null);
        if (!name) return say("bad", "Badge not recognized", "Ask an admin for a new one.");
        beep("hello");
        setFlash(null);
        setHello({ id: ++lineId, mode: "in", name });
        whoRef.current = { name, token };
        countRef.current = 0;
        setCount(0);
        setWho({ name, token });
        setLines([]);
        return;
      }

      if (!person) return say("bad", "Scan your badge first", "Then scan the boxes you're taking.");
      const code = pickCode(raw);
      if (!code) return say("bad", "That code didn't read", "Try scanning it again.");
      try {
        const pkg = await checkOut(code, person.name);
        notifyChanged();
        bump(1);
        say("ok", pkg.jobName || code, "checked out to you", code);
      } catch {
        const now = await getPackage(code).catch(() => undefined);
        if (now === null) say("bad", "Not in Floorcast", "Receive it first. Nothing changed.", code);
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

  /** A box scanned by mistake goes straight back on the floor. */
  async function undo(line: Line) {
    if (!line.code || line.undone) return;
    lastAt.current = Date.now();
    try {
      await returnToFloor(line.code);
      notifyChanged();
      bump(-1);
      beep("ok");
      setLines((l) => l.map((x) => (x.id === line.id ? { ...x, undone: true } : x)));
      // Scanning it again right away should check it out again, not count as a double read.
      recent.current = { raw: "", at: 0 };
    } catch (err) {
      beep("bad");
      toast(errorText(err, "Couldn't undo that. It needs signal."), "error");
    }
  }

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

  // Nobody walks off still signed in: 3 minutes with no scans signs them out.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (whoRef.current && !returningRef.current && Date.now() - lastAt.current >= STATION_IDLE_MS) {
        signOut(`No scans for 3 minutes · ${boxes(countRef.current)} checked out`);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [signOut]);

  return (
    <div className="relative isolate mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pt-[max(env(safe-area-inset-top),16px)] pb-[max(env(safe-area-inset-bottom),16px)]">
      {who ? null : <CodeField />}
      <header className="flex items-center justify-between gap-2">
        <Brand />
        <span className="flex items-center gap-1.5 rounded-[8px] border border-line px-2.5 py-1 text-[12px] text-dim lowercase">
          <IdCard aria-hidden className="size-3.5 text-cyan" /> check-out station
        </span>
      </header>

      {who ? (
        <main className="mt-6 flex flex-1 flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="m-0 truncate font-sans text-[30px] leading-tight font-bold tracking-[-0.02em] text-white">
                Hi {who.name}
                {who.name.endsWith(".") ? "" : "."}
              </h1>
              <p className="mt-0.5 text-[17px] text-cyan">Start scanning your items.</p>
              <button
                type="button"
                onClick={() => openReturn(true)}
                className="vw-press mt-2.5 inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-3 text-[13px] text-ink lowercase"
              >
                <PackageX aria-hidden className="size-4 text-cyan" /> start a return
              </button>
            </div>
            <span className="flex shrink-0 flex-col items-end leading-none">
              <span className="font-sans text-[34px] font-bold text-cyan tabular-nums">{count}</span>
              <span className="text-[11px] text-faint">checked out</span>
            </span>
          </div>

          {lines.length === 0 ? (
            <div className="flex items-center gap-3 rounded-[16px] border-2 border-dashed border-line px-4 py-6 text-[16px] text-dim">
              <IdCard aria-hidden className="size-6 text-cyan" /> Point the scanner at a box sticker.
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Scanned this time">
              {lines.map((l) => (
                <li
                  key={`${l.id}-${l.pulse ?? 0}`}
                  data-line={l.id}
                  className={cx(
                    "vw-landed flex items-center gap-3 rounded-[12px] border px-3.5 py-3",
                    l.undone ? "border-line bg-panel opacity-60" : l.tone === "ok" ? "border-cyan/40 bg-cyan/5" : l.tone === "warn" ? "border-amber/50 bg-amber/5" : "border-danger/50 bg-danger/5",
                  )}
                >
                  {l.undone ? (
                    <Undo2 aria-label="undone" className="size-5 shrink-0 text-dim" />
                  ) : l.isReturn ? (
                    <PackageX aria-label="return" className="size-5 shrink-0 text-cyan" />
                  ) : (
                    <Mark tone={l.tone} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cx("truncate font-sans text-[17px] leading-tight font-semibold text-white", l.undone && "line-through")}>{l.title}</p>
                    <p className={cx("truncate text-[13px]", l.undone ? "text-dim" : l.tone === "bad" ? "text-danger" : "text-dim")}>
                      {l.undone ? "undone · back on the floor" : l.detail}
                      {l.code ? <span className="code text-faint"> · {l.code}</span> : null}
                    </p>
                  </div>
                  {l.tone === "ok" && !l.undone && !l.isReturn ? (
                    <button
                      type="button"
                      onClick={() => void undo(l)}
                      aria-label={`Undo ${l.title}`}
                      className="vw-press flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-panel px-3 text-[13px] text-ink lowercase"
                    >
                      <Undo2 aria-hidden className="size-4" /> undo
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-4">
            <p className="text-center text-[14px] text-dim">Scan your badge again to sign out.</p>
            <Button variant="ghost" onClick={() => signOut()}>
              <LogOut className="size-[18px]" /> sign out
            </Button>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
          <span className="vw-badge-glow flex size-24 items-center justify-center rounded-[24px] border border-cyan/70 bg-[#0b1d22] text-cyan">
            <IdCard className="size-12 drop-shadow-[0_0_8px_rgb(45_174_196/0.9)]" strokeWidth={1.8} />
          </span>
          <h1 className="m-0 font-sans text-[32px] leading-tight font-bold tracking-[-0.02em] text-white [text-shadow:0_2px_18px_rgb(0_0_0/0.85)]">Scan your badge</h1>
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
          footer={who ? <p className="text-center text-[14px] text-ink">{who.name} · {count} checked out</p> : null}
        />
      ) : null}
      {flash ? <ScanFlash key={flash.id} line={flash} onDone={() => setFlash((f) => (f?.id === flash.id ? null : f))} /> : null}
      {hello ? <HelloCard key={hello.id} hello={hello} onDone={() => setHello((h) => (h?.id === hello.id ? null : h))} /> : null}
      {returning && who ? (
        <StationReturn
          name={who.name}
          onClose={(ret) => {
            openReturn(false);
            if (ret) {
              const line: Line = { id: ++lineId, tone: "ok", title: `Return ${ret.code}`, detail: returnTypeInfo(ret.type).label.toLowerCase(), isReturn: true };
              setLines((l) => [line, ...l].slice(0, 40));
            }
          }}
        />
      ) : null}
      {exiting ? <ExitStation onCancel={() => setExiting(false)} onExit={onExit} /> : null}
    </div>
  );
}

/**
 * Idle screensaver behind "Scan your badge": a grid of small QR-style squares
 * that flicker on and off, with a slow ripple spreading out from the middle.
 * Only runs while nobody is signed in; a still frame with reduced motion.
 */
function CodeField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const CELL = 14;
    const CYAN = "45,174,196";
    const RED = "197,44,46";
    let d = 1;
    let cols = 0;
    let rows = 0;
    let seed: number[] = [];
    const setup = () => {
      d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(window.innerWidth * d);
      c.height = Math.round(window.innerHeight * d);
      cols = Math.ceil(window.innerWidth / CELL);
      rows = Math.ceil(window.innerHeight / CELL);
      seed = Array.from({ length: cols * rows }, () => Math.random());
    };
    const draw = (t: number) => {
      g.clearRect(0, 0, c.width, c.height);
      const cx = cols / 2;
      const cy = rows / 2.3;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const s = seed[y * cols + x];
          if ((Math.sin(t * 0.0006 + s * 40) + 1) / 2 <= 0.62) continue;
          const wave = (Math.sin(Math.hypot(x - cx, y - cy) * 0.55 - t * 0.0022) + 1) / 2;
          g.fillStyle = `rgba(${s > 0.9 ? RED : CYAN},${0.05 + wave * 0.2})`;
          g.fillRect((x * CELL + 1) * d, (y * CELL + 1) * d, (CELL - 3) * d, (CELL - 3) * d);
        }
    };
    setup();
    window.addEventListener("resize", setup);
    let raf = 0;
    if (calm()) draw(0);
    else {
      const loop = (t: number) => {
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setup);
    };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />;
}

/**
 * Each scan pops up big in the middle of the screen, holds a moment, then
 * shrinks into its row in the list. With nobody signed in there's no list,
 * so it just fades. Never blocks the next scan or the undo buttons.
 */
function ScanFlash({ line, onDone }: { line: Line; onDone: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    let anim: Animation | undefined;
    const t = window.setTimeout(() => {
      const el = card.current;
      if (!el) return doneRef.current();
      const quick = calm();
      const a = el.getBoundingClientRect();
      const target = document.querySelector(`[data-line="${line.target ?? line.id}"]`)?.getBoundingClientRect();
      const ease = "cubic-bezier(0.4, 0, 0.2, 1)";
      if (target) {
        const dx = target.left + target.width / 2 - (a.left + a.width / 2);
        const dy = target.top + target.height / 2 - (a.top + a.height / 2);
        anim = el.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(${target.width / a.width}, ${target.height / a.height})`, opacity: 0.9, offset: 0.85 },
            { transform: `translate(${dx}px, ${dy}px) scale(${target.width / a.width}, ${target.height / a.height})`, opacity: 0 },
          ],
          { duration: quick ? 1 : 420, easing: ease, fill: "forwards" },
        );
      } else {
        anim = el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(0.96)" }], { duration: quick ? 1 : 260, easing: ease, fill: "forwards" });
      }
      veil.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: quick ? 1 : 360, fill: "forwards" });
      anim.onfinish = () => doneRef.current();
    }, line.tone === "ok" ? 900 : 1400);
    return () => {
      window.clearTimeout(t);
      anim?.cancel();
    };
  }, [line.id, line.tone]);

  return (
    <div ref={veil} role="status" aria-live="assertive" className="vw-greet-veil pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/45 px-5">
      <div
        ref={card}
        className={cx(
          "vw-greet-in flex min-h-[34dvh] w-full max-w-xl flex-col items-center justify-center gap-3 rounded-[24px] border-2 px-6 py-8 text-center",
          line.tone === "ok"
            ? "border-cyan bg-[linear-gradient(160deg,#0f3a42_0%,#0a1d22_60%,#0a0a0c_100%)] shadow-[0_0_60px_rgb(45_174_196/0.4)]"
            : line.tone === "warn"
              ? "border-amber bg-[linear-gradient(160deg,#3a2a0c_0%,#1a1408_60%,#0a0a0c_100%)]"
              : "border-danger bg-[linear-gradient(160deg,#3a0f12_0%,#1d0a0b_60%,#0a0a0c_100%)] shadow-[0_0_60px_rgb(197_44_46/0.35)]",
        )}
      >
        <Mark tone={line.tone} big />
        <p className="font-sans text-[clamp(28px,8vw,44px)] leading-[1.05] font-bold tracking-[-0.02em] break-words text-white">{line.title}</p>
        {line.detail ? <p className={cx("text-[17px]", line.tone === "bad" ? "text-danger" : "text-ink")}>{line.detail}</p> : null}
        {line.code ? <p className="code text-[14px] text-dim">{line.code}</p> : null}
      </div>
    </div>
  );
}

/**
 * Full-screen card when a badge is scanned. Signing in: the Vans mark draws in
 * outline, then fills with a blue glow ("Hi, Dana"). Signing out: the mark
 * starts lit and drains back to an outline ("Bye, Dana"). Then it lifts away.
 * It never blocks scanning; box scans go through underneath.
 */
function HelloCard({ hello, onDone }: { hello: Hello; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Timed once per card; the station keeps re-rendering underneath.
  useEffect(() => {
    const out = window.setTimeout(() => setLeaving(true), 1900);
    const done = window.setTimeout(() => doneRef.current(), 2250);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(done);
    };
  }, []);
  const signingIn = hello.mode === "in";
  return (
    <div
      role="status"
      aria-live="assertive"
      data-hello={hello.mode}
      className={cx("pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm", leaving ? "vw-greet-out-veil" : "vw-greet-veil")}
    >
      <div
        className={cx(
          "flex min-h-[62dvh] w-full max-w-xl flex-col items-center justify-center gap-5 rounded-[28px] border-2 px-6 py-10 text-center",
          signingIn
            ? "border-cyan bg-[linear-gradient(160deg,#0f3a42_0%,#0a1d22_55%,#0a0a0c_100%)] shadow-[0_0_80px_rgb(45_174_196/0.45)]"
            : "border-cyan/50 bg-[linear-gradient(160deg,#0c2a30_0%,#0a1518_55%,#0a0a0c_100%)] shadow-[0_0_50px_rgb(45_174_196/0.25)]",
          leaving ? "vw-greet-out" : "vw-greet-in",
        )}
      >
        <VansMarkFill className={cx("h-40 w-auto text-cyan", !signingIn && "vw-mark-out")} />
        <span className="font-sans text-[28px] font-semibold text-cyan">{signingIn ? "Hi," : "Bye,"}</span>
        <span className="font-sans text-[clamp(44px,14vw,92px)] leading-[0.95] font-bold tracking-[-0.03em] break-words text-white">{hello.name}</span>
        <span className="text-[19px] text-ink">{signingIn ? "Start scanning your items." : "You're signed out."}</span>
        {!signingIn && hello.note ? <span className="text-[16px] text-dim">{hello.note}</span> : null}
      </div>
    </div>
  );
}

function Mark({ tone, big }: { tone: Tone; big?: boolean }) {
  const size = big ? "size-12" : "size-5";
  if (tone === "ok") return <Check aria-label="checked out" className={cx(size, "shrink-0 text-cyan")} strokeWidth={2.8} />;
  if (tone === "warn") return <TriangleAlert aria-label="note" className={cx(size, "shrink-0 text-amber")} strokeWidth={2.4} />;
  return <X aria-label="problem" className={cx(size, "shrink-0 text-danger")} strokeWidth={2.8} />;
}

/**
 * A return started at the station: the person is already known from their
 * badge and the station is on site, so it's just the type, then the code to
 * write on the item. Details and a photo can be added later on the Returns page.
 */
function StationReturn({ name, onClose }: { name: string; onClose: (ret: Ret | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<Ret | null>(null);

  async function pick(type: ReturnType) {
    setBusy(true);
    try {
      const ret = await startReturn(type, name);
      notifyChanged();
      beep("ok");
      setMade(ret);
    } catch (err) {
      beep("bad");
      toast(errorText(err, "Could not start the return."), "error");
    } finally {
      setBusy(false);
    }
  }

  if (made) {
    return (
      <Overlay title="Return started" onClose={() => onClose(made)} closeLabel="Done">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <div className="flex items-center gap-3">
            <DrawCheck className="size-8 shrink-0 text-cyan drop-shadow-[0_0_10px_rgb(45_174_196/0.6)]" />
            <div className="flex flex-col">
              <span className="text-[13px] text-faint lowercase">{returnTypeInfo(made.type).label}</span>
              <span className="font-sans text-[20px] font-semibold text-white">Write this on the item</span>
            </div>
          </div>
          <div className="vw-pop flex flex-col items-center gap-2 rounded-[16px] border border-cyan/50 bg-[radial-gradient(circle_at_50%_0%,rgb(45_174_196/0.18),transparent_70%)] px-4 py-8">
            <Decode text={made.code} ms={700} className="code text-[clamp(44px,15vw,72px)] leading-none font-bold tracking-[0.06em] text-white" />
            <span className="text-[13px] text-dim">with a sharpie, big and clear</span>
          </div>
          <Button big variant="primary" onClick={() => onClose(made)}>
            Done
          </Button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay title="Start a return" onClose={() => onClose(null)} closeLabel="Cancel">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-3 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <h2 className="font-sans text-[26px] leading-tight font-bold tracking-[-0.02em]">What kind of return?</h2>
        {RETURN_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            disabled={busy}
            onClick={() => void pick(t.type)}
            className="vw-press flex min-h-[72px] items-center gap-4 rounded-[14px] border border-line bg-panel px-4 text-left disabled:opacity-50"
          >
            <span className="code w-14 shrink-0 text-[17px] font-semibold text-cyan">{t.prefix}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-sans text-[18px] font-semibold text-white">{t.label}</span>
              <span className="text-[13px] text-dim">{t.hint}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-faint" />
          </button>
        ))}
      </div>
    </Overlay>
  );
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
        <p className="text-[15px] text-dim">Enter the shop PIN.</p>
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
