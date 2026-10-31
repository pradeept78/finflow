import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast, { Toaster, useToasterStore } from 'react-hot-toast'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

/**
 * Keeps the top-right corner calm when many things fail at once (backend down, session ended): the same message is shown
 * once — the newest copy — and at most 3 toasts are visible; older ones are dismissed. Page-level handlers that call
 * toast.error() themselves are covered too, not just the API layer.
 */
const MAX_TOASTS = 3
function ToastGuard() {
  const { toasts } = useToasterStore()
  useEffect(() => {
    const visible = toasts.filter(t => t.visible) // newest first
    const seen = new Set<string>()
    visible.forEach(t => {
      const key = typeof t.message === 'string' ? `${t.type}:${t.message}` : ''
      if (key && seen.has(key)) toast.dismiss(t.id)
      else if (key) seen.add(key)
    })
    visible.slice(MAX_TOASTS).forEach(t => toast.dismiss(t.id))
  }, [toasts])
  return null
}

// Installable app: the service worker lets FinFlow open from the home screen without a connection.
// Production builds only — in `npm run dev` a cached shell would hide your latest edits.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* app works without it */ }) })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 }
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Outer net: catches a throw in Layout, the router, or a provider — anything that would
          otherwise leave a blank page with no way out. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <ToastGuard />
      <Toaster position="top-right" toastOptions={{
        style: { background: 'var(--bg-card)', color: 'var(--text)', border: '1px solid var(--border)' },
        success: { iconTheme: { primary: '#34d399', secondary: '#1a1d27' } },
        error: { iconTheme: { primary: '#f87171', secondary: '#1a1d27' } }
      }} />
    </QueryClientProvider>
  </React.StrictMode>
)
