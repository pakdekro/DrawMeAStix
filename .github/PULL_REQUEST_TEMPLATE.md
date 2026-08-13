<!--
One issue, one pull request. Delete the sections that do not apply rather than
leaving them empty.
-->

Closes #

## What changes, and why

<!--
The why is the part that cannot be read from the diff: what was wrong, and what
you tried that did not work. That is what the commit bodies in this repository
carry, and what makes them worth reading a year later.
-->

## Checks

<!-- Only the ones your change touches. CI runs all three regardless. -->

- [ ] `frontend`: `npx tsc -b`, `npm test`, `npm run build`
- [ ] `backend`: `uv run ruff check .`, `uv run pytest -q`
- [ ] `enricher`: `uv run ruff check .`, `uv run pytest -q`

`npm test`, not `npx vitest`: the OASIS validators are compiled by a `pretest`
hook and are not committed.

## Golden vectors

- [ ] Untouched.
- [ ] Regenerated, and committed here.

If they moved, say which recipe changed and why. An identifier that moves turns
somebody's next re-import into a duplicate rather than an update, so this is the
one thing in the tree that deserves a sentence of its own.

## Anything a reader meets

- [ ] English, and no i18n layer.
- [ ] Documentation updated if behaviour changed: the README, the wiki, or
      `CHANGELOG.md` if it is worth a release note.
