/**
 * The interface is in English, whatever language the comments are in.
 *
 * It was a spoken convention from the start, so it drifted: at the last
 * count, a dozen French strings were still sitting in dialogs nobody ever
 * reopened. This test makes the convention executable.
 *
 * It only reads what can REACH THE SCREEN: comments are stripped, leaving
 * only the JSX text and the string literals. A French comment has nothing
 * to fear, and that is deliberate.
 */

import { describe, expect, it } from "vitest";

/**
 * Sources read through Vite rather than `node:fs`: the frontend tsconfig
 * does not carry the Node types, and adding a dependency for a convention
 * test would be paying a lot for one guard rail.
 */
const ALL_TSX = import.meta.glob("./**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Test files are set aside: their labels are in French like everything else
 * that addresses the developer, and they reach no screen at all. The case
 * did not come up as long as no test was written in TSX.
 */
const SOURCES = Object.fromEntries(
  Object.entries(ALL_TSX).filter(([file]) => !file.endsWith(".test.tsx")),
);

/** Strips line and block comments, the only source of false positives. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Legitimate character ranges outside the interface: regular expression
 * character classes, where the accented range serves to CLEAN a file name.
 */
const ALLOWED = [/\[\^?[^\]]*à-ÿ[^\]]*\]/g];

/**
 * Accented Latin letters, excluding U+00D7 and U+00F7: these two maths signs
 * (multiplication and division) fall in the middle of the range, and a "x3"
 * in a counter is not French.
 */
const ACCENT = "[\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF]";

function accentedStrings(source: string): string[] {
  let text = stripComments(source);
  for (const pattern of ALLOWED) text = text.replace(pattern, "");
  const found: string[] = [];
  // Scanned LINE BY LINE: an expression crossing newlines swallowed whole
  // blocks of code as soon as a template literal opened somewhere, and
  // reported "offences" twenty lines long.
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("//")) continue;
    const patterns = [
      new RegExp(`>([^<>{}]*${ACCENT}[^<>{}]*)<`, "g"), // JSX text
      new RegExp(`'([^'\n]*${ACCENT}[^'\n]*)'`, "g"),
      new RegExp(`"([^"\n]*${ACCENT}[^"\n]*)"`, "g"),
      new RegExp("`([^`\n]*" + ACCENT + "[^`\n]*)`", "g"),
    ];
    for (const re of patterns) {
      for (const m of line.matchAll(re)) {
        const value = m[1].trim();
        if (value.length > 2) found.push(value);
      }
    }
  }
  return found;
}

describe("interface en anglais", () => {
  it("aucune chaîne accentuée ne peut atteindre l'écran", () => {
    const offenders: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const value of accentedStrings(source)) {
        offenders.push(`${file}: ${value}`);
      }
    }
    // the corpus must not be empty, or the test passes by reading nothing
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it("le détecteur voit bien une chaîne fautive", () => {
    // Without this check, a broken detector would pass for healthy code.
    expect(accentedStrings('<p>Aucun résultat</p>')).toContain("Aucun résultat");
    expect(accentedStrings("const m = 'Opération annulée'")).toContain("Opération annulée");
  });

  it("ne se déclenche ni sur un commentaire ni sur une plage de regex", () => {
    expect(accentedStrings("// pas de résultat trouvé")).toEqual([]);
    expect(accentedStrings("/** Récupère la liste */")).toEqual([]);
    expect(accentedStrings("name.replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ _-]/g, '')")).toEqual([]);
  });
});
