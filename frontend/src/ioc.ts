import { entityKey } from "./entityKey";
/**
 * IOC handling - defang/refang (#30).
 *
 * CTI reports defang indicators (hxxp://evil[.]com) to make them harmless
 * to click. In storage and in the exported STIX we always want the
 * canonical form: `refang` is applied automatically when any observable is
 * entered (store.ts) and when a third-party bundle is imported.
 */

const REFANG_RULES: [RegExp, string][] = [
  [/\[\.\]|\(\.\)|\{\.\}/g, "."],
  [/\[dot\]|\(dot\)|\{dot\}/gi, "."],
  [/\[@\]|\(@\)|\{@\}/g, "@"],
  [/\[at\]|\(at\)|\{at\}/gi, "@"],
  [/\[:\]/g, ":"],
  [/\[:\/\/\]/g, "://"],
  [/^hxxp(s?)/i, "http$1"],
  [/^fxp(s?)/i, "ftp$1"],
  [/^meow(s?):\/\//i, "http$1://"],
];

/** Canonical form of a defanged IOC; no effect on an already sane value. */
export function refang(value: string): string {
  let out = value.trim();
  for (const [pattern, replacement] of REFANG_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

/* -- type detection (#31: smart paste) --------------------------------------- */

export interface DetectedIoc {
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

const HASH_ALGOS: Record<number, string> = { 32: "MD5", 40: "SHA-1", 64: "SHA-256" };

function isIpv4(token: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/\d{1,2})?$/.exec(token);
  return m !== null && [m[1], m[2], m[3], m[4]].every((o) => Number(o) <= 255);
}

const HEXTET_RE = /^[0-9a-f]{1,4}$/i;

/**
 * Valid IPv6, either full form (8 groups) or compressed (a single "::").
 *
 * Requiring one of those two forms is what keeps us from swallowing the
 * clock times in reports: "18:34:43" has three groups and no compression,
 * so it is not an address. A lax regex (2 to 7 groups) took them all.
 */
function isIpv6(token: string): boolean {
  const m = /^([^/]+)(?:\/(\d{1,3}))?$/.exec(token);
  if (m === null) return false;
  const [, address, prefix] = m;
  if (prefix !== undefined && Number(prefix) > 128) return false;
  if (!address.includes(":")) return false;

  if (address.split("::").length > 2) return false; // "::" appears only once

  // IPv4 embedded at the end of the address ("::ffff:192.0.2.1") is worth two
  // groups: we swap it for two hextets so only ":" has to be reasoned about
  const embedded = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(address);
  let normalized = address;
  if (embedded !== null) {
    if (!isIpv4(embedded[1])) return false;
    normalized = address.slice(0, -embedded[1].length) + "0:0";
  }

  const parts = normalized.split("::");
  const groups = (part: string) => (part === "" ? [] : part.split(":"));
  if (parts.length === 2) {
    const left = groups(parts[0]);
    const right = groups(parts[1]);
    if (![...left, ...right].every((g) => HEXTET_RE.test(g))) return false;
    // at least one group must be left to elide, otherwise "::" is one too many
    return left.length + right.length <= 7;
  }
  const all = groups(parts[0]);
  return all.length === 8 && all.every((g) => HEXTET_RE.test(g));
}

/** Classifies an already refanged token; null if not recognized. */
export function detectIoc(token: string): DetectedIoc | null {
  const t = token.trim().replace(/[,;]$/, "");
  if (!t) return null;
  if (/^(https?|ftp):\/\/\S+$/i.test(t)) {
    return { stix_type: "url", name: t, properties: {} };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return { stix_type: "email-addr", name: t, properties: {} };
  }
  if (isIpv4(t)) {
    return { stix_type: "ipv4-addr", name: t, properties: {} };
  }
  if (isIpv6(t)) {
    return { stix_type: "ipv6-addr", name: t, properties: {} };
  }
  const algo = HASH_ALGOS[t.length];
  if (algo && /^[a-f0-9]+$/i.test(t)) {
    return {
      stix_type: "file",
      name: t.toLowerCase(),
      properties: { hashes: { [algo]: t.toLowerCase() } },
    };
  }
  const asn = /^AS(\d+)$/i.exec(t);
  if (asn) {
    return {
      stix_type: "autonomous-system",
      name: t.toUpperCase(),
      properties: { number: Number(asn[1]) },
    };
  }
  if (/^([a-z0-9_][a-z0-9_-]*\.)+[a-z]{2,}$/i.test(t)) {
    return { stix_type: "domain-name", name: t, properties: {} };
  }
  return null;
}

/* -- input validation (#130) ------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  "ipv4-addr": "an IPv4 address",
  "ipv6-addr": "an IPv6 address",
  "domain-name": "a domain name",
  url: "a URL",
  "email-addr": "an email address",
  file: "a file",
  "autonomous-system": "an AS",
};

const VALUE_CHECKS: Record<string, (v: string) => boolean> = {
  "ipv4-addr": isIpv4,
  "ipv6-addr": isIpv6,
  "domain-name": (v) => /^([a-z0-9_][a-z0-9_-]*\.)+[a-z]{2,}$/i.test(v),
  url: (v) => /^(https?|ftp):\/\/\S+$/i.test(v),
  "email-addr": (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
};

/**
 * Format warning on an observable value - never blocking, the tool stays
 * tolerant on principle (an exotic IOC must still be able to get in).
 * null if the value is plausible or if the type has no checkable format.
 */
export function valueWarning(stixType: string, rawValue: string): string | null {
  const value = refang(rawValue.trim());
  if (!value) return null;
  if (stixType === "vulnerability") {
    // free-form name accepted; we only flag a visibly malformed CVE
    return /^cve/i.test(value) && !/^CVE-\d{4}-\d{4,}$/i.test(value)
      ? "malformed CVE identifier (expected: CVE-2024-3094)"
      : null;
  }
  const check = VALUE_CHECKS[stixType];
  if (!check || check(value)) return null;
  const detected = detectIoc(value);
  if (detected && detected.stix_type !== stixType && TYPE_LABELS[detected.stix_type]) {
    return `this value looks more like ${TYPE_LABELS[detected.stix_type]}`;
  }
  return `does not look like ${TYPE_LABELS[stixType]}`;
}

const HASH_LENGTHS: Record<string, number> = { MD5: 32, "SHA-1": 40, "SHA-256": 64 };

/** Warning on a hash (length + hexadecimal); null if plausible. */
export function hashWarning(algo: "MD5" | "SHA-1" | "SHA-256", rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (!/^[a-f0-9]+$/i.test(value)) return `${algo}: non-hexadecimal characters`;
  if (value.length !== HASH_LENGTHS[algo]) {
    return `${algo}: ${value.length} characters instead of ${HASH_LENGTHS[algo]}`;
  }
  return null;
}

/** Warning on a MITRE ATT&CK ID (T1566, T1566.001, TA0001…). */
export function mitreIdWarning(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  return /^TA?\d{4}(\.\d{3})?$/i.test(value)
    ? null
    : "unexpected format (e.g. T1566, T1566.001, TA0001)";
}

interface DetectionResult {
  iocs: DetectedIoc[];
  unrecognized: string[];
}

/** Splits pasted text, refangs each token, classifies, deduplicates. */
export function detectIocs(text: string): DetectionResult {
  const iocs: DetectedIoc[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    if (!raw) continue;
    const token = refang(raw);
    const detected = detectIoc(token);
    if (detected === null) {
      unrecognized.push(token);
      continue;
    }
    // same key as everywhere else: pasting "EVIL.example" then
    // "evil.example" in one block must not yield two IOCs
    const key = entityKey(detected);
    if (seen.has(key)) continue;
    seen.add(key);
    iocs.push(detected);
  }
  return { iocs, unrecognized };
}
