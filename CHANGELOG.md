# Changelog

Notable changes, newest first. Dates are the day the work landed on `main`.

The showcase page carries a shorter, friendlier version of the same history;
this file is the one meant for people reading the code.

## Unreleased

- **The STIX guide is now a real page at `/guide`.** It used to live behind
  `#/guide`, an address no server ever sees: nothing could index it, a link
  preview showed nothing, and reading a page of prose meant starting a graph
  application first. The page is now written into the HTML at build time, so
  it arrives complete and readable, then the script hydrates it and the
  dropdowns come alive. Same guide at both addresses, down to the markup.
- The guide loads its own bundle rather than the application's: no canvas, no
  storage, no document readers.
- **A page that says what the tool does with your data**, at `/about`: where an
  investigation lives, what leaves the browser and what never does, what a
  backup file carries that a bundle does not, and how long any of it is kept.
  It also explains why identifiers are computed rather than drawn, what that
  buys you, and the two things it costs: renaming an object creates a second
  one downstream, and an identifier is a stable fingerprint of the value it was
  derived from. All of this was already true of the code and written down
  nowhere. The page carries no script at all.
- **An enrichment token is no longer written to disk unless you ask.** It used
  to sit in `localStorage` indefinitely, next to the preferences, although it
  is a credential rather than a setting. It now lasts as long as the tab, and a
  checkbox per endpoint keeps it on the machine for those who prefer that. An
  endpoint already configured keeps working exactly as before. This is not
  encryption, and it is not presented as such: it bounds how long the secret
  exists, not who can read it.
- The token fields are masked, and the endpoint dialog had kept a French
  button label.
- The export dialog now says, at the moment it matters, that re-importing
  updates rather than duplicates, and links to what that implies.
- A French string had survived in the export result, where the guard against
  them could not see it for want of an accent.
- The application host now serves a `robots.txt` and a `sitemap.xml`, which it
  had neither of.

## 1.0.0 - 11 August 2026

First version tagged for a public audience. Everything below already worked
before; what changed is that the sharp edges an outside user would have hit
first are gone.

### The export says what it means

- The layout extension's **definition now travels with the bundle**, signed by
  a deterministic tool identity. Objects used to carry an `extensions` key
  pointing at an identifier nothing in the bundle explained.
- **Deterministic identifiers are deduplicated.** Two canvas objects can
  legitimately collapse onto the same STIX identity (two techniques sharing an
  ATT&CK id, two identical relationships); the bundle used to carry the
  duplicate silently, and the second assertion vanished on ingestion.
- An indicator whose `valid_until` precedes its `valid_from` is **refused**
  rather than exported invalid, and the pre-export check now compares the
  effective start date instead of the one typed in.
- Export freshness compares the state the file actually contains, so
  "exported" can no longer be shown for a file that no longer matches.

### Nothing is lost without saying so

- **Rejecting a triage candidate is undoable**, alone or by group, like
  deleting a node from the canvas already was.
- Accepting a group of candidates absorbs duplicates instead of creating a
  second node: the three acceptance paths behave the same at last.
- The working notes no longer overwrite what is being typed when the
  investigation reloads.

### Keyboard and accessibility

- A shared modal component: **Escape closes**, focus moves in, is trapped, and
  is handed back to whatever opened the dialog. `role`/`aria-modal`/linked
  title everywhere.
- `?` opens a shortcut memo from the canvas; `/` and `?` no longer fire from
  under an open dialog.
- Focus is visible on primary buttons and on the node delete button, which was
  reachable by keyboard while invisible.

### Learning STIX

- A guide at `#/guide` explaining objects, observables and indicators, built
  **from the relationship matrix itself** so it cannot drift from the tool.
  Pick two types and it tells you whether they can be linked, with which verb,
  and what that verb means.

### Robustness

- Malformed third-party bundles no longer make an investigation permanently
  unopenable: types are normalised at the import boundary, and a badly typed
  field costs that field rather than the whole bundle.
- IndexedDB reports being blocked by another tab instead of leaving the home
  page empty for ever.

### Packaging

- `SECURITY.md`, this file, the version shown in the status bar, Apache-2.0
  declared in `package.json`.
- Security headers now reach `/assets/` too, where nginx silently dropped them
  there.
