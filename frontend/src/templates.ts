/**
 * Scenario templates - "easy mode" (#28).
 *
 * A template is a declarative JSON file (never code): slots (fields the
 * analyst fills in - the empty ones are dropped), relations between slots,
 * default labels specific to the scenario and the usual ATT&CK techniques
 * (`fixed` slots). Applying one goes through the same API as manual entry:
 * same matrix validation, same deterministic IDs - a typing shortcut,
 * never a way around the rules.
 */

import { allowedRelationships, SCO_TYPES, SDO_TYPES } from "./stix/relationships";
import botnetDdos from "./templates/botnet-ddos.json";
import compteCompromis from "./templates/compte-compromis.json";
import cryptojacking from "./templates/cryptojacking.json";
import defacement from "./templates/defacement.json";
import espionnage from "./templates/espionnage-cible.json";
import exploitExpose from "./templates/exploit-service-expose.json";
import fauxInstalleur from "./templates/faux-installeur.json";
import fuiteExtorsion from "./templates/fuite-extorsion.json";
import infostealer from "./templates/infostealer.json";
import phishingCreds from "./templates/phishing-creds.json";
import phishingFovi from "./templates/phishing-fovi.json";
import ransomware from "./templates/ransomware.json";
import spamSeo from "./templates/spam-seo.json";
import supplyChain from "./templates/supply-chain.json";
import usurpationMarque from "./templates/usurpation-marque.json";
import wateringHole from "./templates/watering-hole.json";

interface TemplateSlot {
  key: string;
  type: string;
  label: string;
  placeholder?: string;
  /** file: offer a SHA-256 hash field alongside the name */
  hash?: boolean;
  /** default properties (is_family, identity_class, x_mitre_id…) */
  prefill?: Record<string, unknown>;
  /** forced value: the slot is created as is, with no input field */
  fixed?: string;
}

export interface ScenarioTemplate {
  name: string;
  description?: string;
  labels?: string[];
  slots: TemplateSlot[];
  relations: { from: string; rel: string; to: string }[];
}

export const BUILTIN_TEMPLATES: ScenarioTemplate[] = [
  ransomware,
  phishingCreds,
  phishingFovi,
  exploitExpose,
  supplyChain,
  infostealer,
  espionnage,
  wateringHole,
  fauxInstalleur,
  compteCompromis,
  fuiteExtorsion,
  botnetDdos,
  cryptojacking,
  defacement,
  usurpationMarque,
  spamSeo,
] as ScenarioTemplate[];

/**
 * Structural validation of a template (built-ins under test, home-made ones
 * at load time): known types, unique keys, relations the STIX matrix allows.
 * Returns the list of problems.
 */
export function validateTemplate(tpl: ScenarioTemplate): string[] {
  const problems: string[] = [];
  if (!tpl.name) problems.push("nom manquant");
  const byKey = new Map<string, TemplateSlot>();
  for (const slot of tpl.slots ?? []) {
    if (byKey.has(slot.key)) problems.push(`slot en double : ${slot.key}`);
    byKey.set(slot.key, slot);
    if (!SDO_TYPES.has(slot.type) && !SCO_TYPES.has(slot.type)) {
      problems.push(`slot ${slot.key} : type inconnu « ${slot.type} »`);
    }
  }
  if (byKey.size === 0) problems.push("aucun slot");
  for (const rel of tpl.relations ?? []) {
    const from = byKey.get(rel.from);
    const to = byKey.get(rel.to);
    if (!from || !to) {
      problems.push(`relationship ${rel.rel}: unknown slot (${rel.from} → ${rel.to})`);
      continue;
    }
    if (!allowedRelationships(from.type, to.type).includes(rel.rel)) {
      problems.push(
        `illegal relationship: ${from.type} -[${rel.rel}]-> ${to.type}`,
      );
    }
  }
  return problems;
}

interface PlannedEntity {
  key: string;
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface TemplatePlan {
  entities: PlannedEntity[];
  relations: { fromKey: string; rel: string; toKey: string }[];
}

/**
 * Builds the creation plan: filled (or `fixed`) slots → entities carrying the
 * scenario labels (SDO only, SCOs have no labels in 2.1), plus the relations
 * whose two ends both exist.
 */
export function buildPlan(
  tpl: ScenarioTemplate,
  values: Record<string, string>,
  hashes: Record<string, string> = {},
): TemplatePlan {
  const entities: PlannedEntity[] = [];
  const present = new Set<string>();

  for (const slot of tpl.slots) {
    const name = (slot.fixed ?? values[slot.key] ?? "").trim();
    if (!name) continue;
    const properties: Record<string, unknown> = { ...(slot.prefill ?? {}) };
    if (tpl.labels?.length && SDO_TYPES.has(slot.type)) {
      properties.labels = tpl.labels;
    }
    if (slot.type === "file") {
      properties.file_name = name;
      const hash = (hashes[slot.key] ?? "").trim();
      if (hash) properties.hashes = { "SHA-256": hash };
    }
    present.add(slot.key);
    entities.push({ key: slot.key, stix_type: slot.type, name, properties });
  }

  const relations = tpl.relations
    .filter((r) => present.has(r.from) && present.has(r.to))
    .map((r) => ({ fromKey: r.from, rel: r.rel, toKey: r.to }));

  return { entities, relations };
}

export interface PlanIsolation {
  /** entities of the plan that will have no relationship at all */
  isolated: PlannedEntity[];
  /** labels of the empty slots that, filled in, would link the isolated ones */
  connectors: string[];
}

/**
 * Isolation diagnosis (#82): when the "hub" slots (actor, kit…) are left
 * empty, part of the generated subgraph has no relationship. We do not make
 * up fallback links between observables (no clean STIX SRO for that, and
 * semantic noise in the TIP) - the analyst is warned BEFORE generating,
 * by naming the slots that would glue the graph back together.
 */
export function planIsolation(tpl: ScenarioTemplate, plan: TemplatePlan): PlanIsolation {
  const linked = new Set(plan.relations.flatMap((r) => [r.fromKey, r.toKey]));
  const isolated = plan.entities.filter((e) => !linked.has(e.key));
  if (isolated.length === 0) return { isolated, connectors: [] };

  const present = new Set(plan.entities.map((e) => e.key));
  const isolatedKeys = new Set(isolated.map((e) => e.key));
  const labelOf = (key: string) => tpl.slots.find((s) => s.key === key)?.label ?? key;
  const connectors = new Set<string>();
  for (const rel of tpl.relations) {
    const fromIn = present.has(rel.from);
    if (fromIn === present.has(rel.to)) continue; // linked, or both missing
    const [inKey, outKey] = fromIn ? [rel.from, rel.to] : [rel.to, rel.from];
    if (isolatedKeys.has(inKey)) connectors.add(labelOf(outKey));
  }
  return { isolated, connectors: [...connectors] };
}

/** Positions on a circle around a centre, to lay the subgraph out. */
export function circleLayout(
  count: number,
  center: { x: number; y: number },
  radius = 240,
): { x: number; y: number }[] {
  if (count === 1) return [center];
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}
