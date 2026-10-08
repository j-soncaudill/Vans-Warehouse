import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ListChecks, ScanLine, X } from "lucide-react";
import { BatchCheckoutSheet } from "@/components/BatchCheckout";
import { Scanner } from "@/components/Scanner";
import { PageTitle } from "@/components/Shell";
import { Button, btn, cx, errorText, toast } from "@/components/ui";
import { isPlausibleCode, isReturnCode, normalizeCode } from "@/lib/codes";
import { useWedgeScanner } from "@/lib/hid";
import { getPackage, type Pkg } from "@/lib/packages";

const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

export function ScanPage() {
  const navigate = useNavigate();
  const [camera, setCamera] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Desk PCs with a wedge scanner: cursor lands in the code field.
  useEffect(() => {
    if (finePointer()) inputRef.current?.focus();
  }, []);

  async function lookup(raw: string) {
    const c = normalizeCode(raw);
    if (!isPlausibleCode(c)) {
      toast("That does not look like a barcode.", "error");
      return;
    }
    if (isReturnCode(c)) {
      await navigate({ to: "/r/$code", params: { code: c } });
      return;
    }
    setBusy(true);
    try {
      const found = await getPackage(c);
      if (found) await navigate({ to: "/p/$code", params: { code: found.code } });
      else {
        toast(`${c} is not in the warehouse. Receive it.`);
        await navigate({ to: "/receive", search: { code: c } });
      }
    } catch (err) {
      toast(errorText(err, "Lookup failed."), "error");
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void lookup(code);
  }

  return (
    <>
      <PageTitle>Scan</PageTitle>
      <button
        type="button"
        onClick={() => setCamera(true)}
        className="vw-press grad-cyan flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[14px] text-cyan-ink shadow-[0_12px_32px_rgb(45_174_196/0.3)] active:brightness-110"
      >
        <ScanLine className="size-12" strokeWidth={2} />
        <span className="text-[17px] font-semibold lowercase">open camera</span>
      </button>

      <Link to="/scan/batch" className={cx(btn("plain"), "mt-3")}>
        <ListChecks className="size-[18px]" /> Scan several · check out together
      </Link>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-2.5">
        <label htmlFor="scan-code" className="label">
          or type the code
        </label>
        <input
          ref={inputRef}
          id="scan-code"
          className="field code h-14 text-[18px] text-cyan uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="VW-XXXXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button big type="submit" disabled={busy || !code.trim()}>
          {busy ? "Looking up…" : "Look up"}
        </Button>
      </form>

      {camera ? (
        <Scanner
          onClose={() => setCamera(false)}
          onScan={(c) => {
            setCamera(false);
            setCode(c);
            void lookup(c);
          }}
        />
      ) : null}
    </>
  );
}

type Note = { text: string; tone: "ok" | "warn" };

/** Scan several stickers in a row (camera or handheld scanner), then check them all out to one person. */
export function BatchScanPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<Pkg[]>([]);
  const [camera, setCamera] = useState(true);
  const [note, setNote] = useState<Note | null>(null);
  const [typed, setTyped] = useState("");
  const [sheet, setSheet] = useState(false);
  const listRef = useRef(list);
  listRef.current = list;

  async function add(raw: string) {
    const c = normalizeCode(raw);
    if (!isPlausibleCode(c)) return setNote({ text: "That does not look like a barcode.", tone: "warn" });
    if (isReturnCode(c)) return setNote({ text: `${c} is a return, not a box.`, tone: "warn" });
    if (listRef.current.some((p) => p.code === c)) return setNote({ text: `${c} is already on the list.`, tone: "warn" });
    try {
      const p = await getPackage(c);
      if (!p) return setNote({ text: `${c} is not in the warehouse.`, tone: "warn" });
      if (p.status === "checked_out") return setNote({ text: `${p.jobName} is already out to ${p.checkedOutTo ?? "someone"}.`, tone: "warn" });
      setList((cur) => (cur.some((x) => x.code === p.code) ? cur : [...cur, p]));
      setNote({ text: `Added ${p.jobName}`, tone: "ok" });
    } catch (err) {
      setNote({ text: errorText(err, "Lookup failed."), tone: "warn" });
    }
  }

  // Handheld scanners work here too; each read adds a box.
  useWedgeScanner((c) => void add(c), !sheet);

  const count = `${list.length} ${list.length === 1 ? "box" : "boxes"}`;

  return (
    <>
      <PageTitle aside={<span className="text-[13px] text-faint tabular-nums">{count}</span>}>Scan several</PageTitle>
      <p className="-mt-2 mb-4 text-[14px] text-dim">Scan each box's sticker, then check them all out to one person.</p>
      {note ? <p className={note.tone === "ok" ? "mb-3 text-[14px] text-cyan" : "mb-3 text-[14px] text-danger"}>{note.text}</p> : null}

      <div className="flex flex-col gap-2.5">
        <Button onClick={() => setCamera(true)}>
          <ScanLine className="size-[18px]" /> {list.length ? "Scan more" : "Open camera"}
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) void add(typed).then(() => setTyped(""));
          }}
          className="flex gap-2"
        >
          <label htmlFor="batch-code" className="sr-only">
            Type a code
          </label>
          <input
            id="batch-code"
            className="field code min-w-0 flex-1 text-cyan uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="or type a code"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" className="w-auto! px-5" disabled={!typed.trim()}>
            Add
          </Button>
        </form>
      </div>

      {list.length ? (
        <ul className="mt-5 flex flex-col border-t border-hair">
          {list.map((p) => (
            <li key={p.code} className="flex items-center gap-3 border-b border-hair py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-sans text-[16px] font-semibold text-white">{p.jobName}</span>
                <span className="code text-[12px] text-cyan">{p.code}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${p.code} from the list`}
                onClick={() => setList((cur) => cur.filter((x) => x.code !== p.code))}
                className="vw-press flex size-11 items-center justify-center rounded-[8px] border border-line text-dim"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <Button big variant="primary" disabled={!list.length} onClick={() => setSheet(true)}>
          Check out {count}
        </Button>
        <Button variant="ghost" onClick={() => void navigate({ to: "/scan" })}>
          Back to scan
        </Button>
      </div>

      {camera ? (
        <Scanner
          title="Scan several"
          continuous
          hint="scan each sticker"
          onClose={() => setCamera(false)}
          onScan={(c) => void add(c)}
          footer={
            <div className="flex items-center gap-3">
              <span className={note?.tone === "warn" ? "min-w-0 flex-1 truncate text-[13px] text-danger" : "min-w-0 flex-1 truncate text-[13px] text-cyan"}>
                {note?.text ?? "Nothing scanned yet"}
              </span>
              <Button variant="primary" className="w-auto! px-5" onClick={() => setCamera(false)}>
                Done · {list.length}
              </Button>
            </div>
          }
        />
      ) : null}
      {sheet ? (
        <BatchCheckoutSheet
          pkgs={list}
          onCancel={() => setSheet(false)}
          onDone={() => {
            setSheet(false);
            setList([]);
            setNote(null);
            void navigate({ to: "/out" });
          }}
        />
      ) : null}
    </>
  );
}
