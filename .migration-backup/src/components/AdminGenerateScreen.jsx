import { useState, useEffect, useRef } from 'react'
import { S1_TOPICS, S2_TOPICS } from '../lib/adminTopics'
import { adminApiPost } from '../lib/adminApi'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const GOLD   = '#f1be43'

const STAGES = ['Chemistry Stage 1', 'Chemistry Stage 2']
const COUNTS = [5, 10, 20]
const DIFFICULTIES = [
  { value: 'mixed', label: 'Mixed (1–5)' },
  { value: '1', label: '1 — Easy' },
  { value: '2', label: '2' },
  { value: '3', label: '3 — Medium' },
  { value: '4', label: '4' },
  { value: '5', label: '5 — Hard' },
]

export default function AdminGenerateScreen() {
  const [stage,      setStage]      = useState('Chemistry Stage 1')
  const [topicCode,  setTopicCode]  = useState('')
  const [count,      setCount]      = useState(10)
  const [difficulty, setDifficulty] = useState('mixed')
  const [loading,    setLoading]    = useState(false)
  const [elapsed,    setElapsed]    = useState(0)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [loading])

  const topics = stage === 'Chemistry Stage 1' ? S1_TOPICS : S2_TOPICS

  const handleStageChange = (s) => {
    setStage(s)
    setTopicCode('')
    setResult(null)
    setError(null)
  }

  const handleSubmit = async () => {
    if (!topicCode) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const data = await adminApiPost('/api/generate-questions', {
        stage,
        topicCode,
        count,
        difficulty,
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.12)',
    background: '#0c1037',
    color: '#fff', fontSize: 13, fontFamily: FONT_B, outline: 'none',
  }

  return (
    <div>
      <h2 style={{ color: '#fff', marginTop: 0 }}>Generate Questions</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
        Pick a topic and let Claude generate MCQs. They land in the draft queue for your review.
      </p>

      {/* Stage */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Stage</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {STAGES.map(s => (
            <button
              key={s}
              onClick={() => handleStageChange(s)}
              style={{
                padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${stage === s ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: stage === s ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: stage === s ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Topic</label>
        <select value={topicCode} onChange={e => setTopicCode(e.target.value)} style={selectStyle}>
          <option value="">Select a topic…</option>
          {topics.map(t => (
            <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
          ))}
        </select>
      </div>

      {/* Count */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Number of Questions</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {COUNTS.map(c => (
            <button
              key={c}
              onClick={() => setCount(c)}
              style={{
                padding: '8px 18px', borderRadius: 8,
                border: `1px solid ${count === c ? GOLD : 'rgba(255,255,255,0.12)'}`,
                background: count === c ? 'rgba(241,190,67,0.1)' : 'transparent',
                color: count === c ? GOLD : 'rgba(255,255,255,0.5)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B,
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Difficulty</label>
        <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={selectStyle}>
          {DIFFICULTIES.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!topicCode || loading}
        style={{
          padding: '12px 28px', borderRadius: 10, border: 'none',
          background: (!topicCode || loading) ? 'rgba(255,255,255,0.08)' : GOLD,
          color: (!topicCode || loading) ? 'rgba(255,255,255,0.3)' : '#0c1037',
          fontSize: 14, fontWeight: 800,
          cursor: (!topicCode || loading) ? 'not-allowed' : 'pointer',
          fontFamily: FONT_B,
        }}
      >
        {loading ? `Generating ${count} questions… ${elapsed}s` : `Generate ${count} Questions`}
      </button>

      {loading && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_B }}>
          {elapsed < 10
            ? 'Calling Claude API…'
            : elapsed < 30
            ? 'Claude is writing questions…'
            : elapsed < 60
            ? 'Almost there, parsing response…'
            : `Still working… (${elapsed}s — large batches can take ~90s)`}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <div style={{ color: '#4ade80', fontWeight: 700 }}>✓ {result.inserted} questions added to the draft queue</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Go to the Review Queue tab to approve them.</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  )
}
