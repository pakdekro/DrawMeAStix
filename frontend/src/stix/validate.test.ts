/**
 * The OASIS/ajv validation must accept everything our builder produces
 * (both golden bundles) and catch the objects that do not conform.
 */

import { describe, expect, it } from "vitest";

import type { StixObject } from "./bundle";
import golden from "./golden-bundle.json";
import { validateObjects } from "./validate";

const OBJECTS = golden.exports[0].bundle.objects as unknown as StixObject[];

describe("schémas OASIS", () => {
  it("les bundles golden passent sans problème", async () => {
    for (const ex of golden.exports) {
      const problems = await validateObjects(ex.bundle.objects as unknown as StixObject[]);
      expect(problems).toEqual([]);
    }
  });

  it("détecte une propriété requise manquante", async () => {
    const actor = { ...OBJECTS.find((o) => o.type === "threat-actor")! };
    delete (actor as Record<string, unknown>).created;
    const problems = await validateObjects([actor]);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toContain("created");
  });

  it("détecte un id malformé", async () => {
    const malware = {
      ...OBJECTS.find((o) => o.type === "malware")!,
      id: "malware--pas-un-uuid",
    };
    const problems = await validateObjects([malware]);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("détecte une valeur d'opinion hors énumération", async () => {
    const opinion = {
      ...OBJECTS.find((o) => o.type === "opinion")!,
      opinion: "probably-true",
    };
    const problems = await validateObjects([opinion]);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("signale un type sans schéma vendoré", async () => {
    const problems = await validateObjects([
      { type: "x-custom-chose", id: "x-custom-chose--1" } as StixObject,
    ]);
    expect(problems[0]).toContain("no vendored OASIS schema");
  });
});
