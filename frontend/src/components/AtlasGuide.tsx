/**
 * MITRE ATLAS, the AI matrix, explained where it is used.
 *
 * Third of the framework pages, same shape as the other two. The tactics are
 * written down here and held against the shipped dataset by a test, for the
 * same reason as F3: importing the JSON would put 33 KB into a page of prose
 * to print sixteen lines.
 */

import GuideShell, { guideHref } from './GuideShell'
import type { GuideMode } from './GuideShell'

/**
 * The sixteen tactics of ATLAS, in matrix order.
 *
 * `attack` is the ATT&CK tactic this one mirrors, and fourteen of the sixteen
 * mirror one. It is a correspondence and never a reuse: every identifier here
 * is ATLAS's own, which is the whole difference with F3.
 */
export const ATLAS_TACTICS: { id: string; name: string; attack?: string; gloss: string }[] = [
  {
    id: 'AML.TA0002',
    name: 'Reconnaissance',
    attack: 'TA0043',
    gloss: 'learning what the target builds with, down to which model and which data.',
  },
  {
    id: 'AML.TA0003',
    name: 'Resource Development',
    attack: 'TA0042',
    gloss: 'assembling the means: datasets, proxy models, poisoned artefacts.',
  },
  {
    id: 'AML.TA0004',
    name: 'Initial Access',
    attack: 'TA0001',
    gloss: 'getting into the environment the AI system lives in.',
  },
  {
    id: 'AML.TA0000',
    name: 'AI Model Access',
    gloss:
      'reaching the model itself, from querying an API to holding its weights. ATT&CK has no word for this.',
  },
  {
    id: 'AML.TA0005',
    name: 'Execution',
    attack: 'TA0002',
    gloss: 'running code, including through the model when it is allowed to act.',
  },
  {
    id: 'AML.TA0006',
    name: 'Persistence',
    attack: 'TA0003',
    gloss: 'staying, sometimes inside the model rather than beside it: a backdoor in weights.',
  },
  {
    id: 'AML.TA0012',
    name: 'Privilege Escalation',
    attack: 'TA0004',
    gloss: 'gaining rights, an agent with tools being a promising place to try.',
  },
  {
    id: 'AML.TA0007',
    name: 'Defense Evasion',
    attack: 'TA0005',
    gloss: 'getting past the guardrails, the classifier, the content filter.',
  },
  {
    id: 'AML.TA0013',
    name: 'Credential Access',
    attack: 'TA0006',
    gloss: 'stealing the secrets the system holds, prompts and keys included.',
  },
  {
    id: 'AML.TA0008',
    name: 'Discovery',
    attack: 'TA0007',
    gloss: 'mapping what is there, the model and its guardrails included.',
  },
  {
    id: 'AML.TA0015',
    name: 'Lateral Movement',
    attack: 'TA0008',
    gloss: 'moving on through the environment.',
  },
  {
    id: 'AML.TA0009',
    name: 'Collection',
    attack: 'TA0009',
    gloss: 'gathering what is worth taking: data, artefacts, the model itself.',
  },
  {
    id: 'AML.TA0001',
    name: 'AI Attack Staging',
    gloss:
      'preparing the attack ON the model: crafting adversarial examples, training a proxy, planting a backdoor. The other half of what ATT&CK cannot say.',
  },
  {
    id: 'AML.TA0014',
    name: 'Command and Control',
    attack: 'TA0011',
    gloss: 'keeping a channel to what was compromised.',
  },
  {
    id: 'AML.TA0010',
    name: 'Exfiltration',
    attack: 'TA0010',
    gloss: 'getting it out, a model extracted through its own API included.',
  },
  {
    id: 'AML.TA0011',
    name: 'Impact',
    attack: 'TA0040',
    gloss: 'the point of it: degraded decisions, denied service, eroded trust.',
  },
]

export default function AtlasGuide({ mode = 'app' }: { mode?: GuideMode }) {
  return (
    <GuideShell
      mode={mode}
      title="ATLAS, the AI matrix"
      tagline="MITRE's Adversarial Threat Landscape for AI Systems: what it adds to ATT&CK, why it borrows none of its numbers, and what one of its techniques becomes here."
    >
      <section className="guide-section">
        <h2>What it is</h2>
        <p>
          <strong>MITRE ATLAS</strong> is a knowledge base of adversary behaviour against
          systems that use AI. Same three levels as ATT&CK, same numbering habits, same
          discipline of describing actions rather than tools, and the same grounding in
          incidents that happened rather than in what could be imagined. It is released
          every month or two, dated rather than numbered, and the version in the framework
          panel says which one this canvas is carrying.
        </p>
        <p className="hint">
          The name is a trap worth clearing early: ATLAS is about attacks on AI systems, and
          has nothing to do with fraud, with atlases of threat actors, or with the ATT&CK
          groups. It catalogues what people do to a model and to the pipeline around it.
        </p>
      </section>

      <section className="guide-section">
        <h2>What it adds that ATT&CK cannot say</h2>
        <p>
          Fourteen of its sixteen tactics mirror an ATT&CK tactic, because most of an attack
          on an AI system is an ordinary attack: reconnaissance, initial access, exfiltration,
          impact. Two have no ATT&CK counterpart at all, and they are the reason the
          framework exists.
        </p>
        <dl className="guide-verbs">
          <div>
            <dt>
              <code>AML.TA0000</code> AI Model Access
            </dt>
            <dd>
              the model as a thing you reach: through a product that calls it, through its
              API, through the weights on a disk. Access to the model is not access to a
              host, and defending one is not defending the other.
            </dd>
          </div>
          <div>
            <dt>
              <code>AML.TA0001</code> AI Attack Staging
            </dt>
            <dd>
              the work done ON the model before using it: training a proxy of it, crafting
              adversarial inputs, planting a backdoor during training. There is no ATT&CK
              tactic for preparing an attack against a statistical artefact.
            </dd>
          </div>
        </dl>
      </section>

      <section className="guide-section">
        <h2>The sixteen tactics</h2>
        <p>
          In matrix order, which ATLAS publishes as a relationship rather than as a list.
          The right-hand column is the ATT&CK tactic each one mirrors, where there is one.
        </p>
        <table className="guide-tactics">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tactic</th>
              <th>What it is for</th>
              <th>ATT&CK</th>
            </tr>
          </thead>
          <tbody>
            {ATLAS_TACTICS.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  {t.name}
                  {t.attack ? null : <span className="node-framework">ATLAS</span>}
                </td>
                <td className="guide-others">{t.gloss}</td>
                <td>{t.attack ?? ''}</td>
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
              <code>AML.TA0000</code>
            </dt>
            <dd>a tactic. AI Model Access.</dd>
          </div>
          <div>
            <dt>
              <code>AML.T0051</code>
            </dt>
            <dd>a technique. LLM Prompt Injection.</dd>
          </div>
          <div>
            <dt>
              <code>AML.T0051.000</code>
            </dt>
            <dd>a sub-technique, under the technique it extends. Direct.</dd>
          </div>
        </dl>
        <p>
          <strong>ATLAS borrows no identifier</strong>, and that is its whole difference
          with the fraud matrix. Where F3 reuses 43 ATT&CK numbers verbatim, ATLAS gives
          everything a number of its own and, for 37 of its 178 techniques, records which
          ATT&CK technique it was adapted from. <code>AML.T0000</code> is adapted from{' '}
          <code>T1596</code>; it is not <code>T1596</code>. So the export writes an{' '}
          <code>mitre-atlas</code> reference and nothing else, exactly as MITRE's own ATLAS
          bundle does.
        </p>
      </section>

      <section className="guide-section">
        <h2>Two cards called Phishing</h2>
        <p>
          Thirty-six ATLAS techniques carry a name that also exists in ATT&CK. Put both on
          one canvas and you get two cards with the same name, two different numbers and two
          different framework marks, which is correct: they are two entries in two
          catalogues, and the identifiers this tool derives keep them apart the whole way
          into the bundle.
        </p>
        <p className="hint">
          It also means a search for a name finds the one in the framework you are searching,
          and only that one. The panel says which framework it is searching, and Ctrl+K puts
          each in its own group, for exactly this reason.
        </p>
      </section>

      <section className="guide-section">
        <h2>What it becomes on this canvas</h2>
        <p>
          A STIX <code>attack-pattern</code> carrying its <code>AML</code> number, like any
          other technique, joined by the same <code>uses</code> and <code>targets</code>.
          Nothing about it is a mode: an intrusion that ends in a poisoned model is one
          graph, with ATT&CK on one side of it and ATLAS on the other.
        </p>
      </section>

      <section className="guide-section">
        <h2>What is left out, and where to find it</h2>
        <p>
          ATLAS publishes two things this canvas does not carry. Its{' '}
          <strong>mitigations</strong> are STIX <code>course-of-action</code> objects, a type
          this tool has no card for. Its <strong>case studies</strong>, real incidents walked
          through step by step, are not a STIX object at all, and they are the best way into
          the framework: read a couple before the matrix.
        </p>
        <div className="guide-actions">
          <a className="guide-cta" href={guideHref(mode, 'attack')}>
            ATT&CK, and what it becomes here
          </a>
          <a className="guide-cta" href={guideHref(mode, 'f3')}>
            F3, the fraud matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'aadapt')}>
            AADAPT, the digital asset matrix
          </a>
          <a className="guide-cta" href={guideHref(mode, 'guide')}>
            Objects, observables, relationships
          </a>
          <a
            className="guide-cta"
            href="https://atlas.mitre.org/"
            target="_blank"
            rel="noreferrer"
          >
            atlas.mitre.org
          </a>
        </div>
      </section>
    </GuideShell>
  )
}
