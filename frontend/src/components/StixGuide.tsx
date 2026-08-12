/**
 * The STIX guide on the home page (#190).
 *
 * For whoever has never handled STIX: what an object is, what an observable
 * is, and why the application refuses certain links. The content is NOT
 * written by hand - it is derived from the matrix by `guide.ts`. Copied prose
 * would have aged the first time a type was added, and help that lies costs
 * more than no help at all.
 *
 * On a route of its own (#/guide) rather than in a modal: you can read it at
 * your own pace, keep it open beside the canvas, and send the link to a
 * colleague who is starting out.
 *
 * TWO ADDRESSES, ONE GUIDE (#223). This component is rendered in two places:
 * in the application at `#/guide`, and in the `/guide` page pre-rendered at
 * build time then hydrated. It is the SAME page, not a cut-down version - the
 * `mode` only changes what depends on the address: the shape of internal
 * links, the wording of the way out, and when the dropdowns come alive.
 */

import { useEffect, useState } from 'react'
import { byVerb, canLink, incoming, label, outgoing, patternExamples } from '../guide'
import type { BridgeOption, RelationLine, VerbGroup } from '../guide'
import { SCO_ORDER, SDO_ORDER, typeMeta } from '../stixMeta'
import Icon from './Icon'

export type GuideMode = 'app' | 'static'

export default function StixGuide({ mode = 'app' }: { mode?: GuideMode }) {
  const [focus, setFocus] = useState('threat-actor')
  const [source, setSource] = useState('threat-actor')
  const [target, setTarget] = useState('ipv4-addr')

  /**
   * The controls only come alive once the script is in place.
   *
   * The static page starts on a default selection, so it already says
   * something without JavaScript. It is the dropdowns that would lie: they
   * would change their label without producing anything as long as the script
   * has not loaded, or forever if it never loads. A disabled control tells the
   * truth; a dead control casts doubt on the rest of the page.
   */
  const [ready, setReady] = useState(mode === 'app')
  useEffect(() => setReady(true), [])

  // The static page lives at /guide: an `#/` href would stay put there instead
  // of reaching the application. So every internal target goes through this
  // constant, and a test checks that none of them was hardcoded.
  const home = mode === 'static' ? '/' : '#/'

  return (
    <>
      <div className="topbar">
        <a className="brand" href={home}>
          <img src="/logo.svg" alt="" />
          DRAW ME A STIX
        </a>
      </div>
      <div className="home guide">
        <a className="guide-back" href={home}>
          <Icon name="chevron-down" size={13} style={{ transform: 'rotate(90deg)' }} />
          {mode === 'static' ? 'Open the canvas' : 'Back to investigations'}
        </a>
        <h1>Objects, observables, relationships</h1>
        <p className="tagline">
          What STIX lets you write down, and why this canvas sometimes says no.
        </p>

        <section className="guide-section">
          <h2>Two families, and one rule</h2>
          <p>
            A STIX bundle holds two kinds of things. <strong>Objects</strong> are what you
            think about: an actor, a campaign, a malware, a technique. <strong>Observables</strong>{' '}
            are what you saw: an address, a domain, a hash. On the canvas, objects carry a
            saturated colour and observables a muted one, so you can tell them apart without
            reading.
          </p>
          <div className="guide-legend">
            <div>
              <h3 className="micro">Objects (SDO)</h3>
              <ul className="guide-chips">
                {SDO_ORDER.map((t) => (
                  <TypeChip key={t} type={t} />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="micro">Observables (SCO)</h3>
              <ul className="guide-chips">
                {SCO_ORDER.map((t) => (
                  <TypeChip key={t} type={t} />
                ))}
              </ul>
            </div>
          </div>
          <p className="guide-rule">
            <Icon name="warning" size={15} />
            <span>
              An observable is never the <em>source</em> of a relationship toward an object.
              An IP address does not use a malware; it is the infrastructure that consists of
              that address. This trips up everyone once, and it is why dragging a link
              sometimes offers you the reverse direction, or an intermediate object, instead
              of what you asked for.
            </span>
          </p>
        </section>

        {/* Section asked for because the three notions get mixed up. Hence a
            SINGLE example running through the three levels rather than three
            definitions side by side: what causes trouble is the step from one
            to the next, not each term taken on its own. */}
        <section className="guide-section">
          <h2>And indicators, where the two meet</h2>
          <p>
            Object, observable, indicator: the three get mixed up constantly, because an
            indicator <em>is</em> an object, and yet it is the only one that reaches back down
            into the observable world. The difference is not what they contain, it is what
            they <strong>claim</strong>. The same domain, at three levels:
          </p>

          <ol className="guide-ladder">
            <li>
              <h3 className="micro">The observable, a fact</h3>
              <p>
                <code>nest.corax.example</code> — you saw this domain. That is all it says. No
                judgement, no claim: an observable can perfectly well be harmless, and often
                is.
              </p>
            </li>
            <li>
              <h3 className="micro">The indicator, a claim</h3>
              <p>
                "If you see this, it matters." That claim has to be machine-readable, so an
                indicator carries a <strong>pattern</strong>, a detection expression written
                in STIX's own syntax. This is what makes it usable by whatever you point at
                your logs.
              </p>
              <ul className="guide-patterns">
                {patternExamples().map((ex) => (
                  <li key={ex.observableType}>
                    <span className="guide-others">{label(ex.observableType)}</span>
                    <code>{ex.pattern}</code>
                  </li>
                ))}
              </ul>
              <p className="hint">
                You rarely type these by hand: on the canvas, an observable can generate its
                own indicator, pattern included. An indicator with no pattern cannot be
                exported, and the check before export tells you so.
              </p>
            </li>
            <li>
              <h3 className="micro">The object, what you are reasoning about</h3>
              <p>
                The C2 cluster the domain belongs to, the malware that beacons to it, the
                actor operating the whole thing. This is the level your report is written at,
                and the level a reader still understands six months from now.
              </p>
            </li>
          </ol>

          <p>
            Hence the two verbs an indicator owns, and it is the only object to own this
            pair: one pointing down at what it was built from, one pointing up at what it
            reveals.
          </p>
          <VerbList groups={byVerb(outgoing('indicator'), 'to')} subject="indicator" side="to" />
          <p className="hint">
            This is also why the canvas offers you a detection indicator when you try to link
            an actor straight to an address: the indicator is the legal path between the two
            families, not a workaround.
          </p>
        </section>

        <section className="guide-section">
          <h2>What can I do with a…</h2>
          <TypeSelect value={focus} onChange={setFocus} disabled={!ready} label="Type" />
          <TypeColumns type={focus} />
          <p className="hint">
            Between two objects, <code>related-to</code> is always legal. It is left out of
            these lists on purpose: it says nothing, and it is worth using only when no other
            verb fits.
          </p>
        </section>

        <section className="guide-section">
          <h2>Can I link these two?</h2>
          <div className="guide-pair">
            <TypeSelect value={source} onChange={setSource} disabled={!ready} label="Source type" />
            <span className="guide-arrow">→</span>
            <TypeSelect value={target} onChange={setTarget} disabled={!ready} label="Target type" />
          </div>
          <Answer source={source} target={target} />
        </section>

        <section className="guide-section">
          <h2>Then what?</h2>
          {/* Deliberately without naming a platform: a STIX bundle is an open
              format, and framing the export around a single tool would suggest
              it is only good for that one. */}
          <p>
            Everything you draw stays in this browser. When the investigation holds up,
            export it: you get a STIX 2.1 bundle, the interchange format the whole field
            reads. Its identifiers are deterministic, derived from each object's own
            properties rather than drawn at random, so re-importing the same object updates
            it instead of creating a second one.
          </p>
          <div className="guide-actions">
            <a className="guide-cta" href={home}>
              Start an investigation
            </a>
            <span className="hint">
              Press <span className="kbd">?</span> on the canvas for the keyboard shortcuts.
            </span>
          </div>
        </section>
      </div>
    </>
  )
}

function TypeChip({ type }: { type: string }) {
  const meta = typeMeta(type)
  return (
    <li className="guide-chip">
      <span className="dot" style={{ background: meta.color }} />
      {meta.label}
    </li>
  )
}

/** A type's two columns: what it is the source of, what it is the target of. */
function TypeColumns({ type }: { type: string }) {
  const out = byVerb(outgoing(type), 'to')
  const inc = byVerb(incoming(type), 'from')
  return (
    <div className="guide-columns">
      <div>
        <h3 className="micro">As the source</h3>
        {out.length === 0 ? (
          <p className="hint">
            Nothing. {label(type)} only ever sits at the receiving end of a relationship,
            which is normal for this type.
          </p>
        ) : (
          <VerbList groups={out} subject={type} side="to" />
        )}
      </div>
      <div>
        <h3 className="micro">As the target</h3>
        {inc.length === 0 ? (
          <p className="hint">Nothing points at a {label(type)} in the spec.</p>
        ) : (
          <VerbList groups={inc} subject={type} side="from" />
        )}
      </div>
    </div>
  )
}

function TypeSelect({
  value,
  onChange,
  disabled,
  label: ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  /** These dropdowns have no visible label: the section heading carries it. */
  label: string
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      <optgroup label="Objects">
        {SDO_ORDER.map((t) => (
          <option key={t} value={t}>
            {label(t)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Observables">
        {SCO_ORDER.map((t) => (
          <option key={t} value={t}>
            {label(t)}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

/** One verb, its sentence, and the types it accepts at the other end. */
function VerbList({
  groups,
  subject,
  side,
}: {
  groups: VerbGroup[]
  subject: string
  side: 'from' | 'to'
}) {
  return (
    <dl className="guide-verbs">
      {groups.map((g) => (
        <div key={g.rel}>
          <dt>
            {side === 'to' ? (
              <>
                <strong>{label(subject)}</strong> <code>{g.rel}</code>{' '}
                <span className="guide-others">{g.types.map(label).join(', ')}</span>
              </>
            ) : (
              <>
                <span className="guide-others">{g.types.map(label).join(', ')}</span>{' '}
                <code>{g.rel}</code> <strong>{label(subject)}</strong>
              </>
            )}
          </dt>
          {g.help && <dd>{g.help}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** The application's own answer, in the order it decides it. */
function Answer({ source, target }: { source: string; target: string }) {
  const verdict = canLink(source, target)
  if (verdict.kind === 'direct') {
    return (
      <div className="guide-answer ok">
        <p>
          Yes, directly. Drag from <strong>{label(source)}</strong> onto{' '}
          <strong>{label(target)}</strong> and pick your verb:
        </p>
        <Lines lines={verdict.relations} />
      </div>
    )
  }
  if (verdict.kind === 'reversed') {
    return (
      <div className="guide-answer ok">
        <p>
          Yes, but the other way round. The spec writes it{' '}
          <strong>{label(target)}</strong> → <strong>{label(source)}</strong>, and the canvas
          flips it for you rather than refusing:
        </p>
        <Lines lines={verdict.relations} />
      </div>
    )
  }
  if (verdict.kind === 'bridge') {
    return (
      <div className="guide-answer bridge">
        <p>
          Not directly, and that is on purpose: nothing in the spec says what a{' '}
          <strong>{label(source)}</strong> and a <strong>{label(target)}</strong> have to do
          with each other. The canvas offers the canonical detour instead, one object and two
          relationships in a single click:
        </p>
        <ul className="guide-recipes">
          {verdict.recipes.map((r) => (
            <li key={r.label}>
              {r.label}
              <Chain option={r} />
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (verdict.kind === 'generic') {
    return (
      <div className="guide-answer weak">
        <p>
          Only with <code>related-to</code>, which means no more than "these two have
          something to do with each other". Legal, but it carries nothing: whoever reads the
          bundle next, human or platform, learns nothing from it. Look for an object that
          would make the link explicit before falling back to it.
        </p>
      </div>
    )
  }
  return (
    <div className="guide-answer no">
      <p>
        No. Two observables with no relationship defined between them: the spec has nothing
        to say here, and neither has the canvas. Bring in the object that connects them, an
        infrastructure or a malware, and relate each of them to that.
      </p>
    </div>
  )
}

/**
 * A bridge's chain, with the chosen types rather than an abstract diagram.
 *
 * One arrow on each side of the verb, both pointing the way the relationship
 * really runs. A single arrow left the verb floating with no connector on one
 * side, and you could no longer tell which node it attached to.
 *
 * The direction comes from the recipe, never from reading left to right:
 * `indicates` runs back up toward the object, so both of its arrows point
 * left. The indicator then ends up with an arrow leaving on each side, which
 * is exactly what it does.
 */
function Chain({ option }: { option: BridgeOption }) {
  return (
    <span className="guide-chain">
      <strong>{label(option.nodes[0])}</strong>
      {option.steps.map((step, i) => {
        const arrow = step.back ? '←' : '→'
        return (
          <span key={step.rel} className="guide-chain-step">
            <span className="guide-chain-arrow">{arrow}</span>
            <code>{step.rel}</code>
            <span className="guide-chain-arrow">{arrow}</span>
            <strong>{label(option.nodes[i + 1])}</strong>
          </span>
        )
      })}
    </span>
  )
}

function Lines({ lines }: { lines: RelationLine[] }) {
  return (
    <dl className="guide-verbs">
      {lines.map((l) => (
        <div key={l.rel}>
          <dt>
            <strong>{label(l.from)}</strong> <code>{l.rel}</code>{' '}
            <strong>{label(l.to)}</strong>
          </dt>
          {l.help && <dd>{l.help}</dd>}
        </div>
      ))}
    </dl>
  )
}
