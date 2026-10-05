import { useEffect, useRef, useState, type FormEvent } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Flashlight, ImageUp, Keyboard } from "lucide-react";
import { Button, Overlay, cx } from "@/components/ui";
import { isPlausibleCode, normalizeCode, pickCode } from "@/lib/codes";

const REGION_ID = "vw-scan-region";

const FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

function makeReader(elementId: string) {
  return new Html5Qrcode(elementId, {
    verbose: false,
    formatsToSupport: FORMATS,
    useBarCodeDetectorIfSupported: true,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  });
}

/** Reads a barcode out of a still photo (fallback when live camera fails). */
async function decodeFile(file: File): Promise<string | null> {
  const host = document.createElement("div");
  host.id = `vw-file-${Math.random().toString(36).slice(2)}`;
  host.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden";
  document.body.appendChild(host);
  try {
    const reader = makeReader(host.id);
    const text = await reader.scanFile(file, false);
    return pickCode(text);
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

type CamState = "starting" | "live" | "failed";

/**
 * Full-screen barcode scanner. Live camera, torch when the phone has one,
 * and a typed-code field for when the camera cannot read the label.
 */
export function Scanner({
  title = "Scan barcode",
  onScan,
  onClose,
  startTyping = false,
}: {
  title?: string;
  onScan: (code: string) => void;
  onClose: () => void;
  startTyping?: boolean;
}) {
  const readerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [cam, setCam] = useState<CamState>("starting");
  const [camError, setCamError] = useState("");
  const [torch, setTorch] = useState<null | boolean>(null);
  const [typing, setTyping] = useState(startTyping);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState("");
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = makeReader(REGION_ID);
    readerRef.current = reader;

    const finish = (raw: string) => {
      const code = pickCode(raw);
      if (!code || doneRef.current) return;
      doneRef.current = true;
      navigator.vibrate?.(60);
      void stop().finally(() => onScanRef.current(code));
    };

    const stop = async () => {
      try {
        if (reader.isScanning) await reader.stop();
      } catch {
        /* already stopped */
      }
      try {
        reader.clear();
      } catch {
        /* ignore */
      }
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam("failed");
        setCamError("This browser cannot open the camera. Type the code, or use a photo of the barcode.");
        return;
      }
      try {
        await reader.start(
          { facingMode: "environment" },
          {
            fps: 12,
            disableFlip: true,
            videoConstraints: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          },
          finish,
          () => undefined,
        );
        if (cancelled) return stop();
        setCam("live");
        try {
          const t = reader.getRunningTrackCameraCapabilities().torchFeature();
          if (t.isSupported()) setTorch(false);
        } catch {
          /* no torch */
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : String(err);
        setCam("failed");
        setCamError(
          /NotAllowed|Permission/i.test(name + String(err))
            ? "Camera permission is off. Allow the camera for this site in the browser settings, or type the code."
            : "Could not start the camera. Type the code, or use a photo of the barcode.",
        );
        setTyping(true);
      }
    })();

    return () => {
      cancelled = true;
      void stop();
    };
  }, []);

  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);

  async function toggleTorch() {
    const next = !torch;
    try {
      await readerRef.current?.getRunningTrackCameraCapabilities().torchFeature().apply(next);
      setTorch(next);
    } catch {
      setTorch(null);
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const code = normalizeCode(typed);
    if (!isPlausibleCode(code)) {
      setTypedError("Letters, numbers, dot or dash. At least 3 characters.");
      return;
    }
    doneRef.current = true;
    onScanRef.current(code);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    const code = await decodeFile(file);
    setReading(false);
    if (code) {
      doneRef.current = true;
      onScanRef.current(code);
    } else {
      setCamError("No barcode found in that photo. Fill the frame with the label and try again, or type it.");
    }
  }

  return (
    <Overlay title={title} onClose={onClose} dark>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <div id={REGION_ID} className="absolute inset-0" />
        {cam === "live" ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[34%] w-[80%] max-w-[520px]">
              <span className="absolute top-0 left-0 size-7 border-t-2 border-l-2 border-cyan" />
              <span className="absolute top-0 right-0 size-7 border-t-2 border-r-2 border-cyan" />
              <span className="absolute bottom-0 left-0 size-7 border-b-2 border-l-2 border-cyan" />
              <span className="absolute right-0 bottom-0 size-7 border-r-2 border-b-2 border-cyan" />
              <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[linear-gradient(90deg,transparent,var(--color-cyan),transparent)] shadow-[0_0_14px_var(--color-cyan)]" />
            </div>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 text-center">
          {cam === "starting" ? <p className="text-[13px] text-cyan">starting camera…</p> : null}
          {cam === "live" ? <p className="inline-block rounded-md bg-black/75 px-2.5 py-1 text-[12px] text-cyan">scanning · code128 · qr · ean · upc</p> : null}
          {cam === "failed" ? <p className="mx-auto max-w-md rounded-md bg-black/80 px-3 py-2 text-[14px] text-ink">{camError}</p> : null}
        </div>
      </div>

      <div className="bg-[linear-gradient(110deg,#0b262c_0%,#0a0a0c_50%,#2a0c0f_100%)] px-4 pt-0 pb-[max(env(safe-area-inset-bottom),14px)]">
        <div aria-hidden className="brand-rule mb-3" />
        {typing ? (
          <form onSubmit={submitTyped} className="mx-auto flex max-w-lg flex-col gap-2">
            <label htmlFor="scan-typed" className="label">
              // or type the code
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="scan-typed"
                className="field code min-w-0 flex-1 text-[17px] text-cyan uppercase"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="VW-XXXXXX"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError("");
                }}
              />
              <Button type="submit" variant="primary" className="w-auto! px-6" disabled={!typed.trim()}>
                Go
              </Button>
            </div>
            {typedError ? <p className="text-[13px] text-danger">{typedError}</p> : null}
            {cam === "failed" ? (
              <Button onClick={() => fileRef.current?.click()} disabled={reading}>
                <ImageUp className="size-[18px]" /> {reading ? "Reading…" : "Photo of the barcode"}
              </Button>
            ) : null}
          </form>
        ) : (
          <div className={cx("mx-auto grid max-w-lg gap-2", torch !== null ? "grid-cols-2" : "grid-cols-1")}>
            <Button onClick={() => setTyping(true)}>
              <Keyboard className="size-[18px]" /> Type code
            </Button>
            {torch !== null ? (
              <Button variant={torch ? "primary" : "plain"} onClick={() => void toggleTorch()} aria-pressed={torch}>
                <Flashlight className="size-[18px]" /> {torch ? "Light on" : "Light"}
              </Button>
            ) : null}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </Overlay>
  );
}
