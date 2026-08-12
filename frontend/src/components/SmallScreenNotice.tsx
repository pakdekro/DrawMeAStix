/**
 * Landing screen for small screens.
 *
 * The real case is not "an analyst wants to work from their phone": it is
 * someone who clicked a shared link and is trying to work out what the tool
 * is, to decide whether to come back to it from their desk. Showing them a
 * broken canvas, or a "desktop only" wall, loses exactly the person we were
 * trying to convince.
 *
 * Hence a presentation card rather than a block, and a way out we stand by:
 * an absolute block always ends up turning against a legitimate case (tablet
 * with a keyboard, unusual window).
 */

const LANDING = 'https://drawmeastix.io/'

export default function SmallScreenNotice({ onOpenAnyway }: { onOpenAnyway: () => void }) {
  return (
    <div className="small-screen">
      <div className="small-card">
        <img src="/logo.svg" alt="" className="small-logo" />
        <h1>Draw Me A STIX</h1>
        <p className="small-tagline">The CTI analyst's STIX scratchpad.</p>

        <p className="small-body">
          Structure an investigation on a canvas, annotate it, and walk away with a clean
          STIX 2.1 bundle that imports into your platform without creating duplicates.
        </p>

        <ul className="small-points">
          <li>Everything runs in your browser. The server holds code, never data.</li>
          <li>Deterministic identifiers: re-importing merges, it does not duplicate.</li>
          <li>No LLM anywhere near your intel.</li>
        </ul>

        <p className="small-body">
          The canvas needs a mouse and a keyboard: you relate objects by dragging between
          them, select several at once, and edit them in a side panel. It is built for a
          desk.
        </p>

        <p className="small-warn">
          And what you create lives in <em>this</em> browser only. An investigation started
          on a phone stays on that phone.
        </p>

        <a className="small-cta" href={LANDING}>
          See what it does
        </a>
        <button className="small-anyway" onClick={onOpenAnyway}>
          Open it anyway
        </button>
      </div>
    </div>
  )
}
