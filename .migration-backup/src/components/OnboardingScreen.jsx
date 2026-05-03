import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveSubscriptions, completeOnboarding } from '../lib/db'
import { ALL_SUBJECTS } from '../lib/subjects'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const YEAR_LEVELS = [6, 7, 8, 9, 10, 11, 12]

const ATAR_TARGETS = [
  { value: 99.5, label: '99.5+', emoji: '🏆', sub: 'Top 0.5%' },
  { value: 95,   label: '95+',   emoji: '⭐', sub: 'Top 5%' },
  { value: 90,   label: '90+',   emoji: '🎯', sub: 'Top 10%' },
  { value: 80,   label: '80+',   emoji: '📈', sub: 'Above average' },
  { value: 70,   label: '70+',   emoji: '👍', sub: 'Comfortable pass' },
]

const STUDY_HOURS = [1, 2, 3, 5, 7, 10]

const AVAILABLE_SUBJECTS = ALL_SUBJECTS.filter(s => s.available)
const COMING_SUBJECTS    = ALL_SUBJECTS.filter(s => !s.available)

const inp = {
  padding: '12px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontSize: 15, outline: 'none',
  fontFamily: FONT_B, boxSizing: 'border-box', width: '100%',
}

export default function OnboardingScreen({ profile, userEmail, onDone }) {
  const [step, setStep]       = useState(0)
  const [saving, setSaving]   = useState(false)
  const [mounted, setMounted] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { const t = setTimeout(() => setMounted(true), 40); return () => clearTimeout(t) }, [])

  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [dob, setDob]                 = useState('')
  const [school, setSchool]           = useState(profile.school || '')
  const [yearLevel, setYearLevel]     = useState(null)
  const [atarTarget, setAtarTarget]   = useState(null)
  const [goals, setGoals]             = useState('')
  const [studyHours, setStudyHours]   = useState(null)
  const [selectedSubs, setSelectedSubs] = useState([])
  const [termsAccepted, setTermsAccepted] = useState(false)

  const TOTAL_CONTENT_STEPS = 4

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)

  const toggleSubject = (subj) => {
    setSelectedSubs(prev => {
      const key = `${subj.name}::${subj.stage}`
      const exists = prev.find(s => `${s.subject_name}::${s.stage}` === key)
      if (exists) return prev.filter(s => `${s.subject_name}::${s.stage}` !== key)
      return [...prev, { subject_name: subj.name, stage: subj.stage }]
    })
  }

  const isSubSelected = (subj) =>
    selectedSubs.some(s => s.subject_name === subj.name && s.stage === subj.stage)

  const finish = async () => {
    setSaving(true)
    try {
      const profileUpdates = {}
      if (displayName.trim()) profileUpdates.display_name = displayName.trim()
      if (dob)                profileUpdates.dob = dob
      if (school.trim())      profileUpdates.school = school.trim()
      if (yearLevel)          profileUpdates.year_level = yearLevel
      if (atarTarget)         profileUpdates.atar_target = atarTarget
      if (goals.trim())       profileUpdates.goals = goals.trim()
      if (studyHours)         profileUpdates.study_hours_per_week = studyHours
      await saveSubscriptions(profile.id, selectedSubs)
      await completeOnboarding(profile.id, profileUpdates)
    } catch (e) {
      console.error('Onboarding save error:', e)
    }
    setSaving(false)
    onDone()
  }

  const progressBar = () => {
    if (step === 0) return null
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          {['Details', 'Goals', 'Subjects', 'Confirm'].map((label, i) => (
            <span key={label} style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: step - 1 >= i ? GOLD : 'rgba(255,255,255,0.2)',
              transition: 'color 0.4s',
            }}>{label}</span>
          ))}
        </div>
        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: `linear-gradient(90deg,${GOLD},${GOLDL})`,
            width: `${((step - 1) / TOTAL_CONTENT_STEPS) * 100}%`,
            transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
            boxShadow: `0 0 8px ${GOLD}80`,
          }} />
        </div>
      </div>
    )
  }

  const navButtons = ({ onNext, nextLabel = 'Continue →', nextDisabled = false, hideBack = false }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
      {!hideBack && (
        <button type="button" onClick={back} style={{
          flex: 1, padding: '12px', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
          color: '#475569', fontSize: 14, cursor: 'pointer', fontFamily: FONT_B,
        }}>← Back</button>
      )}
      <button type="button"
        onClick={onNext}
        disabled={nextDisabled}
        style={{
          flex: 2, padding: '13px', borderRadius: 10, border: 'none',
          background: nextDisabled ? 'rgba(255,255,255,0.05)' : `linear-gradient(135deg,${GOLD},${GOLDL})`,
          color: nextDisabled ? '#475569' : NAVYD,
          fontSize: 14, fontWeight: 800,
          cursor: nextDisabled ? 'default' : 'pointer',
          fontFamily: FONT_B,
          boxShadow: nextDisabled ? 'none' : `0 4px 20px ${GOLD}40`,
          transition: 'all 0.2s',
        }}
      >{nextLabel}</button>
    </div>
  )

  const stepWelcome = () => (
    <div style={{ textAlign: 'center', animation: 'slideIn 0.55s cubic-bezier(0.34,1.2,0.64,1) both' }}>
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `conic-gradient(${GOLD}, ${GOLDL}, ${GOLD}40, transparent 70%)`,
          animation: 'spin 6s linear infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 68, height: 68, borderRadius: '50%', background: NAVYD, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: FONT_D, fontSize: 18, color: GOLD, letterSpacing: 1 }}>GF</span>
          </div>
        </div>
        <div style={{ position: 'absolute', top: -4, left: '50%', transformOrigin: '0 44px', animation: 'spin 3s linear infinite', width: 8, height: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: GOLD, boxShadow: `0 0 8px ${GOLD}` }} />
        </div>
      </div>

      <h2 style={{ fontFamily: FONT_D, fontSize: 24, color: '#f1f5f9', margin: '0 0 10px', letterSpacing: 1, lineHeight: 1.3 }}>
        WELCOME TO<br /><span style={{ color: GOLD }}>GRADEFARM.</span>
      </h2>
      <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.75, margin: '0 0 6px' }}>
        Let's set up your account so we can personalise your experience and give you access to the right subjects.
      </p>
      <p style={{ fontSize: 12, color: '#475569', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />
        Takes about 2 minutes
        <span style={{ display: 'inline-block', width: 20, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[
          { num: '500+', label: 'Questions' },
          { num: 'SACE', label: 'Aligned' },
          { num: 'Free', label: 'Beta access' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '12px 8px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
            animation: `slideIn 0.5s ${0.1 + i * 0.07}s cubic-bezier(0.34,1.2,0.64,1) both`,
          }}>
            <div style={{ fontFamily: FONT_D, fontSize: 15, color: GOLD, letterSpacing: 0.5 }}>{s.num}</div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <button type="button" onClick={next} style={{
        width: '100%', padding: '15px', borderRadius: 12, border: 'none',
        background: `linear-gradient(135deg,${GOLD},${GOLDL})`,
        color: NAVYD, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B,
        position: 'relative', overflow: 'hidden',
        animation: 'pulseBtn 2.5s ease-in-out infinite',
      }}>
        <span style={{ position: 'relative', zIndex: 1 }}>Let's go →</span>
        <div style={{
          position: 'absolute', top: 0, left: '-100%', width: '60%', height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
          animation: 'shimmer 2.8s ease-in-out 0.8s infinite',
        }} />
      </button>
    </div>
  )

  const stepDetails = () => (
    <div style={{ animation: 'slideIn 0.4s cubic-bezier(0.34,1.1,0.64,1) both' }}>
      <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>👤</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 20, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: 1, textAlign: 'center' }}>YOUR DETAILS</h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 22 }}>Tell us a bit about yourself.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={labelStyle}>Full Name <span style={{ color: '#f87171' }}>*</span></label>
          <input style={{ ...inp, borderColor: !displayName.trim() ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)' }} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input
            style={{ ...inp, opacity: 0.6, cursor: 'not-allowed' }}
            value={userEmail || ''}
            readOnly
            tabIndex={-1}
          />
        </div>
        <div>
          <label style={labelStyle}>Date of Birth <span style={{ color: '#f87171' }}>*</span></label>
          <input style={{ ...inp, colorScheme: 'dark', borderColor: !dob ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)' }} type="date" value={dob} onChange={e => setDob(e.target.value)} max={new Date().toISOString().split('T')[0]} />
        </div>
        <div>
          <label style={labelStyle}>School <span style={{ color: '#f87171' }}>*</span></label>
          <input style={{ ...inp, borderColor: !school.trim() ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)' }} value={school} onChange={e => setSchool(e.target.value)} placeholder="Your school name" />
        </div>
        <div>
          <label style={labelStyle}>Year Level <span style={{ color: '#f87171' }}>*</span></label>
          <select
            value={yearLevel ?? ''}
            onChange={e => setYearLevel(e.target.value ? Number(e.target.value) : null)}
            style={{
              ...inp,
              cursor: 'pointer', appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
              borderColor: yearLevel ? GOLD : 'rgba(255,255,255,0.1)',
              boxShadow: yearLevel ? `0 0 0 3px rgba(241,190,67,0.12)` : 'none',
            }}
          >
            <option value="" disabled style={{ background: '#0c1037' }}>Select year level</option>
            {YEAR_LEVELS.map(y => (
              <option key={y} value={y} style={{ background: '#0c1037' }}>Year {y}</option>
            ))}
          </select>
        </div>
      </div>
      {(() => {
        const missing = []
        if (!displayName.trim()) missing.push('Full Name')
        if (!dob)                missing.push('Date of Birth')
        if (!school.trim())     missing.push('School')
        if (!yearLevel)         missing.push('Year Level')
        return (
          <>
            {missing.length > 0 && (
              <p style={{ fontSize: 11, color: '#475569', marginTop: 16, marginBottom: 0, textAlign: 'center' }}>
                Required: {missing.join(' · ')}
              </p>
            )}
            {navButtons({ onNext: next, hideBack: true, nextLabel: "Continue \u2192", nextDisabled: missing.length > 0 })}
          </>
        )
      })()}
    </div>
  )

  const stepGoals = () => (
    <div style={{ animation: 'slideIn 0.4s cubic-bezier(0.34,1.1,0.64,1) both' }}>
      <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>🎯</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 20, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: 1, textAlign: 'center' }}>YOUR GOALS</h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 22 }}>This helps us calibrate your study plan.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>ATAR Target</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ATAR_TARGETS.map(a => (
              <button type="button" key={a.value} onClick={() => setAtarTarget(atarTarget === a.value ? null : a.value)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                border: `1px solid ${atarTarget === a.value ? GOLD : 'rgba(255,255,255,0.08)'}`,
                background: atarTarget === a.value ? 'rgba(241,190,67,0.1)' : 'rgba(255,255,255,0.02)',
                cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', transition: 'all 0.2s',
                boxShadow: atarTarget === a.value ? `0 0 12px ${GOLD}25` : 'none',
              }}>
                <span style={{ fontSize: 18, width: 24 }}>{a.emoji}</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: atarTarget === a.value ? GOLD : '#e2e8f0' }}>{a.label}</span>
                  <span style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>{a.sub}</span>
                </div>
                {atarTarget === a.value && <span style={{ color: GOLD, fontSize: 14 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Study hours per week (optional)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STUDY_HOURS.map(h => (
              <button type="button" key={h} onClick={() => setStudyHours(studyHours === h ? null : h)} style={{
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: FONT_B,
                border: `1px solid ${studyHours === h ? GOLD : 'rgba(255,255,255,0.1)'}`,
                background: studyHours === h ? 'rgba(241,190,67,0.1)' : 'rgba(255,255,255,0.03)',
                color: studyHours === h ? GOLD : '#94a3b8', fontSize: 13, fontWeight: 600,
                transition: 'all 0.2s',
              }}>{h}h</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Anything else? (optional)</label>
          <textarea value={goals} onChange={e => setGoals(e.target.value)}
            placeholder="e.g. I want to improve my understanding of organic chemistry..."
            style={{ ...inp, resize: 'vertical', minHeight: 72, lineHeight: 1.5 }} />
        </div>
      </div>
      {navButtons({ onNext: next })}
    </div>
  )

  const stepSubjects = () => (
    <div style={{ animation: 'slideIn 0.4s cubic-bezier(0.34,1.1,0.64,1) both' }}>
      <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>📚</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 20, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: 1, textAlign: 'center' }}>YOUR SUBJECTS</h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 6 }}>Select the subjects you're studying.</p>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 11, background: 'rgba(241,190,67,0.15)', color: GOLD, border: `1px solid ${GOLD}30`, borderRadius: 20, padding: '3px 10px', fontWeight: 700 }}>🎉 FREE during Beta</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {AVAILABLE_SUBJECTS.map((subj, i) => {
          const sel = isSubSelected(subj)
          return (
            <button type="button" key={subj.id} onClick={() => toggleSubject(subj)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
              border: `1px solid ${sel ? GOLD : 'rgba(255,255,255,0.1)'}`,
              background: sel ? 'rgba(241,190,67,0.08)' : 'rgba(255,255,255,0.02)',
              cursor: 'pointer', fontFamily: FONT_B, textAlign: 'left', transition: 'all 0.2s', width: '100%',
              boxShadow: sel ? `0 0 16px ${GOLD}20` : 'none',
              animation: `slideIn 0.4s ${i * 0.06}s cubic-bezier(0.34,1.1,0.64,1) both`,
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `${subj.color}22`, border: `1px solid ${subj.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{subj.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: sel ? '#f1f5f9' : '#e2e8f0' }}>{subj.name}</div>
                <div style={{ fontSize: 11, color: subj.color, fontWeight: 600, marginTop: 1 }}>{subj.stage}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${sel ? GOLD : 'rgba(255,255,255,0.15)'}`, background: sel ? GOLD : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                {sel && <span style={{ fontSize: 11, color: NAVYD, fontWeight: 800 }}>✓</span>}
              </div>
            </button>
          )
        })}
      </div>
      {COMING_SUBJECTS.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Coming Soon</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.45, marginBottom: 8 }}>
            {COMING_SUBJECTS.map(subj => (
              <div key={subj.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                <div style={{ fontSize: 16 }}>{subj.icon}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>{subj.name}</span>
                  <span style={{ fontSize: 11, color: '#475569', marginLeft: 8 }}>{subj.stage}</span>
                </div>
                <span style={{ fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 6 }}>SOON</span>
              </div>
            ))}
          </div>
        </>
      )}
      {navButtons({ onNext: next, nextDisabled: selectedSubs.length === 0, nextLabel: selectedSubs.length === 0 ? 'Select at least one subject' : `Continue with ${selectedSubs.length} subject${selectedSubs.length > 1 ? 's' : ''} \u2192` })}
    </div>
  )

  const stepConfirm = () => (
    <div style={{ animation: 'slideIn 0.4s cubic-bezier(0.34,1.1,0.64,1) both' }}>
      <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 10 }}>✅</div>
      <h2 style={{ fontFamily: FONT_D, fontSize: 20, color: '#f1f5f9', margin: '0 0 4px', letterSpacing: 1, textAlign: 'center' }}>ALMOST THERE</h2>
      <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>Review your setup and accept terms to get started.</p>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
        {[
          { label: 'Name',           value: displayName || '\u2014' },
          { label: 'School',         value: school || '\u2014' },
          { label: 'Year',           value: yearLevel ? `Year ${yearLevel}` : '\u2014' },
          { label: 'ATAR Target',    value: atarTarget ? `${atarTarget}+` : '\u2014' },
          { label: 'Study hrs/week', value: studyHours ? `${studyHours}h` : '\u2014' },
          { label: 'Subjects',       value: selectedSubs.map(s => `${s.subject_name} ${s.stage}`).join(', ') || '\u2014' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 12, color: '#475569' }}>{row.label}</span>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, maxWidth: '55%', textAlign: 'right' }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px', borderRadius: 10, border: `1px solid ${termsAccepted ? GOLD : 'rgba(255,255,255,0.1)'}`, background: termsAccepted ? 'rgba(241,190,67,0.06)' : 'rgba(255,255,255,0.02)', width: '100%', fontFamily: FONT_B, marginBottom: 6, boxSizing: 'border-box', transition: 'border-color 0.2s, background 0.2s' }}>
        <button type="button" onClick={() => setTermsAccepted(v => !v)} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${termsAccepted ? GOLD : 'rgba(255,255,255,0.2)'}`, background: termsAccepted ? GOLD : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, transition: 'all 0.2s', cursor: 'pointer', padding: 0 }}>
          {termsAccepted && <span style={{ fontSize: 11, color: NAVYD, fontWeight: 800 }}>✓</span>}
        </button>
        <span style={{ fontSize: 13, color: termsAccepted ? '#e2e8f0' : '#64748b', textAlign: 'left', lineHeight: 1.5 }}>
          I agree to the{' '}
          <button type="button" onClick={() => window.open('/terms', '_blank')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B, fontSize: 'inherit' }}>Terms of Service</button>
          {' '}and{' '}
          <button type="button" onClick={() => window.open('/privacy', '_blank')} style={{ background: 'none', border: 'none', padding: 0, color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontFamily: FONT_B, fontSize: 'inherit' }}>Privacy Policy</button>
          . I confirm I am 13 years or older, or have parental consent.
        </span>
      </div>
      {navButtons({ onNext: finish, nextLabel: saving ? 'Setting up…' : "Let's start! 🚀", nextDisabled: !termsAccepted || saving })}
    </div>
  )



  return (
    <div style={{
      minHeight: '100vh', background: NAVYD,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: FONT_B,
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @font-face { font-family: 'Sifonn Pro'; src: url('/SIFONN_PRO.otf') format('opentype'); font-display: swap; }
        @keyframes slideIn  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes shimmer  { 0%{left:-100%} 60%{left:160%} 100%{left:160%} }
        @keyframes pulseBtn { 0%,100%{box-shadow:0 8px 32px rgba(241,190,67,0.5)} 50%{box-shadow:0 8px 52px rgba(241,190,67,0.8)} }
        @keyframes float1   { 0%,100%{transform:translate(0,0) scale(1)}   50%{transform:translate(30px,-40px) scale(1.08)} }
        @keyframes float2   { 0%,100%{transform:translate(0,0) scale(1)}   50%{transform:translate(-20px,30px) scale(0.95)} }
        @keyframes float3   { 0%,100%{transform:translate(0,0) scale(1)}   50%{transform:translate(15px,20px)  scale(1.05)} }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
        input:focus, textarea:focus { border-color: #f1be43 !important; box-shadow: 0 0 0 3px rgba(241,190,67,0.12) !important; }
      `}</style>

      {/* Animated background orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(241,190,67,0.1) 0%, transparent 70%)', animation: 'float1 14s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)', animation: 'float2 18s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '40%', right: '10%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(241,190,67,0.07) 0%, transparent 70%)', animation: 'float3 10s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 440, position: 'relative',
        background: 'rgba(8,13,40,0.96)', borderRadius: 24,
        border: '1px solid rgba(241,190,67,0.2)',
        padding: '36px 32px',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04)',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0) scale(1)' : 'translateY(36px) scale(0.97)',
        transition: 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.34,1.2,0.64,1)',
        backdropFilter: 'blur(24px)',
      }}>
        {/* Top glow edge */}
        <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(241,190,67,0.7), transparent)', borderRadius: 99 }} />

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 22, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em', marginTop: 3, fontFamily: FONT_B }}>by Titanium Tutoring</div>
        </div>
        {progressBar()}
        {[stepWelcome, stepDetails, stepGoals, stepSubjects, stepConfirm][step]()}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6, letterSpacing: '0.03em' }
