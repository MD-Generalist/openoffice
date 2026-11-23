import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Placeholder root replaced by App.tsx in T8.
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<StrictMode>{null}</StrictMode>)
}
