# Changelog

Notable changes, newest first. Dates are the day the work landed on `main`.

The showcase page carries a shorter, friendlier version of the same history;
this file is the one meant for people reading the code.

## 1.7.0 - 29 August 2026

- **F3 alongside ATT&CK, and a case that crosses from one to the other.**
  MITRE's Fight Financial Fraud matrix is offered in the framework panel, next
  to ATT&CK rather than instead of it. There are tools that model fraud and
  tools that model intrusions, and almost none that let one case be both,
  which is odd given that a great many frauds start as an intrusion. Nothing
  here is a mode: F3 needs no new verb, because its own bundle carries only
  `subtechnique-of`, which describes the catalogue and never reaches a canvas.
  On the canvas a fraud technique is an `attack-pattern` like any other,
  reached through the `uses` and `targets` the matrix already allows, and
  `impersonates` was already the most fraud-shaped verb we had. So the same
  actor can be shown spearphishing its way in and cashing out, in one graph
  and one bundle, and each half stays readable by the team that owns it.

- **The two frameworks meet on the technique instead of forking it.** F3
  reuses 43 ATT&CK techniques by number, and six of its eight tactics ARE
  ATT&CK tactics. That overlap is the whole point, and it is also a trap: our
  identifiers derive from the MITRE number alone, so a technique reached
  through F3 and the same one reached through ATT&CK are one object, and any
  disagreement about its NAME would put two cards on the canvas for it. F3
  spells sub-techniques by full path where ATT&CK spells the leaf, so the
  dataset build takes ATT&CK's name back for the shared ones and a test holds
  that line against future regenerations. Those techniques are then plain
  ATT&CK techniques, which is what makes the crossing above work at all.

- **A technique no longer claims ATT&CK just because it carries a number.**
  The export used to stamp `mitre-attack` on every `attack-pattern` that had
  one, which was true while ATT&CK was the only source. It is a fabricated
  reference the moment F1001 goes out claiming an ATT&CK identifier that does
  not exist, and the shape of the identifier cannot arbitrate: F3 publishes
  T-numbers of its own. So the framework is recorded next to the number, on
  the object, set by whichever palette created it and editable in the
  inspector. Absent still means ATT&CK, so nothing already on a canvas
  changed meaning, and the import reads the provenance back out of the
  reference. F3 references also carry a url, which ATT&CK does not need and
  F1001 does, and it is the one the F3 site actually serves, hash route and
  all, rather than the flat path F3's own bundle publishes and nothing
  answers. On the canvas a fraud technique wears a small F3 mark and an
  ATT&CK one wears none, because absent means ATT&CK there as everywhere
  else, and because a mixed case is exactly where you want to see which half
  of it you are looking at.

- **Three AI scenarios, and the scenario panel reorganised around families.**
  Prompt injection against an agent that then leaks through its own tools, a
  poisoned model taken off a hub, and a model extracted through the API it is
  served from. ATLAS numbers throughout, which is what those three cases are
  made of. One fraud scenario reaches across on purpose: a deepfake-assisted
  transfer is an ATLAS technique for the face and a voice, and F3 techniques
  for the money.

  Twenty-six scenarios under three headings meant scrolling past two families
  to reach the third, so the panel switches between them instead, behind the
  same chips the framework panel uses two icons above, each carrying its
  count. One family at a time, because somebody opening that panel is working
  an intrusion, a fraud or an AI incident, not the three at the same minute.
  Ctrl+K keeps its own group per family.

- **Seven fraud scenarios, and a second scenario now completes the first.**
  The fake adviser call, account takeover, SIM swap, card data theft, the mule
  network, crypto cash-out and the token scam, written on F3, ATT&CK and
  AADAPT numbers with the framework named beside each. Between them they cover
  the three ways money leaves: a transfer the victim makes themselves, one made
  in their name, and one that never touches an account at all. They sit under a
  heading of their own in the panel, with FOVI joining them where it always
  belonged: somebody opening that panel is working an intrusion or a fraud, and
  a rule costs less to read than a badge on every line.

  A test now holds every number a scenario carries against the shipped
  corpora, name included, since a typo there is a fabricated reference in
  every bundle that scenario ever produces. It found one on its first run, and
  not in the new ones: the FOVI scenario still pointed at `T1656`, which
  ATT&CK revoked in favour of `T1684.001`.

  What the second one used to do was draw a second graph beside the first. Two
  templates naming the same actor gave two cards, and that was worse than
  untidy: both collapse onto one STIX identity at export, so the second card's
  description was quietly the one that lost. A scenario now attaches to what is
  already drawn, the way the document import and the enrichment already did,
  and the labels of both scenarios end up on the object they share, because an
  actor in two cases belongs to both. A relationship both scenarios assert is
  drawn once: they agreed, and an agreement is one statement.

- **An audit of the four corpora together, and two holes closed.** Four
  catalogues now share one identifier space in this application, and an
  identity derived from a number alone, so what matters is no longer what each
  of them does but what they do to each other. That audit is now a test file:
  no number is claimed by two frameworks under two names, every number the
  palettes can produce is accepted by the form, every technique exports the
  reference its framework claims and nothing else, all of it validates against
  the OASIS schemas, and an export followed by an import and another export
  gives the same identifiers. It held on the day, and each of those would have
  failed in silence.

  Two things it found. The form now warns when a number cannot belong to the
  framework beside it: ATT&CK publishes no `AML.` number, so an ATLAS number
  filed under ATT&CK was about to become a fabricated ATT&CK reference, which
  is the exact class of mistake this release spent its time removing. The
  shapes moved into the framework registry to do it, so a fifth framework
  brings its own and nothing else changes. And the canonical bridges no longer
  offer a detection indicator when there is no pattern to put in it: an account
  named by its display name identifies nobody, the export already refuses it,
  and offering an indicator on top handed the analyst a second unexportable
  object in one click.

- **AADAPT, where a fraud that cashes out in crypto keeps going.** MITRE's
  Adversarial Actions in Digital Asset Payment Technologies: 68 techniques over
  eleven tactics, about exchanges, wallets, bridges and the consensus
  underneath. It earns its place next to F3 rather than beside it: the fraud
  matrix ends at Monetization with "Convert to Cryptocurrency", and AADAPT's
  own eleventh tactic is called Fraud. It is also a hybrid of the two
  arrangements already here, ten of its eleven tactics being ATT&CK's by
  identifier the way F3's are, while every technique is its own the way ATLAS's
  are, four of them adapted from an ATT&CK technique and numbered after it
  without ever claiming to be it. It publishes no version, so the panel shows
  none: the number in its data file is the version of the ATLAS tooling it was
  forked from, and a test holds that line.

- **The rest of ATT&CK: Mobile and ICS.** The palette shipped Enterprise and
  nothing else, so a SIM swap or an attack on a PLC had to be typed in by hand.
  All three matrices are now one corpus, which is safe because ATT&CK numbers
  them in one space: 918 techniques instead of 697, and not one identifier in
  common between the domains, checked at every build rather than assumed. They
  come with 126 more malware families, mobile ones mostly, and 6 more groups.
  A result that is not Enterprise says which matrix it is from, in the panel
  and in Ctrl+K, because a technique numbered T0800 answers a question nobody
  working an office intrusion asked. Two things fell out of it: three of the five
  identifiers F3 flags as ATT&CK but could not resolve are Mobile techniques,
  so they are now checked against ATT&CK rather than taken on F3's word (the
  two spellings already agreed, which is exactly what nobody could tell
  before), and five actors the MISP galaxy was answering for are now resolved
  by ATT&CK itself, which is the arbitration working. The dataset moves to ATT&CK v19.2 in the same pass.

- **ATLAS, the third matrix, and the one that borrows nothing.** MITRE's
  Adversarial Threat Landscape for AI Systems sits beside ATT&CK and F3 in the
  same panel: 178 techniques and 16 tactics about attacks on models and on the
  pipelines around them. Fourteen of those tactics mirror an ATT&CK tactic,
  because most of an attack on an AI system is an ordinary attack, and two have
  no ATT&CK counterpart at all: reaching the model, and preparing an attack on
  it. Unlike F3, ATLAS reuses no identifier: everything is an `AML` number of
  its own, and the 37 techniques adapted from an ATT&CK one merely record which,
  which the framework page reads and no bundle ever claims. So an intrusion that
  ends in a poisoned model is one graph, and the 36 techniques whose name exists
  in both catalogues are two cards with two numbers, which is what they are.

- **A framework is now an entry rather than a change.** Adding this one moved
  neither palette, neither the export nor the import, and no text extraction:
  they all read the framework registry, so the switch, the search, the Ctrl+K
  group, the mark on a card, the reference written at export and the one read
  at import came for free. What it did take is a build script, a line saying
  which loader answers for `mitre-atlas`, and a page. `docs/adding-a-framework.md`
  is the recipe, and it now has two worked examples that answer its first
  question in opposite ways.

- **The weekly refresh can now see an F3 release at all.** The build read one
  pinned file, `f3-v1.1.json`, because the native series is published one file
  per version with no unversioned copy: a v1.2 would have shipped, and the
  Monday job would have gone on rebuilding v1.1 and reporting "unchanged"
  about a framework that had moved. It now lists what MITRE has published and
  takes the highest version, and names the file it read in the report the pull
  request carries. Still the published artefact and never the working copy the
  site builds from, which is always current and is also somebody's draft.

- **A page for each framework, because a matrix is read and not searched.**
  The palette lets you find `F1005.003` and says nothing about what F3 is,
  which is fine for ATT&CK, common knowledge in this trade, and no use at all
  for a framework that is a year old. So `/attack` and `/f3`, prose pages of
  their own rather than a section of the STIX guide: that page teaches a
  format, these teach a body of knowledge, and the reader of one is rarely
  the reader of the other at the same moment. They cover what the framework
  is and is not, how to read a number, and what a technique becomes once it
  is on the canvas, including the trap that F3 also publishes ATT&CK numbers.
  What they say about relationships is derived from the matrix like the rest
  of the guide, and what they say about the frameworks themselves is held
  against the shipped datasets by a test: the eight F3 tactics on the page
  are the eight in the file, or the build says so. Reachable from the
  framework panel, from the guide, and from each other; served as plain HTML
  at their own address like the guide and "Your data".

- **The narrative reads the case in the order it happened.** A relation has
  carried an activity window since the first release and the narrative
  ignored it, so the story came out in the reading order of the attack chain:
  actors, then tooling, then infrastructure, then observables. That order is a
  decent guess when nothing better is known, and it is exactly wrong for a
  fraud, where the case IS the sequence and eight dated steps arrive as a bag.

  So a **Chronology**, named as such: every dated statement, from every
  subject, on one timeline, each line saying who did what that day. Ordering
  them in place was the first answer and it was half of one, because a case
  whose actor and whose malware are both dated then had two timelines to
  interleave by eye, and because the undated bulk a scenario generates opened
  the story ahead of what actually happened. What carries no date follows,
  under **Undated**, in the reading order it always had. A graph nobody dated
  has no chronology, hence no headings and nothing to explain: it reads
  exactly as it did before.

  The hour, when it is known. STIX has no day: `start_time` is an RFC 3339
  timestamp with seconds and a `Z` required, so a day-only window goes out as
  midnight UTC, and an imported hour used to be truncated to its day on screen
  and overwritten the moment somebody edited the date. A relationship now
  carries an optional time beside its date, in a second field rather than one
  `datetime`, so that leaving it empty stays a way of saying "that day" rather
  than a way of asserting midnight. The chronology orders, groups and reads to
  the minute, and midnight exactly is read back as a day, which is what
  everybody writes it to mean and what keeps our own roundtrip from rewording
  the narrative.

  And, at export, the chronology drawn, in every format and at the analyst's
  choice: in the Markdown a mermaid timeline above the list, where a diagram
  can be generated rather than drawn, and in the image report and the PDF the
  same rows painted on a rail, a dot per moment with its events under it,
  since neither of those has anybody downstream to render a diagram for it.
  The PDF draws its rail line by line, so a page break cuts it where the text
  is cut instead of leaving it running into the margin. The global chronology
  only: a drawing per subject would be several pictures saying what the
  by-subject lists already say in less room. It is a shortening and says so,
  dropping the scheme of a URL and cutting a label past seventy characters,
  since a box of ninety characters is a paragraph in a frame. The list under
  it is the same chronology in full, and the image report and the PDF now name
  their parts the way the Markdown does rather than running three sections
  together.

  A report gets one thing the panel does not: the same chronology again, one
  timeline per subject, every dated subject included. A subject with a single
  event has no sequence, so it reads as one line rather than as a heading over
  a list of one, but it is there: a reader looking up what the domain did and
  not finding it would conclude it did nothing dated. Those one-off subjects
  are gathered ahead of the blocks, each line opening with its moment like
  every other line of the section, because a lone line printed after a subject
  that has a sequence is read as the end of that sequence, and a date sitting
  in the middle of a sentence is read as a mistake. The section as a whole
  appears only when two subjects are dated, since a case whose actor did
  everything would print the same list twice under two headings. A 300 pixel
  panel read while working wants the case rather than the case and its index,
  so it stays out of there.

  The report image and the PDF give those parts three ranks that differ by
  more than a point of type: a section is small uppercase in the accent,
  tracked out and ruled off; a part of it is bold in the text colour; a subject
  inside that part is bold and quiet. Bold at one size for a heading and for a
  name, which is what these two did, is one rank wearing two hats, and it left
  a reader meeting "Chronology, by subject" and "The threat actor Guilde
  Vermeil" as the same kind of thing. There is more air between the ranks too,
  which is most of what makes them legible at all.

- **A technique says which knowledge base its number belongs to, and both
  are named.** ATT&CK and F3 look identical on a canvas, same shape and same
  word, while a case that crosses from an intrusion to a fraud is made of
  both. The card now carries the name of the framework, ATT&CK included:
  marking only the newcomer works while there are two and reads as an
  oversight the day there is a third. The three places that used to spell
  those names their own way (the export, the form, the card) read one list,
  so adding a framework is one entry and nothing else. The mark is read off
  the property and never off the number, which cannot arbitrate in either
  direction: F3 reuses 43 ATT&CK numbers and publishes T-numbers of its own.

- **The command palette knows the fraud matrix too.** Ctrl+K searched ATT&CK
  and only ATT&CK, so half the techniques the app ships were reachable from
  the side panel alone. F3 gets its own group, next to ATT&CK rather than
  merged into it, and only its own 80 techniques: the 43 it borrows are
  already there under ATT&CK and build the very same object, and offering
  them twice would be asking the analyst to choose between a thing and
  itself.

- **The name of an account says which name it is.** An account has three in
  STIX and they are not interchangeable: `account_login` is what you type to
  sign in, `user_id` is what the system calls the account (a SID, a UUID, an
  IBAN), `display_name` is what a human reads. The node name went to
  `account_login` whatever it was, which is right for `j.smith` and a
  fabricated claim for an IBAN, and the identifier that came out of it was
  the identifier of an account that does not exist. The analyst says which
  one, `account_login` stays the default so nothing already drawn moves, and
  the form hides the field the name occupies so the same value is never
  entered twice. An import records what it read, so an account known only by
  its `user_id` stops coming home as a login. A display name identifies
  nobody: STIX answers that with a random identifier, which is the one thing
  this application cannot do, so the export refuses and the lint says so
  first.

- **An email address is part of what the actor set up, and an account is
  asked for in the words of an account.** Dragging a link from an actor to an
  email address offered a detection indicator and nothing else, while a
  certificate or a MAC address got the infrastructure route: an address you
  send phishing from is something you acquired, exactly like the domain
  hosting the page it links to, so it joins them. The wording of that route
  now follows the observable. `infrastructure` is the right STIX object for a
  bank account and the wrong English word for it, and "infrastructure this
  observable is part of" offered over an IBAN reads as a category error, so
  the question becomes "its accounts". The bundle is identical either way:
  only the question changes, and it is the question that decides whether the
  analyst takes the one route STIX gives them.

- **The infrastructure types are offered, from the spec's own list.** They
  were reachable only through the C2 bridge, which sets
  `command-and-control` and nothing else, so every infrastructure created by
  hand went out untyped. The eleven values of `infrastructure-type-ov` are
  now toggles on the form, taken from the vendored OASIS schema with a test
  holding the two in step. Picked rather than typed, because the vocabulary
  is open in the sense that a consumer may not know a value, not in the sense
  that inventing one is useful: the schema declares plain strings and would
  have let anything through.

## 1.6.1 - 29 August 2026

- **A report carries your reasoning, and the picture no longer carries your
  mood.** Notes and opinions already travelled in the STIX bundle, by
  default, and reached none of the outputs a person reads: the Markdown, the
  PDF and the image carried the graph and the narrative and nothing else. So
  a receiving platform was told "the evidence stays thin, do not publish as
  is" while the colleague reading the report was not, which is the wrong way
  round. Each output now has its own checkbox for them, because a bundle
  going to a platform and a report going to a person do not want the same
  candour and only the analyst knows which is which. They are filed under the
  object they are about, after the narrative, and quoted: a doubt set in the
  same voice as a finding becomes a finding by the time it is read aloud.

- **The image export takes a neutral canvas.** It captures the live viewport,
  so whatever you were doing to look at the graph was baked into the picture:
  a lens dims two thirds of the objects, the link focus rings some and fades
  the rest, the search does the same, the selection draws a ring. None of it
  is a property of the case, all of it is a question you happened to be
  asking, and you would not have found out until you opened the file. Worse,
  it would have exported half of it, since the highlight is drawn on the
  element where the capture sees it and the fade is in the stylesheet where
  it mostly does not. Opening the export dialog now puts the canvas back to
  neutral and closing it puts your view back, which is also what tells you
  what you are about to export.

- **A scenario arrives drawn the way the Arrange button would draw it.** A
  template landed in a ring of its own, and a ring has no centre that means
  anything, so the object the scenario is about sat wherever the alphabet put
  it. A scenario knows its relationships before its objects exist, so the
  drawing that answers them is computed from the plan itself, with the same
  function the button uses: the operator or the strain of a ransomware plan
  ends up in the middle, which is the first thing you want to see. It is
  framed once it lands, too, which the ring never needed.

- **The narrative names a subject once.** One sentence per verb meant a hub
  produced ten paragraphs opening with the same six words, and the reader
  spent each sentence finding out it was still the same subject. Each object
  now gets a block: its name, then a clause per verb. A block with a single
  clause stays a sentence, because a one-item bullet list is worse prose than
  the sentence it replaces.

## 1.6.0 - 28 August 2026

- **The graph gets drawn after all, because the edges stopped leaving from a
  fixed point.** Every relationship used to leave the bottom of its source and
  enter the top of its target, since that is where the two handles were. On a
  layout that reads top to bottom that is honest; on any other it is the whole
  of the spaghetti, because an edge pointing upwards has to leave downwards,
  swing around the card and come back, once per edge. The anchor now aims for
  the middle of the side facing the other object, and leaves that middle only
  when it has to: several edges on one side fan out around it, ordered the way
  their targets lie along it, so two lines leaving the same border do not cross
  each other in the last few pixels. What says which way a relationship runs is
  the arrowhead, which it always did; where the line touched the card was never
  carrying that.

- **A layout that draws the investigation around what it is about.** 1.5.0
  measured that no layered layout survives a star and gave up on drawing;
  radiating edges make the drawing a star actually has available. The most
  connected object goes in the middle, what it touches forms a ring around it,
  and what those touch forms the next ring out, so distance from the centre
  means hops from the subject of the case. Angles come from the breadth-first
  tree, each object owning a wedge and splitting it between its children in
  proportion to what hangs off each, so subtrees stay together; a ring too
  crowded for wedges shares itself out evenly rather than growing without
  bound. Measured again, on the shapes this app produces, and the harness is
  committed beside it: on a hub with seventeen spokes, ranks give a ribbon
  4294px wide and 246px tall, and the radial gives 1846x1018 with the same
  zero crossings. Neither wins outright, which is the finding: ranks still draw
  a chain better, and Aviary costs four crossings against one. The layered
  layout stays one search away in the command palette.

- **The seven arrangements became five lenses, and stopped moving anything.**
  They existed because the graph could not be drawn, and made a virtue of
  ignoring the relationships. Once it could be drawn, ignoring them stopped
  being a precaution and became the cost: the answer to "what has no indicator
  on it" is a SET of objects, and piling that set into a block takes away the
  context that made those objects mean anything - which of them is wired to the
  malware was the interesting half. They had a plainer fault too: nothing named
  the blocks, so you got six silent piles and had to work out which was which.
  A lens moves nothing. It lights what answers the question and steps the rest
  back, on whatever layout is on screen, and `Esc` puts it away. Five questions
  survived the change: no indicator on it, no relationship at all, no TLP of
  its own, machine-supplied, and what the export will complain about. "By type"
  and "by ATT&CK tactic" did not: both were partitions rather than questions,
  and the first was telling the analyst something every card already says in
  its own colour.

- **A relationship is drawn in the colour of what it says.** Not one colour per
  verb: STIX has twenty-six of them here, and six more hues on top of the
  eighteen the objects already carry would say "these differ" far louder than
  they differ. What an analyst reads off a graph is coarser than the verb
  anyway, so the colour groups instead: who is behind this, what does it wield,
  who does it hit, how would we see it, where does it live. `related-to`, and
  any verb a later spec adds, reads as unclassified rather than as a guess. A
  legend beside the minimap carries the key, folds away, and stays folded.

- **The labels you coin, listed in their own panel, each one a lens.** Most
  used first, with how many objects carry each; clicking one lights those
  objects. They are compared exactly and never case-folded, because they are
  free text and they drift: `ransomware` and `Ransomware` are two labels and a
  bundle exports them as two, so folding them here would hide the drift at the
  moment a list makes it visible. It is the only place in the app where you see
  your own vocabulary at once. `t` shows or hides the labels written on the
  cards, which are a third line of text on every object when the canvas is
  crowded.

- **A card offers a grip on every side, and only when you come near it.** Two
  fixed triangles claimed that a line arrives at the top and leaves from the
  bottom, which stopped being true. There is one grip per side now, drawn as
  circles because a triangle points and there is nothing left to point at, and
  they are hidden at rest: a mark drawn there permanently was the thing reading
  as "the line arrives here". While a link is being dragged, every card that
  could legally receive it shows its own. The annotation grip is the exception
  and stays drawn when there is something to read, in the notes' own hue, so a
  note left in the inspector is no longer invisible until you click the object.

- **Two canvas faults that were making every arrangement look worse than it
  was.** The fit ran one frame too early and framed the previous layout, so the
  same arrangement chosen twice gave two different viewports. And
  `fitView({ minZoom })` never did anything: the option changes the viewport
  being computed, and d3-zoom then clamps the transform to the canvas's own
  scale extent, which was the default 0.5. The fit therefore stopped at half
  size and every arrangement ran off the sides of the screen. The floor is set
  on the canvas now, where it takes effect, and you can zoom out that far by
  hand as well.

- **Notes and captures are no longer laid across the relationships.** They went
  to the right of their object, which is nowhere in particular on a layered
  layout and straight at the hub on a radial one. They go outward from the
  middle of the drawing now, and the placer is handed the relationships as the
  lines they will be once everything has moved: a free cell is not a clear one,
  and a note could overlap nothing while sitting on three spokes.

## 1.5.1 - 19 August 2026

- **Self-hosting: the permissions of your clone no longer decide what the
  server will serve.** Reported from a real deployment, where a repository
  cloned as root produced an HTTP 403 on the example bundle. Vite copies
  `public/` with `copyFileSync`, which preserves the source file's mode, and
  `COPY --from` preserves it again, so a restrictive umask on the build host
  reached the image; nginx runs its workers as `nginx` rather than root, and an
  unreadable file is a 403. What made it hard to place is which files it hit:
  everything shipped under `public/` (the ATT&CK dataset, the actor names, the
  country list, the logo, the example bundle) while `index.html` and `/assets/`
  are generated by the build and take the container's own umask. The
  application therefore loaded and ran perfectly, with only the parts that read
  a shipped file failing, one of them loudly and the rest in silence. The image
  now normalises the permissions of what it serves.

- **The demo says what went wrong instead of guessing.** It answered "example
  not found" whatever the server replied, 403 included, which is not a missing
  file but a refusal to hand over one that is right there. Refusal, absence and
  the case where the single-page fallback answers with its own HTML are now
  three different sentences, the last of which used to surface as
  `Unexpected token '<'`.

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
