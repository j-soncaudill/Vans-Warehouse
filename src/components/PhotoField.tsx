import { useEffect, useState } from "react";
import { Camera, FileText, Trash2 } from "lucide-react";
import { PhotoCamera } from "@/components/PhotoCamera";
import { Button } from "@/components/ui";
import { savePhotoDraft, type CapturedPhoto, type PhotoKind } from "@/lib/photo";

/**
 * Box photo or packing slip photo: take, retake, remove. With `draft`, it is
 * also kept in this tab's session so an iPhone page reload doesn't lose it.
 */
export function PhotoField({
  kind,
  photo,
  onChange,
  draft = false,
  label,
}: {
  kind: PhotoKind;
  photo: CapturedPhoto | null;
  onChange: (p: CapturedPhoto | null) => void;
  draft?: boolean;
  label?: string;
}) {
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const slip = kind === "slip";
  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo.thumb);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const set = (p: CapturedPhoto | null) => {
    onChange(p);
    if (draft) void savePhotoDraft(p, kind);
  };
  return (
    <section aria-label={slip ? "Packing slip photo" : "Box photo"} className="flex flex-col gap-2.5">
      <span className="section-label">{label ?? (slip ? "packing slip photo" : "box photo")}</span>
      {preview ? (
        <div className="flex items-center gap-3">
          <img src={preview} alt={slip ? "Packing slip photo" : "Box photo"} className="size-24 rounded-[8px] border border-line object-cover" />
          <div className="flex flex-1 flex-col gap-2">
            <Button onClick={() => setCamera(true)}>
              <Camera className="size-[18px]" /> {slip ? "Retake slip" : "Retake"}
            </Button>
            <Button variant="ghost" onClick={() => set(null)}>
              <Trash2 className="size-[18px]" /> {slip ? "Remove slip" : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setCamera(true)}>
          {slip ? <FileText className="size-[18px]" /> : <Camera className="size-[18px]" />} {slip ? "Photo of packing slip" : "Open camera"}
        </Button>
      )}
      {camera ? (
        <PhotoCamera
          kind={kind}
          onClose={() => setCamera(false)}
          onUse={(p) => {
            set(p);
            setCamera(false);
          }}
        />
      ) : null}
    </section>
  );
}
