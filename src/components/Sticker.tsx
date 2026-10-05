import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, errorText, toast } from "@/components/ui";
import { IS_DEMO } from "@/lib/supabase";
import { printSticker, renderSticker, saveSticker, type StickerInfo } from "@/lib/sticker";

/** On-screen preview is the exact PNG that gets saved or printed. */
export function StickerPreview({ info }: { info: StickerInfo }) {
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
    <div className="overflow-hidden rounded-[var(--radius-box)] border-2 border-line bg-white">
      {url ? (
        <img src={url} alt={`Sticker ${info.code}`} className="block aspect-[4/3] w-full" />
      ) : (
        <div className="aspect-[4/3] w-full" />
      )}
    </div>
  );
}

export function StickerButtons({ info, primary }: { info: StickerInfo; primary?: boolean }) {
  const [busy, setBusy] = useState<"" | "save" | "print">("");
  if (IS_DEMO) {
    return <p className="rounded-[var(--radius-box)] border-2 border-dashed border-line px-4 py-3 text-[17px] text-dim">Save and Print work on the live site. This preview blocks downloads and printing.</p>;
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
        <Download className="size-6" /> {busy === "save" ? "…" : "Save"}
      </Button>
      <Button big={primary} variant={primary ? "primary" : "plain"} disabled={!!busy} onClick={() => void run("print")}>
        <Printer className="size-6" /> {busy === "print" ? "…" : "Print"}
      </Button>
    </div>
  );
}
