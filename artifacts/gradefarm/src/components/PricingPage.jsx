import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlatformSettings } from '../lib/db'
import { Lightbulb, GraduationCap, Menu, X, Infinity as InfinityIcon } from 'lucide-react'
import { usePublicSubjects } from '../lib/publicSubjects'
import { formatSubjectLabel } from '../lib/subjects'
import { SubjectIconByName } from './SubjectIcons'

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const PURPLE = '#a78bfa'
const GREEN  = '#10b981'
const MUTED  = '#94a3b8'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

function FadeUp({ children, delay = 0 }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect() } }, { threshold: 0.08 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ opacity: vis ? 1 : 0, transform: vis ? 'none' : 'translateY(28px)', transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms` }}>
      {children}
    </div>
  )
}

const CHECK = ({ gold }) => (
  <div style={{ width: 18, height: 18, borderRadius: '50%', background: gold ? 'rgba(241,190,67,0.15)' : 'rgba(167,139,250,0.12)', border: `1px solid ${gold ? 'rgba(241,190,67,0.35)' : 'rgba(167,139,250,0.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
    <span style={{ fontSize: 8, fontWeight: 900, color: gold ? GOLD : PURPLE }}>✓</span>
  </div>
)

const DASH = () => (
  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
    <span style={{ fontSize: 10, fontWeight: 900, color: '#334155' }}>–</span>
  </div>
)

const DEFAULT_PRICING = { student_tiers: [5, 4, 3], free_daily_questions: 20, free_daily_ai_messages: 10, tutor_plans: [{ name: 'Starter', price: 29 }, { name: 'Growth', price: 59 }, { name: 'Pro', price: 99 }], annual_discount: 0.2 }

export default function PricingPage({ onGetStarted, onSignIn }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('students') // 'students' | 'tutors'
  const [billing, setBilling] = useState('monthly') // 'monthly' | 'annual'
  const [dbPricing, setDbPricing] = useState(DEFAULT_PRICING)
  const [menuOpen, setMenuOpen] = useState(false)
  const subjects = usePublicSubjects()

  useEffect(() => { window.scrollTo(0, 0) }, [])

  useEffect(() => {
    getPlatformSettings('pricing').then(val => {
      if (val) setDbPricing(prev => ({ ...DEFAULT_PRICING, ...val, tutor_plans: val.tutor_plans || DEFAULT_PRICING.tutor_plans }))
    }).catch(() => {})
  }, [])

  const handleGetStarted = onGetStarted || (() => navigate('/auth'))
  const handleSignIn     = onSignIn     || (() => navigate('/auth'))

  const annualDiscount = dbPricing.annual_discount ?? 0.2

  const tiers = Array.isArray(dbPricing.student_tiers) && dbPricing.student_tiers.length ? dbPricing.student_tiers : [5, 4, 3]
  const studentWeekly = tiers[0]
  const freeDaily = dbPricing.free_daily_questions ?? 20
  const freeAi = dbPricing.free_daily_ai_messages ?? 10
  const extraLadder = tiers.length > 1 ? `$${tiers.slice(1).join(', then $')}` : `$${studentWeekly}`
  const threeSubjects = [0, 1, 2].map(i => tiers[Math.min(i, tiers.length - 1)]).reduce((a, b) => a + b, 0)
  // Students pay weekly per subject; the monthly/annual toggle is for tutor plans.
  const studentPlans = [
    {
      name: 'Free',
      price: 0,
      fixed: true,
      sub: 'No credit card required',
      badge: null,
      hi: false,
      accentColor: MUTED,
      cta: 'Get started free',
      features: [
        { text: '1 subject of your choice (swap any time)', included: true },
        { text: `${freeDaily} questions per day`, included: true },
        { text: `${freeAi} Titan AI messages per day`, included: true },
        { text: 'Instant feedback & struggle tracking', included: true },
        { text: 'Weekly leaderboard', included: true },
        { text: 'Unlimited questions', included: false },
        { text: 'Exam Mode', included: false },
      ],
    },
    {
      name: 'Per Subject',
      price: studentWeekly,
      fixed: true,
      unit: '/wk',
      sub: `first subject · extra subjects ${extraLadder}/week each · AUD`,
      badge: 'MOST POPULAR',
      hi: true,
      accentColor: GOLD,
      cta: 'Start learning →',
      features: [
        { text: 'Unlimited questions — fresh AI questions, no daily cap', included: true },
        { text: 'Exam Mode', included: true },
        { text: 'Unlimited Titan AI tutoring', included: true },
        { text: 'Readiness score & study plan', included: true },
        { text: 'Essay / writing module', included: true },
        { text: 'Cancel any time', included: true },
      ],
    },
  ]

  const tutorDbPlans = dbPricing.tutor_plans || DEFAULT_PRICING.tutor_plans
  const tutorPlans = [
    {
      name: 'Starter',
      price: tutorDbPlans[0]?.price ?? 29,
      sub: 'per month',
      badge: null,
      hi: false,
      accentColor: PURPLE,
      cta: 'Get started →',
      limits: 'Up to 5 students · 1 subject',
      features: [
        { text: 'Student progress dashboard', included: true },
        { text: 'Session scheduling', included: true },
        { text: 'Assignment creation', included: true },
        { text: 'Student roster management', included: true },
        { text: 'Up to 3 subjects', included: false },
        { text: 'Session recordings', included: false },
        { text: 'Parent progress reports', included: false },
        { text: 'Unlimited students', included: false },
        { text: 'All SACE subjects', included: false },
        { text: 'Priority support', included: false },
      ],
    },
    {
      name: 'Growth',
      price: tutorDbPlans[1]?.price ?? 59,
      sub: 'per month',
      badge: 'MOST POPULAR',
      hi: true,
      accentColor: PURPLE,
      cta: 'Get started →',
      limits: 'Up to 20 students · 3 subjects',
      features: [
        { text: 'Student progress dashboard', included: true },
        { text: 'Session scheduling', included: true },
        { text: 'Assignment creation', included: true },
        { text: 'Student roster management', included: true },
        { text: 'Up to 3 subjects', included: true },
        { text: 'Session recordings', included: true },
        { text: 'Parent progress reports', included: true },
        { text: 'Unlimited students', included: false },
        { text: 'All SACE subjects', included: false },
        { text: 'Priority support', included: false },
      ],
    },
    {
      name: 'Pro',
      price: tutorDbPlans[2]?.price ?? 99,
      sub: 'per month',
      badge: null,
      hi: false,
      accentColor: GOLD,
      cta: 'Get started →',
      limits: 'Unlimited students · All subjects',
      features: [
        { text: 'Student progress dashboard', included: true },
        { text: 'Session scheduling', included: true },
        { text: 'Assignment creation', included: true },
        { text: 'Student roster management', included: true },
        { text: 'All SACE subjects', included: true },
        { text: 'Session recordings', included: true },
        { text: 'Parent progress reports', included: true },
        { text: 'Unlimited students', included: true },
        { text: 'All SACE subjects', included: true },
        { text: 'Priority support', included: true },
      ],
    },
  ]

  const displayPrice = (p, fixed = false) => {
    if (p === 0) return 'Free'
    if (fixed) return `$${p}`
    const monthly = billing === 'annual' ? Math.round(p * (1 - annualDiscount)) : p
    return `$${monthly}`
  }

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: '#f1f5f9', fontFamily: FONT_B, overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
        .pp-nl { text-decoration: none !important }
        .pp-tab-btn { transition: all 0.18s; }
        .pp-tab-btn:hover { opacity: 0.85; }
        .pp-card { transition: transform 0.18s, box-shadow 0.18s; }
        .pp-card:hover { transform: translateY(-3px); }
        .pp-shimmer { background: linear-gradient(90deg,${GOLD} 0%,${GOLDL} 30%,#fff8e1 50%,${GOLDL} 70%,${GOLD} 100%); background-size: 200% auto; animation: pp-shimmer 3s linear infinite; }
        @keyframes pp-shimmer { to { background-position: -200% center; } }
        .pp-shimmer-purple { background: linear-gradient(90deg,${PURPLE} 0%,#c4b5fd 40%,${PURPLE} 100%); background-size: 200% auto; animation: pp-shimmer 3s linear infinite; }
        .pp-menu-btn { display: none; }
        @media(max-width:900px) {
          .pp-plans-grid { grid-template-columns: 1fr !important; max-width: 460px; margin: 0 auto; }
          .pp-nav-links { display: none !important; }
          .pp-menu-btn { display: flex; }
        }
        @media(max-width:760px) {
          .pp-student-grid { grid-template-columns: 1fr !important; max-width: 460px; margin: 0 auto; }
        }
        @media(max-width:560px) {
          .pp-pad { padding-left: 16px !important; padding-right: 16px !important; }
          .pp-nav { padding: 0 14px !important; }
          .pp-tag, .pp-signin { display: none !important; }
          .pp-hero { padding-top: 48px !important; padding-bottom: 32px !important; }
          .pp-hero-p { font-size: 15px !important; margin-bottom: 28px !important; }
          .pp-tabs { display: flex !important; width: 100%; }
          .pp-tabs > button { flex: 1; padding: 10px 12px !important; }
          .pp-card { padding: 32px 20px 24px !important; }
          .pp-card:hover { transform: none; }
          .pp-price { font-size: 44px !important; }
          .pp-note { padding: 16px !important; gap: 12px !important; }
          .pp-footer { flex-direction: column; text-align: center; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="pp-nav" style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(20px)', background: 'rgba(8,13,40,0.88)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <button onClick={() => navigate('/home')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
              <span style={{ color: '#f1f5f9' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
            </span>
            <span className="pp-tag" style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>by Titanium Tutoring</span>
          </button>
          <div className="pp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1 }}>
            {[['features', 'Features'], ['how', 'How It Works'], ['subjects', 'Subjects']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => navigate(`/home#${id}`)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: FONT_B, transition: 'color 0.15s', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f1f5f9' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
              >{label}</button>
            ))}
            <button
              style={{ background: 'none', border: 'none', color: GOLD, fontSize: 13.5, fontWeight: 700, cursor: 'default', fontFamily: FONT_B, whiteSpace: 'nowrap' }}
            >Pricing</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={handleSignIn} className="pp-signin" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.65)', fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>Sign in</button>
            <button onClick={handleGetStarted} className="pp-shimmer" style={{ padding: '9px 16px', borderRadius: 9, border: 'none', color: NAVYD, fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: FONT_B, whiteSpace: 'nowrap' }}>Get started free</button>
            <button
              className="pp-menu-btn"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{ alignItems: 'center', justifyContent: 'center', width: 38, height: 38, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f1f5f9', cursor: 'pointer', padding: 0 }}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '4px 0 14px', display: 'flex', flexDirection: 'column' }}>
            {[['features', 'Features'], ['how', 'How It Works'], ['subjects', 'Subjects']].map(([id, label]) => (
              <button key={id} onClick={() => navigate(`/home#${id}`)} style={{ background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 8px' }}>{label}</button>
            ))}
            <button onClick={handleSignIn} style={{ background: 'none', border: 'none', color: '#f1f5f9', fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 8px' }}>Sign in</button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <FadeUp>
        <section className="pp-pad pp-hero" style={{ padding: '80px 32px 48px', textAlign: 'center' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>Pricing</div>
            <h1 style={{ fontFamily: FONT_D, fontSize: 'clamp(28px,5vw,52px)', margin: '0 0 18px', color: '#fff', letterSpacing: 1, lineHeight: 1.1 }}>
              PLANS FOR STUDENTS<br /><span style={{ color: GOLD }}>&amp; TUTORS.</span>
            </h1>
            <p className="pp-hero-p" style={{ fontSize: 17, color: MUTED, lineHeight: 1.75, margin: '0 0 40px' }}>
              Students pay only for the subjects they need — and every paid subject comes with unlimited questions. Tutors choose a plan that fits their roster.
            </p>

            {/* Role tab switcher */}
            <div className="pp-tabs" style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 4, gap: 4, marginBottom: 20 }}>
              {[['students', 'For Students'], ['tutors', 'For Tutors']].map(([key, label]) => (
                <button
                  key={key}
                  className="pp-tab-btn"
                  onClick={() => setTab(key)}
                  style={{
                    padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: FONT_B,
                    fontSize: 14, fontWeight: 700,
                    background: tab === key ? (key === 'students' ? `linear-gradient(135deg,${GOLD},${GOLDL})` : `linear-gradient(135deg,${PURPLE},#7c3aed)`) : 'transparent',
                    color: tab === key ? (key === 'students' ? NAVYD : '#fff') : MUTED,
                    boxShadow: tab === key ? '0 4px 14px rgba(0,0,0,0.3)' : 'none',
                  }}
                >{label}</button>
              ))}
            </div>

            {/* Billing toggle (tutor plans only) */}
            {tab === 'tutors' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
              <button onClick={() => setBilling('monthly')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: billing === 'monthly' ? 700 : 400, color: billing === 'monthly' ? '#f1f5f9' : MUTED }}>Monthly</button>
              <div
                onClick={() => setBilling(b => b === 'monthly' ? 'annual' : 'monthly')}
                style={{ width: 44, height: 24, borderRadius: 12, background: billing === 'annual' ? `linear-gradient(90deg,${GOLD},${GOLDL})` : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
              >
                <div style={{ position: 'absolute', top: 3, left: billing === 'annual' ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
              </div>
              <button onClick={() => setBilling('annual')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, fontWeight: billing === 'annual' ? 700 : 400, color: billing === 'annual' ? '#f1f5f9' : MUTED }}>
                Annual <span style={{ fontSize: 11, color: GREEN, fontWeight: 800, marginLeft: 4 }}>–20%</span>
              </button>
            </div>}
          </div>
        </section>
      </FadeUp>

      {/* ── STUDENT PLANS ── */}
      {tab === 'students' && (
        <FadeUp delay={60}>
          <section className="pp-pad" style={{ padding: '0 32px 80px' }}>
            <div style={{ maxWidth: 780, margin: '0 auto' }}>
              <div className="pp-student-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 20 }}>
                {studentPlans.map((plan) => (
                  <div
                    key={plan.name}
                    className="pp-card"
                    style={{
                      background: plan.hi ? 'rgba(241,190,67,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${plan.hi ? 'rgba(241,190,67,0.32)' : 'rgba(255,255,255,0.07)'}`,
                      borderTop: plan.hi ? `3px solid ${GOLD}` : `1px solid rgba(255,255,255,0.07)`,
                      borderRadius: 22,
                      padding: '40px 32px 36px',
                      position: 'relative',
                    }}
                  >
                    {plan.badge && (
                      <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg,${GOLD},${GOLDL})`, color: NAVYD, fontSize: 10, fontWeight: 900, padding: '5px 16px', borderRadius: 20, whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{plan.badge}</div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 800, color: plan.hi ? GOLD : 'rgba(255,255,255,0.28)', marginBottom: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{plan.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                      <div className="pp-price" style={{ fontFamily: FONT_D, fontSize: 52, color: plan.hi ? '#fff' : 'rgba(255,255,255,0.45)', letterSpacing: 1, lineHeight: 1 }}>
                        {displayPrice(plan.price, plan.fixed)}
                      </div>
                      {plan.price > 0 && <span style={{ fontSize: 13, color: MUTED, marginBottom: 2 }}>{plan.unit || '/mo'}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 28, lineHeight: 1.5 }}>
                      {billing === 'annual' && plan.price > 0 && !plan.fixed
                        ? `$${Math.round(plan.price * (1 - annualDiscount) * 12)}/year · billed annually`
                        : plan.sub}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                      {plan.features.map(f => (
                        <div key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: f.included ? (plan.hi ? '#cbd5e1' : '#94a3b8') : '#334155' }}>
                          {f.included ? <CHECK gold={true} /> : <DASH />}
                          {f.text}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleGetStarted}
                      className={plan.hi ? 'pp-shimmer' : ''}
                      style={{
                        width: '100%', padding: '14px', borderRadius: 12, border: plan.hi ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        background: plan.hi ? undefined : 'rgba(255,255,255,0.04)',
                        color: plan.hi ? NAVYD : MUTED,
                        fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: FONT_B,
                        boxShadow: plan.hi ? `0 6px 20px rgba(241,190,67,0.35)` : 'none',
                      }}
                    >{plan.cta}</button>
                  </div>
                ))}
              </div>

              {/* Per-subject note */}
              <FadeUp delay={120}>
                <div className="pp-note" style={{ marginTop: 28, background: 'rgba(241,190,67,0.04)', border: '1px solid rgba(241,190,67,0.14)', borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <Lightbulb size={24} color={GOLD} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 6 }}>Mix &amp; match subjects</div>
                    <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
                      Each extra subject costs less. Three subjects together are just <strong style={{ color: '#f1f5f9' }}>${threeSubjects}/week</strong> ({tiers.slice(0, 3).map(n => `$${n}`).join(' + ')}). One weekly bill — add or remove subjects any time.
                    </div>
                  </div>
                </div>
              </FadeUp>

              {/* Subjects available */}
              <FadeUp delay={180}>
                <div style={{ marginTop: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 20 }}>Available subjects</div>
                  {subjects === null ? (
                    <div style={{ fontSize: 13, color: MUTED }}>Loading subjects…</div>
                  ) : subjects.length === 0 ? (
                    <div style={{ fontSize: 13, color: MUTED }}>Sign up to see every subject we offer.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                      {subjects.map(s => (
                        <div key={s.name} style={{ padding: '8px 16px', borderRadius: 20, background: 'rgba(241,190,67,0.08)', border: '1px solid rgba(241,190,67,0.28)', fontSize: 12, fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <SubjectIconByName name={s.name} color={GOLD} size={16} />
                          {formatSubjectLabel({ name: s.name, stage: s.level })}
                          <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.15)', color: GREEN, border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '1px 7px', fontWeight: 800 }}>LIVE</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontSize: 12, color: MUTED, display: 'inline-flex', alignItems: 'center', gap: 6 }}><InfinityIcon size={14} color={GOLD} aria-hidden="true" />More subjects are added all the time</div>
                </div>
              </FadeUp>
            </div>
          </section>
        </FadeUp>
      )}

      {/* ── TUTOR PLANS ── */}
      {tab === 'tutors' && (
        <FadeUp delay={60}>
          <section className="pp-pad" style={{ padding: '0 32px 80px' }}>
            <div style={{ maxWidth: 1040, margin: '0 auto' }}>
              <div className="pp-plans-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
                {tutorPlans.map((plan) => (
                  <div
                    key={plan.name}
                    className="pp-card"
                    style={{
                      background: plan.hi ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${plan.hi ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      borderTop: plan.hi ? `3px solid ${PURPLE}` : `1px solid rgba(255,255,255,0.07)`,
                      borderRadius: 22,
                      padding: '40px 28px 36px',
                      position: 'relative',
                    }}
                  >
                    {plan.badge && (
                      <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg,${PURPLE},#7c3aed)`, color: '#fff', fontSize: 10, fontWeight: 900, padding: '5px 16px', borderRadius: 20, whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{plan.badge}</div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 800, color: plan.hi ? PURPLE : 'rgba(255,255,255,0.28)', marginBottom: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{plan.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                      <div className="pp-price" style={{ fontFamily: FONT_D, fontSize: 46, color: plan.hi ? '#fff' : 'rgba(255,255,255,0.55)', letterSpacing: 1, lineHeight: 1 }}>
                        {displayPrice(plan.price)}
                      </div>
                      <span style={{ fontSize: 13, color: MUTED, marginBottom: 2 }}>/mo</span>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>
                      {billing === 'annual'
                        ? `$${Math.round(plan.price * (1 - annualDiscount) * 12)}/year · billed annually`
                        : plan.sub}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: plan.hi ? PURPLE : '#475569', marginBottom: 24, padding: '6px 12px', background: plan.hi ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${plan.hi ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 8, display: 'inline-block' }}>{plan.limits}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                      {plan.features.filter((f, i, arr) => {
                        // Remove duplicate "All SACE subjects" entries
                        return arr.findIndex(x => x.text === f.text) === i
                      }).map(f => (
                        <div key={f.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: f.included ? (plan.hi ? '#cbd5e1' : '#94a3b8') : '#334155' }}>
                          {f.included ? <CHECK gold={false} /> : <DASH />}
                          {f.text}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={handleGetStarted}
                      className={plan.hi ? 'pp-shimmer-purple' : ''}
                      style={{
                        width: '100%', padding: '14px', borderRadius: 12, border: plan.hi ? 'none' : '1px solid rgba(255,255,255,0.1)',
                        background: plan.hi ? undefined : 'rgba(255,255,255,0.04)',
                        color: '#fff',
                        fontSize: 14, fontWeight: 900, cursor: 'pointer', fontFamily: FONT_B,
                        boxShadow: plan.hi ? '0 6px 20px rgba(167,139,250,0.35)' : 'none',
                      }}
                    >{plan.cta}</button>
                  </div>
                ))}
              </div>

              {/* Tutor note */}
              <FadeUp delay={120}>
                <div className="pp-note" style={{ marginTop: 28, background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.14)', borderRadius: 16, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <GraduationCap size={24} color={PURPLE} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: PURPLE, marginBottom: 6 }}>Already a registered tutor?</div>
                    <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
                      If you're part of the Titanium Tutoring network, your account is provisioned directly. <button onClick={handleSignIn} style={{ background: 'none', border: 'none', color: PURPLE, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, fontSize: 13, padding: 0, textDecoration: 'underline' }}>Sign in here</button> to access your dashboard.
                    </div>
                  </div>
                </div>
              </FadeUp>
            </div>
          </section>
        </FadeUp>
      )}

      {/* ── FAQ ── */}
      <FadeUp>
        <section className="pp-pad" style={{ padding: '20px 32px 80px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>FAQ</div>
            <h2 style={{ fontFamily: FONT_D, fontSize: 'clamp(22px,3.5vw,36px)', margin: '0 0 44px', color: '#fff', letterSpacing: 1 }}>COMMON QUESTIONS</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
              {[
                { q: 'Are the questions really unlimited?', a: `Yes. When you've worked through a topic's question bank, Titan writes brand-new questions for it, pitched at your level and checked before you see them — so you never run out. The free plan is capped at ${freeDaily} questions a day; paid subjects have no cap.` },
                { q: 'Can I try before I pay?', a: `Yes — pick any one subject to use free, with ${freeDaily} questions a day and no credit card. You can swap your free subject any time.` },
                { q: 'Can I cancel anytime?', a: "Absolutely. Remove a subject from My Account whenever you like — unused time is credited to your next bill. Removing your last paid subject ends your plan at the end of the week you've paid for." },
                { q: 'Do I pay per subject or for all subjects at once?', a: `Per subject, on one weekly bill, and each extra subject costs less: $${studentWeekly} for the first, then ${extraLadder}/week. Two subjects are $${tiers[0] + tiers[Math.min(1, tiers.length - 1)]}/week.` },
                { q: 'How do tutor plans bill annually?', a: "Annual tutor plans are charged for 12 months upfront at a discount. Student subscriptions are always weekly." },
                { q: "What happens to my tutors' students if I downgrade?", a: "If you downgrade below your current student count, existing students remain active but you can't add new ones until you're within your plan's limit." },
                { q: 'Do tutors get access to student quiz data?', a: "Yes. Tutors on any plan can see their rostered students' readiness scores, struggle maps, and session history — subject to the student consenting to share." },
              ].map(({ q, a }, i) => (
                <FaqItem key={i} q={q} a={a} />
              ))}
            </div>
          </div>
        </section>
      </FadeUp>

      {/* ── CTA ── */}
      <FadeUp>
        <section className="pp-pad" style={{ padding: '60px 32px 100px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(600px, 100%)', height: 300, borderRadius: '50%', background: `radial-gradient(ellipse,rgba(241,190,67,0.1) 0%,transparent 70%)`, filter: 'blur(40px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ fontFamily: FONT_D, fontSize: 'clamp(22px,4vw,44px)', margin: '0 0 18px', color: '#fff', letterSpacing: 1 }}>
              START FREE TODAY.
            </h2>
            <p style={{ fontSize: 16, color: MUTED, marginBottom: 36, lineHeight: 1.75, maxWidth: 400, margin: '0 auto 36px' }}>
              No credit card. No commitment. The algorithm gets to work on your first question.
            </p>
            <button onClick={handleGetStarted} className="pp-shimmer" style={{ padding: '16px 48px', borderRadius: 13, border: 'none', color: NAVYD, fontSize: 16, fontWeight: 900, cursor: 'pointer', fontFamily: FONT_B, boxShadow: `0 10px 36px rgba(241,190,67,0.4)` }}>
              Get started free →
            </button>
            <div style={{ marginTop: 16, fontSize: 13, color: MUTED }}>No credit card · No commitment · Free plan available</div>
          </div>
        </section>
      </FadeUp>

      {/* ── FOOTER ── */}
      <footer className="pp-pad" style={{ borderTop: '1px solid rgba(241,190,67,0.1)', padding: '28px 32px' }}>
        <div className="pp-footer" style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}><span style={{ color: '#f1f5f9' }}>grade</span><span style={{ color: GOLD }}>farm.</span></span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>by Titanium Tutoring</span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Home</button>
            <button onClick={() => navigate('/terms')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Terms</button>
            <button onClick={() => navigate('/privacy')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 12, cursor: 'pointer', fontFamily: FONT_B }}>Privacy</button>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>© 2026 Titanium Tutoring · Adelaide, SA</div>
        </div>
      </footer>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, fontFamily: FONT_B, textAlign: 'left' }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{q}</span>
        <span style={{ fontSize: 18, color: GOLD, fontWeight: 300, flexShrink: 0, transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s', lineHeight: 1 }}>+</span>
      </button>
      <div style={{ maxHeight: open ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, paddingBottom: 18, margin: 0 }}>{a}</p>
      </div>
    </div>
  )
}
