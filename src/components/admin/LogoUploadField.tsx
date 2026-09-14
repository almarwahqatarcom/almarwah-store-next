"use client";

import { useRef, useState } from "react";

// A real, unmissable upload control — extracted so both the header logo
// and the footer logo (each a genuinely separate image an admin can set)
// share the exact same, already-hardened pipeline: a plain unstyled
// <input type="file"> reads as inert or broken to a lot of real admins
// (a real, reported "I can't upload the logo" bug traced back to exactly
// that), so the native input here is hidden and triggered via ref by an
// obvious dashed dropzone with a large button, drag-and-drop, a live
// thumbnail, and a collapsed "use a URL instead" fallback.
//
// Resizes through a canvas before ever converting to base64 — a logo only
// ever needs to render at a few dozen pixels tall, so capping the long
// side at `maxDimension` keeps the resulting data: URI small (tens of KB)
// regardless of how large the original source photo was, and keeps a real
// multi-MB phone photo from ever becoming a slow/failed save.
export default function LogoUploadField({
  label,
  hint,
  value,
  onChange,
  maxDimension = 320,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (dataUrlOrUrl: string) => void;
  maxDimension?: number;
}) {
  const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function processFile(file: File, onDone: () => void) {
    setError("");

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG, WEBP…).");
      onDone();
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("That image is too large (max 15MB). Please choose a smaller file.");
      onDone();
      return;
    }

    // A hard ceiling on how long this is allowed to hang — if img.onload
    // never fires (a corrupt file, an unsupported format the browser
    // silently rejects, etc.) the admin would otherwise be stuck on
    // "Processing…" forever with no error and no way to know why.
    const watchdog = setTimeout(() => {
      setUploading(false);
      setError("That took too long — please try a different image.");
      onDone();
    }, 10000);

    setUploading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      clearTimeout(watchdog);
      setUploading(false);
      setError("Couldn't read that file. Please try a different image.");
      onDone();
    };
    reader.onload = () => {
      try {
        const img = new Image();
        img.onerror = () => {
          clearTimeout(watchdog);
          setUploading(false);
          setError("That doesn't look like a valid image file.");
          onDone();
        };
        img.onload = () => {
          try {
            const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("no 2d context");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            onChange(canvas.toDataURL("image/png"));
          } catch {
            setError("Something went wrong processing that image. Please try a different file.");
          } finally {
            clearTimeout(watchdog);
            setUploading(false);
            onDone();
          }
        };
        img.src = reader.result as string;
      } catch {
        clearTimeout(watchdog);
        setUploading(false);
        setError("Something went wrong reading that image. Please try a different file.");
        onDone();
      }
    };
    reader.readAsDataURL(file);
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    // Keeps the picked filename visible on the native input for the whole
    // duration of processing instead of reverting to "No file selected"
    // instantly — the exact earlier bug this component's own history
    // traces back to (a picked file looking like nothing happened).
    processFile(file, () => {
      input.value = "";
    });
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file, () => {});
  }

  return (
    <div>
      <label className="block text-[11px] font-bold text-am-text-muted uppercase tracking-wide mb-1.5">{label}</label>
      {hint && <p className="text-[12px] text-am-text-muted mb-2.5 -mt-0.5">{hint}</p>}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileInputChange} className="hidden" />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex items-center gap-4 rounded-2xl border-2 border-dashed p-4 transition-colors ${dragOver ? "border-am-primary bg-am-primary/5" : "border-am-border"}`}
      >
        <div className="w-16 h-16 rounded-xl border border-am-border bg-am-bg shrink-0 flex items-center justify-center overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="w-full h-full object-contain" />
          ) : (
            <span className="text-2xl opacity-40">🖼️</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-am-primary hover:bg-am-primary-dark disabled:opacity-60 text-white text-[13px] font-bold px-5 py-2.5 rounded-full transition-colors shadow-[0_6px_16px_rgba(196,154,60,0.3)]"
            >
              {uploading ? "Processing…" : "📤 Upload Image"}
            </button>
            <span className="text-[12px] text-am-text-muted">or drag an image here</span>
            {value && !uploading && (
              <button onClick={() => onChange("")} className="text-[12px] text-am-error font-semibold hover:underline">
                Remove
              </button>
            )}
          </div>
          {error && <p className="text-[12px] text-am-error font-semibold">{error}</p>}
          <details className="text-[11.5px] text-am-text-faint">
            <summary className="cursor-pointer hover:text-am-text-muted">Use an image URL instead</summary>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="w-full mt-2 border border-am-border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-am-primary"
            />
          </details>
        </div>
      </div>
    </div>
  );
}
