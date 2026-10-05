import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { Scanner } from "@/components/Scanner";
import { PageTitle } from "@/components/Shell";
import { Button, errorText, toast } from "@/components/ui";
import { isPlausibleCode, normalizeCode } from "@/lib/codes";
import { getPackage } from "@/lib/packages";

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
        className="flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-box)] bg-amber text-amber-ink active:bg-[#e09b00]"
      >
        <ScanLine className="size-16" strokeWidth={2.25} />
        <span className="font-cond text-[30px] font-bold uppercase">Open camera</span>
      </button>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        <label htmlFor="scan-code" className="label">
          Or type / wedge-scan the code
        </label>
        <input
          ref={inputRef}
          id="scan-code"
          className="field code h-16 text-[24px] uppercase"
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
