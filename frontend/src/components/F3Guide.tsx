/**
 * MITRE F3, the fraud matrix, explained where it is used.
 *
 * The sibling of the ATT&CK page, and needed more than it: ATT&CK is common
 * knowledge in this trade and F3 is a year old. Someone meeting a framework
 * for the first time does not search it, they read it, and that reading does
 * not fit in 180 pixels of palette.
 *
 * The tactics are written down here rather than derived from the dataset,
 * which ships them: importing that JSON would put 17 KB into a page of prose
 * to print eight lines. A test holds this table against the dataset instead,
 * so the two cannot drift apart in silence.
 */

import GuideShell, { guideHref } from './GuideShell'
import type { GuideMode } from './GuideShell'

/**
 * The eight tactics of F3 v1.1, in matrix order, which is the order of the
 * fraud lifecycle rather than alphabetical.
 *
 * Six are ATT&CK's own, identifiers included: that overlap is the point of
 * the framework, not an accident of it.
 */
export const F3_TACTICS: { id: string; name: string; own: boolean; gloss: string }[] = [
  {
    id: 'TA0043',
    name: 'Reconnaissance',
    own: false,
    gloss: 'gathering what is needed to plan: the institution, its staff, its customers.',
  },
  {
    id: 'TA0042',
    name: 'Resource Development',
    own: false,
    gloss: 'building the means: accounts, fake documents, look-alike sites, mules.',
  },
  {
    id: 'TA0001',
    name: 'Initial Access',
    own: false,
    gloss: 'getting a foothold, most often into a customer account rather than a network.',
  },
  {
    id: 'TA0005',
    name: 'Stealth',
    own: false,
    gloss: 'avoiding detection: spoofed devices, spoofed geolocation, deleted alerts.',
  },
  {
    id: 'TA0112',
    name: 'Defense Impairment',
    own: false,
    gloss: 'turning the defences down rather than hiding from them.',
  },
  {
    id: 'FA0001',
    name: 'Positioning',
    own: true,
    gloss:
      'the preparation that makes the payout possible: changing payment details, adding a beneficiary, raising a limit.',
  },
  {
    id: 'TA0002',
    name: 'Execution',
    own: false,
    gloss: 'running the fraudulent transaction itself.',
  },
  {
    id: 'FA0002',
    name: 'Monetization',
    own: true,
    gloss: 'turning the proceeds into value in hand, and blurring the trail behind it.',
  },
]

export default function F3Guide({ mode = 'app' }: { mode?: GuideMode }) {
  return (
    <GuideShell
      mode={mode}
      title="F3, the fraud matrix"
      tagline="MITRE's Fight Financial Fraud framework: what it covers, how it is numbered, and why it shares a canvas with ATT&CK rather than a mode of its own."
    >
      <section className="guide-section">
        <h2>What it is</h2>
        <p>
          <strong>MITRE F3</strong>, the Fight Financial Fraud framework, is a knowledge base
          of fraud actor behaviour in cyber-enabled fraud incidents. It was built by fraud
          fusion analysts through MITRE's Center for Threat-Informed Defense, published in
          April 2026, and modelled deliberately on ATT&CK: same three levels, same
          numbering habits, same refusal to describe anything but behaviour. Its first
          release covers financial fraud as banking institutions see it.
        </p>
        <p className="hint">
          It exists because fraud teams, cyber teams and anti-money-laundering teams
          describe the same incident in three vocabularies, and the seams between them are
          where the same case gets dropped three times.
        </p>
      </section>

      <section className="guide-section">
        <h2>What gets into it, and what does not</h2>
        <p>
          F3 publishes its own admission rules, and they are worth knowing before you go
          looking for a technique that is not there:
        </p>
        <dl className="guide-verbs">
          <div>
            <dt>The institution must see the effects during the incident</dt>
            <dd>
              a behaviour nobody can observe from the inside teaches nobody anything about
              detecting it next time.
            </dd>
          </div>
          <div>
            <dt>The incident must involve a cyber technique</dt>
            <dd>
              purely physical, social or paper fraud is out of scope. This is a framework
              about fraud that leaves digital traces.
            </dd>
          </div>
          <div>
            <dt>A technique describes the fraud actor's behaviour</dt>
            <dd>
              in MITRE's own words, a technique is not an entity or a tool but the specific
              way those are used. Nothing in F3 will ever name an account, an amount or a
              victim.
            </dd>
          </div>
          <div>
            <dt>One "how", done in several ways, becomes a technique and its sub-techniques</dt>
            <dd>
              which is why <code>Account Manipulation</code> has seven of them and{' '}
              <code>3DS Bypass</code> has none.
            </dd>
          </div>
        </dl>
        <p className="guide-rule">
          <span>
            The second rule is the interesting one here: an F3 incident contains a cyber
            technique <em>by definition</em>. Drawing a fraud and an intrusion on one canvas
            is not a stretch of the framework, it is its entry condition.
          </span>
        </p>
      </section>

      <section className="guide-section">
        <h2>The eight tactics</h2>
        <p>
          The goals a fraud actor pursues, in the order of the matrix. Six of them{' '}
          <strong>are</strong> ATT&CK tactics, identifiers included: fraud that begins with
          a phishing message is doing the same reconnaissance and the same initial access as
          any intrusion. Only two describe something ATT&CK has no word for.
        </p>
        <table className="guide-tactics">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tactic</th>
              <th>What it is for</th>
            </tr>
          </thead>
          <tbody>
            {F3_TACTICS.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  {t.name}
                  {t.own ? <span className="node-framework">F3</span> : null}
                </td>
                <td className="guide-others">{t.gloss}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          MITRE's own paper describes seven: it was written before ATT&CK v19 split what
          used to be Defense Evasion into <code>TA0005 Stealth</code> and{' '}
          <code>TA0112 Defense Impairment</code>. F3 v1.1 followed the split, and so does
          this application.
        </p>
      </section>

      <section className="guide-section">
        <h2>Reading a number, and the trap in it</h2>
        <dl className="guide-verbs">
          <div>
            <dt>
              <code>FA0001</code>
            </dt>
            <dd>a tactic of F3's own. Positioning.</dd>
          </div>
          <div>
            <dt>
              <code>F1005</code>
            </dt>
            <dd>a technique. Account Manipulation.</dd>
          </div>
          <div>
            <dt>
              <code>F1005.003</code>
            </dt>
            <dd>a sub-technique. Add Beneficiary.</dd>
          </div>
        </dl>
        <p>
          Now the trap. F3's convention is that a technique already described by ATT&CK{' '}
          <strong>keeps its ATT&CK number</strong>, so the F3 catalogue also publishes
          numbers like <code>T1566</code> and <code>T1110.003</code>. The shape of an
          identifier therefore says nothing about which framework you are in: an{' '}
          <code>F</code> is always F3, a <code>T</code> may be either.
        </p>
        <p className="hint">
          Which is why this canvas records the framework <em>beside</em> the number rather
          than guessing it from the number, and why the card of a technique says which
          knowledge base it came from.
        </p>
      </section>

      <section className="guide-section">
        <h2>What it becomes on this canvas</h2>
        <p>
          The same thing an ATT&CK technique becomes: a STIX <code>attack-pattern</code>{' '}
          carrying its number. There is no fraud mode, and there is no new verb to learn.
          F3's own bundle contains a single kind of relationship,{' '}
          <code>subtechnique-of</code>, which describes the catalogue rather than any
          incident: on a canvas, a fraud technique is joined by the same{' '}
          <code>uses</code> and <code>targets</code> as everything else, and{' '}
          <code>impersonates</code> was already the most fraud-shaped verb STIX had.
        </p>
        <p>
          The 43 techniques F3 borrows from ATT&CK go out as <strong>ATT&CK</strong>{' '}
          techniques, because that is what they are: one number is one object, and a
          technique that came in through the fraud palette must not become a second card
          for something already on the canvas. F3's own techniques go out with a{' '}
          <code>mitre-f3</code> reference and a link to their page, which an{' '}
          <code>F1005</code> needs and a <code>T1566</code> does not.
        </p>
      </section>

      <section className="guide-section">
        <h2>What F3 will not do for you</h2>
        <p>
          F3 describes behaviour and nothing else, by its own third rule. The account the
          money left, the account it landed in, the amount, the timestamps: none of that is
          in the framework, and all of it is what makes a fraud case a case. That half lives
          in STIX, on the canvas, as objects and observables around the techniques, and it
          is worth knowing which of the two you are missing when something will not fit.
        </p>
        <div className="guide-actions">
          <a className="guide-cta" href={guideHref(mode, 'attack')}>
            ATT&CK, and what it becomes here
          </a>
          <a className="guide-cta" href={guideHref(mode, 'guide')}>
            Objects, observables, relationships
          </a>
          <a
            className="guide-cta"
            href="https://ctid.mitre.org/fraud"
            target="_blank"
            rel="noreferrer"
          >
            ctid.mitre.org/fraud
          </a>
        </div>
      </section>
    </GuideShell>
  )
}
