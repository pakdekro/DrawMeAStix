/**
 * The STIX guide, derived from the product rather than written by hand (#190).
 *
 * Everything that page says, the application already knows: the matrix says
 * what is allowed, `relationHelp` says what each verb means, `findBridges`
 * says what to do when nothing is allowed. Copying that into prose would
 * create a second truth, one that falls out of step the first time a type is
 * added - and help that lies costs more than no help at all.
 *
 * Hence this module. It holds no knowledge of its own; it only turns the
 * matrix around so it reads the other way ("what can I do with a Threat
 * Actor?" rather than "is this pair allowed?").
 */

import { findBridges } from "./bridges";
import type { BridgeRecipe } from "./bridges";
import { patternFromObservable } from "./pattern";
import { relationHelp } from "./relationHelp";
import { allowedRelationships } from "./stix/relationships";
import { SCO_ORDER, SDO_ORDER, typeMeta } from "./stixMeta";

/** Every type you can place, objects first then observables. */
export const ALL_TYPES = [...SDO_ORDER, ...SCO_ORDER];

/**
 * `related-to` exists between every pair of objects, so listing it in the
 * explorer would drown the verbs that actually say something. It is shown
 * once, on its own, as the last resort it is.
 */
const GENERIC = "related-to";

export interface RelationLine {
  from: string;
  rel: string;
  to: string;
  /** sentence from `relationHelp`, absent when the verb carries no gloss */
  help?: string;
}

function line(from: string, rel: string, to: string): RelationLine {
  return { from, rel, to, help: relationHelp(rel) };
}

/** Relationships this type can be the SOURCE of, verb by verb. */
export function outgoing(type: string): RelationLine[] {
  return ALL_TYPES.flatMap((to) =>
    allowedRelationships(type, to)
      .filter((rel) => rel !== GENERIC)
      .map((rel) => line(type, rel, to)),
  );
}

/** Relationships this type can be the TARGET of. */
export function incoming(type: string): RelationLine[] {
  return ALL_TYPES.flatMap((from) =>
    allowedRelationships(from, type)
      .filter((rel) => rel !== GENERIC)
      .map((rel) => line(from, rel, type)),
  );
}

export interface VerbGroup {
  rel: string;
  help?: string;
  /** the OTHER end, the one that is not the type being looked at */
  types: string[];
}

/**
 * Groups relationships by verb, in order of first appearance.
 *
 * `end` names the endpoint to collect: the target for outgoing relationships,
 * the source for incoming ones. Passing it explicitly avoids inferring it
 * from a comparison, which gets self-relationships wrong (`malware
 * variant-of malware`).
 */
export function byVerb(lines: RelationLine[], end: "from" | "to"): VerbGroup[] {
  const groups = new Map<string, VerbGroup>();
  for (const l of lines) {
    const group = groups.get(l.rel) ?? { rel: l.rel, help: l.help, types: [] };
    group.types.push(l[end]);
    groups.set(l.rel, group);
  }
  return [...groups.values()];
}

/** One step of the chain, between two neighbouring nodes. */
export interface ChainStep {
  rel: string;
  /** true when the relationship runs back up the chain (arrow points left) */
  back: boolean;
}

export interface BridgeOption {
  label: string;
  /** three types: the left end, the intermediate object, the right end */
  nodes: string[];
  /** two steps, in the order of the gaps between the nodes */
  steps: ChainStep[];
}

export type Verdict =
  | { kind: "direct"; relations: RelationLine[] }
  | { kind: "reversed"; relations: RelationLine[] }
  | { kind: "bridge"; recipes: BridgeOption[] }
  | { kind: "generic" }
  | { kind: "none" };

/** Where each role sits on the chain, left to right. */
const POS: Record<string, number> = { sdo: 0, bridge: 1, sco: 2 };

/**
 * Unfolds a recipe into a concrete chain, with the types actually chosen.
 *
 * The direction of each step is READ from the recipe, never assumed: the
 * indicator recipe makes the intermediate the source of both its
 * relationships (`indicates` runs up toward the object, `based-on` runs down
 * toward the observable). A chain forced to read left to right would
 * therefore display a relationship that does not exist, which is precisely
 * the mistake this guide exists to prevent.
 */
function chainOf(recipe: BridgeRecipe, sdo: string, sco: string): BridgeOption {
  const nodes = [sdo, recipe.bridgeType, sco];
  const steps = [0, 1].flatMap<ChainStep>((gap) => {
    const leg = recipe.legs.find(
      (l) => Math.min(POS[l.from], POS[l.to]) === gap && Math.max(POS[l.from], POS[l.to]) === gap + 1,
    );
    return leg ? [{ rel: leg.rel, back: POS[leg.from] > POS[leg.to] }] : [];
  });
  return { label: recipe.label, nodes, steps };
}

/**
 * "Can I link these two types?", answered in the order the application
 * itself answers when you drag a link on the canvas.
 *
 * The order matters: offer the reversed direction BEFORE the bridge, because
 * a direct relationship pointing the right way always beats an intermediate
 * object. This mirrors what `beginRelation` does.
 */
export function canLink(source: string, target: string): Verdict {
  const direct = allowedRelationships(source, target).filter((r) => r !== GENERIC);
  if (direct.length > 0) {
    return { kind: "direct", relations: direct.map((rel) => line(source, rel, target)) };
  }
  const reverse = allowedRelationships(target, source).filter((r) => r !== GENERIC);
  if (reverse.length > 0) {
    return { kind: "reversed", relations: reverse.map((rel) => line(target, rel, source)) };
  }
  const endpoint = (stix_type: string) => ({ stix_type, name: "", properties: {} });
  const bridge = findBridges(endpoint(source), endpoint(target));
  if (bridge) {
    // `findBridges` has normalised the ends: the chain always reads from the
    // object toward the observable, whichever order the page asked for.
    return {
      kind: "bridge",
      recipes: bridge.recipes.map((r) => chainOf(r, bridge.sdo.stix_type, bridge.sco.stix_type)),
    };
  }
  // last net: between two objects, `related-to` is still legal
  if (allowedRelationships(source, target).includes(GENERIC)) {
    return { kind: "generic" };
  }
  return { kind: "none" };
}

export interface PatternExample {
  observableType: string;
  value: string;
  pattern: string;
}

/**
 * Sample values, so the guide can show a real detection pattern.
 *
 * Only the VALUES are invented here, and they come from the ranges reserved
 * for documentation (RFC 2606, RFC 5737) so they can never be mistaken for a
 * real IOC. The pattern syntax comes from the same generator the canvas uses:
 * nobody hand-writes STIX inside the help.
 */
const SAMPLES: { observableType: string; value: string; props?: Record<string, unknown> }[] = [
  { observableType: "domain-name", value: "nest.corax.example" },
  { observableType: "ipv4-addr", value: "203.0.113.42" },
  {
    observableType: "file",
    value: "invoice_2024.pdf.exe",
    props: { hashes: { "SHA-256": "3b7f1c2ad9e4508c6ab21f0d5e9c7a4488b1d63fe0a2c5719d84e6b0f3c1a25d" } },
  },
];

/** Example patterns, generated rather than transcribed. */
export function patternExamples(): PatternExample[] {
  return SAMPLES.flatMap(({ observableType, value, props }) => {
    const pattern = patternFromObservable(observableType, value, props ?? {});
    return pattern === null ? [] : [{ observableType, value, pattern }];
  });
}

/** Readable label for a type, to build a sentence with. */
export function label(type: string): string {
  return typeMeta(type).label;
}

/**
 * Observables are never the source of a relationship toward an object.
 *
 * This is THE rule that surprises people, and the reason canonical bridges
 * exist. It is not asserted here: it is *checked* against the matrix by the
 * test that accompanies this module. If the matrix ever contradicts it, the
 * test falls over rather than the help page quietly lying.
 */
export function observableSourcesTowardSdo(): RelationLine[] {
  return SCO_ORDER.flatMap((sco) =>
    SDO_ORDER.flatMap((sdo) => allowedRelationships(sco, sdo).map((rel) => line(sco, rel, sdo))),
  );
}
