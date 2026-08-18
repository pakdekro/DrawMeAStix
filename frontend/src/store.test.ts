/**
 * The IndexedDB store must reproduce the rules of the old FastAPI
 * routes: validations, cascades, counts, export/import.
 * IndexedDB is provided by fake-indexeddb in the test environment.
 */

import "fake-indexeddb/auto";

// localStorage does not exist under Node: the settings backup (#123)
// probes it, so we give it something able to answer.
if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  } as Storage;
}

import { beforeEach, describe, expect, it } from "vitest";

import {
  _resetForTests,
  createCapture,
  exportBackup,
  importBackup,
  inspectBackup,
  createEntity,
  createInvestigation,
  createNote,
  createRelationship,
  deleteEntity,
  deleteInvestigation,
  deleteNote,
  deleteRelationship,
  exportBundle,
  getInvestigation,
  importBundle,
  listCaptures,
  listEntities,
  listInvestigations,
  listNotes,
  listRelationships,
  markExported,
  mergeEntities,
  pinNote,
  restoreEntity,
  restoreNote,
  restoreRelationship,
  savePositions,
  saveLayoutBackup,
  saveScratchpad,
  updateRelationship,
  StoreError,
  updateCapture,
  updateEntity,
} from "./store";
import golden from "./stix/golden-bundle.json";

beforeEach(async () => {
  await _resetForTests();
});

async function seed() {
  const inv = await createInvestigation("Op Test", "desc");
  const actor = await createEntity(inv.id, { stix_type: "threat-actor", name: "APT28" });
  const malware = await createEntity(inv.id, {
    stix_type: "malware",
    name: "X-Agent",
    properties: { is_family: true },
  });
  return { inv, actor, malware };
}

describe("investigations", () => {
  it("CRUD + comptages", async () => {
    const { inv } = await seed();
    const got = await getInvestigation(inv.id);
    expect(got.entity_count).toBe(2);
    expect(got.relationship_count).toBe(0);
    expect((await listInvestigations()).map((i) => i.id)).toContain(inv.id);
    await deleteInvestigation(inv.id);
    await expect(getInvestigation(inv.id)).rejects.toMatchObject({ status: 404 });
  });

  it("suppression en cascade", async () => {
    const { inv, actor, malware } = await seed();
    await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    await createNote(inv.id, { content: "attribution ?", entity_id: actor.id });
    await deleteInvestigation(inv.id);
    const fresh = await createInvestigation("Autre");
    expect(await listEntities(fresh.id)).toEqual([]);
    expect(await listRelationships(fresh.id)).toEqual([]);
  });
});

describe("relations", () => {
  it("valide par la matrice, avec la liste des relations permises", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    expect(rel.rel_type).toBe("uses");
    await expect(
      createRelationship(inv.id, {
        source_id: malware.id,
        target_id: actor.id,
        rel_type: "targets",
      }),
    ).rejects.toMatchObject({ status: 422 });
    try {
      await createRelationship(inv.id, {
        source_id: malware.id,
        target_id: actor.id,
        rel_type: "targets",
      });
    } catch (e) {
      expect((e as StoreError).message).toContain("allowed: authored-by");
    }
  });

  it("refuse l'auto-référence", async () => {
    const { inv, actor } = await seed();
    await expect(
      createRelationship(inv.id, {
        source_id: actor.id,
        target_id: actor.id,
        rel_type: "related-to",
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("entités", () => {
  it("suppression : cascade sur relations et notes rattachées", async () => {
    const { inv, actor, malware } = await seed();
    await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    await createNote(inv.id, { content: "sur l'acteur", entity_id: actor.id });
    await createNote(inv.id, { content: "générale" });
    await deleteEntity(inv.id, actor.id);
    expect(await listRelationships(inv.id)).toEqual([]);
    expect((await listNotes(inv.id)).map((n) => n.content)).toEqual(["générale"]);
  });

  it("positions groupées", async () => {
    const { inv, actor, malware } = await seed();
    const res = await savePositions(inv.id, {
      [actor.id]: { x: 10, y: 20 },
      [malware.id]: { x: 30, y: 40 },
      "id-inconnu": { x: 0, y: 0 },
    });
    expect(res.updated).toBe(2);
    const entities = await listEntities(inv.id);
    expect(entities.find((e) => e.id === actor.id)?.position_x).toBe(10);
  });
});

describe("annulation d'une suppression", () => {
  it("restaure l'entité AVEC ses relations et ses notes", async () => {
    const { inv, actor, malware } = await seed();
    await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    await createNote(inv.id, { content: "sur l'acteur", entity_id: actor.id });

    const snap = await deleteEntity(inv.id, actor.id);
    expect(await listRelationships(inv.id)).toEqual([]);

    await restoreEntity(inv.id, snap);
    const entities = await listEntities(inv.id);
    // the original id is kept: that is what lets the relationships find
    // their endpoint again
    expect(entities.map((e) => e.id)).toContain(actor.id);
    expect(await listRelationships(inv.id)).toHaveLength(1);
    expect((await listNotes(inv.id)).map((n) => n.content)).toContain("sur l'acteur");
  });

  it("ne restaure pas une relation dont une extrémité a disparu", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    const row = await deleteRelationship(inv.id, rel.id);
    await deleteEntity(inv.id, malware.id);

    expect(await restoreRelationship(inv.id, row)).toBe(false);
    expect(await listRelationships(inv.id)).toEqual([]);
  });

  it("restaure une note supprimée", async () => {
    const { inv, actor } = await seed();
    const note = await createNote(inv.id, { content: "à garder", entity_id: actor.id });
    const row = await deleteNote(inv.id, note.id);
    expect(await listNotes(inv.id)).toEqual([]);

    await restoreNote(inv.id, row);
    expect((await listNotes(inv.id)).map((n) => n.content)).toEqual(["à garder"]);
  });

  it("restaurer deux fois ne duplique rien", async () => {
    const { inv, actor } = await seed();
    const snap = await deleteEntity(inv.id, actor.id);
    await restoreEntity(inv.id, snap);
    await restoreEntity(inv.id, snap);
    expect((await listEntities(inv.id)).filter((e) => e.id === actor.id)).toHaveLength(1);
  });
});

describe("notes", () => {
  it("une opinion exige une opinion_value", async () => {
    const { inv } = await seed();
    await expect(
      createNote(inv.id, { content: "doute", kind: "opinion" }),
    ).rejects.toMatchObject({ status: 422 });
    const ok = await createNote(inv.id, {
      content: "doute",
      kind: "opinion",
      opinion_value: "disagree",
    });
    expect(ok.opinion_value).toBe("disagree");
  });
});

describe("export / import via le store", () => {
  it("export : APT28 garde son ID golden pycti à travers toute la chaîne", async () => {
    const { inv } = await seed();
    const result = await exportBundle(inv.id, { tlp: "none" });
    const actor = (result.bundle.objects as { type: string; id: string }[]).find(
      (o) => o.type === "threat-actor",
    );
    expect(actor?.id).toBe("threat-actor--90bd2396-8173-5dd4-92ad-31f3786e636d");
    expect(result.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("export d'une investigation vide : 422 avec problems", async () => {
    const inv = await createInvestigation("Vide");
    await expect(exportBundle(inv.id, {})).rejects.toMatchObject({
      status: 422,
      detail: { problems: ["empty investigation: nothing to export"] },
    });
  });

  it("import du bundle golden puis ré-export : empreinte préservée", async () => {
    const ex = golden.exports[0];
    const { investigation, report } = await importBundle(ex.bundle);
    expect(report.entities).toBe(20);
    expect(investigation.entity_count).toBe(20);
    const rebuilt = await exportBundle(investigation.id, ex.opts);
    expect(rebuilt.fingerprint).toBe(ex.fingerprint);
  });

  it("import d'un non-bundle : erreur explicite", async () => {
    await expect(importBundle({ type: "rien" })).rejects.toThrow("STIX bundle");
  });
});

describe("notes de travail (#29)", () => {
  it("sauvées localement, jamais dans l'export, empreinte intacte", async () => {
    const { inv } = await seed();
    const before = await exportBundle(inv.id, { tlp: "none" });
    const invBefore = await getInvestigation(inv.id);

    await saveScratchpad(inv.id, "hypothèse : infra partagée avec TA-2024-X - à creuser");

    const reloaded = await getInvestigation(inv.id);
    expect(reloaded.scratchpad).toContain("TA-2024-X");
    expect(reloaded.updated_at).toBe(invBefore.updated_at); // no touch

    const after = await exportBundle(inv.id, { tlp: "none" });
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(JSON.stringify(after.bundle)).not.toContain("TA-2024-X");
  });
});

describe("layout kept aside before the arrangements", () => {
  it("saved locally, never in the export, fingerprint intact", async () => {
    const { inv } = await seed();
    const before = await exportBundle(inv.id, { tlp: "none" });
    const invBefore = await getInvestigation(inv.id);

    await saveLayoutBackup(inv.id, { "node-TA-2024-X": { x: 42, y: 1337 } });

    const reloaded = await getInvestigation(inv.id);
    expect(reloaded.layout_backup?.["node-TA-2024-X"]).toEqual({ x: 42, y: 1337 });
    expect(reloaded.updated_at).toBe(invBefore.updated_at); // no touch

    const after = await exportBundle(inv.id, { tlp: "none" });
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(JSON.stringify(after.bundle)).not.toContain("node-TA-2024-X");
  });

  it("null wipes it rather than storing an empty object", async () => {
    // the button shows itself on the strength of this field: an empty object
    // is truthy and would leave a "My layout" that restores nothing
    const { inv } = await seed();
    await saveLayoutBackup(inv.id, { a: { x: 1, y: 2 } });
    await saveLayoutBackup(inv.id, null);
    expect((await getInvestigation(inv.id)).layout_backup).toBeUndefined();
  });
});

describe("bac de triage via le store", () => {
  it("candidat : hors export tant que non confirmé, inclus après", async () => {
    const inv = await createInvestigation("Triage");
    await createEntity(inv.id, { stix_type: "malware", name: "Confirmé" });
    const cand = await createEntity(inv.id, {
      stix_type: "tool",
      name: "Douteux",
      status: "candidate",
      source: "import",
    });

    expect(await listEntities(inv.id, "candidate")).toHaveLength(1);
    const before = await exportBundle(inv.id, { tlp: "none" });
    expect(JSON.stringify(before.bundle)).not.toContain("Douteux");

    await updateEntity(inv.id, cand.id, { status: "confirmed" });
    const after = await exportBundle(inv.id, { tlp: "none" });
    expect(JSON.stringify(after.bundle)).toContain("Douteux");
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe("couche d'annotation (#136)", () => {
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

  it("capture : création, déplacement, liens, cascade entité", async () => {
    const { inv, actor } = await seed();
    const cap = await createCapture(inv.id, { blob: png(), width: 10, height: 8, x: 5, y: 6 });
    expect(cap.entity_ids).toEqual([]);

    await updateCapture(inv.id, cap.id, { x: 50, entity_ids: [actor.id] });
    let all = await listCaptures(inv.id);
    expect(all[0].position_x).toBe(50);
    expect(all[0].position_y).toBe(6);
    expect(all[0].entity_ids).toEqual([actor.id]);

    // the deleted entity drops out of the links, the capture stays
    await deleteEntity(inv.id, actor.id);
    all = await listCaptures(inv.id);
    expect(all).toHaveLength(1);
    expect(all[0].entity_ids).toEqual([]);
  });

  it("capture : cascade avec l'investigation", async () => {
    const { inv } = await seed();
    await createCapture(inv.id, { blob: png(), width: 1, height: 1, x: 0, y: 0 });
    await deleteInvestigation(inv.id);
    await expect(listCaptures(inv.id)).rejects.toThrow();
  });

  it("épingler une note ne touche ni updated_at ni l'empreinte", async () => {
    const { inv, actor } = await seed();
    const note = await createNote(inv.id, { content: "à creuser", entity_id: actor.id });
    const before = await exportBundle(inv.id, {});

    await pinNote(inv.id, note.id, { x: 120, y: 240 });
    const [pinned] = await listNotes(inv.id);
    expect(pinned.position_x).toBe(120);
    expect(pinned.updated_at).toBe(note.updated_at);

    // annotation positions change neither the bundle nor the fingerprint
    const after = await exportBundle(inv.id, {});
    expect(after.fingerprint).toBe(before.fingerprint);
    const stixNote = after.bundle.objects.find((o) => o.type === "note");
    expect(stixNote).toBeDefined();
    expect("position_x" in stixNote!).toBe(false);

    await pinNote(inv.id, note.id, null);
    expect((await listNotes(inv.id))[0].position_x).toBeNull();
  });
});

describe("sauvegarde / restauration (#123)", () => {
  const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/webp" });

  it("un aller-retour complet restitue tout, captures comprises", async () => {
    const { inv, actor, malware } = await seed();
    await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    await createNote(inv.id, { content: "à creuser", entity_id: actor.id });
    await createCapture(inv.id, { blob: png(), width: 4, height: 2, x: 7, y: 9 });
    await saveScratchpad(inv.id, "brouillon local");

    const backup = await exportBackup();
    expect(backup.captures[0].blob_base64.length).toBeGreaterThan(0);

    // cache wiped: we start again from a fresh database
    await _resetForTests();
    expect(await listInvestigations()).toHaveLength(0);

    const report = await importBackup(backup);
    expect(report.investigations).toBe(1);
    expect(report.replaced).toEqual([]);
    expect(report.captures).toBe(1);

    const restored = await listInvestigations();
    expect(restored).toHaveLength(1);
    expect(restored[0].entity_count).toBe(2);
    expect(restored[0].relationship_count).toBe(1);
    expect((await getInvestigation(inv.id)).scratchpad).toBe("brouillon local");
    expect(await listNotes(inv.id)).toHaveLength(1);
    const captures = await listCaptures(inv.id);
    expect(captures).toHaveLength(1);
    expect(captures[0].position_x).toBe(7);
    expect(await captures[0].blob.arrayBuffer()).toEqual(await png().arrayBuffer());
  });

  it("restaurer remplace l'investigation du fichier sans toucher aux autres", async () => {
    const { inv, actor } = await seed();
    const backup = await exportBackup();

    // the work diverges after the backup was taken
    await createEntity(inv.id, { stix_type: "tool", name: "Mimikatz" });
    await deleteEntity(inv.id, actor.id);
    const other = await createInvestigation("Investigation en cours");
    await createEntity(other.id, { stix_type: "malware", name: "EggShell" });

    const report = await importBackup(backup);
    expect(report.replaced).toEqual(["Op Test"]);

    // the backed-up investigation returns to its state back then...
    const names = (await listEntities(inv.id)).map((e) => e.name).sort();
    expect(names).toEqual(["APT28", "X-Agent"]);
    // ...and the one missing from the file is untouched
    expect((await listEntities(other.id))[0].name).toBe("EggShell");
  });

  it("les réglages ne partent que si on le demande", async () => {
    await seed();
    localStorage.setItem("dmas.enrich.endpoints", '[{"token":"secret"}]');
    expect((await exportBackup()).settings).toBeUndefined();
    expect((await exportBackup(true)).settings).toEqual({
      "dmas.enrich.endpoints": '[{"token":"secret"}]',
    });
  });

  it("refuse un fichier qui n'est pas une sauvegarde", async () => {
    await expect(importBackup({ type: "bundle", objects: [] })).rejects.toThrow(StoreError);
    await expect(importBackup(null)).rejects.toThrow(/backup/);
    await expect(
      importBackup({ format: "dmas-backup", version: 99, investigations: [] }),
    ).rejects.toThrow(/too recent/);
  });
});

describe("correction du verbe d'une relation (#164)", () => {
  it("change le type sans toucher aux extrémités ni à l'id local", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    const fixed = await updateRelationship(inv.id, rel.id, { rel_type: "related-to" });
    expect(fixed.id).toBe(rel.id);
    expect(fixed.rel_type).toBe("related-to");
    expect(fixed.source_id).toBe(actor.id);
    expect(fixed.target_id).toBe(malware.id);
    const [stored] = await listRelationships(inv.id);
    expect(stored.rel_type).toBe("related-to");
  });

  it("refuse un verbe hors matrice pour ce couple de types", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    await expect(updateRelationship(inv.id, rel.id, { rel_type: "resolves-to" })).rejects.toThrow(
      /invalid/,
    );
    // nothing moved
    expect((await listRelationships(inv.id))[0].rel_type).toBe("uses");
  });

  it("404 sur une relation d'une autre investigation", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    const other = await createInvestigation("Ailleurs");
    await expect(updateRelationship(other.id, rel.id, { rel_type: "related-to" })).rejects.toThrow(
      /unknown/,
    );
  });

  it("le verbe corrigé change l'identifiant STIX exporté", async () => {
    const { inv, actor, malware } = await seed();
    const rel = await createRelationship(inv.id, {
      source_id: actor.id,
      target_id: malware.id,
      rel_type: "uses",
    });
    const before = await exportBundle(inv.id, {});
    await updateRelationship(inv.id, rel.id, { rel_type: "related-to" });
    const after = await exportBundle(inv.id, {});
    const idOf = (b: { bundle: { objects: { type: string; id: string }[] } }) =>
      b.bundle.objects.find((o) => o.type === "relationship")!.id;
    // expected: it is no longer the same assertion, so no longer the same id
    expect(idOf(after)).not.toBe(idOf(before));
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });
});

describe("forme canonique d'un observable à la saisie", () => {
  it("une MAC est rangée en minuscules à deux-points, quelle que soit la frappe", async () => {
    // Found in the E2E run: typed in capitals, the node showed one spelling and
    // the export wrote another, so the same address entered twice made two
    // nodes that only collapse into one object at export.
    const inv = await createInvestigation("Op MAC", "");
    const typed = await createEntity(inv.id, {
      stix_type: "mac-addr",
      name: "00:1A:2B:3C:4D:5E",
    });
    const dashed = await createEntity(inv.id, {
      stix_type: "mac-addr",
      name: "00-1A-2B-3C-4D-5E",
    });
    expect(typed.name).toBe("00:1a:2b:3c:4d:5e");
    expect(dashed.name).toBe("00:1a:2b:3c:4d:5e");
  });

  it("le renommage passe par la même forme", async () => {
    const inv = await createInvestigation("Op MAC", "");
    const mac = await createEntity(inv.id, { stix_type: "mac-addr", name: "00:1a:2b:3c:4d:5e" });
    const renamed = await updateEntity(inv.id, mac.id, { name: "AA:BB:CC:DD:EE:FF" });
    expect(renamed.name).toBe("aa:bb:cc:dd:ee:ff");
  });

  it("les autres observables gardent leur casse", async () => {
    // Only the MAC has a spelling the schema mandates. A domain in capitals is
    // still the same domain, and rewriting it would be us editing the analyst.
    const inv = await createInvestigation("Op MAC", "");
    const dom = await createEntity(inv.id, { stix_type: "domain-name", name: "Evil[.]Example" });
    expect(dom.name).toBe("Evil.Example");
  });
});

describe("fusion d'un doublon (#168)", () => {
  /** pak's own case: two domains that resolve to the same IP. */
  async function deuxDomainesUneIp() {
    const inv = await createInvestigation("Op Dedup", "");
    const apex = await createEntity(inv.id, { stix_type: "domain-name", name: "corax.example" });
    const blog = await createEntity(inv.id, { stix_type: "domain-name", name: "blog.corax.example" });
    const ip = await createEntity(inv.id, { stix_type: "ipv4-addr", name: "203.0.113.42" });
    const doublon = await createEntity(inv.id, {
      stix_type: "ipv4-addr",
      name: "203.0.113.42",
      status: "candidate",
    });
    await createRelationship(inv.id, {
      source_id: apex.id,
      target_id: ip.id,
      rel_type: "resolves-to",
    });
    await createRelationship(inv.id, {
      source_id: blog.id,
      target_id: doublon.id,
      rel_type: "resolves-to",
    });
    return { inv, apex, blog, ip, doublon };
  }

  it("reporte les relations du doublon et le fait disparaître", async () => {
    const { inv, blog, ip, doublon } = await deuxDomainesUneIp();
    const res = await mergeEntities(inv.id, doublon.id, ip.id);

    expect(res.relations).toBe(1);
    const ids = (await listEntities(inv.id)).map((e) => e.id);
    expect(ids).not.toContain(doublon.id);
    // both domains now converge on the same IP: that is the piece of
    // information the duplicate was making disappear
    const rels = await listRelationships(inv.id);
    expect(rels).toHaveLength(2);
    expect(rels.every((r) => r.target_id === ip.id)).toBe(true);
    expect(rels.some((r) => r.source_id === blog.id)).toBe(true);
  });

  it("ne crée pas d'arête en double si la relation existe déjà", async () => {
    const inv = await createInvestigation("Op Dedup", "");
    const domain = await createEntity(inv.id, { stix_type: "domain-name", name: "evil.example" });
    const ip = await createEntity(inv.id, { stix_type: "ipv4-addr", name: "203.0.113.5" });
    const doublon = await createEntity(inv.id, {
      stix_type: "ipv4-addr",
      name: "203.0.113.5",
      status: "candidate",
    });
    for (const target of [ip.id, doublon.id]) {
      await createRelationship(inv.id, {
        source_id: domain.id,
        target_id: target,
        rel_type: "resolves-to",
      });
    }

    const res = await mergeEntities(inv.id, doublon.id, ip.id);
    expect(res.relations).toBe(0); // the duplicate's edge was a duplicate too
    expect(await listRelationships(inv.id)).toHaveLength(1);
  });

  it("écarte une relation qui deviendrait réflexive", async () => {
    // a CNAME collected twice can link the node to its own duplicate: once
    // carried over, the relationship would point at itself
    const inv = await createInvestigation("Op Dedup", "");
    const cible = await createEntity(inv.id, { stix_type: "domain-name", name: "www.evil.example" });
    const doublon = await createEntity(inv.id, {
      stix_type: "domain-name",
      name: "www.evil.example",
      status: "candidate",
    });
    await createRelationship(inv.id, {
      source_id: cible.id,
      target_id: doublon.id,
      rel_type: "resolves-to",
    });

    const res = await mergeEntities(inv.id, doublon.id, cible.id);
    expect(res.relations).toBe(0);
    expect(await listRelationships(inv.id)).toHaveLength(0);
  });

  it("reporte les notes et les liens de capture", async () => {
    const inv = await createInvestigation("Op Dedup", "");
    const ip = await createEntity(inv.id, { stix_type: "ipv4-addr", name: "203.0.113.5" });
    const doublon = await createEntity(inv.id, {
      stix_type: "ipv4-addr",
      name: "203.0.113.5",
      status: "candidate",
    });
    await createNote(inv.id, { content: "vue dans le log proxy", entity_id: doublon.id });
    const capture = await createCapture(inv.id, {
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
      width: 10,
      height: 10,
      x: 0,
      y: 0,
    });
    await updateCapture(inv.id, capture.id, { entity_ids: [doublon.id] });

    const res = await mergeEntities(inv.id, doublon.id, ip.id);
    expect(res.notes).toBe(1);
    const notes = await listNotes(inv.id);
    expect(notes[0].entity_id).toBe(ip.id);
    const captures = await listCaptures(inv.id);
    expect(captures[0].entity_ids).toEqual([ip.id]);
  });

  it("refuse de fusionner une entité avec elle-même", async () => {
    const { inv, actor } = await seed();
    await expect(mergeEntities(inv.id, actor.id, actor.id)).rejects.toThrow(StoreError);
  });
})

/**
 * Regressions from the security audit (July 2026).
 *
 * These tests describe what a backup received from a third party must NOT
 * be able to do. A backup file looks harmless ("my backup of the
 * investigation we share") while it drives local writes directly.
 */
describe("sauvegarde hostile", () => {
  beforeEach(async () => {
    await _resetForTests();
    localStorage.clear();
  });

  const minimal = (settings: Record<string, string>) => ({
    format: "dmas-backup",
    version: 1,
    created_at: new Date().toISOString(),
    investigations: [],
    entities: [],
    relationships: [],
    notes: [],
    captures: [],
    settings,
  });

  it("ne repointe jamais les endpoints d'enrichissement", async () => {
    const attaquant = JSON.stringify([
      { id: "x", label: "CERT sidecar", url: "https://attaquant.example", token: "vole" },
    ]);
    localStorage.setItem("dmas.enrich.endpoints", "[]");

    const report = await importBackup(minimal({ "dmas.enrich.endpoints": attaquant }));

    // the key has not moved, and the refusal is reported
    expect(localStorage.getItem("dmas.enrich.endpoints")).toBe("[]");
    expect(report.skippedSettings).toBe(1);
  });

  it("restaure quand même les préférences d'export", async () => {
    const report = await importBackup(
      minimal({ "dmas.export-prefs": '{"tlp":"amber"}' }),
    );
    expect(localStorage.getItem("dmas.export-prefs")).toBe('{"tlp":"amber"}');
    expect(report.skippedSettings).toBe(0);
  });

  it("ignore une clé de réglage inconnue sans la compter comme refusée", async () => {
    const report = await importBackup(minimal({ "dmas.autre": "x" }));
    expect(localStorage.getItem("dmas.autre")).toBeNull();
    expect(report.skippedSettings).toBe(0);
  });

  it("ignore un réglage dont la valeur n'est pas une chaîne", async () => {
    const bad = minimal({}) as unknown as Record<string, unknown>;
    bad.settings = { "dmas.export-prefs": { pas: "une chaine" } };
    await importBackup(bad);
    expect(localStorage.getItem("dmas.export-prefs")).toBeNull();
  });
});

describe("fraîcheur de l'export (#204)", () => {
  it("le repère est l'état exporté, pas l'heure du téléchargement", async () => {
    // The defect: `exported_at` was stamped on click, so necessarily later
    // than any edit made before it. A canvas modified between building the
    // bundle and downloading it came out looking "up to date".
    const inv = await createInvestigation("Op fraîcheur", "");
    await createEntity(inv.id, { stix_type: "malware", name: "Egghook" });
    const built = await exportBundle(inv.id, {});

    // the analyst edits BEFORE clicking download
    await createEntity(inv.id, { stix_type: "threat-actor", name: "Corax" });
    const modified = await getInvestigation(inv.id);

    await markExported(inv.id, built.fingerprint, built.sourceUpdatedAt);
    const after = await getInvestigation(inv.id);

    expect(after.exported_state_at).toBe(built.sourceUpdatedAt);
    // this is what lets the status bar tell the truth
    expect(modified.updated_at > (after.exported_state_at ?? "")).toBe(true);
    // the download time stays available for display
    expect(after.exported_at).toBeTruthy();
  });

  it("marquer l'export ne rend pas l'investigation modifiée", async () => {
    const inv = await createInvestigation("Op", "");
    await createEntity(inv.id, { stix_type: "malware", name: "x" });
    const built = await exportBundle(inv.id, {});
    const before = await getInvestigation(inv.id);
    await markExported(inv.id, built.fingerprint, built.sourceUpdatedAt);
    const after = await getInvestigation(inv.id);
    expect(after.updated_at).toBe(before.updated_at);
    expect(after.updated_at > (after.exported_state_at ?? "")).toBe(false);
  });
});

describe("restauration : lignes orphelines (#212)", () => {
  const ts = "2026-08-11T12:00:00.000Z";
  const backup = (investigationIds: string[], entityInvestigationId: string) => ({
    format: "dmas-backup",
    version: 1,
    created_at: ts,
    investigations: investigationIds.map((id) => ({
      id,
      name: `Sauvegarde ${id}`,
      description: "",
      created_at: ts,
      updated_at: ts,
    })),
    entities: [
      {
        id: "e-orpheline",
        investigation_id: entityInvestigationId,
        stix_type: "malware",
        name: "Injectee",
        properties: "{}",
        status: "confirmed",
        source: "manual",
        position_x: 0,
        position_y: 0,
        created_at: ts,
        updated_at: ts,
      },
    ],
    relationships: [],
    notes: [],
    captures: [],
  });

  it("une ligne rattachée à une investigation absente du fichier n'est pas écrite", async () => {
    // importBackup's docstring promises that investigations absent from the
    // file are never touched. `targets` bounded the purge, not the writes:
    // the row landed in an investigation the confirmation dialog had never
    // named.
    const victime = await createInvestigation("Investigation existante", "");
    const report = await importBackup(backup(["depuis-le-fichier"], victime.id));

    expect(await listEntities(victime.id)).toHaveLength(0);
    expect(report.skippedRows).toBe(1);
    // and the announced count reflects what was written, not what the file
    // contained: announcing "1 entity restored" would be the same lie
    expect(report.entities).toBe(0);
  });

  it("blob_type ne survit pas dans le magasin", async () => {
    // Field belonging to the file format only: letting it through wrote it
    // into the store as a foreign value no code ever reads.
    const inv = await createInvestigation("Op captures", "");
    await createCapture(inv.id, {
      blob: new Blob(["x"], { type: "image/webp" }),
      width: 100,
      height: 80,
      x: 0,
      y: 0,
    });
    const file = await exportBackup(false);
    await _resetForTests();
    await importBackup(file);
    const [capture] = await listCaptures(inv.id);
    expect(capture).toBeDefined();
    expect("blob_type" in capture).toBe(false);
    expect(capture.blob.type).toBe("image/webp");
  });

  it("une ligne rattachée à une investigation du fichier est bien écrite", async () => {
    const report = await importBackup(backup(["inv-du-fichier"], "inv-du-fichier"));
    expect(await listEntities("inv-du-fichier")).toHaveLength(1);
    expect(report.skippedRows).toBe(0);
    expect(report.entities).toBe(1);
  });
});

describe("aperçu de restauration (#220)", () => {
  it("annonce le contenu qui va être détruit, pas seulement le nom", async () => {
    // Restoring yesterday's backup can wipe out work done today: the dialog
    // announced a count of investigations, never what they contain.
    const inv = await createInvestigation("Op vivante", "");
    const a = await createEntity(inv.id, { stix_type: "malware", name: "EggShell" });
    const b = await createEntity(inv.id, { stix_type: "threat-actor", name: "Corax" });
    await createRelationship(inv.id, {
      source_id: b.id,
      target_id: a.id,
      rel_type: "uses",
    });
    await createNote(inv.id, { entity_id: a.id, content: "à ne pas perdre" });

    // a backup of the SAME investigation, but empty of content
    const file = {
      format: "dmas-backup",
      version: 1,
      created_at: new Date().toISOString(),
      investigations: [
        {
          id: inv.id,
          name: "Op vivante",
          description: "",
          created_at: inv.created_at,
          updated_at: inv.updated_at,
        },
      ],
      entities: [],
      relationships: [],
      notes: [],
      captures: [],
    };

    const { replaced } = await inspectBackup(file);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({
      name: "Op vivante",
      entities: 2,
      relationships: 1,
      notes: 1,
    });
    expect(replaced[0].updatedAt).toBeTruthy();
  });

  it("ne signale rien quand aucune investigation n'est touchée", async () => {
    await createInvestigation("Intacte", "");
    const { replaced } = await inspectBackup({
      format: "dmas-backup",
      version: 1,
      created_at: new Date().toISOString(),
      investigations: [
        { id: "autre", name: "Autre", description: "", created_at: "", updated_at: "" },
      ],
      entities: [],
      relationships: [],
      notes: [],
      captures: [],
    });
    expect(replaced).toEqual([]);
  });
});
