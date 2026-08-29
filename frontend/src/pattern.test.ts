/** STIX pattern generator (#32/#35). */

import { describe, expect, it } from "vitest";

import { PATTERN_KINDS } from "./components/PatternBuilder";
import { patternFromObservable } from "./pattern";
import { SCO_TYPES } from "./stix/relationships";

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

  // Without these, the canonical bridge would build an indicator with no
  // pattern for the whole second batch, and the export would refuse it.
  it("second batch: each type patterns on the property that identifies it", () => {
    expect(patternFromObservable("mac-addr", "00:1A:2B:3C:4D:5E")).toBe(
      "[mac-addr:value = '00:1a:2b:3c:4d:5e']",
    );
    expect(patternFromObservable("mutex", "Global\\Zeus")).toBe(
      "[mutex:name = 'Global\\\\Zeus']",
    );
    expect(patternFromObservable("directory", "C:\\Windows\\Temp")).toBe(
      "[directory:path = 'C:\\\\Windows\\\\Temp']",
    );
    expect(patternFromObservable("user-account", "jdoe")).toBe(
      "[user-account:account_login = 'jdoe']",
    );
  });

  it("software : le CPE l'emporte, il ne vise qu'une version", () => {
    const cpe = "cpe:2.3:a:apache:http_server:2.4.49:*:*:*:*:*:*:*";
    expect(patternFromObservable("software", "Apache HTTP Server", { cpe })).toBe(
      `[software:cpe = '${cpe}']`,
    );
    expect(patternFromObservable("software", "Apache HTTP Server")).toBe(
      "[software:name = 'Apache HTTP Server']",
    );
  });

  it("x509-certificate : lu comme le builder le lit", () => {
    const sha1 = "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3";
    // A node named after its fingerprint must not yield a pattern on a serial
    // number the exported certificate does not carry.
    expect(patternFromObservable("x509-certificate", sha1.toUpperCase())).toBe(
      `[x509-certificate:hashes.'SHA-1' = '${sha1}']`,
    );
    expect(patternFromObservable("x509-certificate", "36:f7:d4:zz")).toBe(
      "[x509-certificate:serial_number = '36:f7:d4:zz']",
    );
  });
});

/**
 * The dropdown of the pattern builder against the observables the application
 * supports.
 *
 * These two drifted apart once already, and the way it failed is the reason
 * this sweep exists. `patternFromObservable` learned the second batch of
 * observables (accounts, software, certificates, MAC, mutex, directory) and
 * the dropdown did not, so the inspector's "Generate an indicator" produced a
 * pattern for an account while the builder offered no way to write one by
 * hand. Nothing was broken and nothing warned: the analyst simply concluded
 * that STIX could not express it, which is the expensive kind of gap.
 */
describe("couverture du constructeur de pattern", () => {
  const SAMPLE: Record<string, string> = {
    "ipv4-addr": "203.0.113.5",
    "ipv6-addr": "2001:db8::1",
    "domain-name": "evil.example",
    url: "https://evil.example/p",
    "email-addr": "a@evil.example",
    file: "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    "autonomous-system": "64500",
    "mac-addr": "00:1a:2b:3c:4d:5e",
    mutex: "Global\\Zeus",
    directory: "C:\\Windows\\Temp",
    software: "Apache HTTP Server",
    "user-account": "FR7630004000031234567890143",
    "x509-certificate": "36:f7:d4:2e:1a",
  };

  it("chaque observable supporté est joignable depuis le menu", () => {
    const offered = new Set(PATTERN_KINDS.map((k) => k.type));
    expect([...SCO_TYPES].filter((t) => !offered.has(t))).toEqual([]);
  });

  it("chaque entrée du menu produit un pattern", () => {
    for (const kind of PATTERN_KINDS) {
      const value = SAMPLE[kind.type];
      expect(value, `${kind.key} : pas d'échantillon`).toBeDefined();
      const pattern =
        kind.prop === "hash"
          ? patternFromObservable("file", value, { hashes: { "SHA-256": value } })
          : kind.prop !== undefined
            ? patternFromObservable(kind.type, "", { [kind.prop]: value })
            : patternFromObservable(kind.type, value);
      expect(pattern, `${kind.key} : aucun pattern`).toBeTruthy();
    }
  });

  // The reason the account has two entries rather than one. An IBAN written
  // into `account_login` asserts that the holder signs in with it.
  it("un compte se décrit par son login OU par son identifiant", () => {
    const iban = "FR7630004000031234567890143";
    expect(patternFromObservable("user-account", iban)).toBe(
      `[user-account:account_login = '${iban}']`,
    );
    expect(patternFromObservable("user-account", "", { user_id: iban })).toBe(
      `[user-account:user_id = '${iban}']`,
    );
  });
});
