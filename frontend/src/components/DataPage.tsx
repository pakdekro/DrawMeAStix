/**
 * "Your data" (#225), served at /about, pre-rendered at build time.
 *
 * Why a page of its own rather than a section of the guide: the guide teaches
 * STIX, it speaks to someone learning a format. This page states the tool's
 * CONTRACT - where the data lives, what leaves, what the identifiers give
 * away. Two texts, two audiences, two moments of reading.
 *
 * It exists because an outside security-watch note reconstructed all of this
 * by reading minified JavaScript, having found it written down nowhere. What
 * is true of the code deserves saying in plain words: a reader should not have
 * to take us at our word, nor to disassemble us.
 *
 * No state, no events: the page is text, so the entry point that serves it
 * loads no script at all.
 */

import Icon from './Icon'

export default function DataPage() {
  return (
    <>
      <div className="topbar">
        <a className="brand" href="/">
          <img src="/logo.svg" alt="" />
          DRAW ME A STIX
        </a>
      </div>
      <div className="home guide">
        <a className="guide-back" href="/">
          <Icon name="chevron-down" size={13} style={{ transform: 'rotate(90deg)' }} />
          Open the canvas
        </a>
        <h1>Your data, and what this tool does with it</h1>
        <p className="tagline">
          Where an investigation lives, what leaves your browser, and what the identifiers
          give away.
        </p>

        <section className="guide-section">
          <h2>Where an investigation lives</h2>
          <p>
            In this browser, on this machine, and nowhere else. Everything you draw goes into
            an IndexedDB database named <code>stixit</code>, under this browser profile: the
            investigations, their objects and relationships, the notes, the screenshots you
            pasted. There is no account, no server holding a copy, and no encryption at rest.
          </p>
          <p className="guide-rule">
            <Icon name="warning" size={15} />
            <span>
              Anyone who can open this browser profile can read your investigations. On a
              shared or unlocked machine, that is the whole security model, and it is worth
              knowing before you paste a real case into it.
            </span>
          </p>
          <p className="hint">
            The control that actually matches this is full-disk encryption on the machine,
            which protects the browser profile along with everything else on it. An
            application-level lock would only move the question to where its own key is
            kept, and a key the browser can read on its own protects nobody.
          </p>
          <p>
            The application also asks the browser to make that database{' '}
            <strong>persistent</strong>, so it survives the automatic clean-ups a browser
            performs when disk runs short. That protects you from losing a case you never
            exported. It also means a phishing investigation from last spring is still sitting
            there today, intact, until you delete it yourself.
          </p>
        </section>

        <section className="guide-section">
          <h2>What leaves, and what does not</h2>
          <p>
            Nothing is sent anywhere as you work. There is no analytics, no error reporting, no
            language model, no remote call of any kind in the course of an investigation. Three
            things are worth spelling out, because they are the only ways anything moves at
            all:
          </p>
          <dl className="guide-verbs">
            <div>
              <dt>
                <strong>The bundle you export</strong>
              </dt>
              <dd>
                A file, saved by your browser to your disk. Where it goes next is your
                decision, not the tool's.
              </dd>
            </div>
            <div>
              <dt>
                <strong>The ATT&amp;CK catalogue</strong>
              </dt>
              <dd>
                Shipped with the application and loaded from the same address that served this
                page. MITRE is never contacted.
              </dd>
            </div>
            <div>
              <dt>
                <strong>Enrichment, only if you set it up</strong>
              </dt>
              <dd>
                No endpoint is configured by default, so no call is possible until you enter
                one. When you do, a request carries exactly three fields: which enricher, the
                type of observable, and its value. One value at a time. Never the graph, never
                the notes, never the screenshots. Results arrive as candidates in a triage
                tray, and nothing joins the investigation without you accepting it. The token
                you hand it is treated as a secret rather than a setting: unless you tick the
                box asking otherwise, it lasts as long as the tab and is never written to
                disk.
              </dd>
            </div>
          </dl>
        </section>

        <section className="guide-section">
          <h2>What a file carries</h2>
          <p>
            Two different exports exist, and the difference matters more than it looks.
          </p>
          <p>
            The <strong>STIX bundle</strong> carries the objects, the relationships, and the
            notes and opinions from the right-hand panel if you ask for them. The{' '}
            <strong>working notes</strong> at the bottom of the canvas are never in it: they
            are where hypotheses and dead ends live, and those have no business in a file you
            hand to someone else.
          </p>
          <p>
            The <strong>full backup</strong> is the opposite: it carries everything, including
            those working notes and every screenshot, encoded inline. It exists so you can move
            to another machine or recover from a wiped browser. Treat that file exactly as you
            would treat the case itself.
          </p>
          <p className="hint">
            One thing a backup never carries: your enrichment endpoints and their tokens.
            Restoring a file that contains some refuses to apply them and says so, because a
            backup passed between colleagues would otherwise silently repoint the application
            at a server chosen by whoever made the file.
          </p>
        </section>

        <section className="guide-section">
          <h2>Keeping it, and getting rid of it</h2>
          <p>
            The export is the only copy that exists outside this browser. That is why the
            status bar tells you when an investigation has <em>never been exported</em>: it is
            not a nag, it is the literal state of affairs.
          </p>
          <p>
            An investigation holds personal data, and usually quite a lot of it: sender
            addresses, IP addresses, names written in the notes. This tool applies no retention
            policy of its own and will keep all of it indefinitely. If you use it on real
            cases, the working habit that follows is simple enough:{' '}
            <strong>export into the case folder, then delete the investigation</strong>.
            Deleting one removes its objects, its relationships, its notes and its screenshots
            in the same movement.
          </p>
          <p className="hint">
            If this becomes a habit rather than an experiment, it is also the point at which
            your organisation's own record of processing should probably hear about it.
          </p>
        </section>

        <section className="guide-section" id="identifiers">
          <h2>Why identifiers are computed rather than drawn</h2>
          <p>
            STIX says an object should get a random identifier. This tool does the opposite:
            every identifier is <strong>derived from the object's own properties</strong>, run
            through a canonical form of the JSON (RFC 8785) and hashed into a UUID version 5
            under the OASIS namespace. For observables that is exactly what the specification
            prescribes. For objects it is a deliberate departure from it, and it matches what
            OpenCTI computes on its side.
          </p>
          <p>
            <strong>What it buys you.</strong> Export the same investigation twice and the
            second import updates the objects instead of duplicating them. Two analysts on two
            machines, with no shared server, produce the same identifier for the same malware,
            so their bundles merge instead of piling up.
          </p>
          <p>
            <strong>What it costs you</strong>, and this is the part people meet late: the
            identifier follows the properties. Rename an object and its identifier changes.
            Export again, and the receiving platform sees a brand new object rather than a
            rename, next to the old one. The same goes for correcting a file hash or a domain
            you had mistyped. Fixing a typo is cheap on the canvas; downstream it creates a
            second entry.
          </p>
          <p className="guide-rule">
            <Icon name="warning" size={15} />
            <span>
              And one consequence for confidentiality, since it is rarely said out loud: an
              identifier is derived from the value. It cannot be turned back into it, but it is
              a stable fingerprint of it. Somebody who already suspects a bundle concerns a
              given address can compute the identifier themselves and confirm it. If you share
              a bundle you thought was stripped of its observables, its identifiers still
              answer yes or no to a guess.
            </span>
          </p>
          <p className="hint">
            The exact recipe, property by property and type by type, is written down in the
            source repository alongside the test vectors that lock it, so anyone can recompute
            an identifier and check that it matches ours.
          </p>
        </section>

        <section className="guide-section">
          <h2>Who serves this page</h2>
          <p>
            An application that sends nothing is one thing; the infrastructure serving it is
            another, and the two deserve to be separated honestly. The hosted version at{' '}
            <code>app.drawmeastix.io</code> sits behind Cloudflare, which sees the requests for
            the page and its files the way any content network does. It never sees an
            investigation, since none of them ever leaves the browser.
          </p>
          <p>
            The application has no backend at all: it is a folder of static files. Serving it
            yourself removes the question entirely, and it is the recommended arrangement for
            anyone whose cases would not be allowed near a third party.
          </p>
          <div className="guide-actions">
            <a className="guide-cta" href="/">
              Open the canvas
            </a>
            <span className="hint">
              New to STIX? <a href="/guide">Start with the guide</a>.
            </span>
          </div>
        </section>
      </div>
    </>
  )
}
