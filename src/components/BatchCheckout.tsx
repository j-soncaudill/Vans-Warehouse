import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button, Overlay, errorText, toast } from "@/components/ui";
import { notifyChanged } from "@/lib/live";
import { checkOutMany, type BatchResult, type Pkg } from "@/lib/packages";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One name, several boxes. Shows what was skipped (already out, removed) instead of overwriting it. */
export function BatchCheckoutSheet({
  pkgs,
  onCancel,
  onDone,
}: {
  pkgs: Array<Pick<Pkg, "code" | "jobName">>;
  onCancel: () => void;
  onDone: (result: BatchResult) => void;
}) {
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);

  async function run() {
    setBusy(true);
    try {
      const r = await checkOutMany(pkgs, who, setProgress);
      notifyChanged();
      setResult(r);
      if (!r.skipped.length) {
        toast(`Checked out ${plural(r.done.length, "box", "boxes")} to ${who.trim()}.`);
        onDone(r);
      }
    } catch (err) {
      toast(errorText(err, "Check out failed."), "error");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Overlay title="Check out" onClose={() => onDone(result)} closeLabel="Done">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <h2 className="font-sans text-[26px] leading-tight font-bold tracking-[-0.02em]">
            {plural(result.done.length, "box", "boxes")} checked out
            {result.skipped.length ? `, ${result.skipped.length} skipped` : ""}
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {result.done.map((p) => (
              <li key={p.code} className="flex items-center gap-2 border-b border-hair py-2 text-[14px]">
                <Check aria-hidden className="size-4 text-cyan" strokeWidth={2.6} />
                <span className="min-w-0 flex-1 truncate">{p.jobName}</span>
                <span className="code text-[12px] text-cyan">{p.code}</span>
              </li>
            ))}
            {result.skipped.map((p) => (
              <li key={p.code} className="flex items-center gap-2 border-b border-hair py-2 text-[14px]">
                <X aria-hidden className="size-4 text-danger" strokeWidth={2.6} />
                <span className="min-w-0 flex-1">
                  {p.jobName} <span className="text-danger">· {p.reason}</span>
                </span>
                <span className="code text-[12px] text-dim">{p.code}</span>
              </li>
            ))}
          </ul>
          <Button big variant="primary" onClick={() => onDone(result)}>
            Done
          </Button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay title="Check out" onClose={onCancel} closeLabel="Cancel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (who.trim() && !busy) void run();
        }}
        className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <p className="text-[15px] text-dim">{plural(pkgs.length, "box", "boxes")}</p>
        <ul className="m-0 flex max-h-[34vh] list-none flex-col overflow-y-auto p-0">
          {pkgs.map((p) => (
            <li key={p.code} className="flex items-center gap-2 border-b border-hair py-1.5 text-[14px]">
              <span className="min-w-0 flex-1 truncate">{p.jobName}</span>
              <span className="code text-[12px] text-cyan">{p.code}</span>
            </li>
          ))}
        </ul>
        <label htmlFor="batch-by" className="font-sans text-[28px] leading-tight font-bold tracking-[-0.02em]">
          Checked out by:
        </label>
        <input
          id="batch-by"
          autoFocus
          required
          maxLength={80}
          autoComplete="off"
          className="field h-14 text-[17px]"
          placeholder="Sign your name"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        <Button big variant="primary" type="submit" disabled={busy || !who.trim() || !pkgs.length}>
          {busy ? `Checking out ${progress} of ${pkgs.length}…` : `Check out ${plural(pkgs.length, "box", "boxes")}`}
        </Button>
      </form>
    </Overlay>
  );
}
