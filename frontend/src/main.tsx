import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
// The fonts are declared in index.css, not here: this entry is one of three
// and the other two were left without them. See the head of that file.
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import InsecureContext from './components/InsecureContext'
import { canRun } from './secureContext'

const root = createRoot(document.getElementById('root')!)

// Checked BEFORE mounting: without a secure context the application cannot
// record or export anything, and letting it start only moves the failure to
// the first click. See components/InsecureContext.tsx.
root.render(
  canRun(window) ? (
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  ) : (
    <InsecureContext />
  ),
)
