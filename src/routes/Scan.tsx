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
        className="vw-press grad-cyan flex min-h-[150px] w-full flex-col items-center justify-center gap-3 rounded-[14px] text-cyan-ink shadow-[0_12px_32px_rgb(45_174_196/0.3)] active:brightness-110"
      >
        <ScanLine className="size-12" strokeWidth={2} />
        <span className="text-[17px] font-semibold lowercase">open camera</span>
      </button>

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
