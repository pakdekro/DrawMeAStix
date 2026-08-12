/**
 * Export guardrail: validation of the bundle against the official OASIS
 * JSON schemas (oasis-open/cti-stix2-json-schemas, STIX 2.1) - replaces
 * the backend's stix2 re-parse. The validators are PRECOMPILED at build
 * time (scripts/build-validators.mjs, #77): the production CSP forbids
 * `unsafe-eval`, so no ajv compilation may happen at runtime. The
 * generated module is loaded on demand to keep the initial bundle light.
 */

import type { StixObject } from "./bundle";

let validatorsPromise: Promise<typeof import("./generated/validators.mjs")> | null = null;

/**
 * Validates each object of the bundle against the schema for its type.
 * Returns the list of problems (empty when everything conforms); a type with
 * no vendored schema is reported as a problem like any other.
 */
export async function validateObjects(objects: StixObject[]): Promise<string[]> {
  const { validators } = await (validatorsPromise ??= import(
    "./generated/validators.mjs"
  ));
  const problems = new Set<string>();
  for (const obj of objects) {
    const validate = validators[obj.type];
    if (validate === undefined) {
      problems.add(`${obj.type} ${obj.id}: no vendored OASIS schema for this type`);
      continue;
    }
    if (!validate(obj)) {
      const label = (obj.name as string | undefined) ?? obj.id;
      for (const err of validate.errors ?? []) {
        problems.add(
          `${obj.type} "${label}"${err.instancePath ? ` ${err.instancePath}` : ""}: ${err.message ?? "invalid"}`,
        );
      }
    }
  }
  return [...problems];
}
