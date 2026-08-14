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
