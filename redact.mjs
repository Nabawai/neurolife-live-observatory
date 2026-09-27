const KEY_RE = /(secret|token|password|passwd|authorization|cookie|private[_-]?key|hmac|credential|session)/i;
const NLB_RE = /NLB-[A-Za-z0-9_-]+/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?20|0)?1[0125]\d{8}(?!\d)/g;

export function redactString(value = "") {
  return String(value)
    .replace(NLB_RE, "NLB-[REDACTED]")
    .replace(EMAIL_RE, "[EMAIL-REDACTED]")
    .replace(PHONE_RE, "[PHONE-REDACTED]");
}

export function safeUrl(raw = "") {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return redactString(raw).split("?")[0];
  }
}

export function redactObject(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) return value.map(v => redactObject(v, seen));

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (KEY_RE.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactObject(v, seen);
    }
  }
  return out;
}
