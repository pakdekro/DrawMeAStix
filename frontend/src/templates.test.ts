/**
 * Scenario templates (#28): the built-ins must be structurally valid (every
 * relationship legal according to the STIX matrix), and the creation plan
 * must omit the empty fields, apply the scenario labels to the SDOs only
 * and handle file hashes.
 */

import { describe, expect, it } from "vitest";

import {
  BUILTIN_TEMPLATES,
  buildPlan,
  circleLayout,
  planIsolation,
  validateTemplate,
} from "./templates";

const RANSOMWARE = BUILTIN_TEMPLATES.find((t) => t.name === "Ransomware")!;

describe("templates embarqués", () => {
  it("il y en a au moins trois", () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  for (const tpl of BUILTIN_TEMPLATES) {
    it(`« ${tpl.name} » est valide (matrice comprise)`, () => {
      expect(validateTemplate(tpl)).toEqual([]);
    });
  }

  it("détecte une relation illégale", () => {
    const bad = {
      ...RANSOMWARE,
      relations: [{ from: "victim", rel: "uses", to: "malware" }],
    };
    expect(validateTemplate(bad).join("\n")).toContain("illegal relationship");
  });
});

describe("plan de création", () => {
  it("omet les slots vides et leurs relations", () => {
    const plan = buildPlan(RANSOMWARE, { actor: "LockBit", malware: "LockBit 3.0" });
    const keys = plan.entities.map((e) => e.key);
    expect(keys).toContain("actor");
    expect(keys).toContain("malware");
    expect(keys).toContain("t1486"); // fixed slot: created no matter what
    expect(keys).not.toContain("c2_ip");
    expect(plan.relations).toEqual([
      { fromKey: "actor", rel: "uses", toKey: "malware" },
      { fromKey: "actor", rel: "uses", toKey: "t1486" },
    ]);
  });

  it("labels du scénario sur les SDO seulement, prefill conservé", () => {
    const plan = buildPlan(RANSOMWARE, {
      malware: "LockBit 3.0",
      c2_ip: "203.0.113.5",
    });
    const malware = plan.entities.find((e) => e.key === "malware")!;
    expect(malware.properties.labels).toEqual(["ransomware"]);
    expect(malware.properties.is_family).toBe(true);
    const ip = plan.entities.find((e) => e.key === "c2_ip")!;
    expect(ip.properties.labels).toBeUndefined(); // no labels on an SCO
  });

  it("fichier : nom + hash SHA-256 optionnel", () => {
    const withHash = buildPlan(
      RANSOMWARE,
      { binary: "encryptor.exe" },
      { binary: "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f" },
    );
    const file = withHash.entities.find((e) => e.key === "binary")!;
    expect(file.properties.file_name).toBe("encryptor.exe");
    expect(file.properties.hashes).toEqual({
      "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    });
    const noHash = buildPlan(RANSOMWARE, { binary: "encryptor.exe" });
    expect(noHash.entities.find((e) => e.key === "binary")!.properties.hashes).toBeUndefined();
  });

  it("la technique fixed porte son x_mitre_id", () => {
    const plan = buildPlan(RANSOMWARE, { actor: "LockBit" });
    const technique = plan.entities.find((e) => e.key === "t1486")!;
    expect(technique.stix_type).toBe("attack-pattern");
    expect(technique.properties.x_mitre_id).toBe("T1486");
    expect(technique.name).toBe("Data Encrypted for Impact");
  });
});

describe("isolement sans hub (#82)", () => {
  const PHISHING = BUILTIN_TEMPLATES.find((t) =>
    t.name.startsWith("Phishing - credential"),
  )!;

  it("cas réaliste sans kit ni acteur : les observables sont signalés, pas la victime", () => {
    // sender + URL + domain + victim, hubs left empty - the issue's scenario
    const values = {
      sender: "rh@evil.example",
      lure_url: "https://evil.example/login",
      domain: "evil.example",
      victim: "ACME Corp",
    };
    const plan = buildPlan(PHISHING, values);
    const { isolated, connectors } = planIsolation(PHISHING, plan);
    // the victim is now linked through the fixed technique (targets),
    // the domain alone stays isolated for want of an IP (resolves-to) or kit
    expect(isolated.map((e) => e.key).sort()).toEqual(["domain", "lure_url", "sender"]);
    // the two slots that would glue the graph back together are named
    expect(connectors).toContain("Kit / infrastructure");
  });

  it("graphe complet : aucun isolement", () => {
    const values = {
      actor: "Héliotrope",
      infra: "Kit EvilProxy",
      sender: "rh@evil.example",
      victim: "ACME Corp",
    };
    const { isolated, connectors } = planIsolation(PHISHING, buildPlan(PHISHING, values));
    expect(isolated).toEqual([]);
    expect(connectors).toEqual([]);
  });

  it("chaque built-in, entièrement rempli, ne laisse aucune entité isolée", () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      // every enterable slot filled: the scenario must then form a connected
      // graph, otherwise it is the template that is missing a relationship
      const values = Object.fromEntries(
        tpl.slots.filter((s) => !s.fixed).map((s) => [s.key, `valeur ${s.key}`]),
      );
      const { isolated } = planIsolation(tpl, buildPlan(tpl, values));
      expect(
        isolated.map((e) => e.key),
        `${tpl.name} : entités isolées une fois tout rempli`,
      ).toEqual([]);
    }
  });

  it("chaque built-in relie la victime même sans acteur (technique fixed targets)", () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      const plan = buildPlan(tpl, { victim: "ACME Corp" });
      const { isolated } = planIsolation(tpl, plan);
      expect(
        isolated.map((e) => e.key),
        `${tpl.name} : victime isolée sans acteur`,
      ).not.toContain("victim");
    }
  });
});

describe("layout", () => {
  it("répartit en cercle autour du centre", () => {
    const positions = circleLayout(4, { x: 0, y: 0 }, 100);
    expect(positions).toHaveLength(4);
    for (const p of positions) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(100, 6);
    }
  });
});
