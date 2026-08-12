/**
 * Persistent status bar (#220).
 *
 * The application only had a six-second toast. That suits "3 candidates
 * added", not "your browser is full" nor "another tab changed this data":
 * those situations LAST, and a message that fades away leaves the analyst
 * carrying on from a false picture.
 *
 * Hence a bar that stays until it is dismissed, at the top rather than the
 * bottom so it is never taken for a toast, and able to carry an action - an
 * abnormal state almost always calls for a gesture.
 */

import Icon from './Icon'

export interface AlertState {
  message: string
  tone: 'danger' | 'warn'
  action?: { label: string; run: () => void }
}

export default function Alert({
  alert,
  onDismiss,
}: {
  alert: AlertState
  onDismiss: () => void
}) {
  return (
    <div className={`alert-bar ${alert.tone}`} role="alert">
      <Icon name="warning" size={15} />
      <span className="alert-text">{alert.message}</span>
      {alert.action && (
        <button className="alert-action" onClick={alert.action.run}>
          {alert.action.label}
        </button>
      )}
      <button className="alert-close" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
        <Icon name="cross" size={13} />
      </button>
    </div>
  )
}
