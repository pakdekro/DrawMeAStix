/**
 * STIX pattern generation (#32, #35): an observable → the matching
 * detection pattern, without typing the syntax. Used by the inspector's
 * "Generate an indicator" button and by the builder of the indicator
 * form.
 */

const escapeValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Preference order for a detection pattern: the strongest hash first. */
const HASH_DETECTION_ORDER = ["SHA-256", "SHA-1", "MD5"] as const;

/**
 * STIX pattern for a canvas observable (value = the entity name,
 * props = its properties). Returns null when the type is not covered.
 */
export function patternFromObservable(
  stixType: string,
  value: string,
  props: Record<string, unknown> = {},
): string | null {
  const v = value.trim();
  switch (stixType) {
    case "ipv4-addr":
    case "ipv6-addr":
    case "domain-name":
    case "url":
    case "email-addr":
      return `[${stixType}:value = '${escapeValue(v)}']`;
    case "autonomous-system": {
      const number =
        (props.number as number | undefined) ??
        ((/\d+/.exec(v)?.[0] && Number(/\d+/.exec(v)![0])) || undefined);
      return number === undefined ? null : `[autonomous-system:number = ${number}]`;
    }
    case "file": {
      const hashes = (props.hashes as Record<string, string> | undefined) ?? {};
      for (const algo of HASH_DETECTION_ORDER) {
        if (hashes[algo]) {
          return `[file:hashes.'${algo}' = '${escapeValue(hashes[algo])}']`;
        }
      }
      const first = Object.entries(hashes)[0];
      if (first) {
        return `[file:hashes.'${first[0]}' = '${escapeValue(first[1])}']`;
      }
      const name = (props.file_name as string | undefined) ?? v;
      return name ? `[file:name = '${escapeValue(name)}']` : null;
    }
    default:
      return null;
  }
}
