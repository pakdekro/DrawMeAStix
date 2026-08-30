/**
 * MITRE ATT&CK, explained where it is used (#116 family, framework docs).
 *
 * Not a section of the STIX guide: that page teaches a FORMAT, this one
 * teaches a KNOWLEDGE BASE. Someone reading "what is an observable" and
 * someone reading "what does T1566.002 mean" are at two different moments,
 * and a page that answers both answers neither.
 *
 * What the page says about relationships is derived from the matrix, like the
 * STIX guide: the day a verb is added around techniques, the prose follows on
 * its own. What it says about ATT&CK itself is written down, because it is
 * about a body of knowledge that lives outside this repository. A test holds
 * it against the shipped dataset where the two can disagree.
 */

import { byVerb, incoming, outgoing } from '../guide'
import GuideShell, { guideHref } from './GuideShell'
import type { GuideMode } from './GuideShell'
import VerbList from './VerbList'

export default function AttackGuide({ mode = 'app' }: { mode?: GuideMode }) {
  return (
    <GuideShell
      mode={mode}
      title="ATT&CK, and what it becomes here"
      tagline="A catalogue of what attackers have been seen doing, and how one of its numbers turns into an object on this canvas."
    >
      <section className="guide-section">
        <h2>What it is, and what it is not</h2>
        <p>
          MITRE ATT&CK is a catalogue of adversary <strong>behaviour</strong>, built from
          incidents that actually happened. It answers "what did they do", never "who are
          they" or "what did they use it on". Three levels, and no more:
        </p>
        <dl className="guide-verbs">
          <div>
            <dt>Tactic</dt>
            <dd>
              the <strong>why</strong>: the goal being pursued at that moment, such as
              getting in, staying in, or getting the data out.
            </dd>
          </div>
          <div>
            <dt>Technique</dt>
            <dd>
              the <strong>how</strong>: one way of reaching that goal, described as an
              action rather than as a tool.
            </dd>
          </div>
          <div>
            <dt>Sub-technique</dt>
            <dd>
              a more precise how, under a technique. Not every technique has any: they
              exist where one behaviour is genuinely done in several distinguishable ways.
            </dd>
          </div>
        </dl>
        <p className="hint">
          It is not a lifecycle and not a checklist. A tactic is a category, not a step, and
          a real intrusion visits some of them, in its own order, sometimes twice.
        </p>
      </section>

      <section className="guide-section">
        <h2>Reading a number</h2>
        <dl className="guide-verbs">
          <div>
            <dt>
              <code>TA0001</code>
            </dt>
            <dd>a tactic. Initial Access, in this instance.</dd>
          </div>
          <div>
            <dt>
              <code>T1566</code>
            </dt>
            <dd>a technique. Phishing.</dd>
          </div>
          <div>
            <dt>
              <code>T1566.002</code>
            </dt>
            <dd>a sub-technique, under the technique it extends. Spearphishing Link.</dd>
          </div>
        </dl>
        <p>
          The number is the stable half. Names are revised between versions, and some are
          revised heavily: what everyone called <em>Defense Evasion</em> for years is
          <code> TA0005 Stealth</code> since ATT&CK v19. That is exactly why this
          application derives an object's identifier from the number and never from the
          name, and why writing the number down is worth the two seconds it costs.
        </p>
      </section>

      <section className="guide-section">
        <h2>Which matrix you are searching</h2>
        <p>
          ATT&CK is published as several matrices: Enterprise, Mobile and ICS. The palette
          here ships <strong>Enterprise</strong>, which is the one an intrusion on a
          corporate network is described with, and its version is shown at the top of the
          framework panel.
        </p>
        <p className="hint">
          A Mobile or ICS number is not in the palette, which does not stop you: type it
          into the MITRE ID field of a technique you create by hand and it travels in the
          bundle like any other. The palette is a search, not a gate.
        </p>
      </section>

      <section className="guide-section">
        <h2>What a technique becomes on this canvas</h2>
        <p>
          A STIX <code>attack-pattern</code>, carrying the number in{' '}
          <code>x_mitre_id</code> and an external reference to{' '}
          <code>mitre-attack</code> on export. Its identifier is derived from that number
          alone, which has one consequence worth knowing: the same technique reached from
          the palette, from a pasted bundle or from the fraud matrix is{' '}
          <strong>one object</strong>, not three, on this canvas and in the platform that
          receives it.
        </p>
        <p className="hint">
          A technique with no number is still a perfectly good object. It just falls back to
          being deduplicated on its name at import, which the lint says out loud before you
          export.
        </p>
      </section>

      <section className="guide-section">
        <h2>What a technique links to</h2>
        <p>
          This is not a choice of ours: STIX decides what may point at what, and the canvas
          refuses the rest. A technique is the object of what somebody did:
        </p>
        <h3 className="micro">What points at a technique</h3>
        <VerbList
          groups={byVerb(incoming('attack-pattern'), 'from')}
          subject="attack-pattern"
          side="from"
        />
        <h3 className="micro">What a technique points at</h3>
        <VerbList
          groups={byVerb(outgoing('attack-pattern'), 'to')}
          subject="attack-pattern"
          side="to"
        />
        <p className="hint">
          Which is why an actor <code>uses</code> a technique and a technique{' '}
          <code>targets</code> a victim, and why nothing on the canvas lets a technique
          point at an IP address: a behaviour is not a thing that talks to a host.
        </p>
      </section>

      <section className="guide-section">
        <h2>Where it lives in the app</h2>
        <ul className="guide-list">
          <li>
            The <strong>framework panel</strong> in the left sidebar: search by name, by
            alias or by number, and the card lands on the canvas with its number filled in.
          </li>
          <li>
            <strong>Ctrl+K</strong>: the same corpus, in a group of its own, when your
            hands are already on the keyboard.
          </li>
          <li>
            The <strong>MITRE ID</strong> field on any technique, for a number the palette
            does not know.
          </li>
        </ul>
        <div className="guide-actions">
          <a className="guide-cta" href={guideHref(mode, 'f3')}>
            F3, the fraud matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'atlas')}>
            ATLAS, the AI matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'guide')}>
            Objects, observables, relationships
          </a>
          <a
            className="guide-cta"
            href="https://attack.mitre.org/"
            target="_blank"
            rel="noreferrer"
          >
            attack.mitre.org
          </a>
        </div>
      </section>
    </GuideShell>
  )
}
