# Adding a knowledge base

This canvas ships two catalogues of adversary behaviour, ATT&CK and F3, and is
built to take a third without a mode of its own. This document is the recipe,
written straight after F3 went in, so that the next one is an afternoon rather
than a rediscovery.

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
section: getting it wrong is silent for months.

## The files, in order

| Where | What |
| --- | --- |
| `backend/scripts/build_<fw>_dataset.py` | distils the published data into a palette dataset |
| `frontend/public/<fw>-dataset.json` | the committed result, regenerated weekly |
| `frontend/src/frameworks.ts` | one entry: id, short name, label, url template |
| `frontend/src/<fw>.ts` | the lazy loader for the dataset |
| `frontend/src/components/AttackPalette.tsx` | one more chip in the switch |
| `frontend/src/components/CommandPalette.tsx` | one more corpus in Ctrl+K |
| `frontend/src/ioc.ts`, `frontend/src/extract.ts` | the identifier shape |
| `frontend/src/components/<Fw>Guide.tsx`, `<fw>.html` | the page that explains it |
| `frontend/src/prerender.tsx`, `frontend/prerender.mjs`, `vite.config.ts` | the page's build |
| `frontend/src/App.tsx`, `frontend/public/sitemap.xml` | the page's addresses |
| `.github/workflows/datasets.yml` | the weekly regeneration |

Export and import need **no change at all** if the registry entry is right.
That is the point of the registry.

## The build script

Model it on `build_f3_dataset.py`. What matters, in the order the mistakes cost
us time:

- **Read the native file when the STIX bundle loses information.** F3's native
  file carries `isAttack`, which says whether a technique is borrowed from
  ATT&CK. Its STIX bundle stamps `mitre-f3` on every external reference,
  T-numbers included: building from the bundle, we would have claimed that
  `T1566` is an F3 identifier. Compare the two files before choosing.
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
  url: (id) => `https://…/${id}` }
```

`id` **is** the `source_name` of the STIX external reference, so what an entity
carries and what a bundle claims cannot drift apart. `short` goes on the card
of a technique, `label` in the form and in the Ctrl+K group. `url` is optional:
an ATT&CK number resolves itself for any consumer on the planet, an `F1001`
does not. When you give one, take the url the framework's site actually serves.
F3's own bundle publishes a flat path that their site does not answer, and
their pages live behind a hash route.

The first entry is the default, and the default is stored as **absent**: an
`attack-pattern` with no `mitre_framework` is an ATT&CK technique, because
every technique drawn before there was a second framework carries nothing.
`toProperties` strips the default so there is only ever one representation of
it.

## The identifier shape

`ioc.ts` validates what an analyst types into the MITRE ID field, and
`extract.ts` recognises identifiers in pasted prose. Two rules learned from F3:

- **Match by number, never by name.** "Bank Deposit" and "Phishing" are
  ordinary English, and extraction from prose that matches names would fill the
  triage tray with sentences.
- **The shape of an identifier decides nothing about its framework.** F3
  publishes T-numbers, so reading "starts with an F" would hand ATT&CK a fraud
  technique and "starts with a T" would do the reverse. The framework is a
  property of the object, set by whichever palette created it, and read back
  from the external reference on import.

## The palettes

In `AttackPalette`, one more chip in the switch, and both corpora searched the
same way. The panel says what it searches, and it does not teach: that is the
page's job.

In `CommandPalette`, one more corpus, in a group named after the framework, and
**only its own techniques**. The borrowed ones are already in the ATT&CK group
and build the very same object: offered twice, the palette would be asking the
analyst to choose between a thing and itself.

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

- **The dataset invariants**, a twin of `f3.test.ts`: no identifier claimed
  twice, no name colliding with one ATT&CK already resolves, every entry
  usable.
- **The page against the dataset**, in `frameworks.static.test.tsx`: the
  tactics printed on the page are the tactics in the file, and any count the
  prose states is computed from it. Prose is the part of this work with no
  compiler, and this is its compiler.
- **The page's links**, same file: a page served at its own address must write
  no hash-relative link.

## The weekly refresh

Add the build to `.github/workflows/datasets.yml`, **after** the ATT&CK one:
the name arbitration reads that file. Nothing else to do. The job runs the
frontend tests against the regenerated datasets, opens a pull request with the
scripts' reports in the body, and says in it whether the tests passed. A
framework that grows a ninth tactic arrives as a red pull request naming the
page to update, which is the whole point of the test above.
