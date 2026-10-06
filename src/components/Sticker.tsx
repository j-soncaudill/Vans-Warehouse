import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, cx, errorText, toast } from "@/components/ui";
import { DEMO_UI } from "@/lib/supabase";
import { printSticker, renderSticker, saveSticker, type StickerInfo } from "@/lib/sticker";

/**
 * On-screen preview is the exact PNG that gets saved or printed.
 * `print`: the sticker feeds out top to bottom, like a label printer.
 */
export function StickerPreview({ info, print }: { info: StickerInfo; print?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    renderSticker(info)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => setUrl(null));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [info.code, info.jobName, info.receivedAt]);
  return (
    <div className={cx("relative overflow-hidden rounded-[12px] border border-line", print ? "bg-panel" : "bg-white")}>
      {url ? (
        <>
          <img src={url} alt={`Sticker ${info.code}`} className={cx("block aspect-[4/3] w-full bg-white", print && "vw-print")} />
          {print ? <span aria-hidden className="vw-print-head" /> : null}
        </>
      ) : (
        <div className="aspect-[4/3] w-full" />
      )}
    </div>
  );
}

export function StickerButtons({ info, primary }: { info: StickerInfo; primary?: boolean }) {
  const [busy, setBusy] = useState<"" | "save" | "print">("");
  if (DEMO_UI) {
    return <p className="rounded-[var(--radius-box)] border border-dashed border-line px-4 py-3 text-[13px] text-dim">Save and Print work on the live site. This preview blocks downloads and printing.</p>;
  }
  async function run(kind: "save" | "print") {
    setBusy(kind);
    try {
      if (kind === "print") await printSticker(info);
      else {
        const r = await saveSticker(info);
        if (r === "downloaded") toast("Sticker saved to downloads.");
      }
    } catch (err) {
      toast(errorText(err, "Could not make the sticker."), "error");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button big={primary} variant={primary ? "primary" : "plain"} disabled={!!busy} onClick={() => void run("save")}>
        <Download className="size-[18px]" /> {busy === "save" ? "…" : "Save"}
      </Button>
      <Button big={primary} variant={primary ? "primary" : "plain"} disabled={!!busy} onClick={() => void run("print")}>
        <Printer className="size-[18px]" /> {busy === "print" ? "…" : "Print"}
      </Button>
    </div>
  );
}
