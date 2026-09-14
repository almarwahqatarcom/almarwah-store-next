// Privacy-masks a customer's full name for public display (e.g. product
// reviews) — "Rabii Souai" -> "Ra*** So***". Keeps up to the first 2
// characters of each word and masks the rest, so a name is recognizable
// enough to feel personal without actually identifying the reviewer to
// other visitors. Works on any number of words; a single-letter word (or
// initial) is left as-is rather than masked into nothing.
export function maskCustomerName(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 1) return word;
      const visible = Math.min(2, word.length - 1);
      return word.slice(0, visible) + "*".repeat(word.length - visible);
    })
    .join(" ");
}
