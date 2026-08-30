/**
 * The knowledge bases a technique number can come from.
 *
 * One list, because three places used to spell the same two names their own
 * way: the export (which reference to write), the form (which values to
 * offer) and the card (what to show). Adding a third framework is an entry
 * here and nothing else.
 *
 * The stored value IS the STIX `source_name` of the external reference, so
 * what an entity carries and what a bundle claims cannot drift apart.
 */

export interface Framework {
  /** `source_name` of the external reference, and the value on the entity */
  id: string;
  /** short form, for a card that has room for nothing else */
  short: string;
  /** the name in a form, where a word of context fits */
  label: string;
  /** the page that explains it, at `/<route>` and `#/<route>` */
  route: string;
  /** what to type, in the palette that searches it */
  placeholder: string;
  /**
   * Where a number of this framework is documented, when it needs saying: an
   * ATT&CK number resolves itself for any consumer on the planet, F1001
   * resolves nowhere without a url.
   */
  url?: (mitreId: string) => string;
}

export const FRAMEWORKS: Framework[] = [
  {
    id: "mitre-attack",
    short: "ATT&CK",
    label: "ATT&CK",
    route: "attack",
    placeholder: "APT28, T1566, Mimikatz…",
  },
  {
    id: "mitre-f3",
    short: "F3",
    label: "F3 (fraud)",
    route: "f3",
    placeholder: "F1001, mule, 3DS…",
    // The hash is not a typo and not ours: the F3 site is hash routed on
    // /technique/:id, and the flat path the F3 bundle itself publishes is
    // served by nothing.
    url: (id) => `https://ctid.mitre.org/fraud#/technique/${id}`,
  },
  {
    id: "mitre-atlas",
    short: "ATLAS",
    label: "ATLAS (AI systems)",
    route: "atlas",
    placeholder: "AML.T0051, prompt, poisoning…",
    // The one MITRE's own ATLAS bundle publishes. Their host answers it with
    // a 404 status and serves the application anyway, which a browser
    // resolves and curl does not: the page is there.
    url: (id) => `https://atlas.mitre.org/techniques/${id}`,
  },
];

/**
 * ATT&CK, and it is first for a reason: absent means ATT&CK everywhere in
 * the app, because every technique drawn before F3 existed carries nothing.
 */
export const DEFAULT_FRAMEWORK = FRAMEWORKS[0];

/** The framework a stored value names, ATT&CK when it names none we know. */
export function frameworkOf(value: unknown): Framework {
  return FRAMEWORKS.find((f) => f.id === value) ?? DEFAULT_FRAMEWORK;
}
