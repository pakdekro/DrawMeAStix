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
  if (!tpl.name) problems.push("missing name");
  const byKey = new Map<string, TemplateSlot>();
  for (const slot of tpl.slots ?? []) {
    if (byKey.has(slot.key)) problems.push(`slot en double : ${slot.key}`);
    byKey.set(slot.key, slot);
    if (!SDO_TYPES.has(slot.type) && !SCO_TYPES.has(slot.type)) {
      problems.push(`slot ${slot.key}: unknown type "${slot.type}"`);
    }
  }
  if (byKey.size === 0) problems.push("no slot");
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
  /** unique in the plan: one entity per filled line of a slot */
  key: string;
  /** the slot the line came from, shared by every line of that slot */
  slotKey: string;
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

/** A relation of the template that was NOT drawn, and why. */
export interface UnpairedRelation {
  rel: string;
  /** slot labels, ready to be shown */
  from: string;
  to: string;
}

export interface TemplatePlan {
  entities: PlannedEntity[];
  relations: { fromKey: string; rel: string; toKey: string }[];
  unpaired: UnpairedRelation[];
}

/**
 * What the analyst typed into one slot: a single line, or several (#6).
 * A bare string is still accepted, so a caller that knows nothing of
 * multi-line slots keeps working.
 */
export type SlotValues = Record<string, string | string[]>;

/** Lines of a slot, in order and WITHOUT filtering: the hash of line n has to stay on line n. */
function linesOf(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Builds the creation plan: filled (or `fixed`) slots → entities carrying the
 * scenario labels (SDO only, SCOs have no labels in 2.1), plus the relations
 * whose two ends both exist.
 *
 * A slot holding several lines produces one entity per line, and the relations
 * of the template fan out over them: three C2 addresses under one malware give
 * three `communicates-with`. What is NOT produced is the cartesian product of
 * two multi-line slots - two domains and three addresses do not tell anyone
 * which one resolves to which, and the six relations that would come out of it
 * are five lies and a truth. Those relations are reported in `unpaired` so the
 * analyst hears about it before generating, in the spirit of #82.
 */
export function buildPlan(
  tpl: ScenarioTemplate,
  values: SlotValues,
  hashes: SlotValues = {},
): TemplatePlan {
  const entities: PlannedEntity[] = [];
  const bySlot = new Map<string, PlannedEntity[]>();

  for (const slot of tpl.slots) {
    const lines = slot.fixed !== undefined ? [slot.fixed] : linesOf(values[slot.key]);
    const hashLines = linesOf(hashes[slot.key]);
    const rows: PlannedEntity[] = [];
    const seen = new Set<string>();
    lines.forEach((line, i) => {
      const name = line.trim();
      // a name typed twice in the same slot is one object: same deterministic
      // id, so two nodes on the canvas for a single object in the bundle
      if (!name || seen.has(name)) return;
      seen.add(name);
      const properties: Record<string, unknown> = { ...(slot.prefill ?? {}) };
      if (tpl.labels?.length && SDO_TYPES.has(slot.type)) {
        properties.labels = tpl.labels;
      }
      if (slot.type === "file") {
        properties.file_name = name;
        const hash = (hashLines[i] ?? "").trim();
        if (hash) properties.hashes = { "SHA-256": hash };
      }
      rows.push({
        key: `${slot.key}#${i}`,
        slotKey: slot.key,
        stix_type: slot.type,
        name,
        properties,
      });
    });
    if (rows.length > 0) bySlot.set(slot.key, rows);
    entities.push(...rows);
  }

  const labelOf = (key: string) => tpl.slots.find((s) => s.key === key)?.label ?? key;
  const relations: { fromKey: string; rel: string; toKey: string }[] = [];
  const unpaired: UnpairedRelation[] = [];
  for (const rel of tpl.relations) {
    const from = bySlot.get(rel.from) ?? [];
    const to = bySlot.get(rel.to) ?? [];
    if (from.length === 0 || to.length === 0) continue;
    if (from.length > 1 && to.length > 1) {
      unpaired.push({ rel: rel.rel, from: labelOf(rel.from), to: labelOf(rel.to) });
      continue;
    }
    for (const f of from) {
      for (const t of to) relations.push({ fromKey: f.key, rel: rel.rel, toKey: t.key });
    }
  }

  return { entities, relations, unpaired };
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

  const present = new Set(plan.entities.map((e) => e.slotKey));
  const isolatedKeys = new Set(isolated.map((e) => e.slotKey));
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

