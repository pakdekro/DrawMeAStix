/**
 * Document extraction core (#13): prose → candidates. Checks refang in
 * context, the prose guards (TLD, whole-word ATT&CK), CVEs, T-ids, the
 * context snippet and deduplication.
 */

import { describe, expect, it } from "vitest";

import type { AttackEntry } from "./attack";
import { contextAt, extractFromText } from "./extract";

const ATTACK: AttackEntry[] = [
  {
    type: "attack-pattern",
    id: "T1566.002",
    name: "Spearphishing Link",
    tactics: ["initial-access"],
  },
  {
    type: "attack-pattern",
    id: "T1486",
    name: "Data Encrypted for Impact",
    tactics: ["impact"],
  },
  { type: "intrusion-set", id: "G0007", name: "APT28", aliases: ["Fancy Bear", "at"] },
  { type: "tool", id: "S0002", name: "Mimikatz" },
];

const REPORT = `Campagne Héliotrope - rapport d'analyse

Le groupe APT28 (aussi appelé Fancy Bear) a mené une campagne de
spearphishing link contre le secteur bancaire. L'email provient de
rh@heliotrope-mail[.]com et pointe vers hxxps://portal-rh[.]top/login.
Le domaine portal-rh[.]top résout vers 203.0.113.45.

La charge utile setup.exe (SHA-256
aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f)
exploite CVE-2024-21412 puis utilise Mimikatz pour le vol de
credentials. Voir la technique T1486 pour la phase finale.

Contact : voir le rapport rapport-final.docx et https://attack.mitre.org.`;

describe("extraction de prose", () => {
  const byKey = () => {
    const out = new Map<string, ReturnType<typeof extractFromText>[number]>();
    for (const c of extractFromText(REPORT, ATTACK)) {
      out.set(`${c.stix_type}|${c.name}`, c);
    }
    return out;
  };

  it("refang en contexte : email, URL, domaine, IP", () => {
    const found = byKey();
    expect(found.has("email-addr|rh@heliotrope-mail.com")).toBe(true);
    expect(found.has("url|https://portal-rh.top/login")).toBe(true);
    expect(found.has("domain-name|portal-rh.top")).toBe(true);
    expect(found.has("ipv4-addr|203.0.113.45")).toBe(true);
  });

  it("hash → file, CVE → vulnerability", () => {
    const found = byKey();
    const file = found.get(
      "file|aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    );
    expect(file?.properties.hashes).toEqual({
      "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    });
    expect(found.has("vulnerability|CVE-2024-21412")).toBe(true);
  });

  it("garde-fou TLD : setup.exe et rapport-final.docx ne sont pas des domaines", () => {
    const domains = extractFromText(REPORT, ATTACK)
      .filter((c) => c.stix_type === "domain-name")
      .map((c) => c.name);
    expect(domains).not.toContain("setup.exe");
    expect(domains).not.toContain("rapport-final.docx");
    expect(domains).toContain("portal-rh.top");
    // attack.mitre.org comes in through the URL, not as a lone filtered domain
  });

  it("dico ATT&CK : nom, alias, T-id cité ; alias court ignoré", () => {
    const found = byKey();
    // "APT28" (name) and "spearphishing link" (name, case-insensitive)
    expect(found.has("intrusion-set|APT28")).toBe(true);
    expect(found.has("attack-pattern|Spearphishing Link")).toBe(true);
    expect(found.has("tool|Mimikatz")).toBe(true);
    // T1486 cited literally → resolved through the dictionary
    const t1486 = found.get("attack-pattern|Data Encrypted for Impact");
    expect(t1486?.properties.x_mitre_id).toBe("T1486");
    // the "at" alias (< 4 characters) never matches, even though "at" is
    // all over the text
    const g = [...found.values()].filter((c) => c.stix_type === "intrusion-set");
    expect(g).toHaveLength(1);
  });

  it("mot entier : « Playbook » ne matche pas un alias « Play »", () => {
    const attack: AttackEntry[] = [
      { type: "intrusion-set", id: "G1040", name: "Play Ransomware Group", aliases: ["Play"] },
    ];
    expect(extractFromText("Voir notre playbook interne.", attack)).toEqual([]);
    const hit = extractFromText("Le groupe Play a revendiqué l'attaque.", attack);
    expect(hit.map((c) => c.name)).toContain("Play Ransomware Group");
  });

  it("T-id inconnu du dico : pas de technique fantôme", () => {
    expect(extractFromText("La technique T9999 n'existe pas.", ATTACK)).toEqual([]);
  });

  it("dédoublonnage : une seule occurrence par type|valeur", () => {
    const twice = "Voir evil[.]top puis EVIL.top et encore evil.top.";
    const out = extractFromText(twice);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("evil.top");
  });

  it("chaque candidat porte un contexte utile", () => {
    const found = byKey();
    expect(found.get("ipv4-addr|203.0.113.45")?.context).toContain("résout vers");
    expect(found.get("vulnerability|CVE-2024-21412")?.context).toContain("exploite");
  });
});

describe("contextAt", () => {
  it("borne à la ligne et marque les coupes", () => {
    const text = "ligne un\n" + "x".repeat(200) + " CIBLE " + "y".repeat(200) + "\nligne trois";
    const start = text.indexOf("CIBLE");
    const ctx = contextAt(text, start, start + 5);
    expect(ctx).toContain("CIBLE");
    expect(ctx.startsWith("…")).toBe(true);
    expect(ctx.endsWith("…")).toBe(true);
    expect(ctx).not.toContain("ligne un");
    expect(ctx).not.toContain("ligne trois");
  });

  it("texte court : pas d'ellipses", () => {
    const text = "IP vue : 203.0.113.45 hier.";
    const start = text.indexOf("203");
    expect(contextAt(text, start, start + 12)).toBe(text);
  });
});
