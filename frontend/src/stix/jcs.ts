/**
 * RFC 8785 (JCS) JSON canonicalisation - the equivalent of
 * stix2.canonicalization.Canonicalize on the Python side.
 *
 * In JavaScript the implementation is short because the JCS requirements are
 * modelled on ECMAScript: JSON.stringify already produces the normative
 * string escaping, and number serialisation is the ES one
 * (`Number::toString`). All that is left is sorting keys by UTF-16 code
 * units (String's default comparison) and rejecting values that cannot be
 * represented.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("JCS: NaN/Infinity cannot be represented in JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const members = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
    return `{${members.join(",")}}`;
  }
  throw new Error(`JCS: non-serialisable type (${typeof value})`);
}
