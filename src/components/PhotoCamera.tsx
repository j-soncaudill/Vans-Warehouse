import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, RotateCcw } from "lucide-react";
import { Button, Overlay, errorText } from "@/components/ui";
import { photoFromFile, photoFromVideo, type CapturedPhoto } from "@/lib/photo";

/**
 * Full-screen box-photo camera. The shot is shrunk to ~1280px JPEG plus a
 * square thumbnail right here, before anything is uploaded.
 */
export function PhotoCamera({
  onUse,
  onClose,
  saving,
}: {
  onUse: (photo: CapturedPhoto) => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"starting" | "live" | "failed">("starting");
  const [error, setError] = useState("");
  const [shot, setShot] = useState<CapturedPhoto | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startStream() {
    setState("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("failed");
      setError("This browser cannot open the camera here. Use the phone camera instead.");
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }
      stopStream();
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return stopStream();
      v.srcObject = stream;
      await v.play();
      setState("live");
    } catch (err) {
      setState("failed");
      setError(
        /NotAllowed|Permission/i.test(String((err as Error)?.name ?? err))
          ? "Camera permission is off. Allow it in the browser settings, or use the phone camera."
          : "Could not start the camera. Use the phone camera instead.",
      );
    }
  }

  useEffect(() => {
    void startStream();
    return stopStream;
  }, []);

  useEffect(() => {
    if (!shot) return setPreview(null);
    const url = URL.createObjectURL(shot.full);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  async function take() {
    const v = videoRef.current;
    if (!v) return;
    setBusy(true);
    try {
      setShot(await photoFromVideo(v));
      navigator.vibrate?.(30);
    } catch (err) {
      setError(errorText(err, "Could not take the photo."));
    } finally {
      setBusy(false);
    }
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setShot(await photoFromFile(file));
    } catch (err) {
      setError(errorText(err, "Could not read that photo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay title="Box photo" onClose={onClose} dark>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={shot ? "hidden" : "absolute inset-0 h-full w-full object-cover"}
        />
        {preview ? <img src={preview} alt="Photo to save" className="absolute inset-0 h-full w-full object-contain" /> : null}
        {!shot && state === "starting" ? <p className="absolute inset-x-0 bottom-4 text-center text-[13px] text-cyan">starting camera…</p> : null}
        {!shot && state === "failed" ? (
          <p className="absolute inset-x-4 bottom-4 mx-auto max-w-md rounded-md bg-black/80 px-3 py-2 text-center text-[14px]">{error}</p>
        ) : null}
      </div>
      <div className="bg-[linear-gradient(110deg,#0b262c_0%,#0a0a0c_50%,#2a0c0f_100%)] px-4 pt-0 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div aria-hidden className="brand-rule mb-3" />
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {shot ? (
            <>
              <Button big variant="primary" disabled={saving} onClick={() => void onUse(shot)}>
                {saving ? "Saving photo…" : "Use photo"}
              </Button>
              <Button disabled={saving} onClick={() => setShot(null)}>
                <RotateCcw className="size-[18px]" /> Retake
              </Button>
            </>
          ) : state === "failed" ? (
            <Button big variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <ImageUp className="size-5" /> {busy ? "Shrinking…" : "Use phone camera"}
            </Button>
          ) : (
            <button
              type="button"
              aria-label="Take photo"
              disabled={state !== "live" || busy}
              onClick={() => void take()}
              className="mx-auto flex size-[72px] items-center justify-center rounded-full border-[1.5px] border-dim text-dim active:border-ink active:text-ink disabled:opacity-40"
            >
              <Camera className="size-[34px]" strokeWidth={1.8} />
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void fromFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </Overlay>
  );
}

export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <Overlay title={alt} onClose={onClose} dark>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-2">
        <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>
    </Overlay>
  );
}
