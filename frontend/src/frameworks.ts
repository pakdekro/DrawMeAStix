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
  /**
   * The identifier shapes this framework PUBLISHES.
   *
   * Not a way of guessing which framework a number belongs to, which is the
   * one thing the shape cannot do: F3 publishes ATT&CK numbers, so a `T1566`
   * is legitimate under two of these. It is the reverse question, and that one
   * has an answer: ATT&CK publishes no `AML.` number and never will, so an
   * `AML.T0051` filed under ATT&CK is a mistake worth saying out loud. The
   * form warns, and warns only: nothing here blocks.
   */
  publishes: RegExp;
}

export const FRAMEWORKS: Framework[] = [
  {
    id: "mitre-attack",
    short: "ATT&CK",
    label: "ATT&CK",
    route: "attack",
    placeholder: "APT28, T1566, Mimikatz…",
    publishes: /^TA?\d{4}(\.\d{3})?$/i,
  },
  {
    id: "mitre-f3",
    short: "F3",
    label: "F3 (fraud)",
    route: "f3",
    placeholder: "F1001, mule, 3DS…",
    // Its own numbers AND ATT&CK's, 43 of which it reuses verbatim.
    publishes: /^[FT]A?\d{4}(\.\d{3})?$/i,
    // The hash is not a typo and not ours: the F3 site is hash routed on
    // /technique/:id, and the flat path the F3 bundle itself publishes is
    // served by nothing.
    url: (id) => `https://ctid.mitre.org/fraud#/technique/${id}`,
  },
  {
    id: "mitre-aadapt",
    short: "AADAPT",
    label: "AADAPT (digital assets)",
    route: "aadapt",
    placeholder: "ADT3003, wallet, bridge…",
    publishes: /^ADTA?\d{4}(\.\d{3})?$/i,
    url: (id) => `https://aadapt.mitre.org/techniques/${id}`,
  },
  {
    id: "mitre-atlas",
    short: "ATLAS",
    label: "ATLAS (AI systems)",
    route: "atlas",
    placeholder: "AML.T0051, prompt, poisoning…",
    publishes: /^AML\.TA?\d{4}(\.\d{3})?$/i,
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

/** The framework that publishes an identifier of this shape, if exactly one does. */
export function frameworkPublishing(mitreId: string): Framework | undefined {
  const candidates = FRAMEWORKS.filter((f) => f.publishes.test(mitreId.trim()));
  return candidates.length === 1 ? candidates[0] : undefined;
}
