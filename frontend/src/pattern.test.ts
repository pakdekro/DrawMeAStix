/** STIX pattern generator (#32/#35). */

import { describe, expect, it } from "vitest";

import { patternFromObservable } from "./pattern";

describe("patternFromObservable", () => {
  it("observables à valeur simple", () => {
    expect(patternFromObservable("ipv4-addr", "203.0.113.5")).toBe(
      "[ipv4-addr:value = '203.0.113.5']",
    );
    expect(patternFromObservable("domain-name", " evil.example ")).toBe(
      "[domain-name:value = 'evil.example']",
    );
    expect(patternFromObservable("url", "https://evil.example/p?a=1")).toBe(
      "[url:value = 'https://evil.example/p?a=1']",
    );
  });

  it("échappe les apostrophes et antislashs", () => {
    expect(patternFromObservable("url", "https://evil.example/o'hara\\x")).toBe(
      "[url:value = 'https://evil.example/o\\'hara\\\\x']",
    );
  });

  it("file : préfère le hash le plus fort pour la détection", () => {
    expect(
      patternFromObservable("file", "dropper.dll", {
        hashes: {
          MD5: "44d88612fea8a8f36de82e1278abb02f",
          "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
        },
      }),
    ).toBe(
      "[file:hashes.'SHA-256' = 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f']",
    );
  });

  it("file sans hash : pattern sur le nom", () => {
    expect(patternFromObservable("file", "dropper.dll", { file_name: "dropper.dll" })).toBe(
      "[file:name = 'dropper.dll']",
    );
  });

  it("autonomous-system : sur le numéro", () => {
    expect(patternFromObservable("autonomous-system", "AS64496", { number: 64496 })).toBe(
      "[autonomous-system:number = 64496]",
    );
    expect(patternFromObservable("autonomous-system", "AS64496")).toBe(
      "[autonomous-system:number = 64496]",
    );
  });

  it("type non couvert : null", () => {
    expect(patternFromObservable("threat-actor", "APT28")).toBeNull();
  });
});
