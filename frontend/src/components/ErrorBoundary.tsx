import React from 'react'

/**
 * Stops one broken page from taking down the whole app.
 *
 * Without this, any render-time throw unmounts the entire React tree and leaves a white screen with
 * no navigation and no explanation. That happened twice during development: a temporal-dead-zone
 * read on the Admin page, and an out-of-scope variable on Quick Lookup. Both are fixed — but the
 * next one will behave identically, and a personal-finance app going completely blank is a far worse
 * failure than one panel showing an error.
 *
 * Deliberately kept dependency-free and defensive: this component runs when something else has
 * already gone wrong, so it must not be able to throw itself.
 */

interface Props {
  children: React.ReactNode
  /** Shown in the message so the user knows what failed. */
  label?: string
  /** Rendered instead of the default panel, if a caller wants something smaller. */
  fallback?: (reset: () => void, error: Error) => React.ReactNode
}

interface State {
  error: Error | null
  info: string | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the component stack: it names the component that threw, which the message alone does not.
    this.setState({ info: info?.componentStack ?? null })
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.label ?? 'app', error, info?.componentStack)
  }

  private reset = () => this.setState({ error: null, info: null })

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) {
      try { return this.props.fallback(this.reset, error) } catch { /* fall through to the default */ }
    }

    const where = this.props.label ? ` on ${this.props.label}` : ''
    return (
      <div className="p-6">
        <div className="rounded-2xl px-5 py-4" style={{ background: '#f8717112', border: '1px solid #f8717140' }}>
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold" style={{ color: 'var(--danger)' }}>
                Something broke{where}
              </div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>
                The rest of the app is unaffected — use the sidebar to go elsewhere, or try again below.
                Your data has not been changed.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-secondary btn-sm text-[12px]" onClick={this.reset}>Try again</button>
                <button className="btn-secondary btn-sm text-[12px]" onClick={() => window.location.reload()}>Reload page</button>
                <button className="btn-secondary btn-sm text-[12px]"
                        onClick={() => {
                          const report = [
                            'FinFlow error report',
                            'when:  ' + new Date().toISOString(),
                            'where: ' + (this.props.label ?? 'app') + ' — ' + window.location.pathname,
                            'error: ' + (error?.message ?? String(error)),
                            '',
                            (error?.stack ?? '').split('\n').slice(0, 12).join('\n'),
                            '',
                            'component stack:',
                            (info ?? '').split('\n').slice(0, 12).join('\n'),
                          ].join('\n')
                          // Clipboard can reject (permissions, insecure context) — never let that throw here.
                          navigator.clipboard?.writeText(report).catch(() => {})
                        }}>
                  Copy details
                </button>
              </div>

              {/* The message is what makes a bug reportable, so it stays visible rather than hidden
                  behind a toggle. The stack is collapsed because it is only useful to a developer. */}
              <div className="mt-3 text-[11px] mono break-words" style={{ color: '#fca5a5' }}>
                {error?.message ?? String(error)}
              </div>
              {(error?.stack || info) && (
                <details className="mt-2">
                  <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                    technical detail
                  </summary>
                  <pre className="text-[11px] mt-1 overflow-auto whitespace-pre-wrap"
                       style={{ color: 'var(--text-faint)', maxHeight: 220 }}>
{(error?.stack ?? '') + (info ? '\n\ncomponent stack:' + info : '')}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
