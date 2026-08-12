/**
 * What each STIX relationship verb means, in one sentence (#164).
 *
 * The matrix says what is *allowed* between two types, not what it
 * *means*: between "consists-of" and "communicates-with" on an
 * infrastructure and a domain, nothing guides someone who does not know the
 * spec. These definitions are written to settle the choice on the spot, and
 * they always say which way round the relationship is to be read.
 */

const RELATION_HELP: Record<string, string> = {
  uses: "The source makes use of the target in its operations: a tool, malicious code, technique or infrastructure.",
  targets:
    "The source goes after the target: a victim, a sector, a place, or a vulnerability it aims at.",
  "attributed-to":
    "The source is traced back to the target: a campaign or intrusion set attributed to the actor behind it.",
  impersonates: "The source passes itself off as the target: identity or brand impersonation.",
  compromises:
    "The source takes control of the target, which does not belong to it: a victim's machine, site or service.",
  owns: "The source owns the target: infrastructure rented or bought by the attacker, as opposed to something compromised.",
  hosts: "The source hosts the target and makes it available.",
  controls: "The source drives the target: a C2 commanding an implant or a fleet of machines.",
  delivers:
    "The source carries the target to the victim: a site or an email delivering a payload.",
  drops:
    "The source writes the target to the system without downloading it: a payload already bundled in.",
  downloads: "The source fetches the target from the network, then runs or installs it.",
  exploits: "The source takes advantage of this vulnerability to act.",
  has: "The source is affected by this vulnerability, whether or not it has been exploited.",
  "beacons-to":
    "The source sends regular signals to the target to stay in touch and receive its orders.",
  "exfiltrates-to": "The source sends the stolen data to the target.",
  "communicates-with":
    "The source exchanges network traffic with the target, without the target being part of it.",
  "consists-of":
    "The target is a component of the source: this domain, address or file is part of the infrastructure.",
  "belongs-to": "The source falls under the target: an IP address attached to its autonomous system.",
  "resolves-to": "The domain name points to this address.",
  indicates: "The indicator signals the presence or activity of the target.",
  "based-on": "The indicator is built from this observable.",
  "variant-of": "The source is a spin-off of the target: same code family.",
  "authored-by": "The target wrote or designed the source.",
  "located-at": "The source sits at this place.",
  "originates-from": "The source comes from this place.",
  "related-to":
    "Generic link, with no precise meaning: keep it for cases where no other verb fits.",
};

/** Sentence explaining a relationship verb, or undefined when it is unknown. */
export function relationHelp(relType: string): string | undefined {
  return RELATION_HELP[relType];
}

/** Test-only: coverage against the matrix. */
export const KNOWN_RELATIONS = Object.keys(RELATION_HELP);
