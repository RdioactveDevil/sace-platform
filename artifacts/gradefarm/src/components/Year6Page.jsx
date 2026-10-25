import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, BookOpen, Timer, TrendingUp, Mail, Repeat, ShieldCheck, MessageCircleOff, UserRound, Lock, Sparkles, Check, ChevronDown } from 'lucide-react'
import { getPlatformSettings } from '../lib/db'
import { studentTiers, planTotal, money } from '../lib/pricing'

// Public page for parents of advanced Year 6 students preparing for selective
// and special-entry high school tests (/year-6). Its sign-up button opens the
// parent sign-up (AuthScreen with { as: 'parent' }).

const GOLD   = '#f1be43'
const GOLDL  = '#f9d87a'
const NAVYD  = '#080d28'
const GREEN  = '#10b981'
const MUTED  = '#94a3b8'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"

const MATHS_TOPICS = [
  'Number, integers and primes',
  'Fractions, decimals and index laws',
  'Percentages and financial maths',
  'Ratio, proportion and rates',
  'Algebra: expressions and equations',
  'Area, circles and Pythagoras',
  'Volume and surface area',
  'Angles, polygons, congruence and similarity',
  'Coordinate geometry and transformations',
  'Statistics, probability and problem solving',
]

const ENGLISH_TOPICS = [
  'Reading comprehension on full passages and poems',
  'Verbal reasoning, as used in selective-entry tests',
  'Grammar and language',
  'Narrative and persuasive writing with instant feedback',
]

const STEPS = [
  { icon: UserRound, title: 'Set up in two minutes', body: "Create the account with your email and add your child's year level. Their first subject is free, with no card needed." },
  { icon: TrendingUp, title: 'Fifteen minutes a day', body: 'Questions start at a comfortable level and climb as your child gets them right. A wrong answer comes back as similar questions until the idea sticks.' },
  { icon: Mail, title: 'A report every Sunday', body: 'How many questions they answered, how many they got right, the days they practised, and the topic to work on next.' },
]

const SAFETY = [
  { icon: Lock, title: 'You confirm first', body: "Set the account up under your own email. If your child signs up on their own, we email you, and for under-15s the AI features stay off until you say yes." },
  { icon: ShieldCheck, title: 'Titan AI stays on schoolwork', body: "It only helps with the subject being studied and never asks for personal details. If your child says something worrying, it tells them to talk to a trusted adult and gives them Kids Helpline's number." },
  { icon: MessageCircleOff, title: 'No ads, no public profiles', body: "Under-15s are left off the all-users leaderboard. Your child can only message a tutor they've joined." },
]

function SampleReport() {
  const rows = [
    ['Questions', '86 (78% right)'],
    ['Days active', '5 of 7'],
    ['Day streak', '4 days'],
    ['Strong at', 'Ratio, proportion and rates'],
    ['Work on', 'Index laws'],
  ]
  return (
    <div className="y6-report" aria-label="Sample weekly progress email">
      <div style={{ background: '#0c1037', padding: '14px 20px', borderRadius: '14px 14px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 900, color: GOLD, fontSize: 17, letterSpacing: '-0.5px' }}>gradefarm.</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sample</span>
      </div>
      <div style={{ background: '#f9f9fb', padding: '20px', borderRadius: '0 0 14px 14px', color: '#0c1037' }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Mia's week on gradefarm</div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#4a5068', lineHeight: 1.55 }}>Mia answered 86 questions on 5 days this week and got 78% right.</p>
        <div style={{ background: '#fff', border: '1px solid #e5e5ea', borderRadius: 8 }}>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', gap: 12, padding: '8px 14px', borderTop: i ? '1px solid #f0f0f4' : 'none', fontSize: 12.5 }}>
              <span style={{ color: '#6b7290', width: 82, flexShrink: 0 }}>{k}</span>
              <span style={{ fontWeight: 700, minWidth: 0 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 0', background: 'none', border: 'none', color: '#f1f5f9', fontFamily: FONT_B, fontSize: 15, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>
        {q}
        <ChevronDown size={18} aria-hidden="true" style={{ flexShrink: 0, color: GOLD, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && <p style={{ margin: '0 0 18px', color: MUTED, fontSize: 14, lineHeight: 1.7 }}>{a}</p>}
    </div>
  )
}

export default function Year6Page({ signedIn = false }) {
  const navigate = useNavigate()
  const [pricing, setPricing] = useState(null)
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  useEffect(() => {
    const prev = document.title
    document.title = 'Year 6 selective-entry prep · gradefarm.'
    return () => { document.title = prev }
  }, [])

  const monthly = studentTiers(pricing?.student_monthly_tiers, 'month')
  const weekly = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20

  const start = () => (signedIn ? navigate('/home') : navigate('/auth', { state: { mode: 'signup', as: 'parent' } }))
  const signIn = () => navigate(signedIn ? '/home' : '/auth')
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  const faqs = [
    { q: 'Which tests is this for?', a: 'Selective and special-entry high school tests that assess mathematical reasoning, reading comprehension, verbal reasoning and writing. Formats differ between schools and states, so check the details of the test your child is sitting. gradefarm builds the skills underneath, and timed practice papers get them used to working against the clock.' },
    { q: 'Is it too hard for Year 6?', a: "It's meant to stretch. The maths goes past the Year 6 curriculum, into index laws, Pythagoras and algebraic equations, because selective tests reward that. Questions adapt: they start easier and get harder as your child gets them right." },
    { q: 'How much time does it take?', a: "Fifteen to twenty minutes on most days works better than one long session at the weekend. The Sunday email shows you how many days they practised." },
    { q: 'What is Titan AI?', a: "An AI tutor, built on Anthropic's Claude, that explains a question your child got wrong one step at a time, with hints and questions rather than just the answer. For under-15s it stays off until a parent or guardian confirms the account." },
    { q: 'Does my child need a tutor?', a: "No, gradefarm works on its own. If you'd like lessons as well, a Titanium Tutoring tutor can link up with your child's account, set work and see their progress." },
    { q: 'Can I cancel?', a: 'Yes, any time, from My Account. You can keep using the free subject after a paid plan ends.' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: '#f1f5f9', fontFamily: FONT_B, overflowX: 'hidden' }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        .y6-wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px; box-sizing: border-box; }
        .y6-btn { padding: 14px 26px; border-radius: 11px; border: none; font-family: ${FONT_B}; font-size: 15px; font-weight: 800; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
        .y6-btn:hover { transform: translateY(-1px); }
        .y6-btn-gold { background: linear-gradient(135deg, ${GOLD}, ${GOLDL}); color: ${NAVYD}; box-shadow: 0 6px 22px rgba(241,190,67,0.32); }
        .y6-btn-ghost { background: rgba(255,255,255,0.05); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.14); }
        .y6-btn:focus-visible, .y6-link:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 3px; }
        .y6-link { background: none; border: none; padding: 0; color: rgba(255,255,255,0.6); font-family: ${FONT_B}; font-size: 13.5px; cursor: pointer; }
        .y6-hero { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 64px; align-items: center; }
        .y6-report { max-width: 360px; width: 100%; margin-left: auto; box-shadow: 0 30px 80px rgba(0,0,0,0.5); border-radius: 14px; }
        .y6-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .y6-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .y6-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 26px; box-sizing: border-box; min-width: 0; }
        .y6-h1 { font-family: ${FONT_D}; font-size: clamp(34px, 5vw, 60px); line-height: 1.04; letter-spacing: 1px; margin: 0 0 22px; color: #fff; }
        .y6-h2 { font-family: ${FONT_D}; font-size: clamp(26px, 3.6vw, 40px); letter-spacing: 1px; margin: 0 0 14px; color: #fff; line-height: 1.1; }
        .y6-eyebrow { font-size: 11.5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: ${GOLD}; margin-bottom: 14px; }
        .y6-sec { padding: 88px 0; }
        @media (max-width: 900px) {
          .y6-hero { grid-template-columns: 1fr; gap: 40px; }
          .y6-report { margin: 0 auto; }
          .y6-grid3 { grid-template-columns: 1fr; }
        }
        @media (max-width: 720px) {
          .y6-wrap { padding: 0 16px; }
          .y6-grid2 { grid-template-columns: 1fr; }
          .y6-sec { padding: 60px 0; }
          .y6-navlinks { display: none !important; }
          .y6-card { padding: 20px; }
          .y6-ctas .y6-btn { flex: 1 1 100%; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(8,13,40,0.94)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(241,190,67,0.1)' }}>
        <div className="y6-wrap" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <button type="button" onClick={() => navigate('/home')} className="y6-link" aria-label="gradefarm home" style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </button>
          <div className="y6-navlinks" style={{ display: 'flex', gap: 26 }}>
            <button type="button" className="y6-link" onClick={() => jump('covered')}>What's covered</button>
            <button type="button" className="y6-link" onClick={() => jump('safety')}>Safety</button>
            <button type="button" className="y6-link" onClick={() => jump('price')}>Pricing</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" className="y6-link" onClick={signIn}>{signedIn ? 'Open app' : 'Sign in'}</button>
            <button type="button" className="y6-btn y6-btn-gold" onClick={start} style={{ padding: '9px 16px', fontSize: 13 }}>Start free</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '72px 0 80px', background: 'radial-gradient(ellipse at 20% 0%, rgba(241,190,67,0.10), transparent 55%)' }}>
        <div className="y6-wrap y6-hero">
          <div>
            <div className="y6-eyebrow">For parents · Year 6 selective-entry prep</div>
            <h1 className="y6-h1">Selective-entry prep that <span style={{ color: GOLD }}>adapts</span> to your child.</h1>
            <p style={{ fontSize: 17, lineHeight: 1.7, color: '#cbd5e1', margin: '0 0 30px', maxWidth: 560 }}>
              Maths and English practice for advanced Year 6 students, pitched above the curriculum at the level selective and special-entry tests reward. gradefarm finds your child's weakest topics, drills them until they stick, and emails you their progress every Sunday.
            </p>
            <div className="y6-ctas" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="y6-btn y6-btn-gold" onClick={start}>Set up your child's account →</button>
              <button type="button" className="y6-btn y6-btn-ghost" onClick={() => jump('covered')}>What's covered</button>
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 22, fontSize: 13, color: MUTED }}>
              {['First subject free', 'No credit card', 'Cancel anytime'].map(x => (
                <span key={x} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={15} color={GREEN} aria-hidden="true" />{x}</span>
              ))}
            </div>
          </div>
          <SampleReport />
        </div>
      </section>

      {/* ── What's covered ── */}
      <section id="covered" className="y6-sec" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="y6-wrap">
          <div className="y6-eyebrow">What's covered</div>
          <h2 className="y6-h2">Two subjects, built for the test.</h2>
          <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.7, maxWidth: 680, margin: '0 0 36px' }}>
            Hundreds of exam-style questions with worked solutions, and fresh ones written on the spot when your child works through the bank.
          </p>
          <div className="y6-grid2">
            {[
              { icon: Calculator, title: 'Year 6 Mathematics', sub: 'Extension level', items: MATHS_TOPICS },
              { icon: BookOpen, title: 'Year 6 English', sub: 'Reading, reasoning and writing', items: ENGLISH_TOPICS },
            ].map(c => (
              <div key={c.title} className="y6-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(241,190,67,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <c.icon size={22} color={GOLD} aria-hidden="true" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{c.title}</div>
                    <div style={{ fontSize: 12.5, color: MUTED }}>{c.sub}</div>
                  </div>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {c.items.map(it => (
                    <li key={it} style={{ display: 'flex', gap: 10, fontSize: 14, color: '#e2e8f0', lineHeight: 1.45 }}>
                      <Check size={16} color={GOLD} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />{it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="y6-grid3" style={{ marginTop: 20 }}>
            {[
              { icon: Timer, title: 'Timed practice papers', body: 'Full papers built from the question bank, against the clock.' },
              { icon: Repeat, title: 'Mistakes come back', body: 'Every wrong answer is followed by similar questions until it clicks.' },
              { icon: Sparkles, title: 'Help when stuck', body: 'Titan AI walks through the question step by step instead of giving the answer away.' },
            ].map(f => (
              <div key={f.title} className="y6-card" style={{ padding: 22 }}>
                <f.icon size={20} color={GOLD} aria-hidden="true" />
                <div style={{ fontWeight: 800, fontSize: 15, margin: '10px 0 6px' }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.6 }}>{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="y6-sec" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="y6-wrap">
          <div className="y6-eyebrow">How it works</div>
          <h2 className="y6-h2" style={{ marginBottom: 36 }}>Short sessions, and you see the progress.</h2>
          <div className="y6-grid3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="y6-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontFamily: FONT_D, color: GOLD, fontSize: 22 }}>{i + 1}</span>
                  <s.icon size={20} color={GOLD} aria-hidden="true" />
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Safety ── */}
      <section id="safety" className="y6-sec" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="y6-wrap">
          <div className="y6-eyebrow">Built for 11-year-olds</div>
          <h2 className="y6-h2">Safe by default.</h2>
          <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.7, maxWidth: 680, margin: '0 0 36px' }}>
            Your child is online on their own, so the guard rails are switched on for them, not left to a setting.
          </p>
          <div className="y6-grid3">
            {SAFETY.map(s => (
              <div key={s.title} className="y6-card">
                <s.icon size={22} color={GREEN} aria-hidden="true" />
                <div style={{ fontWeight: 800, fontSize: 16, margin: '12px 0 8px' }}>{s.title}</div>
                <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 20 }}>
            Read how we handle your child's information in our{' '}
            <button type="button" className="y6-link" onClick={() => navigate('/privacy')} style={{ color: GOLD, fontSize: 13, textDecoration: 'underline' }}>Privacy Policy</button>.
          </p>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="price" className="y6-sec" style={{ background: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="y6-wrap">
          <div className="y6-eyebrow">Pricing</div>
          <h2 className="y6-h2" style={{ marginBottom: 36 }}>Start free. Add the second subject when you're ready.</h2>
          <div className="y6-grid2" style={{ maxWidth: 820 }}>
            <div className="y6-card">
              <div style={{ fontWeight: 800, fontSize: 16 }}>Free</div>
              <div style={{ fontFamily: FONT_D, fontSize: 40, color: '#fff', margin: '10px 0 4px' }}>$0</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginBottom: 18 }}>One subject, no card needed</div>
              {[`${freeDaily} questions a day`, 'Adaptive practice and worked solutions', 'Weekly progress email to you'].map(x => (
                <div key={x} style={{ display: 'flex', gap: 10, fontSize: 14, marginBottom: 9 }}><Check size={16} color={GREEN} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />{x}</div>
              ))}
            </div>
            <div className="y6-card" style={{ borderColor: 'rgba(241,190,67,0.4)', background: 'rgba(241,190,67,0.05)' }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Maths + English</div>
              <div style={{ fontFamily: FONT_D, fontSize: 40, color: GOLD, margin: '10px 0 4px' }}>${money(planTotal(monthly, 2))}<span style={{ fontFamily: FONT_B, fontSize: 15, color: MUTED }}> /month</span></div>
              <div style={{ fontSize: 13.5, color: MUTED, marginBottom: 18 }}>or ${money(planTotal(weekly, 2))} a week · cancel anytime</div>
              {['Unlimited questions in both subjects', 'Unlimited Titan AI help', 'Everything in Free'].map(x => (
                <div key={x} style={{ display: 'flex', gap: 10, fontSize: 14, marginBottom: 9 }}><Check size={16} color={GOLD} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />{x}</div>
              ))}
            </div>
          </div>
          <button type="button" className="y6-link" onClick={() => navigate('/pricing')} style={{ color: GOLD, marginTop: 18, fontWeight: 700 }}>Full pricing →</button>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="y6-sec" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="y6-wrap" style={{ maxWidth: 820 }}>
          <div className="y6-eyebrow">Questions parents ask</div>
          <h2 className="y6-h2" style={{ marginBottom: 20 }}>FAQ</h2>
          {faqs.map(f => <Faq key={f.q} {...f} />)}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="y6-sec" style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'radial-gradient(ellipse at 50% 100%, rgba(241,190,67,0.10), transparent 60%)' }}>
        <div className="y6-wrap" style={{ maxWidth: 720 }}>
          <h2 className="y6-h2">Start with a free subject today.</h2>
          <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.7, margin: '0 0 28px' }}>Two minutes to set up. Your first progress email arrives on Sunday.</p>
          <button type="button" className="y6-btn y6-btn-gold" onClick={start}>Set up your child's account →</button>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '26px 0' }}>
        <div className="y6-wrap" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: 'rgba(255,255,255,0.4)' }}>
          <span>gradefarm. by Titanium Tutoring · Adelaide, South Australia</span>
          <span style={{ display: 'flex', gap: 18 }}>
            <button type="button" className="y6-link" onClick={() => navigate('/terms')} style={{ fontSize: 12.5 }}>Terms</button>
            <button type="button" className="y6-link" onClick={() => navigate('/privacy')} style={{ fontSize: 12.5 }}>Privacy</button>
          </span>
        </div>
      </footer>
    </div>
  )
}
