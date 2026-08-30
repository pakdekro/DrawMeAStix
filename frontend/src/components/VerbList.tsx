import { label } from '../guide'
import type { VerbGroup } from '../guide'

/**
 * One verb, its sentence, and the types it accepts at the other end.
 *
 * Shared by the STIX guide and the framework pages: all three answer the same
 * question about a different subject, and the sentence they build is the
 * matrix speaking, never prose about the matrix.
 */
export default function VerbList({
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
