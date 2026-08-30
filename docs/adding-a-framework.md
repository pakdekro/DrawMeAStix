# Adding a knowledge base

This canvas ships three catalogues of adversary behaviour, ATT&CK, F3 and
ATLAS, and is built to take a fourth without a mode of its own. This document
is the recipe, written straight after F3 went in and then walked with ATLAS,
which took an afternoon rather than a rediscovery.

The two are worth reading as a pair, because they answer question 1 in
opposite ways: **F3 reuses 43 ATT&CK numbers**, which is where all its
difficulty lives, and **ATLAS borrows none**, which makes it mostly plumbing.
Find out which one you are dealing with before anything else.

A "framework" here means one specific thing: **a catalogue of techniques keyed
by MITRE-style identifiers**. Everything below assumes that shape. A framework
that is not that (a control catalogue, a maturity model, a taxonomy of losses)
does not fit this path and needs a design conversation first.

## Decide before writing anything

Four questions. Answer them from the framework's own published data, not from
its website prose.

**1. Does it reuse identifiers from a framework we already ship?**
Look for its convention on techniques that already exist elsewhere. F3's is
explicit: a technique already described by ATT&CK keeps its ATT&CK number, so
43 of its 123 techniques are ATT&CK numbers. This is the single most
consequential answer, because our identifiers derive from the number alone: one
number is one object, and two names for it would put two cards on the canvas
for one thing. If the answer is yes, the borrowed entries must be emitted as
the framework they belong to, and their names taken back from it.

ATLAS answers no, and shows what "no" looks like: 37 of its techniques record
the ATT&CK technique they were **adapted from**, in a field of their own, while
keeping an `AML.*` number. That is a cross-reference and not an identity, so it
travels in the dataset, is read on the framework page, and is never written
into a bundle. MITRE's own ATLAS bundle does not write it either, which is the
argument that settles it. Watch for the near-miss too: 36 ATLAS techniques
carry a name ATT&CK also uses, and that is not a collision, because two numbers
are two objects.

**2. Which relationship types does its own bundle carry?**
F3's carries exactly one, `subtechnique-of`, which describes the catalogue and
never an incident: nothing to add to the relationship matrix. A framework that
ships incident-level verbs we do not have is a different amount of work, and
the verbs would have to be justified against the STIX matrix rather than added
because a framework uses them.

**3. Which object types does it publish?**
We consume `attack-pattern` and `x-mitre-tactic`. A framework that also
publishes mitigations (`course-of-action`), data sources or case studies
publishes things this canvas has no object for. That is not a blocker: ship the
techniques, and say in its page what was left out and why.

**4. Is its data published per version, or in place?**
This decides how the weekly refresh sees a new release. See the build script
section: getting it wrong is silent for months. The two we have differ again:
F3 publishes one file per version and nothing that names the current one, so
the build lists them and takes the highest, while ATLAS publishes a chain of
pointer files that name the current release, and the build follows it. Neither
is guesswork, and a pinned filename is.

## The files, in order

| Where | What |
| --- | --- |
| `backend/scripts/build_<fw>_dataset.py` | distils the published data into a palette dataset |
| `frontend/public/<fw>-dataset.json` | the committed result, regenerated weekly |
| `frontend/src/frameworks.ts` | one entry: id, short name, label, route, placeholder, url |
| `frontend/src/<fw>.ts` | the lazy loader for the dataset |
| `frontend/src/datasets.ts` | one line: which loader answers for that identifier |
| `frontend/src/ioc.ts` | the shape of an identifier, if it is a new one |
| `frontend/src/components/<Fw>Guide.tsx`, `<fw>.html` | the page that explains it |
| `frontend/src/prerender.tsx`, `frontend/prerender.mjs`, `vite.config.ts` | the page's build |
| `frontend/src/App.tsx`, `frontend/public/sitemap.xml` | the page's addresses |
| `.github/workflows/datasets.yml` | the weekly regeneration |

**Neither palette is in that list, and neither are the export and the import.**
The framework switch, its search, the Ctrl+K group, the mark on a card, the
select in the form, the reference written at export and the one read at import
all go through the registry: a framework they had to be told about one by one
is a framework somebody will forget to tell one of them about. Text extraction
is in the same case, since it resolves the other frameworks by looking their
numbers up rather than by matching a shape.

The page is the part that cannot be generic, and that is deliberate. It exists
to say what is particular about this framework.

## The build script

Model it on `build_f3_dataset.py` when the framework borrows identifiers, and
on `build_atlas_dataset.py` when it does not. What matters, in the order the
mistakes cost us time:

- **Read the native file when the STIX bundle loses information.** F3's native
  file carries `isAttack`, which says whether a technique is borrowed from
  ATT&CK. Its STIX bundle stamps `mitre-f3` on every external reference,
  T-numbers included: building from the bundle, we would have claimed that
  `T1566` is an F3 identifier. Compare the two files before choosing. ATLAS
  publishes both too, in two different repositories, and the STIX one trailed
  the data one by eight techniques on the day it was looked at.
- **Never pin one version file.** F3 publishes `f3-v1.1.json` with no
  unversioned copy, so a pinned URL rebuilds the same release for ever and the
  weekly job reports "unchanged" about a framework that has moved. List the
  published files and take the highest version, comparing the numbers as tuples
  so that `f3-v1.json` does not outrank `f3-v1.1.json`.
- **Published, never the working copy.** A repository often holds the file its
  own site builds from, always current and always somebody's draft. We ship
  what was published.
- **Take back the names of shared techniques** from the framework that owns
  them, and count how many you renamed. F3 spells sub-techniques by full path
  ("Brute Force: Password Guessing") where ATT&CK spells the leaf ("Password
  Guessing"), which is 16 techniques whose two spellings would have collided on
  one identifier.
- **Report what you could not resolve rather than trusting it.** Five F3
  identifiers flagged as ATT&CK are not in our Enterprise dataset, three
  because they are ATT&CK Mobile and one because it exists nowhere in ATT&CK at
  all. They keep their own spelling and the script names them at every run.
- **Print a one-line report.** It ends up in the body of the pull request the
  weekly job opens, and it is what a reviewer reads before merging.

The output is `{version, tactics[], entries[]}`, where an entry is
`{type, id, name, framework, tactics[]}`. `framework` is what the registry
calls it, and it is per entry rather than per file precisely because of
question 1.

## The registry

```ts
{ id: "mitre-atlas", short: "ATLAS", label: "ATLAS (AI systems)",
  route: "atlas", placeholder: "AML.T0051, prompt, poisoning…",
  url: (id) => `https://atlas.mitre.org/techniques/${id}` }
```

`id` **is** the `source_name` of the STIX external reference, so what an entity
carries and what a bundle claims cannot drift apart. `short` goes on the card
of a technique and on its chip, `label` in the form and in the Ctrl+K group,
`route` is where its page lives at both addresses, `placeholder` is what the
palette suggests typing. `url` is optional: an ATT&CK number resolves itself
for any consumer on the planet, an `F1001` does not.

When you give one, take the url the framework's site actually serves, and check
it in a browser rather than with `curl`. Both sites we point at answer a plain
request with something other than the page: F3's is hash routed, so the flat
path its own bundle publishes renders the home page, and ATLAS's returns a 404
status while serving the application, which a browser resolves and `curl`
reports as missing.

The first entry is the default, and the default is stored as **absent**: an
`attack-pattern` with no `mitre_framework` is an ATT&CK technique, because
every technique drawn before there was a second framework carries nothing.
`toProperties` strips the default so there is only ever one representation of
it.

## The identifier shape

`ioc.ts` validates what an analyst types into the MITRE ID field, and
`extract.ts` recognises identifiers in pasted prose. Two rules learned from F3:

- **Match by number, never by name.** "Bank Deposit" and "Phishing" are
  ordinary English, 36 ATLAS techniques carry a name ATT&CK also uses, and
  extraction from prose that matched names would fill the triage tray with
  sentences. Only ATT&CK is matched by name, and that is a deliberate
  exception: its corpus is the one whose names are terms of art.
- **The shape of an identifier decides nothing about its framework.** F3
  publishes T-numbers, so reading "starts with an F" would hand ATT&CK a fraud
  technique and "starts with a T" would do the reverse. The framework is a
  property of the object, set by whichever palette created it, and read back
  from the external reference on import.

## The palettes, which you do not touch

Both read the registry. `AttackPalette` grows a chip and searches the new
corpus the same way as the others; the panel says what it searches, and it does
not teach, which is the page's job. `CommandPalette` gains a group named after
the framework holding **only its own techniques**: what one framework borrows
from another is already in that other one's group and builds the very same
object.

The one thing to check by hand is that the corpus really is loaded lazily. Both
palettes fetch a dataset the first time somebody searches with it, and a
framework whose file is fetched on mount would be paid for by everybody who
never opens it.

## The page

Prose, no script, prerendered at build time, and the same component served
inside the app at `#/<fw>`. Copy `F3Guide.tsx` and its plumbing:
`prerender.tsx` gets a renderer, `prerender.mjs` a row, `vite.config.ts` an
input, `App.tsx` an entry in `PROSE`, `sitemap.xml` a URL, and
`AttackPalette.tsx` a link under the search box.

What such a page owes its reader: what the framework is and is not, how to read
one of its numbers, what it shares with the others, what a technique becomes on
this canvas, and what the framework will not do for you. Derive what can be
derived: the relationships of an `attack-pattern` come from the matrix through
`guide.ts`, so that half of the page cannot age.

## The tests

- **The dataset invariants**, a twin of `f3.test.ts` or of `atlas.test.ts`:
  no identifier claimed twice, every entry usable, and the answer to question 1
  held in place. For a framework that borrows, that means no two spellings of
  one number; for a framework that does not, it means checking that it really
  never does, in both directions.
- **The page against the dataset**, in `frameworks.static.test.tsx`: the
  tactics printed on the page are the tactics in the file, and any count the
  prose states is computed from it. Prose is the part of this work with no
  compiler, and this is its compiler.
- **The page's links**, same file: a page served at its own address must write
  no hash-relative link.

## The weekly refresh

Add the build to `.github/workflows/datasets.yml`, **after** the ATT&CK one if
it borrows identifiers: the name arbitration reads that file. Nothing else to do. The job runs the
frontend tests against the regenerated datasets, opens a pull request with the
scripts' reports in the body, and says in it whether the tests passed. A
framework that grows a ninth tactic arrives as a red pull request naming the
page to update, which is the whole point of the test above.
