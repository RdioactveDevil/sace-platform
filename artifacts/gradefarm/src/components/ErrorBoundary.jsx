import { Component } from 'react'
import { reportError } from '../lib/analytics'
import { isChunkLoadError } from '../lib/chunkReload'
import { TriangleAlert } from 'lucide-react'

const GOLD   = 'var(--t-accent)'
const FONT_B = "'Plus Jakarta Sans', sans-serif"

/**
 * Catches render/lifecycle errors in its subtree so a single broken screen
 * never white-screens the whole app. Reports to the observability layer and
 * shows a friendly, branded fallback with recovery actions.
 *
 * Props:
 *  - label?: string   human name of the area (used in the report + retry copy)
 *  - compact?: bool   render a smaller inline fallback (for per-route use)
 *  - onReset?: fn     optional extra cleanup when the user clicks "Try again"
 *  - children
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    reportError(error, {
      source: 'ErrorBoundary',
      label: this.props.label || 'app',
      componentStack: info?.componentStack,
      fatal: !this.props.compact,
    })
  }

  handleRetry = () => {
    // A failed lazy import is cached, so re-rendering can't recover from a
    // stale chunk; only a reload fetches the new build.
    if (isChunkLoadError(this.state.error)) { window.location.reload(); return }
    try { this.props.onReset?.() } catch (_) {}
    this.setState({ error: null })
  }

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.assign('/')
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const compact = this.props.compact
    const label = this.props.label

    return (
      <div
        role="alert"
        style={{
          minHeight: compact ? 220 : '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, background: compact ? 'transparent' : 'var(--t-onAccent)',
          fontFamily: FONT_B, textAlign: 'center', boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'center' }}><TriangleAlert size={compact ? 34 : 48} color={GOLD} aria-hidden="true" /></div>
          <div style={{ fontSize: compact ? 18 : 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em', marginBottom: 8 }}>
            Something went wrong
          </div>
          <p style={{ fontSize: 14, color: 'var(--t-textMuted)', lineHeight: 1.6, margin: '0 0 22px' }}>
            {label
              ? `The ${label} screen hit an unexpected error. `
              : 'This screen hit an unexpected error. '}
            You can try again — your progress is safe.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '11px 22px', borderRadius: 11, border: 'none',
                background: GOLD, color: 'var(--t-onAccent)', fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              Try again
            </button>
            {!compact && (
              <button
                onClick={this.handleReload}
                style={{
                  padding: '11px 22px', borderRadius: 11,
                  border: '1px solid var(--t-border)', background: 'transparent',
                  color: 'var(--t-textMuted)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                Back to home
              </button>
            )}
          </div>
          {error?.message && (
            <details style={{ marginTop: 20, textAlign: 'left' }}>
              <summary style={{ fontSize: 12, color: 'var(--t-textMuted)', cursor: 'pointer', userSelect: 'none' }}>
                Technical details
              </summary>
              <pre style={{
                marginTop: 8, padding: 12, borderRadius: 8, overflowX: 'auto',
                background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 11, color: 'var(--t-borderMid)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {String(error.message)}
              </pre>
            </details>
          )}
        </div>
      </div>
    )
  }
}
