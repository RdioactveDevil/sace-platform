import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { usePublicSubjects } from '../lib/publicSubjects'
import { SubjectIconByName } from './SubjectIcons'
import { formatSubjectLabel } from '../lib/subjects'
import { getPlatformSettings } from '../lib/db'
import { studentTiers } from '../lib/pricing'

const GOLD   = '#f1be43'
const NAVY   = '#0c1037'
const NAVYD  = '#080d28'
const FONT_D = "'Sifonn Pro', sans-serif"
const FONT_B = "'Plus Jakarta Sans', sans-serif"
const TEXT   = '#f1f5f9'
const MUTED  = '#94a3b8'
const CARD   = 'rgba(255,255,255,0.03)'
const LINE   = 'rgba(255,255,255,0.08)'

const NAV_LINKS = [['how', 'How it works'], ['who', "Who it's for"], ['subjects', 'Subjects'], ['pricing', 'Pricing']]

/* ─── sample question ──────────────────────────────────────────────────── */

// One real-looking question so visitors see what using gradefarm. is like.
function SampleQuestion() {
  const [selected, setSelected] = useState(null)
  const opts    = ['36', '32', '24', '12']
  const correct = 0
  const answered = selected !== null

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 10 }}>Try one · Fractions</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 16 }}>What is ¾ of 48?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {opts.map((opt, i) => {
          let bg = '#f8fafc', border = '#e2e8f0', color = '#334155'
          if (answered && i === correct)       { bg = '#f0fdf4'; border = '#86efac'; color = '#166534' }
          else if (answered && i === selected) { bg = '#fef2f2'; border = '#fca5a5'; color = '#991b1b' }
          else if (answered)                   { color = '#94a3b8' }
          return (
            <button key={i} onClick={() => { if (!answered) setSelected(i) }} disabled={answered}
              style={{ background: bg, border: `1px solid ${border}`, color, padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: answered ? 'default' : 'pointer', fontFamily: FONT_B, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {opt}
              {answered && i === correct && <Check size={16} aria-hidden="true" />}
              {answered && i === selected && i !== correct && <X size={16} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      {answered && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: selected === correct ? '#f0fdf4' : '#f8fafc', borderRadius: 10, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
          <strong>{selected === correct ? 'Correct. ' : 'Not quite. '}</strong>
          A quarter of 48 is 12, so three quarters is 3 × 12 = 36.
          {selected !== correct && ' gradefarm. would give you another fractions question soon to check it has stuck.'}
        </div>
      )}
    </div>
  )
}

/* ─── MobileMenu ───────────────────────────────────────────────────────── */

function MobileMenu({ open, onClose, onNavigate, onSignIn }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
      <div style={{ position: 'fixed', top: 64, left: 0, right: 0, zIndex: 99, background: NAVYD, borderBottom: `1px solid ${LINE}`, padding: '8px 16px 16px', display: 'flex', flexDirection: 'column' }}>
        {NAV_LINKS.map(([id, label]) => (
          <button key={id} onClick={() => onNavigate(id)} style={{ background: 'none', border: 'none', borderBottom: `1px solid ${LINE}`, color: TEXT, fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 4px' }}>
            {label}
          </button>
        ))}
        <button onClick={onSignIn} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 16, fontWeight: 600, fontFamily: FONT_B, textAlign: 'left', cursor: 'pointer', padding: '14px 4px' }}>
          Sign in
        </button>
      </div>
    </>
  )
}

/* ─── building blocks ──────────────────────────────────────────────────── */

function Section({ id, children, maxWidth = 1080 }) {
  return (
    <section id={id} className="lp-section" style={{ padding: '88px 32px', borderTop: `1px solid ${LINE}` }}>
      <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
    </section>
  )
}

function H2({ children }) {
  return <h2 style={{ fontSize: 'clamp(26px,3.2vw,36px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 16px', color: TEXT }}>{children}</h2>
}

function PrimaryButton({ onClick, children, large = false }) {
  return (
    <button onClick={onClick} className="lp-primary" style={{ padding: large ? '15px 30px' : '9px 18px', borderRadius: 10, border: 'none', background: GOLD, color: NAVYD, fontSize: large ? 16 : 14, fontWeight: 800, cursor: 'pointer', fontFamily: FONT_B }}>
      {children}
    </button>
  )
}

function TextLink({ onClick, children }) {
  return (
    <button onClick={onClick} className="lp-link" style={{ background: 'none', border: 'none', padding: 0, color: TEXT, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT_B, textDecoration: 'underline', textUnderlineOffset: 4, textDecorationColor: 'rgba(255,255,255,0.3)' }}>
      {children}
    </button>
  )
}

/* ─── main component ───────────────────────────────────────────────────── */

export default function LandingPage({ onSignIn }) {
  const navigate = useNavigate()
  const subjects = usePublicSubjects()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pricing, setPricing] = useState(null)
  useEffect(() => { getPlatformSettings('pricing').then(setPricing).catch(() => {}) }, [])
  const tiers = studentTiers(pricing?.student_tiers)
  const freeDaily = pricing?.free_daily_questions ?? 20
  const trialDays = Math.max(0, Math.floor(Number(pricing?.student_trial_days ?? 7)) || 0)
  const tutorPrices = (pricing?.tutor_plans ?? []).map(p => Number(p.price)).filter(n => n > 0)
  const tutorFrom = tutorPrices.length ? Math.min(...tutorPrices) : 29

  // Every "get started" goes to Pricing, which has the free plan as well as the paid ones.
  const getStarted = () => navigate('/pricing')
  const scroll = id => {
    if (id === 'pricing') { navigate('/pricing'); return }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
  const handleMobileNav = id => { setMenuOpen(false); scroll(id) }

  return (
    <div style={{ minHeight: '100vh', background: NAVYD, color: TEXT, fontFamily: FONT_B, overflowX: 'hidden' }}>
      <style>{`
        @font-face { font-family:'Sifonn Pro'; src:url('/SIFONN_PRO.otf') format('opentype'); font-display:swap; }
        * { box-sizing:border-box; }
        .lp-primary:hover { filter:brightness(1.06); }
        .lp-nl:hover, .lp-link:hover { color:#fff !important; }
        @media(max-width:900px) {
          .lp-dnav { display:none !important; }
          .lp-hmenu { display:block !important; }
          .lp-hero { flex-direction:column !important; gap:48px !important; }
          .lp-hero-visual { align-self:stretch; display:flex; justify-content:center; }
          .lp-3col { grid-template-columns:1fr !important; }
          .lp-why { grid-template-columns:1fr !important; gap:32px !important; }
        }
        @media(max-width:560px) {
          .lp-nav { padding-left:16px !important; padding-right:16px !important; }
          .lp-section { padding:64px 16px !important; }
          .lp-hero-wrap { padding:104px 16px 64px !important; }
          .lp-tag { display:none !important; }
          .lp-footer { flex-direction:column !important; align-items:flex-start !important; padding-left:16px !important; padding-right:16px !important; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="lp-nav" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,13,40,0.92)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: FONT_D, fontSize: 20, letterSpacing: 1 }}>
            <span style={{ color: '#fff' }}>grade</span><span style={{ color: GOLD }}>farm.</span>
          </span>
          <span className="lp-tag" style={{ fontSize: 11, color: MUTED }}>by Titanium Tutoring</span>
        </div>
        <div className="lp-dnav" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {NAV_LINKS.map(([id, label]) => (
            <button key={id} className="lp-nl" onClick={() => scroll(id)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FONT_B }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onSignIn} className="lp-dnav lp-nl" style={{ background: 'none', border: 'none', color: MUTED, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: FONT_B }}>Sign in</button>
          <span className="lp-dnav"><PrimaryButton onClick={getStarted}>Get started free</PrimaryButton></span>
          <button
            className="lp-hmenu"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{ display: 'none', background: 'none', border: `1px solid ${LINE}`, borderRadius: 8, color: TEXT, fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '6px 10px' }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={handleMobileNav} onSignIn={() => { setMenuOpen(false); onSignIn() }} />

      {/* ── HERO: what it is ── */}
      <section className="lp-hero-wrap" style={{ padding: '144px 32px 104px' }}>
        <div className="lp-hero" style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 72 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: MUTED, fontWeight: 600, marginBottom: 16 }}>For Australian students, primary school to Year 12</div>
            <h1 style={{ fontSize: 'clamp(34px,5vw,54px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 20px', color: '#fff' }}>
              Find out what you don't know. Then fix it.
            </h1>
            <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.65, margin: '0 0 32px', maxWidth: 520 }}>
              gradefarm. is an online study tool. You answer practice questions for your subject, it works out which topics you're weak in, and it keeps you practising those until you've got them. An AI tutor explains anything you get wrong.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <PrimaryButton large onClick={getStarted}>Get started free</PrimaryButton>
              <TextLink onClick={() => scroll('how')}>How it works</TextLink>
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: MUTED }}>Free plan available · No credit card needed</div>
          </div>
          <div className="lp-hero-visual" style={{ flexShrink: 0 }}>
            <SampleQuestion />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS: how it helps ── */}
      <Section id="how">
        <H2>How it works</H2>
        <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: '0 0 40px', maxWidth: 560 }}>Short practice sessions, a few times a week. gradefarm. decides what to give you next.</p>
        <div className="lp-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { title: 'Answer questions', desc: 'Pick your subject and start. Questions follow your syllabus and are set at your level.' },
            { title: 'See your weak spots', desc: 'Every answer is tracked by topic, so you can see what you know and what still needs work.' },
            { title: 'Practise until it sticks', desc: 'Topics you miss keep coming back until you get them right. Stuck? Titan, the built-in AI tutor, walks you through it step by step.' },
          ].map((s, i) => (
            <div key={s.title} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: GOLD, marginBottom: 12 }}>Step {i + 1}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.65 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── WHY: why you need it ── */}
      <Section id="why">
        <div className="lp-why" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start' }}>
          <div>
            <H2>Why it works</H2>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.7, margin: 0 }}>
              Most revision time goes on things you already know. Re-reading notes feels productive, but it doesn't show you what you'd get wrong in a test. gradefarm. does, and puts your time where the marks are.
            </p>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              ['Questions that never run out', "When you've worked through the question bank, new questions are written for your weak topics, and checked before you see them."],
              ['Help the moment you\'re stuck', 'Titan explains a question one step at a time, any time of day, instead of just showing you the answer.'],
              ['Know how ready you are', 'A readiness score shows how prepared you are for the test, and which topic to work on next.'],
            ].map(([title, desc]) => (
              <li key={title} style={{ display: 'flex', gap: 14 }}>
                <Check size={20} color={GOLD} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.6 }}>{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── WHO IT'S FOR ── */}
      <Section id="who">
        <H2>Who it's for</H2>
        <div className="lp-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 32 }}>
          {[
            { title: 'Students', desc: 'Practise any time, watch your weak topics turn into strong ones, and climb the leaderboard as you go.', link: 'Get started free', onClick: getStarted },
            { title: 'Parents', desc: 'Set up an account for your child and get a progress email every Sunday. For younger students, the AI tutor stays off until you approve it.', link: 'Year 6 selective-entry prep', onClick: () => navigate('/year-6') },
            { title: 'Tutors', desc: `Invite your students, set work that marks itself, and see every student's results in one place. Plans from $${tutorFrom}/month.`, link: 'Sign up as a tutor', onClick: () => navigate('/auth/tutor') },
          ].map(c => (
            <div key={c.title} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{c.title}</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, marginBottom: 20, flex: 1 }}>{c.desc}</div>
              <div><TextLink onClick={c.onClick}>{c.link} →</TextLink></div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── SUBJECTS & PRICE ── */}
      <Section id="subjects">
        <H2>Subjects</H2>
        <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: '0 0 28px', maxWidth: 560 }}>
          Written by Titanium Tutoring from the Australian Curriculum, SACE and VCE. New subjects are added all the time.
        </p>
        {subjects === null ? (
          <div style={{ fontSize: 14, color: MUTED }}>Loading subjects…</div>
        ) : subjects.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {subjects.map(s => (
              <div key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, fontSize: 14, fontWeight: 600, color: TEXT }}>
                <SubjectIconByName name={s.name} color={MUTED} size={16} />
                {formatSubjectLabel({ name: s.name, stage: s.level })}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 40, padding: 24, borderRadius: 14, background: CARD, border: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 16, color: TEXT, lineHeight: 1.6 }}>
            <strong>Free</strong> for one subject ({freeDaily} questions a day). <strong>Unlimited</strong> from ${tiers[0]}/week{trialDays > 0 ? `, first ${trialDays} days free` : ''}.
          </div>
          <TextLink onClick={() => navigate('/pricing')}>See pricing →</TextLink>
        </div>
      </Section>

      {/* ── FINAL CTA ── */}
      <Section maxWidth={640}>
        <div style={{ textAlign: 'center' }}>
          <H2>Ready to start?</H2>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.65, margin: '0 0 28px' }}>Your first session takes a few minutes, and it starts working out your weak spots from the first question.</p>
          <PrimaryButton large onClick={getStarted}>Get started free</PrimaryButton>
        </div>
      </Section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={{ borderTop: `1px solid ${LINE}`, padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <span style={{ fontFamily: FONT_D, fontSize: 16, letterSpacing: 1 }}><span style={{ color: TEXT }}>grade</span><span style={{ color: GOLD }}>farm.</span></span>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[['Pricing', '/pricing'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, to]) => (
            <button key={to} className="lp-nl" onClick={() => navigate(to)} style={{ background: 'none', border: 'none', padding: 0, color: MUTED, fontSize: 13, cursor: 'pointer', fontFamily: FONT_B }}>{label}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, color: MUTED }}>© 2026 Titanium Tutoring · Adelaide, SA</div>
      </footer>
    </div>
  )
}
