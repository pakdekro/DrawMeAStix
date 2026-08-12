/**
 * Precompiles the vendored OASIS schemas into "standalone" ajv validators
 * (#77): the production CSP forbids `unsafe-eval`, yet ajv compiles its
 * schemas through `new Function` at runtime. Here the code generation runs
 * at build time (Node); the emitted module holds no eval at all.
 *
 * Run by the predev/prebuild/pretest hooks - the output
 * (src/stix/generated/validators.mjs) is not committed.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020, _ } from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const schemasDir = join(here, "..", "src", "stix", "schemas");
const outDir = join(here, "..", "src", "stix", "generated");

const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  allowUnionTypes: true,
  // the OASIS schemas contain escapes (\-) that are invalid
  // under the `u` flag ajv turns on by default
  unicodeRegExp: false,
  code: {
    source: true,
    esm: true,
    // runtime reference to the formats inside the generated code; the
    // `require` is rewritten into an ESM import below
    formats: _`require("ajv-formats/dist/formats").fullFormats`,
  },
});
addFormats(ajv);

/** Types from the `common/` group the export really emits as objects. */
const COMMON_ROOTS = new Set(["marking-definition", "extension-definition"]);

/** valid JS exportName → { STIX type, $id } */
const roots = new Map();
for (const group of readdirSync(schemasDir)) {
  for (const file of readdirSync(join(schemasDir, group))) {
    if (!file.endsWith(".json")) continue;
    const schema = JSON.parse(readFileSync(join(schemasDir, group, file), "utf8"));
    ajv.addSchema(schema);
    const stem = file.replace(/\.json$/, "");
    // only object-type schemas act as validation roots. Two of them live in
    // `common/` without being SDOs: the TLP markings, and the extension
    // definition the export attaches to the bundle. Without them here, the
    // validator reports them as unknown types - when we are the ones
    // emitting them.
    if (["sdos", "sros", "observables"].includes(group) || COMMON_ROOTS.has(stem)) {
      roots.set(stem.replace(/-/g, "_"), { type: stem, id: schema.$id });
    }
  }
}

let code = standaloneCode(
  ajv,
  Object.fromEntries([...roots].map(([name, { id }]) => [name, id])),
);

// standalone emits CJS `require`s (formats, ajv runtime helpers), even in
// ESM - rewritten as static imports so Vite can bundle them without eval
const imports = new Map();
code = code.replace(/require\(["']([^"']+)["']\)\.(\w+)/g, (m, path, prop) => {
  const alias = `__req${imports.size}_${prop}`;
  const stmt =
    prop === "default"
      ? `import ${alias} from "${path}";`
      : `import { ${prop} as ${alias} } from "${path}";`;
  if (!imports.has(m)) imports.set(m, { alias, stmt });
  return imports.get(m).alias;
});
code = [...imports.values()].map((i) => i.stmt).join("\n") + "\n" + code;

if (code.includes("require(")) {
  throw new Error("leftover require() in the generated code - unexpected shape");
}

code += `\nexport const validators = {\n${[...roots]
  .map(([name, { type }]) => `  "${type}": ${name},`)
  .join("\n")}\n};\n`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "validators.mjs"), code);
console.log(`validators.mjs : ${roots.size} types, ${(code.length / 1024).toFixed(0)} Ko`);
