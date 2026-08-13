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

Everything a reader meets is in English: the interface, the documentation, and
the code comments. There is no i18n layer, so English is written in place and
there is nothing to maintain twice.

Three things stay as they are on purpose: test descriptions, which only ever
surface in the output of a test run, commit messages, and the golden-vector
fixtures, which keep their accented names because they exist to exercise JCS
canonicalisation on non-ASCII.

`frontend/src/i18n.test.ts` enforces the rest, up to a point. It reads `.tsx`
files only and keys on accented characters, so an unaccented French label passes
untouched. One survived that way for months.

## Reporting a security issue

Privately, and not as a public issue: [SECURITY.md](SECURITY.md) has the
process, and also draws the line between a security report and a normal bug.

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
