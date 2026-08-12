import { describe, expect, it } from "vitest";
import {
  HARD_MIN_WIDTH,
  SMALL_SCREEN_QUERY,
  TOUCH_MAX_WIDTH,
  hasOptedIn,
  rememberOptIn,
} from "./smallScreen";

/**
 * Deliberately minimal media query evaluator: it only understands the shape
 * this module produces. It is no substitute for a browser - what it checks
 * is how the rule is COMPOSED, not how CSS interprets it.
 *
 * On a desktop the touch branch cannot be triggered: `pointer: coarse`
 * depends on the hardware. These cases are therefore the only ones in the
 * application whose real behaviour can be verified on an actual phone, and
 * nowhere else.
 */
function matches(query: string, env: { width: number; coarse: boolean }): boolean {
  return query.split(",").some((branch) =>
    branch.split(" and ").every((clause) => {
      const width = /\(max-width:\s*(\d+)px\)/.exec(clause);
      if (width) return env.width <= Number(width[1]);
      if (clause.includes("pointer: coarse")) return env.coarse;
      throw new Error(`clause non gérée par ce test : ${clause}`);
    }),
  );
}

describe("écrans où le canvas n'est pas utilisable", () => {
  const cas: [string, { width: number; coarse: boolean }, boolean][] = [
    ["téléphone tenu droit", { width: 390, coarse: true }, true],
    ["téléphone couché", { width: 780, coarse: true }, true],
    ["tablette en portrait", { width: 810, coarse: true }, true],
    ["tablette en paysage", { width: 1024, coarse: true }, false],
    ["portable, fenêtre réduite", { width: 700, coarse: false }, false],
    ["portable, fenêtre minuscule", { width: 520, coarse: false }, true],
    ["poste de travail", { width: 1920, coarse: false }, false],
  ];

  for (const [nom, env, attendu] of cas) {
    it(`${nom} (${env.width}px, ${env.coarse ? "tactile" : "souris"}) : ${attendu ? "carte" : "application"}`, () => {
      expect(matches(SMALL_SCREEN_QUERY, env)).toBe(attendu);
    });
  }

  it("une tablette en paysage n'est PAS bloquée", () => {
    // This is why there are two conditions rather than a single width:
    // blocking on width alone would have shut out a laptop whose window is
    // merely narrowed, which would be wrong.
    expect(matches(SMALL_SCREEN_QUERY, { width: TOUCH_MAX_WIDTH + 1, coarse: true })).toBe(false);
    expect(matches(SMALL_SCREEN_QUERY, { width: TOUCH_MAX_WIDTH, coarse: true })).toBe(true);
  });

  it("sous le seuil dur, le périphérique ne compte plus", () => {
    for (const coarse of [true, false]) {
      expect(matches(SMALL_SCREEN_QUERY, { width: HARD_MIN_WIDTH, coarse })).toBe(true);
      expect(matches(SMALL_SCREEN_QUERY, { width: HARD_MIN_WIDTH + 1, coarse: false })).toBe(false);
    }
  });
});

describe("porte de sortie", () => {
  const storage = (): Storage => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  };

  it("le choix d'entrer quand même est durable", () => {
    // Someone who deliberately works on a tablet should not have to step
    // through the door again on every visit.
    const s = storage();
    expect(hasOptedIn(s)).toBe(false);
    rememberOptIn(s);
    expect(hasOptedIn(s)).toBe(true);
  });

  it("un stockage indisponible ne fait jamais planter l'écran d'accueil", () => {
    // Locked-down private browsing, full quota: the worst acceptable outcome
    // is asking the question again, never a blank page.
    const hostile = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("bloqué");
      },
    } as unknown as Storage;
    expect(() => hasOptedIn(hostile)).not.toThrow();
    expect(hasOptedIn(hostile)).toBe(false);
    expect(() => rememberOptIn(hostile)).not.toThrow();
  });
});
