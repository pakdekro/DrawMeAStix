/**
 * Shown instead of the application when the browser has not granted the page
 * a secure context.
 *
 * `crypto.randomUUID` and `crypto.subtle` are restricted to secure contexts:
 * HTTPS, or a localhost origin. Served over plain HTTP under any other
 * hostname, both are `undefined`. The first creates every entity, note and
 * investigation, the second computes the export fingerprint, so the
 * application can neither record anything nor produce a bundle. It is not
 * degraded, it is unusable.
 *
 * It used to say so through `crypto.randomUUID is not a function`, thrown at
 * the first click rather than at the door, which tells the operator nothing
 * about the actual cause. Whether the page is trustworthy is a decision only
 * the browser makes, from the origin it loaded: no server-side configuration
 * can answer it, and the shipped nginx is not even in a position to try since
 * a reverse proxy terminating TLS forwards plain HTTP to it.
 *
 * Blocking rather than working around the limit is deliberate. `randomUUID`
 * would take five lines over `crypto.getRandomValues`, which is available
 * here, but `crypto.subtle` would mean shipping our own SHA-256, and the
 * result would be an application that lets you build an investigation for an
 * hour before revealing it cannot be exported. Failing at the door is the
 * honest version.
 */
export default function InsecureContext() {
  return (
    <div className="insecure-context">
      <h1>This page needs a secure context</h1>
      <p>
        Your browser is serving this application from an origin it does not consider
        trustworthy, so it withholds the two cryptographic functions the tool is built on:
        the identifiers given to everything you create, and the fingerprint that signs an
        export. Nothing would be recorded, and nothing could be exported.
      </p>
      <p>Two ways out, both fine:</p>
      <ul>
        <li>
          <strong>Serve it over HTTPS.</strong> This is the answer for anything beyond a
          quick look. Put the container behind the reverse proxy you already use and let it
          terminate TLS; the container itself keeps receiving plain HTTP, which is normal
          and expected.
        </li>
        <li>
          <strong>Reach it through localhost.</strong> A localhost origin counts as secure
          even without TLS. From another machine, a tunnel is enough:
          <code>ssh -L 8000:localhost:8000 you@the-host</code>, then open{' '}
          <code>http://localhost:8000</code>.
        </li>
      </ul>
      <p className="hint">
        This restriction comes from the browser, not from this application, and no
        server-side setting can lift it. A browser too old to provide these functions at
        all lands on this page for the same reason.
      </p>
    </div>
  )
}
