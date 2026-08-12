/**
 * Bulk editing (#185): the deterministic core, no React.
 *
 * Two rules carry the whole safety of the feature, and that is why they
 * live here rather than in the component:
 *
 * 1. A field whose values differ from one object to the next is "mixed" and
 *    overwrites NOTHING until the analyst touches it. Without that, opening
 *    the panel then closing it again would be enough to silently flatten a
 *    dozen objects - data loss without a single destructive gesture.
 *
 * 2. Labels are added and removed, they are never replaced: same convention
 *    as on import (#133), where a multi-valued field completes what is
 *    already there instead of overwriting it.
 */

/** Value shared by all, or `undefined` when they differ (= "mixed"). */
export function commonValue<T>(values: T[]): T | undefined {
  if (values.length === 0) return undefined;
  const [first] = values;
  return values.every((v) => v === first) ? first : undefined;
}

/** Labels carried by EVERY object: the only ones a removal can target. */
export function commonLabels(labelSets: string[][]): string[] {
  if (labelSets.length === 0) return [];
  const [first, ...rest] = labelSets;
  return first.filter((label) => rest.every((set) => set.includes(label)));
}

/** Splits an "a, b , c" input into clean labels, no duplicates, no blanks. */
export function parseLabels(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const label = raw.trim();
    if (label) seen.add(label);
  }
  return [...seen];
}

export interface BulkPatch {
  /** absent = leave alone; null = remove the property */
  tlp?: string | null;
  confidence?: number | null;
  addLabels?: string[];
  removeLabels?: string[];
}

/** True when the patch asks for nothing at all. */
export function isEmptyPatch(patch: BulkPatch): boolean {
  return (
    patch.tlp === undefined &&
    patch.confidence === undefined &&
    !patch.addLabels?.length &&
    !patch.removeLabels?.length
  );
}

/**
 * Applies the patch to ONE object's properties and returns the new block.
 *
 * `updateEntity` replaces `properties` wholesale: we therefore always start
 * from the existing properties, otherwise a TLP change would wipe out the
 * aliases, the dates and everything else.
 */
export function applyBulkPatch(
  properties: Record<string, unknown> | undefined,
  patch: BulkPatch,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(properties ?? {}) };

  if (patch.tlp !== undefined) {
    if (patch.tlp === null) delete next.tlp;
    else next.tlp = patch.tlp;
  }

  if (patch.confidence !== undefined) {
    if (patch.confidence === null) delete next.confidence;
    else next.confidence = patch.confidence;
  }

  if (patch.addLabels?.length || patch.removeLabels?.length) {
    const current = Array.isArray(next.labels) ? (next.labels as string[]) : [];
    const kept = current.filter((l) => !patch.removeLabels?.includes(l));
    for (const label of patch.addLabels ?? []) {
      if (!kept.includes(label)) kept.push(label);
    }
    if (kept.length > 0) next.labels = kept;
    else delete next.labels;
  }

  return next;
}
