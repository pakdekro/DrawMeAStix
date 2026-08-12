import { describe, expect, it } from "vitest";
import {
  applyBulkPatch,
  commonLabels,
  commonValue,
  isEmptyPatch,
  parseLabels,
} from "./bulk";

describe("valeur commune", () => {
  it("renvoie la valeur quand tous s'accordent", () => {
    expect(commonValue(["amber", "amber", "amber"])).toBe("amber");
  });

  it("renvoie undefined dès qu'une diverge (= mixte)", () => {
    expect(commonValue(["amber", "red"])).toBeUndefined();
  });

  it("distingue « tous absents » de « mixte »", () => {
    // all undefined = they agree on having no value, not a mixed state
    expect(commonValue([undefined, undefined])).toBeUndefined();
    expect(commonValue([60, 60])).toBe(60);
  });
});

describe("labels communs", () => {
  it("ne garde que ceux portés par TOUS", () => {
    expect(
      commonLabels([
        ["ransomware", "apt", "2026"],
        ["ransomware", "2026"],
        ["ransomware", "2026", "fr"],
      ]),
    ).toEqual(["ransomware", "2026"]);
  });

  it("renvoie vide si un objet n'en a aucun", () => {
    expect(commonLabels([["a"], []])).toEqual([]);
  });
});

describe("saisie de labels", () => {
  it("découpe, nettoie et dédoublonne", () => {
    expect(parseLabels(" apt , ransomware ,, apt ")).toEqual(["apt", "ransomware"]);
  });

  it("une saisie vide ne produit aucun label", () => {
    expect(parseLabels("  ,  , ")).toEqual([]);
  });
});

describe("application du patch", () => {
  it("préserve les propriétés non visées", () => {
    const props = { aliases: ["Fancy Bear"], first_seen: "2026-01-01", tlp: "green" };
    expect(applyBulkPatch(props, { tlp: "amber" })).toEqual({
      aliases: ["Fancy Bear"],
      first_seen: "2026-01-01",
      tlp: "amber",
    });
  });

  it("un patch vide ne change rien", () => {
    const props = { tlp: "red", confidence: 80, labels: ["apt"] };
    expect(applyBulkPatch(props, {})).toEqual(props);
  });

  it("null retire la propriété au lieu de la vider", () => {
    const out = applyBulkPatch({ tlp: "red", confidence: 80 }, { tlp: null, confidence: null });
    expect("tlp" in out).toBe(false);
    expect("confidence" in out).toBe(false);
  });

  it("les labels s'ajoutent sans écraser l'existant (#133)", () => {
    expect(applyBulkPatch({ labels: ["apt"] }, { addLabels: ["ransomware"] })).toEqual({
      labels: ["apt", "ransomware"],
    });
  });

  it("un label déjà présent n'est pas dupliqué", () => {
    expect(applyBulkPatch({ labels: ["apt"] }, { addLabels: ["apt"] })).toEqual({
      labels: ["apt"],
    });
  });

  it("le retrait ne touche que les labels visés", () => {
    expect(
      applyBulkPatch({ labels: ["apt", "ransomware", "fr"] }, { removeLabels: ["ransomware"] }),
    ).toEqual({ labels: ["apt", "fr"] });
  });

  it("retirer le dernier label supprime la propriété", () => {
    const out = applyBulkPatch({ labels: ["apt"] }, { removeLabels: ["apt"] });
    expect("labels" in out).toBe(false);
  });

  it("retrait et ajout se combinent dans le bon ordre", () => {
    expect(
      applyBulkPatch({ labels: ["a", "b"] }, { removeLabels: ["a"], addLabels: ["c"] }),
    ).toEqual({ labels: ["b", "c"] });
  });

  it("part d'un objet sans propriétés sans planter", () => {
    expect(applyBulkPatch(undefined, { tlp: "green" })).toEqual({ tlp: "green" });
  });
});

describe("patch vide", () => {
  it("reconnaît l'absence de demande", () => {
    expect(isEmptyPatch({})).toBe(true);
    expect(isEmptyPatch({ addLabels: [], removeLabels: [] })).toBe(true);
  });

  it("null compte comme une demande (retirer)", () => {
    expect(isEmptyPatch({ tlp: null })).toBe(false);
  });
});
