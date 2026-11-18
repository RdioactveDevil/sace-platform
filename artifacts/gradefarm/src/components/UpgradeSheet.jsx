import { useEffect, useRef, useState } from 'react'
import { getBillingConfig, startUpgradeCheckout, syncCheckout, addPaidSubject } from '../lib/db'
import { upgradeQuote, payLabel, compareRows, dollars } from '../lib/upgrade'
import { subjectHasFeature, formatSubjectLabel } from '../lib/subjects'

const FONT_B = "'Plus Jakarta Sans', sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const HAND = "'Caveat', 'Segoe Print', 'Comic Sans MS', cursive"
// The receipt is paper: the same colours in every theme.
const INK = '#2a2118'
const PAPER = '#fffefa'
const MUTED = '#6f6455'
const PEN = '#c2362d'

// The price, loaded before the pop-up opens (App calls prefetchUpgrade for a
// free subject), so it opens with the right offer instead of swapping in.
let configPromise = null
let configValue = null
let configFor = null // the account it was loaded for
export function prefetchUpgrade(accountId) {
  if (accountId !== undefined && accountId !== configFor) { configFor = accountId; configPromise = null; configValue = null }
  configPromise ??= getBillingConfig()
    .then(c => { configValue = c; return c })
    .catch(err => { configPromise = null; throw err })
  return configPromise
}
/** After upgrading the offer changes (a plan now): load it afresh next time. */
function forgetUpgrade() { configPromise = null; configValue = null }

const SKELETON = { display: 'block', height: 12, borderRadius: 4, background: '#e8dfd0' }

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap');
.us-back { position: fixed; inset: 0; z-index: 60; background: rgba(30,24,19,0.5); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); overflow-y: auto; display: flex; padding: 32px 20px; box-sizing: border-box; font-family: ${FONT_B}; }
/* The tray: a warm card around the receipt, so it stands apart from the app behind. */
.us-row { margin: auto; position: relative; display: flex; align-items: center; justify-content: center; gap: 44px; flex-wrap: wrap; max-width: 1180px; box-sizing: border-box; padding: 52px 68px 44px 52px; background: #efe6d8; border: 1px solid #dccdb6; border-radius: 26px; box-shadow: 0 40px 100px rgba(0,0,0,0.45); }
.us-head { width: 320px; color: ${INK}; display: flex; flex-direction: column; gap: 14px; }
.us-head h2 { margin: 0; font-size: 38px; line-height: 1.08; font-weight: 800; letter-spacing: -0.02em; }
.us-receipt { width: 380px; transform: rotate(1.5deg); filter: drop-shadow(0 16px 24px rgba(60,40,10,0.22)); }
.us-paper { background: ${PAPER}; padding: 24px 26px 18px; font-family: ${MONO}; font-size: 13px; color: ${INK}; display: flex; flex-direction: column; gap: 9px; position: relative; }
.us-line { display: flex; justify-content: space-between; gap: 12px; }
.us-rule { border-top: 1px dashed #bdb1a0; margin: 4px 0 2px; }
.us-btn { height: 50px; border-radius: 10px; border: none; font-family: ${FONT_B}; font-size: 15.5px; font-weight: 800; cursor: pointer; }
.us-slip { width: 470px; background: ${PAPER}; transform: rotate(-1.5deg); box-shadow: 0 16px 30px rgba(60,40,10,0.2); padding: 22px 24px 18px; box-sizing: border-box; color: ${INK}; position: relative; }
.us-slip table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13.5px; }
.us-slip td, .us-slip th { padding: 9px 6px 9px 0; text-align: left; }
.us-slip tbody tr { border-top: 1px dashed #d6c9b4; }
.us-close { position: absolute; right: 16px; top: 16px; width: 40px; height: 40px; border-radius: 50%; border: none; background: #e2d6c3; color: #5e5345; font-size: 22px; cursor: pointer; z-index: 2; }
.us-card { width: min(460px, 100%); background: ${PAPER}; color: ${INK}; border-radius: 22px; box-shadow: 0 30px 80px rgba(0,0,0,0.35); padding: 32px 30px 24px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; margin: auto; }
.us-pay { width: min(520px, 100%); background: #ffffff; color: ${INK}; border-radius: 20px; box-shadow: 0 30px 80px rgba(0,0,0,0.35); padding: 18px 18px 22px; box-sizing: border-box; margin: auto; }
.us-open .us-head { width: 100%; max-width: 900px; text-align: center; align-items: center; }
.us-open .us-head h2 { font-size: 28px; }
@media (max-width: 960px) { .us-head { width: 100%; max-width: 380px; } .us-head h2 { font-size: 30px; } .us-slip { transform: none; width: 100%; max-width: 470px; } }
@media (max-width: 560px) {
  .us-back { padding: 0; align-items: flex-end; }
  .us-row { margin: auto 0 0; width: 100%; gap: 0; padding: 56px 12px 0; border-radius: 20px 20px 0 0; border-bottom: none; }
  .us-head { display: none; }
  .us-receipt { width: 100%; transform: none; filter: none; }
  .us-paper { border-radius: 20px 20px 0 0; padding: 22px 20px 20px; }
  .us-zig { display: none; }
  .us-slip { box-shadow: none; border-top: 1px dashed #d6c9b4; }
  .us-close { top: 10px; right: 10px; }
  .us-pay, .us-card { border-radius: 20px 20px 0 0; margin: auto 0 0; width: 100%; }
}
`

/**
 * The upgrade pop-up, opened where a free student runs out (Practice's daily
 * questions, Titan's messages, the exam builder, Exam Mode) instead of the
 * plan builder. A receipt for the subject they're on: what's included, the
 * $2 first week (or the trial, or the price on their plan), Pay, and "What's
 * the difference from free?" opening a comparison slip. Paying happens in the
 * pop-up (Stripe's embedded Checkout); then "You're in." and `ctx.doneLabel`
 * takes them straight back to what they were doing (`ctx.onDone`).
 *
 * `ctx`: { doneLabel, onDone }. `onUpgraded` refreshes the app's access first.
 */
export default function UpgradeSheet({ subject, curriculumId, ctx = {}, onClose, onUpgraded }) {
  const [config, setConfig] = useState(() => configValue)
  const [step, setStep] = useState('offer') // offer | starting | pay | finishing | done
  const [error, setError] = useState('')
  const [compare, setCompare] = useState(false)
  const [checkout, setCheckout] = useState(null) // { clientSecret, sessionId, publishableKey }
  const mountRef = useRef(null)
  const closeRef = useRef(null)
  const label = formatSubjectLabel(subject)
  const quote = upgradeQuote(config)
  const rows = compareRows({
    freeDaily: config?.freeDailyQuestions || 15,
    examBuilder: subjectHasFeature(subject, 'test_maker'),
    examMode: subjectHasFeature(subject, 'exam_mode'),
  })

  useEffect(() => {
    let alive = true
    prefetchUpgrade().then(c => { if (alive) setConfig(c) }).catch(() => { if (alive) setError("Couldn't load the price. Check your connection and try again.") })
    return () => { alive = false }
  }, [])

  const busy = step === 'starting' || step === 'finishing'
  useEffect(() => {
    closeRef.current?.focus()
  }, [step])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const finish = async (sessionId) => {
    forgetUpgrade()
    setStep('finishing')
    if (sessionId) await syncCheckout(sessionId).catch(() => {})
    await Promise.resolve(onUpgraded?.()).catch(() => {})
    setStep('done')
  }

  // Stripe's embedded Checkout, inside the pop-up.
  useEffect(() => {
    if (step !== 'pay' || !checkout || !mountRef.current) return
    let instance = null
    let alive = true
    import('@stripe/stripe-js')
      .then(({ loadStripe }) => loadStripe(checkout.publishableKey))
      .then(stripe => stripe.createEmbeddedCheckoutPage({ clientSecret: checkout.clientSecret, onComplete: () => finish(checkout.sessionId) }))
      .then(ec => { if (!alive) { ec.destroy(); return } instance = ec; ec.mount(mountRef.current) })
      .catch(() => { if (alive) { setError("Couldn't open payment. Please try again."); setStep('offer') } })
    return () => { alive = false; instance?.destroy() }
  }, [step, checkout]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async () => {
    if (!quote || !curriculumId || busy) return
    setError('')
    setStep('starting')
    try {
      if (quote.mode === 'add') {
        await addPaidSubject(curriculumId, quote.per, { endTrial: quote.trialing })
        await finish(null)
        return
      }
      if (!config?.publishableKey) {
        // Payments in the page aren't set up: Stripe's own Checkout page, as before.
        const { url } = await addPaidSubject(curriculumId, 'week')
        if (url) { window.location.assign(url); return }
        throw new Error('No checkout')
      }
      const res = await startUpgradeCheckout(curriculumId)
      if (res?.added) { await finish(null); return }
      setCheckout({ clientSecret: res.clientSecret, sessionId: res.sessionId, publishableKey: config.publishableKey })
      setStep('pay')
    } catch (e) {
      setError(e?.message && !/^HTTP|fetch/i.test(e.message) ? e.message : "Couldn't start payment. Please try again.")
      setStep('offer')
    }
  }

  const headline = !quote ? `Everything in ${label}.`
    : quote.mode === 'intro' ? 'One week of everything, for less than a coffee.'
    : quote.mode === 'trial' ? `Try everything free for ${quote.days} days.`
    : quote.mode === 'add' ? `Add ${label} to your plan.`
    : `Everything in ${label}.`
  const sub = !quote ? ''
    : quote.mode === 'intro' ? `Then $${dollars(quote.weekly)} a week. Cancel any time.`
    : quote.mode === 'trial' ? `Then $${dollars(quote.weekly)} a week from ${quote.from}. Cancel before then and you won't pay.`
    : quote.mode === 'add' ? `$${dollars(quote.weekly)} a ${quote.per} on your plan.${quote.trialing ? ' Adding it ends your free trial and billing starts today.' : ''}`
    : 'Cancel any time.'
  const today = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Adelaide' }).format(new Date()).replace(',', '').toUpperCase()

  if (step === 'done') {
    return (
      <div className="us-back" role="dialog" aria-modal="true" aria-labelledby="us-done-h">
        <style>{CSS}</style>
        <div className="us-card">
          <svg width="86" height="70" viewBox="0 0 86 70" aria-hidden="true"><path d="M10 38 C 18 44, 26 52, 32 60 C 44 36, 60 18, 78 8" fill="none" stroke={PEN} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <h2 id="us-done-h" style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>You&rsquo;re in.</h2>
          <div style={{ fontSize: 14.5, color: '#4b4033', lineHeight: 1.55 }}>{label} is unlocked: {rows.map(r => r.done).join(', ').replace(/, ([^,]*)$/, ' and $1')}.</div>
          {quote && (
            <div style={{ fontSize: 12.5, color: MUTED }}>
              {quote.mode === 'intro' ? `$${dollars(quote.intro)} paid. $${dollars(quote.weekly)} a week from ${quote.from}. A receipt is on its way.`
                : quote.mode === 'trial' ? `Free until ${quote.from}, then $${dollars(quote.weekly)} a week.`
                : quote.mode === 'add' ? 'Added to your plan.' : 'A receipt is on its way.'}
            </div>
          )}
          <button ref={closeRef} type="button" className="us-btn" onClick={() => { onClose(); ctx.onDone?.() }} style={{ width: '100%', marginTop: 6, background: INK, color: '#f6efe4' }}>
            {ctx.doneLabel || 'Keep going'}
          </button>
          {ctx.onDone && (
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, color: '#5e5345', padding: 8, cursor: 'pointer' }}>I&rsquo;ll look around first</button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'pay' || step === 'finishing') {
    return (
      <div className="us-back" role="dialog" aria-modal="true" aria-labelledby="us-pay-h">
        <style>{CSS}</style>
        <div className="us-pay">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 4px 12px' }}>
            <button ref={closeRef} type="button" onClick={() => { setStep('offer'); setCheckout(null) }} disabled={step === 'finishing'}
              style={{ border: 'none', background: 'none', fontFamily: FONT_B, fontSize: 13.5, fontWeight: 700, color: INK, cursor: 'pointer', padding: 6 }}>&larr; Back</button>
            <h2 id="us-pay-h" style={{ margin: 0, fontSize: 15, fontWeight: 800, fontFamily: FONT_B }}>
              {quote?.mode === 'intro' ? `Pay $${dollars(quote.intro)} for your first week` : quote?.mode === 'trial' ? `Start your ${quote.days}-day free trial` : `${label}`}
            </h2>
            <span style={{ width: 60 }} />
          </div>
          {step === 'finishing'
            ? <div role="status" style={{ padding: '60px 10px', textAlign: 'center', fontFamily: FONT_B, fontSize: 14, color: MUTED }}>Unlocking {label}…</div>
            : <div ref={mountRef} style={{ minHeight: 420 }} />}
        </div>
      </div>
    )
  }

  return (
    <div className="us-back" role="dialog" aria-modal="true" aria-labelledby="us-h" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <style>{CSS}</style>
      <div className={`us-row${compare ? ' us-open' : ''}`}>
        <button ref={closeRef} type="button" className="us-close" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
        <div className="us-head">
          {quote ? (
            <>
              <h2 id="us-h">{headline}</h2>
              {sub && <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.55 }}>{sub}</div>}
            </>
          ) : (
            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span id="us-h" style={{ ...SKELETON, height: 30, width: '90%' }} />
              <span style={{ ...SKELETON, height: 30, width: '70%' }} />
              <span style={{ ...SKELETON, height: 14, width: '55%', marginTop: 6 }} />
            </div>
          )}
        </div>

        <div className="us-receipt">
          <div className="us-paper">
            <div style={{ textAlign: 'center', fontFamily: FONT_B, fontWeight: 800, fontSize: 20, letterSpacing: '0.04em' }}>grade<span style={{ color: '#c98a16' }}>farm.</span></div>
            <div style={{ textAlign: 'center', fontSize: 11.5, color: MUTED }}>{label.toUpperCase()}<br />{today}</div>
            <div className="us-rule" style={{ marginTop: 6 }} />
            {rows.map(r => <div key={r.key} className="us-line"><span>{r.receipt}</span><span>INCL</span></div>)}
            <div className="us-rule" />
            {!quote ? (
              error ? null : (
                <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '2px 0 6px' }}>
                  <span style={{ ...SKELETON, width: '100%' }} />
                  <span style={{ ...SKELETON, width: '80%' }} />
                  <span style={{ ...SKELETON, width: '100%', height: 16 }} />
                </div>
              )
            ) : quote.mode === 'intro' ? (
              <>
                <div className="us-line"><span>WEEK 1</span><span><s style={{ color: '#9c8f7c' }}>{dollars(quote.weekly)}.00</s> {Number(quote.intro).toFixed(2)}</span></div>
                <div className="us-line" style={{ color: MUTED }}><span>FROM {quote.from.toUpperCase()}</span><span>{Number(quote.weekly).toFixed(2)}/WK</span></div>
              </>
            ) : quote.mode === 'trial' ? (
              <>
                <div className="us-line"><span>FIRST {quote.days} DAYS</span><span>FREE</span></div>
                <div className="us-line" style={{ color: MUTED }}><span>FROM {quote.from.toUpperCase()}</span><span>{Number(quote.weekly).toFixed(2)}/WK</span></div>
              </>
            ) : (
              <div className="us-line"><span>{quote.mode === 'add' ? 'ADDED TO YOUR PLAN' : 'EVERY WEEK'}</span><span>{Number(quote.weekly).toFixed(2)}/{quote.per === 'month' ? 'MO' : 'WK'}</span></div>
            )}
            {quote && quote.mode !== 'add' && (
              <div className="us-line" style={{ fontSize: 17, fontWeight: 700, marginTop: 4, alignItems: 'center', position: 'relative' }}>
                <span>TODAY</span>
                <span>${quote.mode === 'intro' ? Number(quote.intro).toFixed(2) : quote.mode === 'trial' ? '0.00' : Number(quote.weekly).toFixed(2)}</span>
                <svg width="110" height="50" viewBox="0 0 110 50" aria-hidden="true" style={{ position: 'absolute', right: -18, top: -13 }}><path d="M14 26 C 8 8, 92 2, 102 22 C 110 42, 30 50, 12 36 C 6 30, 16 18, 30 14" fill="none" stroke={PEN} strokeWidth="2.5" strokeLinecap="round" /></svg>
              </div>
            )}
            {error && <div role="alert" style={{ fontFamily: FONT_B, fontSize: 13, color: PEN, marginTop: 4 }}>{error}</div>}
            <button type="button" className="us-btn" onClick={pay} disabled={!quote || busy} style={{ marginTop: 12, background: INK, color: '#f6efe4', opacity: !quote ? 0.6 : 1 }}>
              {busy || !quote ? 'One moment…' : payLabel(quote)}
            </button>
            <div style={{ textAlign: 'center', fontFamily: FONT_B, fontSize: 12, color: MUTED }}>Card, Apple Pay or Google Pay. Cancel any time.</div>
            <button type="button" onClick={() => setCompare(v => !v)} aria-expanded={compare}
              style={{ alignSelf: 'center', border: 'none', background: 'none', fontFamily: HAND, fontSize: 22, fontWeight: 700, color: PEN, cursor: 'pointer', padding: '2px 6px', transform: 'rotate(-2deg)' }}>
              {compare ? 'Hide the difference' : 'What’s the difference from free?'}
            </button>
          </div>
          <svg className="us-zig" width="100%" height="14" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block' }}><path d="M0 0 H400 V0 L390 14 L380 0 L370 14 L360 0 L350 14 L340 0 L330 14 L320 0 L310 14 L300 0 L290 14 L280 0 L270 14 L260 0 L250 14 L240 0 L230 14 L220 0 L210 14 L200 0 L190 14 L180 0 L170 14 L160 0 L150 14 L140 0 L130 14 L120 0 L110 14 L100 0 L90 14 L80 0 L70 14 L60 0 L50 14 L40 0 L30 14 L20 0 L10 14 L0 0 Z" fill={PAPER} /></svg>
        </div>

        {compare && (
          <section className="us-slip" aria-labelledby="us-cmp-h">
            <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: -12, width: 90, height: 24, transform: 'translateX(-50%) rotate(2deg)', background: 'rgba(243,213,143,0.75)' }} />
            <div style={{ fontFamily: HAND, fontSize: 22, fontWeight: 700, color: PEN, transform: 'rotate(-2deg)', marginBottom: 2 }}>here&rsquo;s what INCL means</div>
            <h3 id="us-cmp-h" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Free vs your {quote?.mode === 'intro' ? `$${dollars(quote.intro)} week` : 'plan'}</h3>
            <table>
              <thead><tr style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8e826f' }}><th scope="col"><span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Feature</span></th><th scope="col">Free</th><th scope="col" style={{ color: INK }}>Unlocked</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <th scope="row" style={{ fontWeight: 700 }}>{r.label}</th>
                    <td style={{ color: '#8e826f' }}>{r.free}</td>
                    <td style={{ fontWeight: 800 }}>{r.paid} <span aria-hidden="true" style={{ fontFamily: HAND, fontSize: 20, color: PEN }}>✓</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}
