# Security policy

## Reporting a vulnerability

Please report security issues **privately**, not through a public issue.

Open a [private security advisory](../../security/advisories/new) on this
repository, or email the address in the repository owner's profile.

You will get an acknowledgement within a few days. This is a side project, not
a product with an on-call rotation: fixes are best-effort, and I would rather
say so than promise a response time I cannot hold.

## What is worth reporting

Draw Me A STIX runs entirely in the browser and holds no server-side data, so
the interesting attack surface is **the content the analyst opens**:

- anything in a STIX bundle, a backup file, or a pasted document that leads to
  script execution, or that reaches IndexedDB in a state the application cannot
  recover from;
- anything that makes data leave the browser without the analyst asking, or
  that leaks the enrichment token;
- a way to make the exported bundle claim something the analyst never entered.

The enrichment sidecar (`enricher/`) is a separate opt-in service that shells
out to network tools. Command injection, SSRF and token handling there are in
scope too.

## What is not a vulnerability

- **A hostile bundle that produces a broken investigation.** The importer is
  meant to be resilient and there are regression tests for it, but a malformed
  object that only degrades what is displayed is a bug, so please open a normal
  issue for it.
- **`connect-src https:` in the Content-Security-Policy.** The enrichment
  sidecar is chosen by the analyst and its address is unknown at build time.
  This is a documented trade-off, not an oversight — see
  `nginx-security-headers.conf`. Tighten it in your own deployment if you know
  your endpoint.
- **The absence of authentication.** There is nothing to authenticate against:
  the server only ever serves static files.

## Data lifecycle

Worth knowing before the tool touches a real case, and written here so that
whoever has to answer for it does not have to read the source to find out. The
same ground, phrased for analysts rather than for their security team, is at
[`/about`](https://app.drawmeastix.io/about).

**Where it lives.** In one browser profile, on one machine: an IndexedDB
database named `stixit`, holding the investigations, their objects and
relationships, the notes and the pasted screenshots. No account, no server-side
copy, no encryption at rest. Anyone who can open that browser profile can read
them, which makes full-disk encryption on the machine the control that actually
matches the exposure. An application-level lock would only move the question to
where its own key is kept, and a key the browser can read unaided protects
nobody.

**How long it lives.** Indefinitely. The application calls
`navigator.storage.persist()`, so the database survives the clean-ups a browser
performs when disk runs short. That prevents losing a case that was never
exported; it also means a case from last year is still intact today. The tool
enforces no retention of its own — deleting an investigation is a deliberate
act, and it removes its objects, relationships, notes and screenshots together.

**What leaves.** Nothing, in the course of an investigation: no analytics, no
error reporting, no language model, no remote call. The ATT&CK catalogue is
bundled and served from the same origin as the application. Two deliberate
exceptions:

- the STIX bundle you export, which is a file written to your disk;
- enrichment, and only once you have configured an endpoint yourself. A request
  then carries three fields — enricher, observable type, observable value — one
  value at a time. Never the graph, the notes or the screenshots. Its bearer
  token is treated as a credential rather than a preference: it lives in
  `sessionStorage` and dies with the tab, unless the operator explicitly asks
  for it to be kept on the machine.

**What a file carries.** A STIX bundle carries objects, relationships, and the
STIX notes and opinions if asked; the free-form working notes are never in it.
A full backup is the opposite and carries everything, working notes and
screenshots included, inline. Handle a backup file as you would handle the case
itself. Neither export ever contains enrichment endpoints or their tokens, and
restoring a backup that carries some refuses to apply them.

**Personal data.** An investigation routinely holds sender addresses, IP
addresses and names written in notes. Under GDPR that is a processing activity,
performed on the analyst's own workstation, with no processor involved and no
retention applied by the tool. Deployments that use it on real cases should
expect to export into the case file and delete the investigation afterwards, and
to record the activity if it becomes routine.

## Supported versions

The latest released version only. There is no backport branch.
