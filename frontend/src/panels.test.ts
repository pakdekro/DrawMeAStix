import { describe, expect, it } from "vitest";
import {
  LEFT_BREAKPOINT,
  RIGHT_BREAKPOINT,
  layoutForWidth,
  loadLayout,
  saveLayout,
} from "./panels";

/** In-memory storage: these tests run without a DOM. */
function fakeStorage(initial?: string): Storage {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set("dmas.panels", initial);
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe("seuils", () => {
  it("découlent de la règle « 40 % de chrome au maximum »", () => {
    // 44 + 180 + 300 = 524; 524 / 0.40 = 1310
    expect(RIGHT_BREAKPOINT).toBe(1310);
    // 44 + 180 = 224; 224 / 0.40 = 560
    expect(LEFT_BREAKPOINT).toBe(560);
  });

  it("un grand écran garde tout ouvert", () => {
    expect(layoutForWidth(1920)).toEqual({ left: true, right: true });
  });

  it("le portable de 1280 replie l'inspecteur, pas la palette", () => {
    expect(layoutForWidth(1280)).toEqual({ left: true, right: false });
  });

  it("une fenêtre étroite replie les deux", () => {
    expect(layoutForWidth(500)).toEqual({ left: false, right: false });
  });

  it("le seuil est inclusif : à la largeur exacte, le panneau reste ouvert", () => {
    expect(layoutForWidth(RIGHT_BREAKPOINT).right).toBe(true);
    expect(layoutForWidth(RIGHT_BREAKPOINT - 1).right).toBe(false);
  });
});

describe("mémoire du choix", () => {
  it("sans rien de stocké, la largeur décide", () => {
    expect(loadLayout(1280, fakeStorage())).toEqual({ left: true, right: false });
  });

  it("un choix explicite prime sur la largeur", () => {
    const stored = fakeStorage(JSON.stringify({ left: false, right: true }));
    expect(loadLayout(1920, stored)).toEqual({ left: false, right: true });
  });

  it("un enregistrement partiel se complète par la largeur", () => {
    const stored = fakeStorage(JSON.stringify({ right: true }));
    expect(loadLayout(500, stored)).toEqual({ left: false, right: true });
  });

  it("un contenu corrompu ne casse pas le démarrage", () => {
    expect(loadLayout(1920, fakeStorage("{pas du json"))).toEqual({
      left: true,
      right: true,
    });
  });

  it("sans stockage du tout, la largeur décide", () => {
    expect(loadLayout(1920, undefined)).toEqual({ left: true, right: true });
  });

  it("aller-retour : ce qu'on écrit est ce qu'on relit", () => {
    const s = fakeStorage();
    saveLayout({ left: false, right: false }, s);
    expect(loadLayout(1920, s)).toEqual({ left: false, right: false });
  });

  it("écrire sans stockage ne lève pas", () => {
    expect(() => saveLayout({ left: true, right: true }, undefined)).not.toThrow();
  });
});
