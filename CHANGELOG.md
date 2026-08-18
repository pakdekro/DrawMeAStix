# Changelog

Notable changes, newest first. Dates are the day the work landed on `main`.

The showcase page carries a shorter, friendlier version of the same history;
this file is the one meant for people reading the code.

## 1.5.0 - 18 August 2026

- **The re-layout stopped pretending it could draw the graph, and became a
  menu of arrangements instead.** A CTI investigation is shaped like a star,
  not like a tree: one malware wired to seventeen objects, one actor to five.
  Measured on two real investigations, no layered layout survives that. A
  Dagre layout that reads top to bottom comes out 5700px wide, and every way
  of narrowing it buys the width back in edge crossings: folding the wide
  ranks costs 119 crossings against 21, packing the ranks costs 41, and
  ranking nodes by their STIX type, the intuitive idea, sends 22 of 37
  relationships pointing back up the page. That last one fails for a reason
  worth stating: a STIX type has no fixed level in a flow, since an indicator
  is the source of `indicates` and a malware its target while that same
  malware is the source of `uses`. So the button stopped answering "what does
  this mean" and now answers "where am I". Seven arrangements, each laying the
  objects out in clusters that answer one question: by type, by detection
  (what carries no indicator yet), by TLP marking, loose ends first, by
  provenance (what a tool handed you against what you established), by
  validation (what the export will complain about), and by ATT&CK tactic. The
  layout by relationship is still there, one search away in the command
  palette. Arranging the meaning goes back to the analyst, which is where it
  was in practice anyway.

- **The layout you built yourself is kept, and comes back.** Trying three
  arrangements in a row used to leave no way home: the backup was rewritten
  each time, so it only ever restored the previous arrangement. It is now
  taken once, before the first arrangement, and it lives in the database
  rather than in memory, where a page reload turned a reversible detour into a
  permanent rearrangement. The button says "My layout" because that is what it
  restores. Like the working notes, it never reaches the exported bundle and
  writing it does not age the export.

- **Selecting an object shows what it touches.** Press `l`, select anything,
  and its direct neighbours take a ring while the relationships it is an end
  of come forward and everything else steps back. It works whatever
  arrangement the canvas is in, which is the point: reading a star is asking
  it one object at a time, not drawing it better. Off by default and on a
  keystroke, because selecting is also how you pick an object up to move it,
  and a canvas that dims itself at every click while you tidy is a strobe.

- **The object counter says what the objects are.** Hovering "24 objects" in
  the status bar breaks the total down by type, in the palette's own order and
  colours. The number said the investigation had weight; the detail existed
  nowhere short of counting nodes by colour on the canvas.

- **A file name pasted as an IOC is a file.** `setup.exe` and `payload.dll`
  were classified as domain names, and that did not stop at a wrong label in
  the triage tray: an observable's identifier is computed from its value, so
  the mistake minted a bogus object that merges with every other analyst's
  `setup.exe` on import. Extensions no registry sells now name a file.
  Deliberately absent from that list: `zip`, `mov`, `com`, `sh`, `py` and `pl`,
  which are all real top-level domains, and guessing on those would break the
  cases an analyst cares about most.

- **The connection handles are easier to grab than to draw.** The diamonds
  were clipped by a `clip-path`, which clips the pointer target along with the
  pixels: the shape you aimed at was smaller than the shape you saw. The
  target is now a transparent rectangle and the diamond is only paint.

- **Scenario templates stopped blaming the payload for the breach it walked
  through.** `X exploits vulnerability` names the component that did the
  exploiting, which a template cannot know: a flaw is often exploited at a
  different phase, by something else entirely. The relation now survives only
  in the scenarios whose payload is genuinely the exploiting component, and
  every scenario carrying a flaw still ties it to the actor.

- **Smaller fixes.** The fit that closes a re-layout no longer stops at React
  Flow's default zoom floor and leaves the result running off the screen. The
  enrichment settings are named instead of being drawn as a magnifying glass,
  which says "search" in every other piece of software. The inspector folds
  and unfolds from its own edge rather than from a button in the middle of the
  import/export group. `countries.json` stopped stamping the local `iso-codes`
  release into itself, which would have opened a noise pull request every
  Monday forever, and a lint error left the CI red on `main` since the 1.4.0
  release.

## 1.4.0 - 15 August 2026

- **Eight hundred more adversary names are suggested.** ATT&CK knows 174
  groups under MITRE's naming; an analyst reading a vendor report meets
  "Storm-2603" or "UNC5221", finds nothing, and creates one more object whose
  name, and therefore whose identifier, matches nobody else's. The MISP
  threat-actor galaxy (CC0) fills that tail. It is arbitrated at build time
  rather than merged blind: the two corpora disagree on where an actor ends,
  MITRE folding UNC2452 into APT29 where the galaxy keeps it apart, so any
  galaxy actor whose name or synonym ATT&CK already resolves is dropped whole,
  along with names two actors both claim. 181 were dropped for that reason,
  857 kept. They carry no MITRE number and say so in the list, and they are
  offered only where a name is typed into a form: the ATT&CK palettes say
  ATT&CK on screen and keep showing ATT&CK, and text extraction keeps matching
  the smaller corpus, because a name found in prose is asserted rather than
  offered.

- **The shipped datasets get a weekly job.** ATT&CK, the actor aliases and the
  countries are regenerated every Monday and land in a pull request when the
  content moved, never in a direct commit: a corpus decides which spelling
  analysts are offered, so the detection is automated and the decision stays
  human. The tool went from ATT&CK 17 to 19.1 without anything saying so.

- **Countries are suggested, so that two analysts write the same one.** A
  `location` identifier is computed from the name, never from the country
  code, so "FR", "France" and "French Republic" were three objects that no
  platform would ever merge, ours included. The name field of a location now
  offers the ISO 3166-1 list, reachable by code as much as by name: typing
  "FR" offers France, and picking it fills the country code and forces the
  type to Country. The list is 9 KB, loaded only once a location is typed, and
  regenerated from the `iso-codes` package by
  `backend/scripts/build_countries_dataset.py`.

- **A vulnerability can be named in five more scenarios.** Ransomware,
  defacement, watering hole, botnet DDoS and targeted espionage carry a CVE
  slot, as the three scenarios built around exploitation already did. Two
  relations follow it each time: the actor targets the flaw, and whatever
  exploits it says so. It was added where the way in is an exploited flaw, and
  nowhere else: a scenario that starts with a credential or with trust has no
  business suggesting a CVE field.

- **A scenario slot takes as many values as the case has.** A ransomware
  operator uses one tool, a C2 answers on one address: that was the shape of
  the form, and it was the shape of nothing else. Every field now carries a
  `+` that adds a line, and each line becomes its own object, with the
  relations of the template following: three tools give three `uses`, two C2
  addresses give two `communicates-with`. Two exceptions, both deliberate. A
  name typed twice in the same slot is created once, since the two would carry
  the same identifier anyway. And a relation whose two ends both hold several
  values is left undrawn: two domains and three addresses do not say which
  resolves to which, and the six links of the product would be five lies and a
  truth. The form says so before generating, next to the isolation warning, and
  the pairing stays a click away on the canvas.

- **The guide is fetched when it is opened**, rather than preloaded on every
  first visit. Worth a line only because the measurement that prompted it was
  wrong: the chunk that looked like the guide was React itself, and the real
  saving is 13 KB out of 721, not the two fifths announced.

- **`docs/identifiers.md` was undercounting the observables it leaves out**: it
  said three, there are five. `artifact` was missing its reason, which is real
  (its identity rests on the bytes), and `windows-registry-key` was missing
  from the list entirely, which is worse, because it has no reason at all. Its
  contributing properties would behave like every other type's. It is simply
  not implemented, and the page now says so.

- **A property the builder does not model went unreported on an observable
  again**, on the narrow set of names the six new types brought in. The list of
  keys the builder consumes itself was pooled across every observable, so
  declaring `display_name` for a user account silenced the "not re-exported"
  notice on an imported email address that carried one. The loss was the same
  as before, the notice about it was not, and that notice is the whole guard
  against an observable enriched elsewhere growing poorer at every round trip.
  The list is now read per type.

## 1.3.0 - 14 August 2026

- **Six more observables**: MAC address, mutex, directory, software,
  user account and X.509 certificate. STIX 2.1 defines eighteen of them and the
  tool carried seven, which is why a compromised account had to be drawn as an
  identity and a vulnerable product had nowhere to go but a description field.
  Three of the spec's eighteen are still absent, deliberately: `email-message`
  and `network-traffic` derive their identifier from the identifier of another
  object, so they cannot be dropped on a canvas and named the way every other
  node is, and `process` has no identifying property at all. The spec gives it a
  random UUID, so importing the same process twice would create it twice, which
  is exactly what this tool exists not to do. `docs/identifiers.md` says so
  rather than leaving the gap unexplained.
- The canonical bridges cover them. Dragging a link from an actor to any of the
  six offers a detection indicator with its pattern already written, and a
  certificate, an account, a MAC or a piece of software also offers the
  infrastructure it is part of (`consists-of`, where a network endpoint gets
  `communicates-with`). A mutex and a directory get only the indicator: they are
  malware artefacts on a victim host, STIX offers no relationship from a malware
  to either, and inventing one is what the bridges exist to avoid.
- **A MAC address pasted into the canvas is now recognised** instead of landing
  as free text, dashes or colons either way, and it is stored lowercase with
  colons, the only form the OASIS schema accepts. Typed by hand in capitals it
  is canonicalised the same way, so the canvas shows the spelling the export
  will carry: otherwise the same address entered twice made two nodes that
  collapse into one object only at export, behind a warning read far too late.
- Each observable's mandatory field now says what it is asking for. The generic
  hint ("198.51.100.7, evil.example…") was shown for every type, including the
  ones it makes no sense for: a software node is not after an IP address, and a
  certificate has no obvious "value" at all.
- Four scenario templates make use of them: the TLS certificate of a phishing or
  look-alike site, the vulnerable product and version behind an exploited
  service, and the account compromise scenario, whose "compromised account" slot
  was an `identity` standing in for something the format could not express and
  is now a real `user-account`, hung off the affected service.
- The graph read back as prose knows their names, the guide lists them, and the
  export is validated against the six OASIS schemas like everything else.
- **Verified against a real OpenCTI (7.26)**: the six types arrive with the
  right observable type, carry their TLP, and the platform recomputes exactly
  the identifiers we wrote. Importing the same bundle twice changes no count.
  That last point was the one the tests could not prove on their own: OpenCTI
  derives the identifier of an observable server-side, so `pycti` cannot stand
  in as the oracle the way it does for the objects.
- **The scenario dialog no longer moves while it is being filled in.** The
  isolation warning appeared and disappeared as slots were filled, and the box
  is centred vertically, so the fields above it slid out from under the cursor.
  The line is now always present, saying either what will stay unlinked or that
  everything will be linked, in a slot tall enough to hold both.

## 1.2.0 - 13 August 2026

- **Served over plain HTTP under anything but localhost, the application now
  refuses to start and explains itself.** Browsers restrict
  `crypto.randomUUID` and `crypto.subtle` to secure contexts. The first mints
  the identifier of every investigation, entity, relationship and note; the
  second computes the fingerprint that tells an export from the state it was
  taken of. Without them nothing can be recorded and nothing can be exported,
  so the tool was not degraded, it was unusable. It used to say so through
  `crypto.randomUUID is not a function`, thrown at the first click, well after
  the operator believed the deployment had worked. It now checks before
  mounting and shows what is missing, why, and the two ways out: TLS in front
  of the container, or a tunnel to localhost. No server-side setting can help,
  because a reverse proxy hands the container plain HTTP even when the browser
  is on HTTPS, so only the browser can answer the question.
- **The guide and "Your data" rendered in the system font**, and they are the
  two pages meant to be read by someone who does not know the tool. The font
  declarations lived in the application bundle alone, so since those pages
  became entry points of their own they asked for IBM Plex and loaded none of
  it.
- **Linking several objects at once could create half the relationships and
  then fail.** In the reverse direction the offered verbs were derived from the
  first selected object alone, so a mixed selection could be offered a verb
  that was legal for part of it. The creation went ahead pair by pair, wrote
  the compatible ones, threw on the first one that was not, and left no way to
  tell what had landed. Both directions now keep only the verbs every pair
  accepts, so the option disappears before it can be chosen.
- **`docker compose pull` failed** with `pull access denied for drawmeastix`.
  Both images are built here and published to no registry, but they carry an
  image name, and pull went looking for it on Docker Hub. `docker compose up`
  never hit this because it builds what it cannot pull, which is why it
  survived: deployment tools hit it, because they pull before they start.
- The build no longer prints a wall of red errors on its way to succeeding. The
  pre-render opened a Vite server and closed it while the dependency scanner
  was still running.
- **Twenty-seven French strings** reached the screen, mostly on error paths.
  They were invisible to the guard, which keys on accented letters, and they
  were found by crossing the system French and English dictionaries. One of
  them had been travelling inside exported STIX bundles, written into the
  content of an enrichment note. The guard now reads the plain modules and the
  build scripts too, not only the components, and its own documentation says
  what it cannot prove.
- A code of conduct, a contributing guide, issue templates and a pull request
  template. The bug template asks how the instance is served and under which
  browser, which is not paperwork: the last two export defects were visible
  only behind the project's own Content-Security-Policy and only under Firefox
  respectively.
- The language rule is English everywhere now, commit messages and test
  descriptions included. Nothing is rewritten backwards, and the documents say
  so rather than describing a tree that does not exist.

## 1.1.2 - 12 August 2026

- **An investigation holding a pasted screenshot could not be exported as an
  image, a JPG or a PDF**, on any deployment served with the project's own
  Content-Security-Policy. Screenshots live as `blob:` URLs and the capture has
  to read them back to embed them; `img-src blob:` was enough to display them
  but not to fetch them, and the export died whole. The policy now allows
  `connect-src blob:`. The defect had been there a long time and only shows
  behind that policy: served by a bare static server, everything worked.
- `font-src data:` is allowed too. The capture rasterises through an SVG loaded
  as an image, a document that cannot reach the page's own fonts, so they are
  embedded inline. Without it the export still produced a file, in a fallback
  typeface.
- When the rendering cannot be loaded the dialog said `[object Event]`, which
  is neither actionable nor searchable. It now names the serving policy as the
  likely cause.

## 1.1.1 - 12 August 2026

- **Image, JPG and PDF export failed under Firefox**, and only there:
  `can't access property "trim" of undefined`. The fault is in `html-to-image`,
  which filters the `@font-face` rules it collects through a property Firefox
  leaves undefined on those rules where Chromium fills it in. Markdown was
  spared for the sole reason that it never calls the library. We now supply the
  font CSS ourselves, which avoids that path entirely. Embedding cannot simply
  be skipped: the capture rasterises through an SVG document that cannot reach
  the page's own fonts, so the report would come out in a fallback typeface.

## 1.1.0 - 12 August 2026

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

- **"Your data" is reachable from the canvas**, not only from the home page and
  the export dialog: the `local only` badge in the status bar leads to it. The
  badge already states the promise, so it may as well lead to the text that
  explains and bounds it.
- **The code comments are in English**, all of them, across 142 files. They were
  translated by reading the code beside each comment rather than the comment
  alone, because what they carry is not in the code: the bug that motivated a
  line, the trap someone already fell into. Twenty-seven of them turned out to
  describe behaviour the code does not have and were corrected rather than
  translated.
- **A name typed with a trailing space no longer freezes the entity form.** The
  baseline was stored trimmed while the comparison used the untrimmed field, so
  the form stayed marked as modified for good and stopped picking up changes
  from anywhere else. Exactly the failure the comment above it claimed to
  prevent.
- The reference Python builder now derives the bundle id from the fingerprint,
  as the TypeScript one already did. Its own documentation promised an export
  reproducible byte for byte, which a random bundle id made false of it, and
  the golden fixture could never be regenerated identically.
- The identifier algorithm is specified in `docs/identifiers.md`, with the test
  vectors that lock it, so anyone can recompute an identifier and check it
  against ours rather than take our word for it. `SECURITY.md` gained a data
  lifecycle section.
- The guard against French reaching the screen was blind to text sitting alone
  on its line, which is how a French label survived months in the image export
  dialog. It sees that case now, and the test that checks the guard covers it.
- Em dashes are gone from the documentation and the interface.

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
