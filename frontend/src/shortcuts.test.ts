import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS, isMac, keyLabel } from "./shortcuts";

describe("inventaire des raccourcis", () => {
  it("chaque raccourci porte au moins une touche et une action", () => {
    const all = SHORTCUT_GROUPS.flatMap((g) => g.shortcuts);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.what.trim()).not.toBe("");
    }
  });

  it("chaque groupe dit dans quel contexte il s'applique", () => {
    // A cheatsheet listing "j / k / y / n" without saying "in the triage
    // tray" helps nobody: the context is what makes the key usable.
    for (const g of SHORTCUT_GROUPS) {
      expect(g.title.trim()).not.toBe("");
      expect(g.scope.trim()).not.toBe("");
    }
  });

  it("aucune combinaison n'est listée deux fois dans le même contexte", () => {
    for (const g of SHORTCUT_GROUPS) {
      const combos = g.shortcuts.map((s) => s.keys.join("+"));
      expect(new Set(combos).size, `doublon dans « ${g.title} »`).toBe(combos.length);
    }
  });
});

describe("plateforme", () => {
  it("Ctrl devient Cmd sur mac, et seulement Ctrl", () => {
    expect(keyLabel("Ctrl", true)).toBe("Cmd");
    expect(keyLabel("Ctrl", false)).toBe("Ctrl");
    // the other keys do not move: a "K" stays a "K"
    expect(keyLabel("K", true)).toBe("K");
    expect(keyLabel("Shift", true)).toBe("Shift");
  });

  it("détecte les plateformes Apple", () => {
    expect(isMac("MacIntel")).toBe(true);
    expect(isMac("iPhone")).toBe(true);
    expect(isMac("Linux x86_64")).toBe(false);
    expect(isMac("Win32")).toBe(false);
  });
});
