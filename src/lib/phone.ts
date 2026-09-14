// Qatar mobile numbers are 8 digits (starting 3/5/6/7). Customers naturally
// type them without the country code — e.g. "66793776" — but the backend's
// own validators require the full international form ("+97466793776"), and
// WhatsApp delivery (Evolution API's JID) needs the country code too or the
// message silently never arrives. This normalizes the common ways people
// type a Qatari number into what both actually need, so nobody has to
// remember to type "+974" themselves.
export function normalizeQatarPhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // Already starts with "+" — assume a full international number was typed;
  // just drop stray spaces/dashes inside it.
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/[^0-9]/g, "");
  }

  const digits = trimmed.replace(/[^0-9]/g, "");

  // "00974..." international-dialing prefix -> "+974..."
  if (digits.startsWith("00974")) {
    return "+" + digits.slice(2);
  }

  // Country code typed without a leading "+" (e.g. "97466793776")
  if (digits.startsWith("974") && digits.length > 8) {
    return "+" + digits;
  }

  // Bare local number (Qatar mobiles are 8 digits) -> prepend +974
  if (digits.length === 8) {
    return "+974" + digits;
  }

  // Anything else — pass the digits through unchanged and let the backend's
  // own validation explain what's wrong, rather than guessing further.
  return digits || trimmed;
}
