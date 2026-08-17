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

  // `exploits` names the component that did the exploiting, which a template
  // cannot know. It is legal from any malware, so it is easy to wire to the
  // payload of the scenario, and wrong whenever that payload lands after the
  // breach: a ransomware encryptor, a backdoor or a miner does not open the
  // door it walks through. Only the scenarios whose payload IS the exploiting
  // component keep it. `actor targets vulnerability` stays everywhere, since
  // it holds whatever the phase and whatever component did the work.
  it("only asserts `exploits` where the payload is what exploits the flaw", () => {
    const exploiters = BUILTIN_TEMPLATES.filter((t) =>
      t.relations.some((r) => r.rel === "exploits"),
    ).map((t) => t.name);
    expect(exploiters.sort()).toEqual(["Botnet / denial of service", "Watering hole"]);
  });

  it("every scenario carrying a flaw ties it to the actor", () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      const flaws = tpl.slots.filter((s) => s.type === "vulnerability").map((s) => s.key);
      for (const key of flaws) {
        const anchored = tpl.relations.some((r) => r.to === key && r.rel === "targets");
        expect(anchored, `${tpl.name}: ${key} is not tied to the actor`).toBe(true);
      }
    }
  });
});

describe("plan de création", () => {
  it("omet les slots vides et leurs relations", () => {
    const plan = buildPlan(RANSOMWARE, { actor: "LockBit", malware: "LockBit 3.0" });
    const keys = plan.entities.map((e) => e.slotKey);
    expect(keys).toContain("actor");
    expect(keys).toContain("malware");
    expect(keys).toContain("t1486"); // fixed slot: created no matter what
    expect(keys).not.toContain("c2_ip");
    expect(plan.relations).toEqual([
      { fromKey: "actor#0", rel: "uses", toKey: "malware#0" },
      { fromKey: "actor#0", rel: "uses", toKey: "t1486#0" },
    ]);
  });

  it("labels du scénario sur les SDO seulement, prefill conservé", () => {
    const plan = buildPlan(RANSOMWARE, {
      malware: "LockBit 3.0",
      c2_ip: "203.0.113.5",
    });
    const malware = plan.entities.find((e) => e.slotKey === "malware")!;
    expect(malware.properties.labels).toEqual(["ransomware"]);
    expect(malware.properties.is_family).toBe(true);
    const ip = plan.entities.find((e) => e.slotKey === "c2_ip")!;
    expect(ip.properties.labels).toBeUndefined(); // no labels on an SCO
  });

  it("fichier : nom + hash SHA-256 optionnel", () => {
    const withHash = buildPlan(
      RANSOMWARE,
      { binary: "encryptor.exe" },
      { binary: "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f" },
    );
    const file = withHash.entities.find((e) => e.slotKey === "binary")!;
    expect(file.properties.file_name).toBe("encryptor.exe");
    expect(file.properties.hashes).toEqual({
      "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    });
    const noHash = buildPlan(RANSOMWARE, { binary: "encryptor.exe" });
    expect(noHash.entities.find((e) => e.slotKey === "binary")!.properties.hashes).toBeUndefined();
  });

  it("la technique fixed porte son x_mitre_id", () => {
    const plan = buildPlan(RANSOMWARE, { actor: "LockBit" });
    const technique = plan.entities.find((e) => e.slotKey === "t1486")!;
    expect(technique.stix_type).toBe("attack-pattern");
    expect(technique.properties.x_mitre_id).toBe("T1486");
    expect(technique.name).toBe("Data Encrypted for Impact");
  });
});

describe("un slot qui porte plusieurs valeurs (#6)", () => {
  it("une entité par ligne, et les relations du template suivent", () => {
    const plan = buildPlan(RANSOMWARE, {
      actor: "LockBit",
      tool: ["Rclone", "Mimikatz", "PsExec"],
    });
    const tools = plan.entities.filter((e) => e.slotKey === "tool");
    expect(tools.map((e) => e.name)).toEqual(["Rclone", "Mimikatz", "PsExec"]);
    // each one carries the scenario labels and its own key
    expect(new Set(tools.map((e) => e.key)).size).toBe(3);
    for (const tool of tools) expect(tool.properties.labels).toEqual(["ransomware"]);
    // the malware slot is empty, so only the tools and the fixed technique
    const uses = plan.relations.filter((r) => r.fromKey === "actor#0" && r.rel === "uses");
    expect(uses.map((r) => r.toKey)).toEqual(["tool#0", "tool#1", "tool#2", "t1486#0"]);
  });

  it("les lignes vides et les doublons ne créent rien", () => {
    const plan = buildPlan(RANSOMWARE, {
      c2_ip: ["203.0.113.5", "  ", "203.0.113.5", " 198.51.100.7 "],
    });
    expect(plan.entities.filter((e) => e.slotKey === "c2_ip").map((e) => e.name)).toEqual([
      "203.0.113.5",
      "198.51.100.7",
    ]);
  });

  it("le hash reste sur son fichier même si une ligne est vide", () => {
    const sha = "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f";
    const plan = buildPlan(
      RANSOMWARE,
      { binary: ["", "encryptor.exe", "loader.dll"] },
      { binary: ["", sha, ""] },
    );
    const files = plan.entities.filter((e) => e.slotKey === "binary");
    expect(files.map((e) => e.name)).toEqual(["encryptor.exe", "loader.dll"]);
    expect(files[0].properties.hashes).toEqual({ "SHA-256": sha });
    expect(files[1].properties.hashes).toBeUndefined();
  });

  it("un seul côté multiple : la relation s'ouvre en éventail", () => {
    const plan = buildPlan(RANSOMWARE, {
      c2_domain: "evil.example",
      c2_ip: ["203.0.113.5", "198.51.100.7"],
    });
    const resolves = plan.relations.filter((r) => r.rel === "resolves-to");
    expect(resolves.map((r) => r.toKey)).toEqual(["c2_ip#0", "c2_ip#1"]);
    expect(plan.unpaired).toEqual([]);
  });

  it("les deux côtés multiples : rien n'est tracé, et c'est dit", () => {
    // two domains and two addresses do not say which resolves to which; the
    // four relations of the cartesian product would be three lies and a truth
    const plan = buildPlan(RANSOMWARE, {
      c2_domain: ["evil.example", "worse.example"],
      c2_ip: ["203.0.113.5", "198.51.100.7"],
    });
    expect(plan.relations.filter((r) => r.rel === "resolves-to")).toEqual([]);
    expect(plan.unpaired).toEqual([
      { rel: "resolves-to", from: "C2 - domain", to: "C2 - IP address" },
    ]);
    // and they are reported as isolated, since nothing else links them here
    // (alongside the fixed technique, which has no actor to hang from)
    const { isolated } = planIsolation(RANSOMWARE, plan);
    expect(isolated.map((e) => e.name).sort()).toEqual([
      "198.51.100.7",
      "203.0.113.5",
      "Data Encrypted for Impact",
      "evil.example",
      "worse.example",
    ]);
  });

  it("une chaîne isolée reste diagnostiquée par slot, pas par ligne", () => {
    const plan = buildPlan(RANSOMWARE, { c2_ip: ["203.0.113.5", "198.51.100.7"] });
    const { isolated, connectors } = planIsolation(RANSOMWARE, plan);
    expect(isolated.filter((e) => e.slotKey === "c2_ip")).toHaveLength(2);
    // the slot that would link them is named once, not once per line
    expect(connectors).toEqual([...new Set(connectors)]);
    expect(connectors).toContain("Ransomware (family)");
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
    expect(isolated.map((e) => e.slotKey).sort()).toEqual(["domain", "lure_url", "sender"]);
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
        isolated.map((e) => e.slotKey),
        `${tpl.name} : entités isolées une fois tout rempli`,
      ).toEqual([]);
    }
  });

  it("chaque built-in relie la victime même sans acteur (technique fixed targets)", () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      const plan = buildPlan(tpl, { victim: "ACME Corp" });
      const { isolated } = planIsolation(tpl, plan);
      expect(
        isolated.map((e) => e.slotKey),
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
