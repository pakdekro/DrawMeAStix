/** Defang/refang (#30): the shapes CTI reports classically use. */

import { describe, expect, it } from "vitest";

import {
  AMBIGUOUS_EXTENSIONS,
  detectIoc,
  detectIocs,
  hashWarning,
  mitreIdWarning,
  refang,
  valueWarning,
} from "./ioc";

describe("refang", () => {
  it("URL défangée classique", () => {
    expect(refang("hxxps://evil[.]example/payload")).toBe("https://evil.example/payload");
    expect(refang("hXXp://198[.]51[.]100[.]7/x")).toBe("http://198.51.100.7/x");
  });

  it("domaines et IP", () => {
    expect(refang("evil[.]example")).toBe("evil.example");
    expect(refang("evil(dot)example")).toBe("evil.example");
    expect(refang("203[.]0[.]113[.]5")).toBe("203.0.113.5");
  });

  it("emails", () => {
    expect(refang("phish[@]evil[.]example")).toBe("phish@evil.example");
    expect(refang("phish(at)evil(dot)example")).toBe("phish@evil.example");
  });

  it("sans effet sur une valeur saine", () => {
    expect(refang("https://ok.example/a?b=1")).toBe("https://ok.example/a?b=1");
    expect(refang("aec070645fe53ee3b3763059376134f0")).toBe(
      "aec070645fe53ee3b3763059376134f0",
    );
  });
});

describe("détection (collage intelligent)", () => {
  it("texte mixte, défangé ou non, dédoublonné", () => {
    const { iocs, unrecognized } = detectIocs(
      `203.0.113.5, evil[.]example
       hxxps://evil[.]example/payload phish(at)evil(dot)example
       44d88612fea8a8f36de82e1278abb02f AS64496
       203.0.113.5 du-texte-libre`,
    );
    expect(iocs.map((i) => i.stix_type)).toEqual([
      "ipv4-addr",
      "domain-name",
      "url",
      "email-addr",
      "file",
      "autonomous-system",
    ]);
    expect(iocs.find((i) => i.stix_type === "domain-name")?.name).toBe("evil.example");
    expect(unrecognized).toContain("du-texte-libre");
  });

  it("hashes classés par longueur", () => {
    const md5 = detectIoc("44D88612FEA8A8F36DE82E1278ABB02F")!;
    expect(md5.properties.hashes).toEqual({ MD5: "44d88612fea8a8f36de82e1278abb02f" });
    const sha256 = detectIoc(
      "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
    )!;
    expect(Object.keys(sha256.properties.hashes as object)).toEqual(["SHA-256"]);
  });

  it("ipv6 et frontières", () => {
    expect(detectIoc("2001:db8::1")?.stix_type).toBe("ipv6-addr");
    expect(detectIoc("999.1.1.1")).toBeNull();
    expect(detectIoc("AS64496")?.properties.number).toBe(64496);
  });

  it("mac-addr : deux séparateurs, une seule forme stockée", () => {
    // Stored lowercase with colons, the only form the OASIS schema accepts,
    // so the identifier is computed on the shape that will be exported.
    expect(detectIoc("00:1A:2B:3C:4D:5E")).toEqual({
      stix_type: "mac-addr",
      name: "00:1a:2b:3c:4d:5e",
      properties: {},
    });
    expect(detectIoc("00-1a-2b-3c-4d-5e")?.name).toBe("00:1a:2b:3c:4d:5e");
  });

  it("mac-addr : ne mange pas ce qui lui ressemble", () => {
    expect(detectIoc("00:1a:2b:3c:4d")).toBeNull(); // five groups
    expect(detectIoc("00:1a:2b:3c:4d:5e:6f")).toBeNull(); // seven
    expect(detectIoc("0:1a:2b:3c:4d:5e")).toBeNull(); // a group of one digit
    // An eight-group hextet string stays an IPv6: it is a valid address, and
    // no MAC has eight groups.
    expect(detectIoc("2001:0db8:85a3:0000:0000:8a2e:0370:7334")?.stix_type).toBe("ipv6-addr");
  });

  it("ipv6 : formes valides acceptées", () => {
    const v6 = (t: string) => detectIoc(t)?.stix_type;
    expect(v6("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("ipv6-addr"); // 8 groups
    expect(v6("fe80::1")).toBe("ipv6-addr");
    expect(v6("::1")).toBe("ipv6-addr");
    expect(v6("2a06:98c1:3120::2")).toBe("ipv6-addr");
    expect(v6("2001:db8::/32")).toBe("ipv6-addr"); // CIDR prefix
    expect(v6("::ffff:192.0.2.1")).toBe("ipv6-addr"); // embedded IPv4
    expect(v6("2001:db8::192.0.2.1")).toBe("ipv6-addr");
  });

  it("ipv6 : les heures des rapports ne sont pas des adresses", () => {
    // "18:34:43": three groups and no "::" - that is not an IPv6
    expect(detectIoc("18:34:43")).toBeNull();
    expect(detectIoc("09:15:00")).toBeNull();
    expect(detectIoc("23:59:59")).toBeNull();
    expect(detectIoc("1:2:3:4")).toBeNull(); // 4 groups, not 8
    expect(detectIoc("2001:db8::1::2")).toBeNull(); // two "::"
    expect(detectIoc("2001:db8:zz::1")).toBeNull(); // non-hexadecimal hextet
    expect(detectIoc("12345::1")).toBeNull(); // hextet too long
    expect(detectIoc("2001:db8::/300")).toBeNull(); // prefix out of range
  });

  it("a file name is a file, not a domain", () => {
    for (const name of ["setup.exe", "payload.dll", "rapport.docx", "invoice.pdf"]) {
      expect(detectIoc(name)).toEqual({
        stix_type: "file",
        name,
        properties: { file_name: name },
      });
    }
    // the extension is matched case-insensitively, the name is kept as typed
    expect(detectIoc("Setup.EXE")?.name).toBe("Setup.EXE");
  });

  it("a slash means a URL, and a path is nobody's file name", () => {
    expect(detectIoc("http://evil.example/setup.exe")?.stix_type).toBe("url");
    expect(detectIoc("evil.example/setup.exe")).toBeNull();
    expect(detectIoc("C:\\Users\\x\\setup.exe")).toBeNull();
  });

  it("an extension a registry sells stays a domain", () => {
    for (const ext of AMBIGUOUS_EXTENSIONS) {
      expect(detectIoc(`invoice.${ext}`)?.stix_type).toBe("domain-name");
    }
  });

  // The list of unambiguous extensions reads like something to complete, and
  // completing it with a gTLD is how `invoice.zip` stops being the domain that
  // phishing campaigns actually register.
  it("the two lists never overlap", () => {
    for (const ext of AMBIGUOUS_EXTENSIONS) {
      expect(detectIoc(`x.${ext}`)?.stix_type, `${ext} is claimed as a file`).not.toBe("file");
    }
  });
});

describe("valueWarning (#130)", () => {
  it("valeur plausible ou type sans format : silence", () => {
    expect(valueWarning("ipv4-addr", "198.51.100.7")).toBeNull();
    expect(valueWarning("domain-name", "evil.example")).toBeNull();
    expect(valueWarning("url", "https://evil.example/p")).toBeNull();
    expect(valueWarning("email-addr", "a@b.example")).toBeNull();
    expect(valueWarning("intrusion-set", "n'importe quoi")).toBeNull();
    expect(valueWarning("ipv4-addr", "")).toBeNull();
  });

  it("valeur invalide : avertissement", () => {
    expect(valueWarning("ipv4-addr", "999.1.2.3")).toContain("IPv4");
    expect(valueWarning("domain-name", "pas un domaine !")).toContain("domain name");
    expect(valueWarning("email-addr", "sans-arobase")).toContain("email address");
  });

  it("détection croisée : signale le type probable", () => {
    expect(valueWarning("domain-name", "198.51.100.7")).toContain("IPv4");
    expect(valueWarning("ipv4-addr", "evil.example")).toContain("domain name");
  });

  it("défang toléré : hxxp://evil[.]example est refangé avant contrôle", () => {
    expect(valueWarning("url", "hxxps://evil[.]example/x")).toBeNull();
  });

  it("vulnérabilité : nom libre ok, CVE malformé signalé", () => {
    expect(valueWarning("vulnerability", "Log4Shell")).toBeNull();
    expect(valueWarning("vulnerability", "CVE-2024-3094")).toBeNull();
    expect(valueWarning("vulnerability", "CVE-24-3094")).toContain("malformed");
  });
});

describe("hashWarning / mitreIdWarning (#130)", () => {
  it("hash : longueur et hexadécimal contrôlés", () => {
    expect(hashWarning("MD5", "d".repeat(32))).toBeNull();
    expect(hashWarning("SHA-256", "a".repeat(64))).toBeNull();
    expect(hashWarning("SHA-256", "a".repeat(40))).toContain("40 characters");
    expect(hashWarning("MD5", "zz".repeat(16))).toContain("non-hexadecimal");
    expect(hashWarning("MD5", "")).toBeNull();
  });

  it("ID MITRE : T1566, T1566.001, TA0001 acceptés", () => {
    expect(mitreIdWarning("T1566")).toBeNull();
    expect(mitreIdWarning("T1566.001")).toBeNull();
    expect(mitreIdWarning("TA0001")).toBeNull();
    expect(mitreIdWarning("1566")).toContain("format");
    expect(mitreIdWarning("")).toBeNull();
  });
});
