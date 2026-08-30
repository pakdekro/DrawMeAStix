/**
 * STIX pattern generation (#32, #35): an observable → the matching
 * detection pattern, without typing the syntax. Used by the inspector's
 * "Generate an indicator" button and by the builder of the indicator
 * form.
 */

import { ACCOUNT_NAME_PROPERTIES, DEFAULT_ACCOUNT_NAME_PROPERTY } from "./entityFields";
import { x509Identity } from "./stix/bundle";

const escapeValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Preference order for a detection pattern: the strongest hash first. */
const HASH_DETECTION_ORDER = ["SHA-256", "SHA-1", "MD5"] as const;

/**
 * STIX pattern for a canvas observable (value = the entity name,
 * props = its properties). Returns null when the type is not covered.
 */
/** `type:hashes.'ALGO' = '…'` on the strongest hash available, or null. */
function hashPattern(stixType: string, hashes: Record<string, string>): string | null {
  const algo =
    HASH_DETECTION_ORDER.find((a) => hashes[a]) ?? Object.keys(hashes).find((a) => hashes[a]);
  return algo === undefined
    ? null
    : `[${stixType}:hashes.'${algo}' = '${escapeValue(hashes[algo])}']`;
}

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
      const byHash = hashPattern("file", hashes);
      if (byHash !== null) return byHash;
      const name = (props.file_name as string | undefined) ?? v;
      return name ? `[file:name = '${escapeValue(name)}']` : null;
    }
    // The observable is lowercased the way the builder does it, otherwise the
    // pattern would look for a form the exported object never takes.
    case "mac-addr":
      return v ? `[mac-addr:value = '${escapeValue(v.toLowerCase())}']` : null;
    case "mutex":
      return v ? `[mutex:name = '${escapeValue(v)}']` : null;
    case "directory":
      return v ? `[directory:path = '${escapeValue(v)}']` : null;
    case "software": {
      // A CPE names one version of one product; the name alone matches a whole
      // product line, which is a far wider net. The narrower one first.
      const cpe = (props.cpe as string | undefined)?.trim();
      if (cpe) return `[software:cpe = '${escapeValue(cpe)}']`;
      return v ? `[software:name = '${escapeValue(v)}']` : null;
    }
    case "user-account": {
      // Read through the same choice as the builder: an account whose name is
      // an IBAN exports as a `user_id`, and a pattern on `account_login` would
      // detect an account that the bundle does not describe.
      const nameIs = ACCOUNT_NAME_PROPERTIES.some((o) => o.value === props.account_name_is)
        ? (props.account_name_is as string)
        : DEFAULT_ACCOUNT_NAME_PROPERTY;
      const userId = (props.user_id as string | undefined)?.trim();
      if (v && nameIs !== "display_name") {
        return `[user-account:${nameIs} = '${escapeValue(v)}']`;
      }
      return userId ? `[user-account:user_id = '${escapeValue(userId)}']` : null;
    }
    case "x509-certificate": {
      // Read through the same resolver as the builder: a node named after its
      // fingerprint must not come out as a pattern on a serial number that the
      // exported certificate does not carry.
      const { hashes, serial } = x509Identity(v, props);
      const byHash = hashPattern("x509-certificate", hashes as Record<string, string>);
      if (byHash !== null) return byHash;
      return serial === null
        ? null
        : `[x509-certificate:serial_number = '${escapeValue(serial)}']`;
    }
    default:
      return null;
  }
}
