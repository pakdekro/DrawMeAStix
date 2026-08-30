# Contributing

Thanks for looking. This is a side project, so the honest expectation first:
issues get read, pull requests get reviewed, neither happens on a schedule.

This file is the short form, and it is enough to get a change written and
checked. The long form lives in the
[Contributing](https://github.com/pakdekro/DrawMeAStix/wiki/Contributing) wiki
page: what each test suite actually proves, how CI is arranged, and the traps
that have already cost somebody an afternoon.

## What you need

Most changes touch `frontend/` alone. That is the application: the STIX logic,
the canvas and the storage all run in the browser, so Node is the only tool you
need for them.

| You are touching | You need |
|---|---|
| `frontend/` | Node 22 |
| `backend/` | uv, Python 3.12 or later, and `libmagic1` on the machine |
| `enricher/` | uv, Python 3.13 or later |

`backend/` is not a service and never runs in production. It is the reference
STIX implementation that generates the golden vectors, and the README says why
that trade was made.

## The one thing that will trip you up

**Run `npm test`, not `npx vitest`.** The OASIS validators are compiled from the
vendored schemas by a `pretest` hook, and they are not committed: the production
Content-Security-Policy forbids `unsafe-eval`, which ajv needs to compile at
runtime. Skip the hook and the validation tests fail on a module that was never
written, which reads like a broken checkout rather than a missing step.

## Running the checks

The same ones CI runs, so a green local run means a green pull request.

```
cd frontend  && npm ci && npx tsc -b && npm test && npm run build
cd backend   && uv sync && uv run ruff check . && uv run pytest -q
cd enricher  && uv sync && uv run ruff check . && uv run pytest -q
```

There is no ESLint anywhere in the tree. The TypeScript type-check stands in its
place, with `strict` and the unused-symbol checks on.

The enricher suite patches the tool runner and the HTTP client, so it needs
neither the network nor `dig`, `whois` or `subfinder` on your machine. A test of
yours that reaches out for real will pass on your laptop and hang in CI.

## Golden vectors

`frontend/src/stix/golden-vectors.json` and `golden-bundle.json` are committed
but generated, by two scripts under `backend/scripts/`. Never edit them by hand,
and regenerate them in the same pull request as the change that moved them, or
the `stix-core` job fails on the diff.

If a vector moves, an identifier moved with it, and an identifier that moves
turns somebody's next re-import into a duplicate rather than an update. Say in
the pull request which recipe changed and why. The wiki page has the commands
and the two failure modes worth being careful about.

## Shipped datasets

`frontend/public/attack-dataset.json`, `f3-dataset.json`, `atlas-dataset.json`,
`actors-dataset.json` and `countries.json` are committed but generated, by five
scripts under `backend/scripts/`. Same rule as the golden vectors: never edit them by hand.
The `Datasets` workflow regenerates them every Monday and opens a pull request
when the content moved, so most of the time you have nothing to do. It opens
one even when the tests then fail, and says so in the body: what fails there is
a disagreement between the new files and something written down beside them,
and the fix belongs on that branch.

They decide which spelling an analyst is offered, and our identifiers are
computed from names, so a dataset is not decoration: it decides whether two
people's objects merge. Two consequences worth knowing before touching them.

**ATT&CK means its three matrices.** Enterprise, Mobile and ICS are one
knowledge base with one identifier space, so they are merged into one corpus
and a technique that is not Enterprise carries its domain. The build checks at
every run that no number is claimed by two of them: that is the only thing that
could put two names on one identifier. Cloud, Containers and the other matrices
of the website are platforms of Enterprise, not domains, and need nothing.

**ATT&CK is authoritative on actor names.** The actor aliases come from the
MISP galaxy, which disagrees with MITRE on where an actor ends: MITRE folds
UNC2452 into APT29, the galaxy keeps it apart. `build_actors_dataset.py`
therefore drops every galaxy actor whose name or synonym ATT&CK already
resolves, rather than merging the two. `src/actors.test.ts` checks that
property on the shipped file: if it fails after a regeneration, MITRE has
adopted a name the galaxy also carries, and the arbitration did its job.

**The corpora are not interchangeable.** The ATT&CK dataset feeds the palettes
and text extraction; the actor aliases feed only the name fields. Extraction
matches every name in its corpus against pasted prose, so a name that lands
there is asserted rather than offered, which is a much higher bar. The F3
and ATLAS datasets are a third case: they are searched like ATT&CK and
extracted **by number only**, because a fraud technique called "Bank Deposit"
is also a sentence, and 36 ATLAS techniques carry a name ATT&CK also uses.

## Adding a knowledge base

A fourth framework beside ATT&CK, F3 and ATLAS is a documented path rather
than a design exercise: [`docs/adding-a-framework.md`](docs/adding-a-framework.md) has
the four questions to answer from the framework's published data first, the
files to touch in order, and the traps that have already been paid for once.

## Conventions

- **Branches**: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/),
  referencing the issue (`#12`).
- **One issue, one pull request.** This is worth more than tidiness: commit
  bodies here say what was wrong and what was rejected as a fix, and a pull
  request carrying two unrelated changes cannot do that for either of them.

Nothing enforces any of it, no hook and no CI job. `git log` is the reference if
you are unsure what a message should look like.

## Language

English, everywhere: the interface, the documentation, the code comments, the
commit messages and the test descriptions. There is no i18n layer, so English is
written in place and there is nothing to maintain twice.

The project started in French and the rule widened in steps, so `git log` still
holds French messages and some suites still have French `describe` labels. They
are not being rewritten. Write yours in English and translate what you touch.

The golden-vector fixtures are the one deliberate exception and keep their
accented names (`Opération Héron`, `Δοκιμή Unicode`, `ПлохойСофт`): they exist
to exercise JCS canonicalisation on non-ASCII, and translating them would delete
the thing under test.

`frontend/src/i18n.test.ts` enforces part of this, and it is worth knowing which
part. It keys on **accented letters**, so French written without accents goes
straight through: an audit crossing the system French and English dictionaries
turned up 25 such strings at once, one of which had been travelling inside an
exported STIX bundle. That audit cannot become a test, it carries a 63% false
positive rate. Read the interface now and then.

## Reporting a security issue

Privately, and not as a public issue: [SECURITY.md](SECURITY.md) has the
process, and also draws the line between a security report and a normal bug.

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
