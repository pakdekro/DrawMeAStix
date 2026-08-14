/**
 * The TS builder must reproduce the bundles of the reference Python builder
 * (golden-bundle.json): same objects, same fingerprint, same warnings.
 * Then the product invariants: stable roundtrip, fingerprint blind to the
 * layout, sensitive to the content.
 */

import { describe, expect, it } from "vitest";

import { buildBundle, ExportError, msTime, stixConfidence, stixTime } from "./bundle";
import golden from "./golden-bundle.json";
import { importBundle } from "./importer";
import { allowedRelationships, commonRelationships, SCO_TYPES } from "./relationships";
import type { EntityRow, ExportOptions, InvestigationState } from "./types";

const STATE = golden.state as unknown as InvestigationState;
const EXPORTS = golden.exports as unknown as {
  opts: ExportOptions;
  bundle: { objects: Record<string, unknown>[] };
  fingerprint: string;
  warnings: string[];
}[];

describe("vecteurs golden - builder de bundle", () => {
  for (const ex of EXPORTS) {
    it(`reproduit l'export ${ex.opts.container}/${ex.opts.tlp}`, async () => {
      const result = await buildBundle(STATE, ex.opts);
      expect(result.bundle.objects).toEqual(ex.bundle.objects);
      expect(result.fingerprint).toBe(ex.fingerprint);
      expect(result.warnings).toEqual(ex.warnings);
    });
  }
});

describe("roundtrip export → import → export", () => {
  for (const ex of EXPORTS) {
    it(`empreinte stable (${ex.opts.container})`, async () => {
      const { state } = importBundle(ex.bundle as never);
      const rebuilt = await buildBundle(state, ex.opts);
      expect(rebuilt.fingerprint).toBe(ex.fingerprint);
    });
  }

  it("le rapport d'import compte juste", () => {
    const { report } = importBundle(EXPORTS[0].bundle as never);
    expect(report.entities).toBe(20); // 21 in store minus the candidate, not exported
    expect(report.relationships).toBe(8);
    expect(report.notes).toBe(3);
    expect(report.skipped).toEqual({ "identity (author)": 1 });
  });
});

describe("définition d'extension jointe au bundle", () => {
  // The defect this fixed: objects carried `extensions[<uuid>]` while the
  // bundle said nowhere what that uuid stands for. A consumer received a
  // key it had no way to resolve.
  it("tout objet qui utilise l'extension peut la résoudre dans le bundle", async () => {
    for (const ex of EXPORTS) {
      const { bundle } = await buildBundle(STATE, ex.opts);
      const declared = new Set(
        bundle.objects.filter((o) => o.type === "extension-definition").map((o) => o.id),
      );
      const used = new Set(
        bundle.objects.flatMap((o) => Object.keys((o.extensions as object | undefined) ?? {})),
      );
      expect(used.size).toBeGreaterThan(0);
      for (const id of used) expect(declared).toContain(id);
    }
  });

  it("la définition est signée par une identité présente dans le bundle", async () => {
    // `created_by_ref` is MANDATORY on extension-definition - one of the
    // rare times the spec requires it. A dangling reference would leave the
    // bundle interpretable by nobody.
    const { bundle } = await buildBundle(STATE, EXPORTS[0].opts);
    const def = bundle.objects.find((o) => o.type === "extension-definition");
    expect(def?.created_by_ref).toBeDefined();
    const ids = bundle.objects.filter((o) => o.type === "identity").map((o) => o.id);
    expect(ids).toContain(def?.created_by_ref);
  });

  it("l'identité de l'outil ne dépend ni de l'analyste ni des options", async () => {
    const withAuthor = await buildBundle(STATE, EXPORTS[0].opts);
    const withoutAuthor = await buildBundle(STATE, { ...EXPORTS[0].opts, author_name: "" });
    const toolId = (b: typeof withAuthor.bundle) =>
      b.objects.find((o) => o.type === "extension-definition")?.created_by_ref;
    expect(toolId(withAuthor.bundle)).toBe(toolId(withoutAuthor.bundle));
  });

  it("la tuyauterie ne pèse pas sur l'empreinte", async () => {
    // Otherwise every investigation already exported would flip at once to
    // "modified since the last export", without anyone touching them.
    for (const ex of EXPORTS) {
      const result = await buildBundle(STATE, ex.opts);
      expect(result.fingerprint).toBe(ex.fingerprint);
    }
  });

  it("l'import ne compte pas l'identité de l'outil comme un auteur", async () => {
    // It is ours: counting it would report "identity (author)" twice to
    // someone who filled in only one.
    const { bundle } = await buildBundle(STATE, EXPORTS[0].opts);
    const { report } = importBundle(bundle as never);
    expect(report.skipped).toEqual({ "identity (author)": 1 });
  });
});

describe("invariants de l'empreinte", () => {
  it("insensible au déplacement d'un nœud (y compris un file)", async () => {
    const moved: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) => ({
        ...e,
        position_x: e.position_x + 500,
        position_y: e.position_y - 42,
      })),
    };
    const result = await buildBundle(moved, EXPORTS[0].opts);
    expect(result.fingerprint).toBe(EXPORTS[0].fingerprint);
  });

  it("sensible au renommage d'une entité", async () => {
    const renamed: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) =>
        e.name === "APT28" ? { ...e, name: "APT29" } : e,
      ),
    };
    const result = await buildBundle(renamed, EXPORTS[0].opts);
    expect(result.fingerprint).not.toBe(EXPORTS[0].fingerprint);
  });

  it("deux exports du même état donnent le même bundle, id compris", async () => {
    const a = await buildBundle(STATE, EXPORTS[0].opts);
    const b = await buildBundle(STATE, EXPORTS[0].opts);
    expect(a.bundle).toEqual(b.bundle);
  });
});

describe("marquage TLP des observables (#210)", () => {
  // Read from the matrix rather than copied: a hand-kept list stops covering
  // the observables added after it was written, and says nothing when it does.
  const observables = (objects: Record<string, unknown>[]) =>
    objects.filter((o) => SCO_TYPES.has(o.type as string));

  it("un observable porte le marquage de l'export", async () => {
    // Measured on OpenCTI before the fix: a platform that ingests objects one
    // by one does not propagate the container's marking. An IP exported as
    // TLP:RED arrived there unmarked, that is, declassified.
    const result = await buildBundle(STATE, { ...EXPORTS[0].opts, tlp: "red" });
    const scos = observables(result.bundle.objects);
    expect(scos.length).toBeGreaterThan(0);
    for (const sco of scos) {
      expect(sco.object_marking_refs, `${sco.type} sans marquage`).toBeDefined();
    }
  });

  it("un observable ne porte JAMAIS created_by_ref", async () => {
    // Spec 2.1 allows the marking on a SCO, but not the author: adding it
    // would produce an object that validation rejects.
    const result = await buildBundle(STATE, { ...EXPORTS[0].opts, tlp: "red" });
    for (const sco of observables(result.bundle.objects)) {
      expect(sco.created_by_ref, `${sco.type} avec un auteur`).toBeUndefined();
    }
  });

  it("sans TLP d'export, un observable ne porte pas de marquage inventé", async () => {
    const result = await buildBundle(STATE, { ...EXPORTS[0].opts, tlp: "none" });
    const marked = observables(result.bundle.objects).filter(
      (o) => o.object_marking_refs !== undefined,
    );
    // only those carrying a tlp of their own stay marked
    for (const sco of marked) {
      const entity = STATE.entities.find((e) => e.name === (sco.value ?? sco.name));
      expect(entity && JSON.parse(entity.properties).tlp).toBeTruthy();
    }
  });

  it("le marquage de l'entité l'emporte sur celui de l'export", async () => {
    const state: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) =>
        e.stix_type === "ipv4-addr"
          ? { ...e, properties: JSON.stringify({ ...JSON.parse(e.properties), tlp: "green" }) }
          : e,
      ),
    };
    const result = await buildBundle(state, { ...EXPORTS[0].opts, tlp: "red" });
    const ip = result.bundle.objects.find((o) => o.type === "ipv4-addr");
    const green = result.bundle.objects.find(
      (o) => o.type === "marking-definition" && (o.name as string)?.includes("GREEN"),
    );
    expect(green).toBeDefined();
    expect(ip?.object_marking_refs).toEqual([green?.id]);
  });

  it("le marquage utilisé par un observable est déclaré dans le bundle", async () => {
    // A dangling reference would make the marking unusable: the consumer
    // would see an identifier it cannot resolve.
    const result = await buildBundle(STATE, { ...EXPORTS[0].opts, tlp: "red" });
    const declared = new Set(
      result.bundle.objects
        .filter((o) => o.type === "marking-definition")
        .map((o) => o.id as string),
    );
    for (const sco of observables(result.bundle.objects)) {
      for (const ref of (sco.object_marking_refs as string[] | undefined) ?? []) {
        expect(declared).toContain(ref);
      }
    }
  });
});

describe("identifiants déterministes en collision", () => {
  // The golden vectors do NOT cover these paths: the fixture holds neither a
  // duplicate nor a typed-in valid_from. Without these tests, the fix would
  // be checked nowhere.
  const entityFrom = (base: EntityRow, over: Partial<EntityRow>): EntityRow => ({
    ...base,
    ...over,
  });

  it("deux techniques de même x_mitre_id ne sortent qu'une fois", async () => {
    const source = STATE.entities.find((e) => e.stix_type === "attack-pattern");
    if (!source) throw new Error("fixture sans attack-pattern");
    const jumelle = entityFrom(source, {
      id: `${source.id}-bis`,
      name: "Hameçonnage ciblé",
    });
    const state: InvestigationState = {
      ...STATE,
      entities: [...STATE.entities, jumelle],
    };
    const result = await buildBundle(state, EXPORTS[0].opts);
    const ids = result.bundle.objects.map((o) => o.id);
    // the invariant that mattered: never two objects with the same id again
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.warnings.some((w) => w.includes("collapses onto"))).toBe(true);

    const container = result.bundle.objects.find((o) => o.type === "report");
    const refs = container?.object_refs as string[];
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("le second nœud garde ses relations malgré la fusion", async () => {
    // With no mapping recorded for the duplicate, its relationships would be
    // dropped silently: we would trade one defect for a worse one.
    const source = STATE.entities.find((e) => e.stix_type === "attack-pattern");
    const other = STATE.entities.find((e) => e.stix_type === "malware");
    if (!source || !other) throw new Error("fixture incomplète");
    const jumelle = entityFrom(source, { id: `${source.id}-bis`, name: "Jumelle" });
    const state: InvestigationState = {
      ...STATE,
      entities: [...STATE.entities, jumelle],
      relationships: [
        ...STATE.relationships,
        {
          id: "rel-jumelle",
          investigation_id: source.investigation_id,
          source_id: jumelle.id,
          target_id: other.id,
          rel_type: "uses",
          description: "",
          start_time: null,
          stop_time: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const withRel = await buildBundle(state, EXPORTS[0].opts);
    const withoutRel = await buildBundle(
      { ...state, relationships: STATE.relationships },
      EXPORTS[0].opts,
    );
    const count = (r: typeof withRel) =>
      r.bundle.objects.filter((o) => o.type === "relationship").length;
    // A comparison and not the absence of a warning: the fixture already
    // produces one (a relationship to a candidate entity, not exported).
    expect(count(withRel)).toBe(count(withoutRel) + 1);
  });

  it("deux relations identiques ne sortent qu'une fois", async () => {
    const first = STATE.relationships[0];
    const state: InvestigationState = {
      ...STATE,
      relationships: [
        ...STATE.relationships,
        { ...first, id: `${first.id}-bis`, description: "assertion contradictoire" },
      ],
    };
    const result = await buildBundle(state, EXPORTS[0].opts);
    const ids = result.bundle.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.warnings.some((w) => w.includes("duplicate of one already"))).toBe(true);
  });
});

describe("fenêtre de validité d'un indicateur", () => {
  const withIndicatorProps = (props: Record<string, unknown>): InvestigationState => ({
    ...STATE,
    entities: STATE.entities.map((e) =>
      e.stix_type === "indicator"
        ? {
            ...e,
            created_at: "2026-06-01T00:00:00.000Z",
            properties: JSON.stringify({
              ...(JSON.parse(e.properties) as Record<string, unknown>),
              ...props,
            }),
          }
        : e,
    ),
  });

  it("un valid_until seul, antérieur à la création, est refusé", async () => {
    // Falling back to the creation date produced an inverted window: the spec
    // forbids it, and at the consumer the detection never fires.
    await expect(
      buildBundle(withIndicatorProps({ valid_until: "2020-01-01" }), EXPORTS[0].opts),
    ).rejects.toThrow(/valid_until/);
  });

  it("le message dit que la date de création a servi de repli", async () => {
    await expect(
      buildBundle(withIndicatorProps({ valid_until: "2020-01-01" }), EXPORTS[0].opts),
    ).rejects.toThrow(/falls back to the creation date/);
  });

  it("une fenêtre correctement ordonnée passe", async () => {
    const result = await buildBundle(
      withIndicatorProps({ valid_from: "2026-01-01", valid_until: "2027-01-01" }),
      EXPORTS[0].opts,
    );
    const indicator = result.bundle.objects.find((o) => o.type === "indicator");
    expect(indicator?.valid_from).toBe("2026-01-01T00:00:00Z");
    expect(indicator?.valid_until).toBe("2027-01-01T00:00:00Z");
  });
});

describe("couche de champs et builders (#218)", () => {
  const withEntity = (over: Partial<EntityRow>): InvestigationState => ({
    ...STATE,
    entities: [
      ...STATE.entities.filter((e) => e.stix_type !== "location"),
      { ...STATE.entities.find((e) => e.stix_type === "location")!, ...over },
    ],
  });

  it("une location sans repère géographique est refusée, pas devinée", async () => {
    // The original fallback copied the NAME into `region`, a normalised
    // vocabulary: "Brive-la-Gaillarde" came out as a region of the world.
    await expect(
      buildBundle(withEntity({ name: "Brive-la-Gaillarde", properties: "{}" }), EXPORTS[0].opts),
    ).rejects.toThrow(/country code, a region, or both coordinates/);
  });

  it("une ville reste une ville quand le pays est donné", async () => {
    const state = withEntity({
      name: "Lyon",
      properties: JSON.stringify({ location_type: "City", country: "FR", city: "Lyon" }),
    });
    const result = await buildBundle(state, EXPORTS[0].opts);
    const loc = result.bundle.objects.find((o) => o.type === "location");
    expect(loc?.city).toBe("Lyon");
    expect(loc?.country).toBe("FR");
    // and above all: no more name copied into a normalised vocabulary
    expect(loc?.region).toBeUndefined();
  });

  it("des coordonnées seules suffisent", async () => {
    const state = withEntity({
      name: "Point de collecte",
      properties: JSON.stringify({ location_type: "Position", latitude: 48.85, longitude: 2.35 }),
    });
    const result = await buildBundle(state, EXPORTS[0].opts);
    const loc = result.bundle.objects.find((o) => o.type === "location");
    expect(loc?.latitude).toBe(48.85);
  });

  it("les propriétés personnalisées d'un observable survivent au ré-export", async () => {
    // `buildSco` enumerated only its identifying keys: an observable enriched
    // elsewhere got poorer with every roundtrip.
    const ip = STATE.entities.find((e) => e.stix_type === "ipv4-addr");
    if (!ip) throw new Error("fixture sans ipv4-addr");
    const state: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) =>
        e.id === ip.id
          ? { ...e, properties: JSON.stringify({ x_opencti_score: 80, resolves_to_refs: ["x"] }) }
          : e,
      ),
    };
    const result = await buildBundle(state, EXPORTS[0].opts);
    const sco = result.bundle.objects.find((o) => o.type === "ipv4-addr");
    expect(sco?.x_opencti_score).toBe(80);
    // a REFERENCE property is not re-emitted: it would point outside the
    // bundle. But the loss is stated.
    expect(sco?.resolves_to_refs).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("resolves_to_refs"))).toBe(true);
  });
});

describe("erreurs d'export", () => {
  it("indicator sans pattern : ExportError explicite", async () => {
    const broken: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) =>
        e.stix_type === "indicator" ? { ...e, properties: "{}" } : e,
      ),
    };
    await expect(buildBundle(broken, EXPORTS[0].opts)).rejects.toThrow(ExportError);
  });

  it("investigation vide : rien à exporter", async () => {
    const empty: InvestigationState = {
      ...STATE,
      entities: [],
      relationships: [],
      notes: [],
    };
    await expect(buildBundle(empty, { ...EXPORTS[0].opts, include_notes: false }))
      .rejects.toThrow("empty investigation");
  });
});

describe("normalisation des timestamps", () => {
  it("précision ANY : millisecondes nulles élaguées", () => {
    expect(stixTime("2026-07-01T00:00:00.000Z")).toBe("2026-07-01T00:00:00Z");
    expect(stixTime("2026-07-01T00:00:00.500Z")).toBe("2026-07-01T00:00:00.5Z");
    expect(stixTime("2026-07-01T00:00:00Z")).toBe("2026-07-01T00:00:00Z");
    expect(stixTime(null)).toBeNull();
  });

  it("précision milliseconde : toujours 3 décimales", () => {
    expect(msTime("2026-07-01T00:00:00Z")).toBe("2026-07-01T00:00:00.000Z");
    expect(msTime("2026-07-01T00:00:00.5Z")).toBe("2026-07-01T00:00:00.500Z");
    expect(msTime("2026-07-01T00:00:00.000Z")).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("matrice de relations", () => {
  it("threat-actor → malware : uses puis related-to en dernier", () => {
    const rels = allowedRelationships("threat-actor", "malware");
    expect(rels).toContain("uses");
    expect(rels[rels.length - 1]).toBe("related-to");
  });

  it("threat-actor → ipv4-addr : rien (pas de related-to vers un SCO)", () => {
    expect(allowedRelationships("threat-actor", "ipv4-addr")).toEqual([]);
  });

  it("indicator → ipv4-addr : based-on seulement", () => {
    expect(allowedRelationships("indicator", "ipv4-addr")).toEqual(["based-on"]);
  });

  it("type inconnu : liste vide", () => {
    expect(allowedRelationships("threat-actor", "yeti")).toEqual([]);
  });
});

describe("verbs common to a whole batch (#234)", () => {
  it("keeps only what every pair accepts", () => {
    // infrastructure accepts communicates-with towards a url, but only
    // consists-of towards an email address. Offering communicates-with for
    // the pair would create the first relationship then throw on the second.
    expect(allowedRelationships("infrastructure", "url")).toContain("communicates-with");
    expect(allowedRelationships("infrastructure", "email-addr")).not.toContain(
      "communicates-with",
    );
    expect(
      commonRelationships([
        ["infrastructure", "url"],
        ["infrastructure", "email-addr"],
      ]),
    ).toEqual(["consists-of"]);
  });

  it("a single pair is its own list of verbs", () => {
    expect(commonRelationships([["indicator", "ipv4-addr"]])).toEqual(["based-on"]);
  });

  it("one incompatible pair empties the list", () => {
    expect(
      commonRelationships([
        ["threat-actor", "malware"],
        ["threat-actor", "ipv4-addr"],
      ]),
    ).toEqual([]);
  });

  it("no pair means no verb, never every verb", () => {
    expect(commonRelationships([])).toEqual([]);
  });
});

describe("confiance et TLP (#125)", () => {
  const OPTS = { ...EXPORTS[0].opts, confidence: 75 };

  it("stixConfidence : entier 0-100 ou rien", () => {
    expect(stixConfidence(75)).toBe(75);
    expect(stixConfidence("85")).toBe(85);
    expect(stixConfidence(0)).toBe(0);
    expect(stixConfidence(150)).toBeNull();
    expect(stixConfidence(-1)).toBeNull();
    expect(stixConfidence("élevée")).toBeNull();
    expect(stixConfidence(true)).toBeNull();
    expect(stixConfidence(null)).toBeNull();
    expect(stixConfidence(undefined)).toBeNull();
  });

  it("la confiance d'export s'applique aux SDO, relations et conteneur", async () => {
    const { bundle } = await buildBundle(STATE, OPTS);
    const sdo = bundle.objects.find((o) => o.type === "malware");
    const rel = bundle.objects.find((o) => o.type === "relationship");
    const container = bundle.objects.find((o) => o.type === "report");
    expect(sdo?.confidence).toBe(75);
    expect(rel?.confidence).toBe(75);
    expect(container?.confidence).toBe(75);
  });

  it("une confiance portée par l'entité prime sur celle de l'export", async () => {
    const { bundle } = await buildBundle(STATE, OPTS);
    const apt = bundle.objects.find((o) => o.type === "threat-actor");
    expect(apt?.confidence).toBe(85); // set in the fixture's props
  });

  it("un TLP d'entité remplace celui de l'export et sa définition est embarquée", async () => {
    const { bundle } = await buildBundle(STATE, OPTS);
    const malware = bundle.objects.find((o) => o.type === "malware");
    const red = "marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed";
    expect(malware?.object_marking_refs).toEqual([red]);
    const markings = bundle.objects.filter((o) => o.type === "marking-definition");
    expect(markings.map((m) => m.name)).toEqual(["TLP:AMBER", "TLP:RED"]);
  });

  it("sans confiance (null), aucun objet n'en porte sauf ceux qui ont la leur", async () => {
    const { bundle } = await buildBundle(STATE, EXPORTS[0].opts);
    const withConf = bundle.objects.filter((o) => "confidence" in o);
    expect(withConf.map((o) => o.type)).toEqual(["threat-actor"]);
  });

  it("l'import retraduit un marquage TLP connu en prop tlp", () => {
    const { bundle } = { bundle: EXPORTS[2].bundle };
    const { state } = importBundle(bundle as never);
    const malware = state.entities.find((e) => e.stix_type === "malware");
    const apt = state.entities.find((e) => e.stix_type === "threat-actor");
    expect(JSON.parse(malware!.properties).tlp).toBe("red");
    expect(JSON.parse(apt!.properties).tlp).toBe("amber"); // TLP inherited from bundle
    expect(JSON.parse(apt!.properties).confidence).toBe(85);
  });
});

describe("champs vides jamais exportés (#125)", () => {
  it("description vide et liste vide sont élaguées", async () => {
    const { bundle } = await buildBundle(STATE, EXPORTS[0].opts);
    const ap = bundle.objects.find((o) => o.type === "attack-pattern");
    expect(ap).toBeDefined();
    expect("description" in ap!).toBe(false); // "" in the fixture
    expect("aliases" in ap!).toBe(false); // [] in the fixture
  });
});

describe("fenêtre temporelle saisie par l'analyste (#170)", () => {
  const OPTS = EXPORTS[0].opts;

  /** Sets properties on the first confirmed entity of a given type. */
  function withProps(stixType: string, props: Record<string, unknown>): InvestigationState {
    let done = false;
    return {
      ...STATE,
      entities: STATE.entities.map((e) => {
        if (done || e.stix_type !== stixType || e.status !== "confirmed") return e;
        done = true;
        return {
          ...e,
          properties: JSON.stringify({
            ...(JSON.parse(e.properties) as Record<string, unknown>),
            ...props,
          }),
        };
      }),
    };
  }

  function objectsOf(result: { bundle: { objects: Record<string, unknown>[] } }, type: string) {
    return result.bundle.objects.filter((o) => o.type === type);
  }

  it("une date du formulaire ressort en timestamp STIX", async () => {
    // the field yields "2026-03-14"; the spec wants a timestamp
    const state = withProps("threat-actor", { first_seen: "2026-03-14", last_seen: "2026-05-02" });
    const [actor] = objectsOf(await buildBundle(state, OPTS), "threat-actor");
    expect(actor.first_seen).toBe("2026-03-14T00:00:00Z");
    expect(actor.last_seen).toBe("2026-05-02T00:00:00Z");
  });

  it("valid_from saisi prime sur la date de création de l'indicateur", async () => {
    const state = withProps("indicator", { valid_from: "2026-01-05", valid_until: "2026-02-05" });
    const [indicator] = objectsOf(await buildBundle(state, OPTS), "indicator");
    expect(indicator.valid_from).toBe("2026-01-05T00:00:00Z");
    expect(indicator.valid_until).toBe("2026-02-05T00:00:00Z");
  });

  it("sans saisie, valid_from reste la date de création", async () => {
    const [indicator] = objectsOf(await buildBundle(STATE, OPTS), "indicator");
    expect(indicator.valid_from).toBe(stixTime(
      STATE.entities.find((e) => e.stix_type === "indicator")!.created_at,
    ));
  });

  it("une fenêtre saisie change l'empreinte : ce n'est plus la même assertion", async () => {
    const state = withProps("threat-actor", { first_seen: "2026-03-14" });
    const after = await buildBundle(state, OPTS);
    expect(after.fingerprint).not.toBe(EXPORTS[0].fingerprint);
  });

  it("la fenêtre d'une relation ressort en start_time/stop_time", async () => {
    const state: InvestigationState = {
      ...STATE,
      relationships: STATE.relationships.map((r, i) =>
        i === 0 ? { ...r, start_time: "2026-03-14", stop_time: "2026-04-01" } : r,
      ),
    };
    // the golden fixture already carries a dated relationship: we aim at ours
    const rels = objectsOf(await buildBundle(state, OPTS), "relationship");
    const dated = rels.filter((r) => r.start_time === "2026-03-14T00:00:00Z");
    expect(dated).toHaveLength(1);
    expect(dated[0].stop_time).toBe("2026-04-01T00:00:00Z");
  });
});

/**
 * Regressions from the security audit (July 2026).
 *
 * A bundle is third-party JSON: its fields do not have the type the
 * TypeScript typing claims. These tests describe what the import refuses to
 * let through as far as IndexedDB, and what the export absorbs.
 */
describe("bundle hostile", () => {
  const wrap = (objects: unknown[]) =>
    ({ type: "bundle", id: "bundle--x", objects }) as never;

  it("un name non-chaîne ne devient jamais le nom de l'investigation", () => {
    // The whole scenario: this name was persisted in IndexedDB, then rendered
    // as a JSX child. React throws "Objects are not valid as a React child",
    // the root unmounts, and since the data is SAVED the crash replays on
    // every visit - with no way out from the interface.
    const { state } = importBundle(
      wrap([{ type: "report", id: "report--1", name: { evil: 1 }, object_refs: [] }]),
      "repli",
    );
    expect(typeof state.investigation.name).toBe("string");
    expect(state.investigation.name).toBe("repli");
  });

  it("un name non-chaîne sur une entité retombe sur une chaîne", () => {
    const { state } = importBundle(
      wrap([{ type: "malware", id: "malware--1", name: ["tableau"], is_family: false }]),
    );
    expect(state.entities.length).toBeGreaterThan(0);
    for (const e of state.entities) expect(typeof e.name).toBe("string");
  });

  it("un id non-chaîne ne se fait pas passer pour un nom", () => {
    // The `obj.id as string` cast typed the object as a string: it became the
    // fallback name of a nameless SDO, then an invalid JSX child.
    const { state, report } = importBundle(
      wrap([{ type: "malware", id: { a: 1 }, is_family: false }]),
    );
    expect(state.entities).toHaveLength(0);
    expect(report.warnings.some((w) => w.includes("type or id"))).toBe(true);
  });

  it("un observable dont le nom n'est pas une chaîne ne fait pas échouer l'import", () => {
    // `refang(obj.name as string)` threw "value.replace is not a function"
    // and aborted the WHOLE bundle on an incomprehensible message.
    const { state } = importBundle(
      wrap([
        { type: "file", id: "file--1", name: { evil: 1 } },
        { type: "malware", id: "malware--ok", name: "survivant", is_family: false },
      ]),
    );
    expect(state.entities.map((e) => e.name)).toContain("survivant");
    for (const e of state.entities) expect(typeof e.name).toBe("string");
  });

  it("un AS sans nom ni numéro exploitable retombe sur une chaîne", () => {
    const { state } = importBundle(
      wrap([{ type: "autonomous-system", id: "autonomous-system--1", number: "pas un nombre" }]),
    );
    for (const e of state.entities) expect(typeof e.name).toBe("string");
  });

  it("des labels non textuels sont écartés au lieu d'être persistés", () => {
    // `labels` is a perfectly legitimate STIX field: a malformed feed is
    // enough, no malice needed. The interface renders them directly.
    const { state } = importBundle(
      wrap([
        {
          type: "malware",
          id: "malware--2",
          name: "ok",
          labels: [{ evil: 1 }, "propre", 42],
          is_family: false,
        },
      ]),
    );
    const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
    expect(props.labels).toEqual(["propre"]);
  });

  it("un champ tableau reçu sous une autre forme ne fait pas échouer le bundle", () => {
    // `refs.map(...)` on a string threw, and the whole import failed - while
    // the module means to be tolerant object by object.
    const { state } = importBundle(
      wrap([
        {
          type: "malware",
          id: "malware--3",
          name: "x",
          is_family: false,
          object_marking_refs: "oops",
          external_references: "oops",
        },
        { type: "note", id: "note--1", content: "n", object_refs: "oops" },
      ]),
    );
    expect(state.entities).toHaveLength(1);
    const props = JSON.parse(state.entities[0].properties) as Record<string, unknown>;
    expect(props.tlp).toBeUndefined();
  });

  it("un hashes mal typé ne fabrique pas un nom d'un seul caractère", () => {
    // `Object.values("abc")[0]` yielded "a" as the file name.
    const { state } = importBundle(
      wrap([{ type: "file", id: "file--2", hashes: "abcdef" }]),
    );
    for (const e of state.entities) expect(e.name.length).toBeGreaterThan(1);
  });

  it("une description non-chaîne ne casse pas l'import", () => {
    const { state } = importBundle(
      wrap([
        { type: "report", id: "report--1", name: "ok", description: 42, object_refs: [] },
      ]),
    );
    expect(state.investigation.description).toBe("");
  });

  it("un tlp valant constructor n'émet aucun marquage undefined", async () => {
    // `"constructor" in TLP_MARKINGS` is true: the presence test passed,
    // marking.id came out undefined, and OASIS validation failed on a
    // message that did not point at the cause.
    let done = false;
    const state: InvestigationState = {
      ...STATE,
      entities: STATE.entities.map((e) => {
        if (done || e.status !== "confirmed") return e;
        done = true;
        return {
          ...e,
          properties: JSON.stringify({
            ...(JSON.parse(e.properties) as Record<string, unknown>),
            tlp: "constructor",
          }),
        };
      }),
    };

    const result = await buildBundle(state, { ...EXPORTS[0].opts, tlp: "none" });
    for (const obj of result.bundle.objects) {
      const refs = (obj as { object_marking_refs?: unknown[] }).object_marking_refs;
      if (refs) expect(refs).not.toContain(undefined);
    }
  });

  it("un tlp global inconnu ne fait pas planter l'export", async () => {
    // opts.tlp comes from dmas.export-prefs (localStorage), which a restored
    // backup file could write. A bare lookup threw, or emitted undefined.
    const opts = { ...EXPORTS[0].opts, tlp: "constructor" } as unknown as ExportOptions;
    await expect(buildBundle(STATE, opts)).resolves.toBeTruthy();
  });
});
