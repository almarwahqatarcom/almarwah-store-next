// Renders real fractional stars (e.g. 3.5 → 3 full, 1 half, 1 empty) rather
// than a single "★ 4.3" text glyph — used wherever a rating is shown on the
// product detail page.
export default function StarRating({ rating, size = 15 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[1px]" style={{ fontSize: size }} aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className="relative inline-block leading-none text-am-border" style={{ width: "1em" }}>
            ★
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden text-am-rating" style={{ width: `${fill * 100}%` }}>
                ★
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
