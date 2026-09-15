"use client";

import { useState } from "react";
import Image from "next/image";

// Extracted from the homepage's Server Component specifically for this
// onError fallback — a plain server-rendered <Image> can't have an event
// handler at all in the App Router, so this one small piece has to be its
// own client island.
//
// Confirmed live that a next/image <img> occasionally fails to decode one
// of these small category thumbnails under heavy concurrent page load,
// even though the exact same URL decodes perfectly every time when
// fetched/decoded in isolation (verified independently via fetch(),
// createImageBitmap(), and a plain new Image() — all succeed reliably).
// So the underlying image is never actually broken; this is a genuine,
// if rare, browser-side decode hiccup under load. Next.js's own <Image>
// has no built-in retry for that, and the default failure state (broken-
// image icon, or the alt text spilling outside this circular frame) reads
// as a real broken category to a visitor. A single automatic retry-once
// covers the transient case; a plain 🖼️ placeholder (matching the pattern
// already used for a missing admin-uploaded logo in LogoUploadField.tsx)
// covers a real, permanent failure without ever looking broken.
export default function CategoryThumb({ src, alt }: { src: string; alt: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="text-2xl opacity-40">🖼️</span>;
  }

  return (
    <Image
      key={attempt}
      src={src}
      alt={alt}
      fill
      sizes="84px"
      className="object-cover"
      loading="eager"
      onError={() => {
        if (attempt === 0) {
          setAttempt(1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
