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
 *
 * What it CANNOT do, and it matters more than what it can: it keys on
 * accented letters. French without an accent goes straight through. That is
 * how "Mon CERT" sat in the export dialog, under everyone's eyes, while this
 * test reported all clear. No heuristic separates unaccented French from
 * English without guessing, so the guard is a net with a known mesh rather
 * than a proof. Read the interface now and then.
 */

import { describe, expect, it } from "vitest";

/**
 * Sources read through Vite rather than `node:fs`: the frontend tsconfig
 * does not carry the Node types, and adding a dependency for a convention
 * test would be paying a lot for one guard rail.
 *
 * The `.ts` modules count as much as the components. They were left out at
 * first, on the assumption that a string reaching the screen came from a
 * component, which is false: the lint messages, the narrative and the
 * markdown export all live in plain modules. The build scripts are read too,
 * for what they print into a terminal.
 */
// The options have to be written out at each call: Vite parses this at build
// time and demands an inline object literal, so a shared constant fails with
// "Expected the second argument to be an object literal".
const ALL = {
  ...(import.meta.glob("./**/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("./**/*.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../*.mjs", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("../scripts/*.mjs", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
};

/**
 * Test files are set aside. Their labels are written in English now like
 * everything else, but the older suites still carry French ones and are not
 * being rewritten; either way a `describe` reaches no screen. The case did
 * not come up as long as no test was written in TSX.
 */
const SOURCES = Object.fromEntries(
  Object.entries(ALL).filter(
    ([file]) => !file.endsWith(".test.tsx") && !file.endsWith(".test.ts"),
  ),
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
      new RegExp(`>([^<>{}]*${ACCENT}[^<>{}]*)<`, "g"), // JSX text on one line
      // JSX text ALONE on its line, which the pattern above cannot see: it
      // wants the surrounding angle brackets, and a label written under its
      // <input /> has neither. That blind spot let "Inclure le récit" sit in
      // the export dialog for months while this test reported all clear.
      // Anything quoted, braced or tagged is excluded, so what is left is
      // text a user reads.
      new RegExp(`^\\s*([^<>{}'"\`()\\[\\];=]*${ACCENT}[^<>{}'"\`()\\[\\];=]*)\\s*$`, "g"),
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
    // The corpus must not be empty, or the test passes by reading nothing.
    // Each family is checked on its own: a glob that stops matching is
    // silent, and the total would stay well above the floor while a whole
    // extension quietly left the net.
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => f.endsWith(".tsx")).length).toBeGreaterThan(20);
    expect(files.filter((f) => f.endsWith(".ts")).length).toBeGreaterThan(10);
    expect(files.filter((f) => f.endsWith(".mjs")).length).toBeGreaterThan(1);
    expect(offenders).toEqual([]);
  });

  it("le détecteur voit bien une chaîne fautive", () => {
    // Without this check, a broken detector would pass for healthy code.
    expect(accentedStrings('<p>Aucun résultat</p>')).toContain("Aucun résultat");
    expect(accentedStrings("const m = 'Opération annulée'")).toContain("Opération annulée");
    // Le cas qui était passé entre les mailles : du texte JSX seul sur sa
    // ligne, sans balise autour de lui.
    expect(accentedStrings("        Inclure le récit\n")).toContain("Inclure le récit");
  });

  it("ne se déclenche ni sur un commentaire ni sur une plage de regex", () => {
    expect(accentedStrings("// pas de résultat trouvé")).toEqual([]);
    expect(accentedStrings("/** Récupère la liste */")).toEqual([]);
    expect(accentedStrings("name.replace(/[^a-zA-Z0-9à-ÿÀ-Ÿ _-]/g, '')")).toEqual([]);
  });
});
