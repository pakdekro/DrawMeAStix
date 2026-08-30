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

import { entityKey } from "./entityKey";
import { allowedRelationships, SCO_TYPES, SDO_TYPES } from "./stix/relationships";
import botnetDdos from "./templates/botnet-ddos.json";
import compteCompromis from "./templates/compte-compromis.json";
import cryptojacking from "./templates/cryptojacking.json";
import defacement from "./templates/defacement.json";
import fraudAccountTakeover from "./templates/fraud-account-takeover.json";
import fraudCard from "./templates/fraud-card.json";
import fraudCrypto from "./templates/fraud-crypto-cashout.json";
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

/**
 * What kind of case the scenario describes.
 *
 * Two families rather than a tag: an intrusion and a fraud are read by
 * different people at different moments, and a list that mixes them makes the
 * reader filter with their eyes. Absent means intrusion, which is what every
 * scenario was before there were any others.
 */
export type TemplateFamily = "intrusion" | "fraud";

export interface ScenarioTemplate {
  name: string;
  family?: TemplateFamily;
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
  fraudAccountTakeover,
  fraudCard,
  fraudCrypto,
] as ScenarioTemplate[];

/** The families, in reading order, with the heading each one carries. */
export const TEMPLATE_FAMILIES: { id: TemplateFamily; label: string }[] = [
  { id: "intrusion", label: "Scenarios" },
  { id: "fraud", label: "Fraud" },
];

/** The scenarios of one family, in the order they were declared. */
export function templatesOfFamily(family: TemplateFamily): ScenarioTemplate[] {
  return BUILTIN_TEMPLATES.filter((t) => (t.family ?? "intrusion") === family);
}

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


/* -- applying a scenario on top of what is already drawn --------------------- */

/** An entity already on the canvas, as much of it as the merge needs. */
export interface CanvasEntity {
  id: string;
  stix_type: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface PlanMerge {
  /** planned entities with nothing to attach to: they have to be created */
  create: PlannedEntity[];
  /** planned entities that ARE something already drawn */
  reuse: { key: string; id: string; addLabels: string[] }[];
}

/**
 * What a scenario becomes when the canvas is not empty (#28 meets #168).
 *
 * Two scenarios that name the same actor are describing one actor. Creating a
 * second card for it would not be a second object either: both collapse onto
 * one STIX identity at export, so the twin's description is the one that
 * quietly loses. The same rule as the document import and the enrichment,
 * for the same reason - the convergence IS the information.
 *
 * Labels are the one thing that merges into an existing object, because they
 * say which scenarios it belongs to and an actor in two cases belongs to both.
 * Nothing else the analyst may have edited is touched.
 */
export function planAgainstCanvas(plan: TemplatePlan, canvas: CanvasEntity[]): PlanMerge {
  const known = new Map(canvas.map((e) => [entityKey(e), e]));
  const merge: PlanMerge = { create: [], reuse: [] };
  for (const planned of plan.entities) {
    const already = known.get(entityKey(planned));
    if (already === undefined) {
      merge.create.push(planned);
      continue;
    }
    const scenario = (planned.properties.labels as string[] | undefined) ?? [];
    const current = Array.isArray(already.properties.labels)
      ? (already.properties.labels as string[])
      : [];
    merge.reuse.push({
      key: planned.key,
      id: already.id,
      addLabels: scenario.filter((l) => !current.includes(l)),
    });
  }
  return merge;
}

/** "source|verb|target", the shape a drawn relationship is compared on. */
export function linkKey(sourceId: string, rel: string, targetId: string): string {
  return `${sourceId}|${rel}|${targetId}`;
}

/**
 * The relations of a plan that are not already drawn.
 *
 * Two scenarios that both say the actor targets the victim have agreed, not
 * disagreed: the second one adds nothing, and drawing it twice would put two
 * identical edges on the canvas and two identical SROs in the bundle.
 */
export function newLinks(
  relations: TemplatePlan["relations"],
  idOf: (key: string) => string | undefined,
  drawn: Iterable<string>,
): { source_id: string; rel_type: string; target_id: string }[] {
  const seen = new Set(drawn);
  const out: { source_id: string; rel_type: string; target_id: string }[] = [];
  for (const rel of relations) {
    const source_id = idOf(rel.fromKey);
    const target_id = idOf(rel.toKey);
    if (source_id === undefined || target_id === undefined) continue;
    const key = linkKey(source_id, rel.rel, target_id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source_id, rel_type: rel.rel, target_id });
  }
  return out;
}
