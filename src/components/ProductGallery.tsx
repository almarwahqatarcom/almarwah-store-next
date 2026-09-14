"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductGallery({
  images,
  alt,
  badge,
}: {
  images: string[];
  alt: string;
  badge?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const shown = images.length > 0 ? images : [undefined];

  return (
    <div>
      <div className="group bg-white border border-am-border rounded-3xl aspect-square flex items-center justify-center shadow-[0_10px_34px_rgba(26,41,66,0.07)] relative overflow-hidden">
        {shown[active] && (
          <Image
            key={active}
            src={shown[active]}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain p-10 transition-transform duration-500 group-hover:scale-[1.04]"
            priority={active === 0}
          />
        )}
        {badge && <div className="absolute top-4 left-4">{badge}</div>}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2.5 mt-4 overflow-x-auto pb-1 am-scrollbar-none">
          {images.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setActive(i)}
              className={`shrink-0 w-16 h-16 rounded-xl border-2 bg-white flex items-center justify-center relative overflow-hidden transition-colors ${
                active === i ? "border-am-primary" : "border-am-border hover:border-am-primary-light"
              }`}
              aria-label={`View image ${i + 1}`}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-contain p-1.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
