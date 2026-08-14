/**
 * The second batch of observables: the types of the spec whose identity rests
 * on properties of their own (mac-addr, mutex, directory, software,
 * user-account, x509-certificate).
 *
 * What is checked here is not "the object comes out": it is that the node name
 * lands on the property the id is computed from, and that it survives an
 * export → import → export roundtrip. Getting that wrong is silent - the
 * bundle validates, and the platform creates a duplicate.
 *
 * The identifiers themselves are pinned elsewhere, against `stix2`, by the
 * golden vectors (ids.test.ts).
 */

import { describe, expect, it } from "vitest";

import { buildBundle } from "./bundle";
import { importBundle } from "./importer";
import type { EntityRow, ExportOptions, InvestigationState } from "./types";

const OPTS: ExportOptions = {
  container: "grouping",
  tlp: "none",
  author_name: null,
  author_class: "organization",
  include_notes: false,
  confidence: null,
};

function stateOf(
  stixType: string,
  name: string,
  properties: Record<string, unknown> = {},
): InvestigationState {
  const entity: EntityRow = {
    id: "e1",
    investigation_id: "i1",
    stix_type: stixType,
    name,
    properties: JSON.stringify(properties),
    status: "confirmed",
    source: "manual",
    position_x: 0,
    position_y: 0,
    created_at: "2026-08-14T10:00:00.000Z",
    updated_at: "2026-08-14T10:00:00.000Z",
  };
  return {
    investigation: {
      id: "i1",
      name: "Observables",
      description: "",
      created_at: "2026-08-14T10:00:00.000Z",
      updated_at: "2026-08-14T10:00:00.000Z",
    },
    entities: [entity],
    relationships: [],
    notes: [],
  };
}

async function observable(
  stixType: string,
  name: string,
  properties: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { bundle } = await buildBundle(stateOf(stixType, name, properties), OPTS);
  const obj = bundle.objects.find((o) => o.type === stixType);
  if (obj === undefined) throw new Error(`${stixType} absent du bundle`);
  return obj;
}

describe("the node name lands on the identifying property", () => {
  it("mac-addr: value, lowercased as the schema demands", async () => {
    // Tools print MAC addresses in either case; the OASIS schema takes only
    // one. Left as typed, an export would fail validation - after the id had
    // been computed on the other form.
    const obj = await observable("mac-addr", "00:1A:2B:3C:4D:5E");
    expect(obj.value).toBe("00:1a:2b:3c:4d:5e");
  });

  it("mutex: name", async () => {
    const obj = await observable("mutex", "Global\\MsWinZonesCacheCounterMutexA");
    expect(obj.name).toBe("Global\\MsWinZonesCacheCounterMutexA");
  });

  it("directory: path", async () => {
    const obj = await observable("directory", "C:\\Windows\\Temp");
    expect(obj.path).toBe("C:\\Windows\\Temp");
  });

  it("software: name, plus the properties that also contribute", async () => {
    const obj = await observable("software", "Apache HTTP Server", {
      vendor: "Apache",
      version: "2.4.49",
    });
    expect(obj.name).toBe("Apache HTTP Server");
    expect(obj.vendor).toBe("Apache");
    expect(obj.version).toBe("2.4.49");
  });

  it("user-account: account_login", async () => {
    const obj = await observable("user-account", "jdoe", { account_type: "windows-domain" });
    expect(obj.account_login).toBe("jdoe");
    expect(obj.account_type).toBe("windows-domain");
  });
});

describe("x509-certificate, which the spec gives no name at all", () => {
  it("a node named after its fingerprint comes out as a hash, not as a serial", async () => {
    const sha256 = "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f";
    const obj = await observable("x509-certificate", sha256);
    expect(obj.hashes).toEqual({ "SHA-256": sha256 });
    expect(obj.serial_number).toBeUndefined();
  });

  it("a colon-separated fingerprint is read as one too", async () => {
    const obj = await observable(
      "x509-certificate",
      "A9:4A:8F:E5:CC:B1:9B:A6:1C:4C:08:73:D3:91:E9:87:98:2F:BB:D3",
    );
    expect(obj.hashes).toEqual({ "SHA-1": "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3" });
  });

  it("anything else is read as the serial number", async () => {
    const obj = await observable("x509-certificate", "36:f7:d4:2e:1a:00:00:00:00:0b:zz");
    expect(obj.serial_number).toBe("36:f7:d4:2e:1a:00:00:00:00:0b:zz");
    expect(obj.hashes).toBeUndefined();
  });

  it("what was typed in the fields wins over what the name looks like", async () => {
    const sha256 = "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f";
    const obj = await observable("x509-certificate", sha256, { serial_number: "0A:1B" });
    expect(obj.serial_number).toBe("0A:1B");
    expect(obj.hashes).toBeUndefined();
  });
});

describe("export → import → export keeps the identifier", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["mac-addr", "00:1a:2b:3c:4d:5e", {}],
    ["mutex", "Global\\MsWinZonesCacheCounterMutexA", {}],
    ["directory", "C:\\Windows\\Temp", {}],
    ["software", "Apache HTTP Server", { vendor: "Apache", version: "2.4.49" }],
    ["user-account", "jdoe", { account_type: "windows-domain", user_id: "1001" }],
    ["x509-certificate", "36:f7:d4:2e:1a", { subject: "CN=example.com" }],
    [
      "x509-certificate",
      "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
      {},
    ],
  ];

  for (const [stixType, name, props] of cases) {
    it(`${stixType} "${name}"`, async () => {
      const first = await buildBundle(stateOf(stixType, name, props), OPTS);
      const { state, report } = importBundle(first.bundle as never);
      expect(report.skipped).toEqual({});
      const second = await buildBundle(state, OPTS);

      // The layout extension is left out of the comparison: it carries the
      // LOCAL id of the node, minted afresh on import, and it takes no part in
      // the identity of the object.
      const stixOnly = (o: Record<string, unknown> | undefined) => {
        if (o === undefined) return undefined;
        const { extensions: _layout, ...rest } = o;
        return rest;
      };
      const before = first.bundle.objects.find((o) => o.type === stixType);
      const after = second.bundle.objects.find((o) => o.type === stixType);
      expect(after?.id).toBe(before?.id);
      // Nothing identifying may be lost on the way through: the properties
      // travel as they left, not merely the id.
      expect(stixOnly(after)).toEqual(stixOnly(before));
      // And nothing is reported as dropped, which is how a property we forgot
      // to declare internal would show up.
      expect(second.warnings.filter((w) => w.includes("not re-exported"))).toEqual([]);
    });
  }
});
