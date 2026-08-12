/**
 * Business key of an entity (#216).
 *
 * What makes two objects "the same" observable in the analyst's eyes
 * (#168): the type and the name, blind to case and to edge whitespace.
 * Used everywhere we refuse to create a duplicate: accepting from the
 * triage bin, enrichment, IOC pasting, document extraction, the check
 * before export.
 *
 * It lived as NINE hand-copied instances, under **three different
 * formulas**: the lint applied `trim()`, the canvas deduplication did not.
 * Two entities differing only by a trailing space were therefore a duplicate
 * for one and two distinct objects for the other - a divergence nothing
 * could report, since none of the copies was tested.
 *
 * The form kept is the most tolerant one: an edge space never creates a
 * second object. That is consistent with the builder, which `trim()`s names
 * anyway before computing a STIX identifier.
 */
export function entityKey(entity: { stix_type: string; name: string }): string {
  return `${entity.stix_type}|${entity.name.trim().toLowerCase()}`;
}
