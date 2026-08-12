/**
 * Document extraction (#13): long text → candidates for the triage tray.
 * 100% deterministic - refanged tokens + regex + embedded ATT&CK
 * dictionary, never an LLM (a founding choice of the project).
 *
 * Differences with the IOC paste (ioc.ts, #31): here we sweep PROSE,
 * not a list. Two guardrails are added:
 * - a domain is kept only if its TLD is plausible (otherwise
 *   "report.docx" or "setup.exe" would turn into domains);
 * - ATT&CK names and aliases only match whole words, and from
 *   4 characters up (short aliases otherwise spray false positives).
 * The triage tray stays the final net: anything can be rejected in one click.
 */

import type { AttackEntry } from "./attack";
import { entryToCreation } from "./attack";
import { detectIoc, refang } from "./ioc";
import { entityKey } from "./entityKey";

export interface ExtractedCandidate {
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
  /** text around the hit, so triage is done knowing what was said */
  context: string;
  /** offset of the first hit in the text (→ PDF page number) */
  offset: number;
}

/* -- TLD guardrail (prose mode) -------------------------------------------- */

// Plausible TLDs of 3 characters or more: historical gTLDs + the most common
// new gTLDs (including the favourites of malicious campaigns). Two-letter
// TLDs (ccTLD) and punycode (xn--) are always accepted. The list is kept
// deliberately short: an exotic TLD can still be pasted through "Paste
// IOCs", which does not apply this filter.
const COMMON_TLDS = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "info", "biz", "name",
  "pro", "mobi", "asia", "tel", "xxx", "aero", "coop", "jobs", "travel",
  "app", "dev", "cloud", "online", "site", "website", "store", "shop",
  "tech", "xyz", "top", "club", "vip", "live", "life", "world", "today",
  "news", "media", "email", "group", "zone", "team", "work", "agency",
  "digital", "network", "systems", "solutions", "services", "tools",
  "center", "expert", "plus", "one", "run", "space", "fun", "icu",
  "monster", "buzz", "cyou", "rest", "support", "host", "hosting", "press",
  "page", "link", "click", "download", "stream", "cam", "cash", "money",
  "finance", "bank", "insurance", "legal", "social", "chat", "video",
  "games", "wiki", "help", "win", "bid", "date", "faith", "review",
  "science", "party", "trade", "webcam", "racing", "accountant", "loan",
  "men", "quest", "sbs", "mom", "lol", "pics", "skin", "beauty", "hair",
  "makeup", "autos", "boats", "best", "bond", "cfd", "surf", "guru",
  "ninja", "rocks", "codes", "capital", "exchange", "market",
]);

function plausibleDomain(name: string): boolean {
  const tld = name.split(".").pop()!.toLowerCase();
  return tld.length === 2 || tld.startsWith("xn--") || COMMON_TLDS.has(tld);
}

/* -- context --------------------------------------------------------------- */

const CONTEXT_WINDOW = 90;

/** Slice of sentence around [start, end), clipped to the line. */
export function contextAt(text: string, start: number, end: number): string {
  let from = Math.max(0, start - CONTEXT_WINDOW);
  let to = Math.min(text.length, end + CONTEXT_WINDOW);
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1));
  if (lineStart >= from) from = lineStart + 1;
  const lineEnd = text.indexOf("\n", end);
  if (lineEnd !== -1 && lineEnd < to) to = lineEnd;
  const prefix = from > lineStart + 1 ? "…" : "";
  const suffix = to < (lineEnd === -1 ? text.length : lineEnd) ? "…" : "";
  return prefix + text.slice(from, to).trim() + suffix;
}

/* -- sweep ----------------------------------------------------------------- */

// a "token": a run of non-blank characters, quotes and angle brackets
// excluded (square brackets stay - they carry the defang "evil[.]com")
const TOKEN_RE = /[^\s"'«»‘’“”<>|]+/g;

// prose punctuation to strip from head/tail of a token - NOT the brackets
const TRIM_LEADING = /^[.,;:!?…()]+/;
const TRIM_TRAILING = /[.,;:!?…()]+$/;

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;
const TID_RE = /^T\d{4}(?:\.\d{3})?$/i;

interface Sighting {
  candidate: ExtractedCandidate;
  key: string;
}

function classifyToken(
  token: string,
  attackById: Map<string, AttackEntry>,
): Omit<ExtractedCandidate, "context" | "offset"> | null {
  if (CVE_RE.test(token)) {
    return { stix_type: "vulnerability", name: token.toUpperCase(), properties: {} };
  }
  if (TID_RE.test(token)) {
    // T-id quoted in the text: only if it exists in the embedded dictionary
    // (an invented "T1234" must not create a phantom technique)
    const entry = attackById.get(token.toUpperCase());
    return entry ? entryToCreation(entry) : null;
  }
  const detected = detectIoc(token);
  if (detected === null) return null;
  if (detected.stix_type === "domain-name") {
    if (!plausibleDomain(detected.name)) return null;
    return { ...detected, name: detected.name.toLowerCase() };
  }
  return detected;
}

/* -- ATT&CK dictionary ----------------------------------------------------- */

const ATTACK_MIN_TERM = 4;

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}_-]/u.test(c);
}

/** First whole-word hit of `term` (already lowercased) inside `lower`. */
function findWholeWord(lower: string, term: string): number {
  let idx = lower.indexOf(term);
  while (idx !== -1) {
    if (!isWordChar(lower[idx - 1]) && !isWordChar(lower[idx + term.length])) {
      return idx;
    }
    idx = lower.indexOf(term, idx + 1);
  }
  return -1;
}

/* -- entry point ----------------------------------------------------------- */

/**
 * Sweeps a long text and returns deduplicated candidates, each with its
 * context excerpt. `attack`: entries of the embedded dataset (empty = no
 * dictionary matching and no T-id resolution).
 */
export function extractFromText(
  text: string,
  attack: AttackEntry[] = [],
): ExtractedCandidate[] {
  const attackById = new Map(attack.map((e) => [e.id.toUpperCase(), e]));
  const sightings: Sighting[] = [];
  const seen = new Set<string>();

  const push = (s: Sighting) => {
    if (seen.has(s.key)) return;
    seen.add(s.key);
    sightings.push(s);
  };

  // 1) tokens: IOCs (refanged), CVEs, T-ids
  for (const m of text.matchAll(TOKEN_RE)) {
    const trimmed = m[0].replace(TRIM_LEADING, "").replace(TRIM_TRAILING, "");
    if (trimmed.length < 4) continue;
    const token = refang(trimmed);
    const classified = classifyToken(token, attackById);
    if (classified === null) continue;
    const leading = TRIM_LEADING.exec(m[0])?.[0].length ?? 0;
    const start = m.index + leading;
    push({
      key: entityKey(classified),
      candidate: {
        ...classified,
        context: contextAt(text, start, start + trimmed.length),
        offset: start,
      },
    });
  }

  // 2) ATT&CK dictionary: names and aliases, whole word (4 characters min)
  const lower = text.toLowerCase();
  for (const entry of attack) {
    const terms = [entry.name, ...(entry.aliases ?? [])]
      .filter((t) => t.length >= ATTACK_MIN_TERM)
      .map((t) => t.toLowerCase());
    for (const term of terms) {
      const idx = findWholeWord(lower, term);
      if (idx === -1) continue;
      const creation = entryToCreation(entry);
      push({
        key: entityKey(creation),
        candidate: { ...creation, context: contextAt(text, idx, idx + term.length), offset: idx },
      });
      break; // one hit is enough, the entry is deduplicated by key
    }
  }

  return sightings.map((s) => s.candidate);
}
