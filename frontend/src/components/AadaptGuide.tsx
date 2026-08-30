/**
 * MITRE AADAPT, the digital asset matrix, explained where it is used.
 *
 * Fourth of the framework pages. The tactics are written down here and held
 * against the shipped dataset by a test, as for the other two matrices that
 * publish theirs.
 */

import GuideShell, { guideHref } from './GuideShell'
import type { GuideMode } from './GuideShell'

/**
 * The eleven tactics of AADAPT, in matrix order.
 *
 * Ten of them ARE ATT&CK tactics, by identifier and not by resemblance, which
 * is the F3 arrangement rather than the ATLAS one. Only Fraud is its own.
 */
export const AADAPT_TACTICS: { id: string; name: string; own?: true; gloss: string }[] = [
  {
    id: 'TA0043',
    name: 'Reconnaissance',
    gloss: 'reading the chain, the exchange, the team: most of it is public by design.',
  },
  {
    id: 'TA0042',
    name: 'Resource Development',
    gloss: 'wallets, accounts, contracts and mules bought or created for what follows.',
  },
  {
    id: 'TA0001',
    name: 'Initial Access',
    gloss: 'getting into the platform, the wallet, or the developer who builds them.',
  },
  { id: 'TA0002', name: 'Execution', gloss: 'running the transaction or the contract call.' },
  {
    id: 'TA0004',
    name: 'Privilege Escalation',
    gloss: 'gaining rights, up to the keys that sign for everybody.',
  },
  {
    id: 'TA0005',
    name: 'Defense Evasion',
    gloss: 'getting past the monitoring, the limits and the compliance checks.',
  },
  {
    id: 'TA0006',
    name: 'Credential Access',
    gloss: 'the private keys, the seed phrases, the API secrets.',
  },
  {
    id: 'TA0008',
    name: 'Lateral Movement',
    gloss: 'moving on, across accounts, chains and bridges.',
  },
  {
    id: 'TA0009',
    name: 'Collection',
    gloss: 'gathering what makes the next step possible, key material included.',
  },
  {
    id: 'TA0040',
    name: 'Impact',
    gloss: 'burning wallets, rewriting the chain, denying the service.',
  },
  {
    id: 'ADTA0001',
    name: 'Fraud',
    own: true,
    gloss:
      'taking the money by deceiving somebody rather than by breaking something. The one tactic ATT&CK has no word for, and the one that continues a fraud case.',
  },
]

export default function AadaptGuide({ mode = 'app' }: { mode?: GuideMode }) {
  return (
    <GuideShell
      mode={mode}
      title="AADAPT, the digital asset matrix"
      tagline="MITRE's Adversarial Actions in Digital Asset Payment Technologies: where a fraud that cashes out in crypto keeps going, and what its numbers mean."
    >
      <section className="guide-section">
        <h2>What it is</h2>
        <p>
          <strong>MITRE AADAPT</strong> catalogues adversary behaviour against digital asset
          payment systems: exchanges, custodians, wallets, smart contracts, bridges and the
          consensus underneath them. Same three levels as ATT&CK, and 68 techniques over
          eleven tactics.
        </p>
        <p className="hint">
          It is the youngest of the four frameworks here and it shows: it publishes no
          version number, its repository carries the ATLAS tooling it was forked from, and
          the <code>4.4.0</code> in its data file is ATLAS's version from 2023. So the
          panel shows no version for it rather than a number that means something else.
        </p>
      </section>

      <section className="guide-section">
        <h2>Where F3 stops, this starts</h2>
        <p>
          The fraud matrix ends at Monetization, whose techniques include converting the
          proceeds into cryptocurrency. That is exactly where its account of the case runs
          out, and it is where this one begins: AADAPT's own eleventh tactic is called{' '}
          <strong>Fraud</strong>, and the rest of its matrix describes what happens to
          money once it is on a chain.
        </p>
        <p>
          On this canvas the two meet the way every framework here meets the others: on the
          same object, an <code>attack-pattern</code>, joined by the same verbs. A case can
          run from a phishing message to a wire transfer to a bridge, in one graph, with
          three frameworks named on the cards and one bundle at the end of it.
        </p>
      </section>

      <section className="guide-section">
        <h2>The eleven tactics</h2>
        <p>
          Ten of them <strong>are</strong> ATT&CK tactics, by identifier rather than by
          resemblance: this is the arrangement F3 uses, not the one ATLAS uses. It costs
          nothing here, because nothing on this canvas creates a tactic object.
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
            {AADAPT_TACTICS.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  {t.name}
                  {t.own ? <span className="node-framework">AADAPT</span> : null}
                </td>
                <td className="guide-others">{t.gloss}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="guide-section">
        <h2>Reading a number</h2>
        <dl className="guide-verbs">
          <div>
            <dt>
              <code>ADTA0001</code>
            </dt>
            <dd>its one tactic of its own. Fraud.</dd>
          </div>
          <div>
            <dt>
              <code>ADT3003</code>
            </dt>
            <dd>a technique it discovered. Chain Reorganization.</dd>
          </div>
          <div>
            <dt>
              <code>ADT3003.001</code>
            </dt>
            <dd>a sub-technique, under the technique it extends. Long-Range Attack.</dd>
          </div>
          <div>
            <dt>
              <code>ADT1195</code>
            </dt>
            <dd>
              a technique adapted from an ATT&CK one, and numbered after it:{' '}
              <code>T1195</code>, Supply Chain Compromise, seen from a chain. Four of the
              68 are like this.
            </dd>
          </div>
        </dl>
        <p>
          Adapted is not the same as borrowed. <code>ADT1195</code> keeps its own
          identifier, so it is its own object here and the export claims{' '}
          <code>mitre-aadapt</code> and nothing else. The same rule as ATLAS, and the
          opposite of F3, which genuinely reuses ATT&CK numbers.
        </p>
      </section>

      <section className="guide-section">
        <h2>What it becomes on this canvas</h2>
        <p>
          A STIX <code>attack-pattern</code> carrying its <code>ADT</code> number, marked
          AADAPT on its card, with an external reference to its page on the AADAPT site.
          Nothing else changes: same verbs, same identifiers, same bundle.
        </p>
        <div className="guide-actions">
          <a className="guide-cta" href={guideHref(mode, 'f3')}>
            F3, the fraud matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'attack')}>
            ATT&CK, and what it becomes here
          </a>
          <a className="guide-cta" href={guideHref(mode, 'atlas')}>
            ATLAS, the AI matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'guide')}>
            Objects, observables, relationships
          </a>
          <a
            className="guide-cta"
            href="https://aadapt.mitre.org/"
            target="_blank"
            rel="noreferrer"
          >
            aadapt.mitre.org
          </a>
        </div>
      </section>
    </GuideShell>
  )
}
