import { Component } from 'react'
import { reportError } from '../lib/analytics'

const GOLD   = '#f1be43'
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const FONT_D = "'Sifonn Pro', sans-serif"

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
          padding: 24, background: compact ? 'transparent' : '#0c1037',
          fontFamily: FONT_B, textAlign: 'center', boxSizing: 'border-box',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: compact ? 32 : 46, marginBottom: 14 }}>⚠️</div>
          <div style={{ fontFamily: FONT_D, fontSize: compact ? 18 : 22, color: '#f1f5f9', letterSpacing: 0.5, marginBottom: 8 }}>
            Something went wrong
          </div>
          <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 22px' }}>
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
                background: GOLD, color: '#0c1037', fontSize: 14, fontWeight: 800,
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
                  border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                  color: '#94a3b8', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: FONT_B,
                }}
              >
                Back to home
              </button>
            )}
          </div>
          {error?.message && (
            <details style={{ marginTop: 20, textAlign: 'left' }}>
              <summary style={{ fontSize: 12, color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>
                Technical details
              </summary>
              <pre style={{
                marginTop: 8, padding: 12, borderRadius: 8, overflowX: 'auto',
                background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: 11, color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
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
