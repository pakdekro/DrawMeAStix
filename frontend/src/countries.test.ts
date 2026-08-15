/**
 * The country list behind the `location` suggestions.
 *
 * What is worth testing here is not "the search returns something": it is the
 * property the list exists for. A location identifier is computed from the
 * NAME, so two analysts who name the same country differently create two
 * objects that never merge. The dataset is checked for the shape that makes
 * one canonical name reachable, and the search for the two ways an analyst
 * reaches it: the code, and any part of the name.
 */

import { describe, expect, it } from "vitest";

import { searchCountries } from "./countries";
import type { Country, CountryDataset } from "./countries";
// Read through Vite rather than `node:fs`: the frontend tsconfig carries no
// Node types, and the shipped file is the one worth testing, not a copy.
import shipped from "../public/countries.json";

const DATASET = shipped as CountryDataset;
const ALL: Country[] = DATASET.entries;

describe("the shipped list", () => {
  it("covers ISO 3166-1 and says where it comes from", () => {
    // 249 assigned codes at the time of writing; the count moves once a
    // decade, so the assertion is a floor rather than an equality.
    expect(ALL.length).toBeGreaterThanOrEqual(240);
    expect(DATASET.source).toContain("iso-codes");
  });

  it("one code, one name, no duplicate of either", () => {
    // A duplicated name would defeat the whole point: two entries offering
    // two spellings is exactly what the list exists to prevent.
    expect(new Set(ALL.map((c) => c.code)).size).toBe(ALL.length);
    expect(new Set(ALL.map((c) => c.name)).size).toBe(ALL.length);
    for (const country of ALL) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.trim()).toBe(country.name);
    }
  });

  it("carries the short name, not the official one", () => {
    // "France" and not "French Republic": the short form is what a platform
    // stores and what an analyst types.
    expect(ALL.find((c) => c.code === "FR")?.name).toBe("France");
    expect(ALL.find((c) => c.code === "US")?.name).toBe("United States");
  });
});

describe("reaching a country", () => {
  it("the exact name comes first", () => {
    expect(searchCountries(ALL, "France")[0].code).toBe("FR");
  });

  it("a two-letter code is read as a code", () => {
    // The point of the whole feature: someone typing "FR" is offered France,
    // and the node ends up named "France" like everyone else's.
    expect(searchCountries(ALL, "FR")[0]).toEqual({ code: "FR", name: "France" });
  });

  it("a code never outranks a name that starts with the same letters", () => {
    // "IN" is India's code, and also the start of a dozen names. India wins
    // because it is the exact code, but Indonesia has to be reachable too.
    const results = searchCountries(ALL, "in");
    expect(results[0].code).toBe("IN");
    expect(results.map((c) => c.name)).toContain("Indonesia");
  });

  it("a fragment in the middle of a name is enough", () => {
    expect(searchCountries(ALL, "korea").map((c) => c.code).sort()).toEqual(["KP", "KR"]);
  });

  it("one letter suggests nothing", () => {
    expect(searchCountries(ALL, "f")).toEqual([]);
  });

  it("case and padding are ignored", () => {
    expect(searchCountries(ALL, "  gErMaNy ")[0].code).toBe("DE");
  });
});
