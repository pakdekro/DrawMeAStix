/**
 * Investigation lint (#33): non-blocking diagnostic before export -
 * "here is what would make your bundle cleaner". Deterministic rules on
 * the local state, none of them stops an export (except those the builder
 * will block anyway, surfaced here beforehand).
 */

import { DEFAULT_ACCOUNT_NAME_PROPERTY } from "./entityFields";
import { SCO_TYPES } from "./stix/relationships";
import { entityKey } from "./entityKey";
import type { InvestigationState } from "./stix/types";

export interface LintFinding {
  level: "warn" | "info";
  message: string;
  /** local id of the entity concerned, when applicable */
  entityId?: string;
}

export function lintInvestigation(state: InvestigationState): LintFinding[] {
  const findings: LintFinding[] = [];
  const confirmed = state.entities.filter((e) => e.status === "confirmed");
  const candidates = state.entities.filter((e) => e.status === "candidate");
  const confirmedIds = new Set(confirmed.map((e) => e.id));

  const degree = new Map<string, number>();
  for (const rel of state.relationships) {
    degree.set(rel.source_id, (degree.get(rel.source_id) ?? 0) + 1);
    degree.set(rel.target_id, (degree.get(rel.target_id) ?? 0) + 1);
  }

  // candidates left in the triage tray: not exported
  if (candidates.length > 0) {
    findings.push({
      level: "info",
      message: `${candidates.length} candidate(s) still in the triage tray - they will not be exported`,
    });
  }

  // relationships with a candidate endpoint: skipped on export
  const dropped = state.relationships.filter(
    (r) => !confirmedIds.has(r.source_id) || !confirmedIds.has(r.target_id),
  ).length;
  if (dropped > 0) {
    findings.push({
      level: "warn",
      message: `${dropped} relationship(s) touch a candidate entity and will be skipped on export`,
    });
  }

  // provenance: entities that came in "already confirmed" from an imported
  // bundle, so without passing through the triage tray. Reminder before pushing
  // to the TIP (guard against a third-party bundle forging our layout extension).
  const importedConfirmed = confirmed.filter((e) => e.imported).length;
  if (importedConfirmed > 0) {
    findings.push({
      level: "warn",
      message: `${importedConfirmed} imported entity/entities already confirmed without triage - check their provenance before exporting`,
    });
  }

  const namesSeen = new Map<string, string>();
  for (const entity of confirmed) {
    const props = JSON.parse(entity.properties) as Record<string, unknown>;
    const label = `${entity.stix_type} "${entity.name}"`;

    // likely duplicate: same type + same name
    const dupKey = entityKey(entity);
    if (namesSeen.has(dupKey)) {
      findings.push({
        level: "warn",
        message: `likely duplicate: two ${entity.stix_type} named "${entity.name}"`,
        entityId: entity.id,
      });
    }
    namesSeen.set(dupKey, entity.id);

    // isolated entity (the container will reference it, but no analysis link)
    if ((degree.get(entity.id) ?? 0) === 0) {
      findings.push({
        level: "info",
        message: `${label}: isolated, no relationship in the graph`,
        entityId: entity.id,
      });
    }

    if (entity.stix_type === "location") {
      // The spec requires at least ONE of these three forms. `city` and
      // `administrative_area` narrow the place down without satisfying it.
      // The builder now refuses to invent a region from the name: better to
      // say so here, before the export blocks.
      const has = (k: string) => props[k] !== undefined && props[k] !== null && props[k] !== "";
      const situe = has("country") || has("region") || (has("latitude") && has("longitude"));
      if (!situe) {
        findings.push({
          level: "warn",
          message: `${label}: no country, region or coordinates - the export will be blocked`,
          entityId: entity.id,
        });
      }
    }

    if (entity.stix_type === "indicator") {
      const pattern = ((props.pattern as string | undefined) ?? "").trim();
      if (!pattern) {
        findings.push({
          level: "warn",
          message: `${label}: missing pattern - the export will be blocked`,
          entityId: entity.id,
        });
      }
      const hasBasedOn = state.relationships.some(
        (r) => r.source_id === entity.id && r.rel_type === "based-on",
      );
      if (!hasBasedOn) {
        findings.push({
          level: "info",
          message: `${label}: no based-on towards the source observable`,
          entityId: entity.id,
        });
      }
    }

    if (entity.stix_type === "user-account") {
      // The name can be the display name, and a display name identifies
      // nobody: the builder refuses, so say it here first.
      const nameIs = props.account_name_is ?? DEFAULT_ACCOUNT_NAME_PROPERTY;
      const filled = (k: string) => props[k] !== undefined && props[k] !== null && props[k] !== "";
      if (nameIs === "display_name" && !filled("account_login") && !filled("user_id")) {
        findings.push({
          level: "warn",
          message: `${label}: a display name identifies no account - the export will be blocked`,
          entityId: entity.id,
        });
      }
    }

    if (entity.stix_type === "file") {
      const hashes = (props.hashes as Record<string, string> | undefined) ?? {};
      if (Object.keys(hashes).length === 0) {
        findings.push({
          level: "warn",
          message: `${label}: no hash - weak identification and deduplication`,
          entityId: entity.id,
        });
      }
    }

    if (entity.stix_type === "attack-pattern" && !props.x_mitre_id) {
      findings.push({
        level: "info",
        message: `${label}: no MITRE ID - deduplication on the name only at import`,
        entityId: entity.id,
      });
    }

    // an observable with no indicator or infrastructure: raw fact, no signal
    if (SCO_TYPES.has(entity.stix_type)) {
      const covered = state.relationships.some(
        (r) =>
          r.target_id === entity.id &&
          (r.rel_type === "based-on" || r.rel_type === "consists-of"),
      );
      if (!covered && (degree.get(entity.id) ?? 0) > 0) {
        findings.push({
          level: "info",
          message: `${label}: no indicator (based-on) covers it`,
          entityId: entity.id,
        });
      }
    }
  }

  // inconsistent activity windows (#170): an end before a start ships as is
  // in the bundle, no platform will catch it downstream
  for (const rel of state.relationships) {
    if (isReversed(rel.start_time, rel.stop_time)) {
      findings.push({
        level: "warn",
        message: `relationship "${rel.rel_type}": activity end before its start`,
      });
    }
  }
  for (const entity of confirmed) {
    const props = JSON.parse(entity.properties) as Record<string, unknown>;
    if (isReversed(props.first_seen, props.last_seen)) {
      findings.push({
        level: "warn",
        message: `${entity.stix_type} "${entity.name}": last_seen earlier than first_seen`,
        entityId: entity.id,
      });
    }
    // `valid_from` is compared on its EFFECTIVE value, not the entered one:
    // the builder falls back on the creation date when the analyst left it
    // empty (#170). A lone `valid_until`, earlier than that creation date,
    // therefore produced a reversed window this check never saw - it needed
    // both dates entered before it would fire.
    const effectiveValidFrom =
      typeof props.valid_from === "string" && props.valid_from.trim() !== ""
        ? props.valid_from
        : entity.created_at;
    if (isReversed(effectiveValidFrom, props.valid_until)) {
      findings.push({
        level: "warn",
        message:
          `${entity.stix_type} "${entity.name}": valid_until earlier than valid_from` +
          (props.valid_from ? "" : " (unset, so the creation date is used)"),
        entityId: entity.id,
      });
    }
  }

  return findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1));
}

/** true if both dates are usable AND out of order. */
function isReversed(from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string" || !from || !to) return false;
  const a = Date.parse(from);
  const b = Date.parse(to);
  return !Number.isNaN(a) && !Number.isNaN(b) && b < a;
}
