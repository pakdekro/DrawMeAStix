import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last net before the blank screen.
 *
 * The scenario that motivated this component: a third-party STIX bundle whose
 * `name` is an object rather than a string was persisted to IndexedDB, then
 * rendered as a JSX child. React throws, the root unmounts, and since the bad
 * data is SAVED, reloading replays exactly the same crash. The analyst loses
 * access to every investigation, the healthy ones included, and the only way
 * out was the devtools or clearing the site data.
 *
 * The cause is fixed upstream (importer.ts validates the type), but an
 * ErrorBoundary is still needed: the data already written by an earlier
 * version is still there, and the next untyped field will do the same.
 *
 * So this component must offer a WAY OUT, not just a message: an error screen
 * with no action is as much of a dead end as a blank screen.
 */

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Stays in the browser console: nothing is sent anywhere, the app is
    // local-first and the message can contain investigation data.
    console.error('Draw Me A STIX: unrecoverable render error', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <h1>Something broke while displaying this view</h1>
        <p>
          Your investigations are still stored in this browser. Nothing has been
          sent anywhere, and nothing has been deleted.
        </p>
        <p className="crash-detail">{error.message}</p>
        <div className="crash-actions">
          <button
            type="button"
            onClick={() => {
              // Back to the list THEN remount: if the crash comes from one
              // specific investigation, we do not reopen it on the way back.
              window.location.hash = '#/'
              this.setState({ error: null })
            }}
          >
            Back to the investigation list
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
        <p className="crash-hint">
          If the list itself keeps breaking, the cause is a stored investigation
          whose data is malformed, most likely from an imported bundle or a
          restored backup. Open it from the list and delete it, or restore a
          known-good backup.
        </p>
      </div>
    )
  }
}
