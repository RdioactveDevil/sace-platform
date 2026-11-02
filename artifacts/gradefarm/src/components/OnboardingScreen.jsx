import { useState } from 'react'
import { completeOnboarding, saveParentDetails } from '../lib/db'
import { needsParentConsent } from '../lib/parentConsent'
import { THEMES } from '../lib/theme'
import { AuthLayout, Field, Note, authBtn, linkStyle, choiceChip } from './AuthLayout'
import CalmBackground from './CalmBackground'

const YEAR_LEVELS = [6, 7, 8, 9, 10, 11, 12]

const ATAR_TARGETS = [70, 80, 90, 95, 99.5]

const STUDY_HOURS = [1, 2, 3, 5, 7, 10]

/** ATAR targets only mean something from Year 11. */
const SHOWS_ATAR = (year) => !year || year >= 11

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Setting up a new account, one question per screen: year level, date of
 * birth, a parent's email if they're under 15, school, and what they're
 * aiming for (with the terms). Name and email come from sign-up.
 *
 * `suggestedYearLevel`: from the subjects their tutor included, pre-selected until they pick one.
 * `asParent`: they signed up as a parent setting the account up for their child
 * (`parentName` is theirs); they can still switch on the first step.
 */
export default function OnboardingScreen({ profile, userEmail, onDone, suggestedYearLevel = null, asParent = false, parentName: initialParentName = '', theme = 'dark', onToggleTheme }) {
  const t = THEMES[theme]
  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')

  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [dob, setDob]                 = useState('')
  const [school, setSchool]           = useState(profile.school || '')
  // Until they choose, the year their tutor's subjects suggest (those can
  // arrive just after this mounts, as the invite is accepted in the background).
  const [chosenYear, setYearLevel]    = useState(null)
  const yearLevel = chosenYear ?? (YEAR_LEVELS.includes(suggestedYearLevel) ? suggestedYearLevel : null)
  const [atarTarget, setAtarTarget]   = useState(null)
  const [goals, setGoals]             = useState('')
  const [studyHours, setStudyHours]   = useState(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  // Who's setting the account up. A parent signs in with their own email; a
  // student under 15 gives a parent's email, and that parent confirms by email
  // before the AI features switch on (lib/parentConsent.js).
  const [holder, setHolder]           = useState(asParent ? 'parent' : 'student')
  const isParent = holder === 'parent'
  const [parentName, setParentName]   = useState(initialParentName || '')
  const [parentEmail, setParentEmail] = useState('')
  const young = needsParentConsent(dob, yearLevel)
  const askParentEmail = !isParent && young
  const parentEmailClean = parentEmail.trim().toLowerCase()
  const parentEmailError = !askParentEmail || !parentEmailClean ? ''
    : !EMAIL_RE.test(parentEmailClean) ? 'Enter a valid email address.'
    : parentEmailClean === (userEmail || '').trim().toLowerCase()
      ? "That's the email you sign in with. Use your parent or guardian's email."
      : ''
  const firstName = displayName.trim().split(' ')[0]
  const child = firstName || 'your child'

  // Sign-up asks for names, so the name screen only shows when one is missing.
  const [askNames] = useState(() => !(profile.display_name || '').trim() || !(initialParentName || '').trim())
  const screens = [
    askNames && (!(profile.display_name || '').trim() || isParent) && 'name',
    'year', 'dob', askParentEmail && 'parent', 'school', 'goal',
  ].filter(Boolean)
  // Subjects are chosen (and paid for) on the subject picker after onboarding.
  const [screen, setScreen] = useState(screens[0])
  const at = Math.max(0, screens.indexOf(screen))
  const next = () => setScreen(screens[Math.min(at + 1, screens.length - 1)])
  const back = () => setScreen(screens[Math.max(at - 1, 0)])

  const finish = async () => {
    setSaving(true)
    setSaveError('')
    try {
      // Parent details first: if they don't save, nothing is half set up.
      let parent = {}
      try {
        if (isParent) {
          ({ parent } = await saveParentDetails({ accountHolder: 'parent', parentName: parentName.trim() }))
        } else if (askParentEmail) {
          ({ parent } = await saveParentDetails({ parentEmail: parentEmailClean, parentName: parentName.trim() }))
        }
      } catch (e) {
        // The API's message says what to fix (e.g. a parent email that's their own).
        e.shown = true
        throw e
      }
      const profileUpdates = {}
      if (displayName.trim()) profileUpdates.display_name = displayName.trim()
      if (dob)                profileUpdates.dob = dob
      if (school.trim())      profileUpdates.school = school.trim()
      if (yearLevel)          profileUpdates.year_level = yearLevel
      if (atarTarget && SHOWS_ATAR(yearLevel)) profileUpdates.atar_target = atarTarget
      if (goals.trim())       profileUpdates.goals = goals.trim()
      if (studyHours)         profileUpdates.study_hours_per_week = studyHours
      await completeOnboarding(profile.id, profileUpdates)
      setSaving(false)
      onDone({ ...profileUpdates, ...parent })
    } catch (e) {
      // Carrying on would send them back through onboarding on their next
      // visit with everything they entered lost, so stay here and say so.
      console.error('Onboarding save error:', e)
      setSaveError(e?.shown && e.message && !/fetch/i.test(e.message) ? e.message : "We couldn't save your details. Check your connection and try again.")
      setSaving(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const dobValid = !!dob && dob <= today && dob >= '1920-01-01'
  const valid = {
    name: !!displayName.trim() && (!isParent || !!parentName.trim()),
    year: !!yearLevel,
    dob: dobValid,
    parent: !!parentEmailClean && !parentEmailError,
    school: true,
    goal: termsAccepted && !saving,
  }[screen]
  const isLast = at === screens.length - 1
  const advance = () => { if (!valid) return; if (isLast) finish(); else next() }

  const you = (student, parent) => (isParent ? parent : student)
  const H = ({ children }) => <h1 style={{ margin: 0, fontSize: 'clamp(24px, 5vw, 30px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2, color: t.text, textWrap: 'balance' }}>{children}</h1>
  const Sub = ({ children }) => <p style={{ margin: 0, fontSize: 14.5, color: t.textMuted, lineHeight: 1.6, maxWidth: '46ch' }}>{children}</p>
  const bigInput = { fontSize: 17, padding: '13px 15px', borderRadius: 11, maxWidth: 380 }

  const switchHolder = (
    <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>
      {isParent ? 'Are you the student? ' : 'Setting this up for your child? '}
      <button type="button" className="af-link" onClick={() => setHolder(isParent ? 'student' : 'parent')} style={linkStyle(t)}>
        {isParent ? 'Switch to a student account' : 'Switch to a parent account'}
      </button>
    </p>
  )

  const body = {
    name: (
      <>
        <H>{you("What's your name?", "What's your child's name?")}</H>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
          <Field id="onb-name" label={you('Your name', "Your child's name")} theme={theme}>
            <input id="onb-name" className="af-inp" style={bigInput} value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete={isParent ? 'off' : 'name'} autoFocus />
          </Field>
          {isParent && (
            <Field id="onb-pname" label="Your name" theme={theme}>
              <input id="onb-pname" className="af-inp" style={bigInput} value={parentName} onChange={e => setParentName(e.target.value)} autoComplete="name" />
            </Field>
          )}
        </div>
        {switchHolder}
      </>
    ),
    year: (
      <>
        <H>{you(`What year are you in${firstName ? `, ${firstName}` : ''}?`, `What year is ${child} in?`)}</H>
        <Sub>{you("We'll start you on questions for that year.", "We'll start them on questions for that year.")}</Sub>
        <div role="radiogroup" aria-label="Year level" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {YEAR_LEVELS.map(y => (
            <button key={y} type="button" role="radio" aria-checked={yearLevel === y} className="af-chip"
              onClick={() => { setYearLevel(y); setTimeout(next, 160) }}
              aria-label={`Year ${y}`} style={{ ...choiceChip(t, yearLevel === y, 'lg'), minWidth: 58 }}>
              {y}
            </button>
          ))}
        </div>
        {!screens.includes('name') && switchHolder}
      </>
    ),
    dob: (
      <>
        <H>{you("When's your birthday?", `When's ${child}'s birthday?`)}</H>
        {!isParent && <Sub>Under 15? We'll ask a parent or guardian to OK Titan AI. Practice questions work straight away.</Sub>}
        <Field id="onb-dob" label="Date of birth" theme={theme}>
          <input id="onb-dob" className="af-inp" style={bigInput} type="date" value={dob} onChange={e => setDob(e.target.value)} max={today} min="1920-01-01" autoFocus />
        </Field>
      </>
    ),
    parent: (
      <>
        <H>Your parent or guardian's email</H>
        <Sub>Because you're under 15, we'll email them to OK your account. Practice questions work straight away. Titan AI switches on when they say yes.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 380 }}>
          <Field id="onb-pemail" label="Their email" error={parentEmailError} theme={theme}>
            <input id="onb-pemail" className="af-inp" style={bigInput} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={parentEmail} onChange={e => setParentEmail(e.target.value)}
              aria-invalid={!!parentEmailError || undefined} aria-describedby={parentEmailError ? 'onb-pemail-err' : undefined} autoFocus />
          </Field>
          <Field id="onb-pname2" label="Their name" optional theme={theme}>
            <input id="onb-pname2" className="af-inp" style={bigInput} value={parentName} onChange={e => setParentName(e.target.value)} />
          </Field>
        </div>
      </>
    ),
    school: (
      <>
        <H>{you('Which school do you go to?', `Which school does ${child} go to?`)}</H>
        <Sub>Optional.</Sub>
        <Field id="onb-school" label="School" theme={theme}>
          <input id="onb-school" className="af-inp" style={bigInput} value={school} onChange={e => setSchool(e.target.value)} autoComplete="organization" autoFocus />
        </Field>
      </>
    ),
    goal: (
      <>
        <H>{you('What are you aiming for?', `What is ${child} aiming for?`)}</H>
        <Sub>Optional. You can change these later in Account.</Sub>
        {SHOWS_ATAR(yearLevel) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="onb-atar" style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>ATAR target</span>
            <div role="radiogroup" aria-labelledby="onb-atar" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ATAR_TARGETS.map(v => (
                <button key={v} type="button" role="radio" aria-checked={atarTarget === v} className="af-chip" onClick={() => setAtarTarget(atarTarget === v ? null : v)} style={choiceChip(t, atarTarget === v)}>{v}+</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="onb-hours" style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>Hours a week {you('you can', 'they can')} study</span>
          <div role="radiogroup" aria-labelledby="onb-hours" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STUDY_HOURS.map(h => (
              <button key={h} type="button" role="radio" aria-checked={studyHours === h} className="af-chip" onClick={() => setStudyHours(studyHours === h ? null : h)} style={{ ...choiceChip(t, studyHours === h), minWidth: 44 }}>{h}</button>
            ))}
          </div>
        </div>
        <Field id="onb-goals" label="Anything else?" optional theme={theme}>
          <textarea id="onb-goals" className="af-inp" rows={2} value={goals} onChange={e => setGoals(e.target.value)} style={{ resize: 'vertical', maxWidth: 480, lineHeight: 1.5 }}
            placeholder={SHOWS_ATAR(yearLevel) ? 'e.g. Get faster at organic chemistry' : isParent ? 'e.g. Preparing for a selective-entry test' : 'e.g. Get faster at problem solving'} />
        </Field>
        <label htmlFor="onb-terms" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: t.textSub, lineHeight: 1.55, maxWidth: 520, cursor: 'pointer' }}>
          <input id="onb-terms" type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2, accentColor: t.text, flexShrink: 0, cursor: 'pointer' }} />
          <span>
            I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="af-link" style={linkStyle(t)}>terms</a> and <a href="/privacy" target="_blank" rel="noreferrer" className="af-link" style={linkStyle(t)}>privacy policy</a>
            {isParent
              ? ` on behalf of ${child}, and I'm their parent or guardian. I'll get a weekly email about their progress.`
              : askParentEmail
                ? ". We'll also email my parent or guardian to ask for their OK."
                : ". I'm 18 or older, or my parent or guardian agrees to them too."}
          </span>
        </label>
        {saveError && <Note tone="danger" theme={theme}>{saveError}</Note>}
      </>
    ),
  }[screen]

  const optionalScreen = screen === 'school'
  return (
    <AuthLayout theme={theme} backdrop={<CalmBackground theme={theme} />} onToggleTheme={onToggleTheme} align="top"
      center={(
        <div role="progressbar" aria-label="Setting up your account" aria-valuemin={1} aria-valuemax={screens.length} aria-valuenow={at + 1} style={{ display: 'flex', gap: 5 }}>
          {screens.map((s, i) => <span key={s} style={{ width: 22, height: 3, borderRadius: 3, background: i <= at ? t.text : t.border }} />)}
        </div>
      )}>
      <form key={screen} className="af-in" noValidate onSubmit={e => { e.preventDefault(); advance() }}
        style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 18, padding: 'clamp(16px, 12vh, 120px) 0 0' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.textFaint }}>Question {at + 1} of {screens.length}</span>
        {body}
        {screen !== 'year' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button type="submit" className="af-btn" disabled={!valid} style={authBtn(t, 'primary', { disabled: !valid })}>
              {isLast ? (saving ? 'Setting up…' : 'Start') : 'Next'}
            </button>
            {optionalScreen && !school.trim() && <button type="button" className="af-btn" onClick={next} style={authBtn(t, 'secondary')}>Skip</button>}
            {at > 0 && <button type="button" className="af-link" onClick={back} style={{ ...linkStyle(t), fontSize: 13.5, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted, marginLeft: 6 }}>Back</button>}
            {!isLast && <span style={{ fontSize: 12.5, color: t.textFaint, marginLeft: 4 }} className="onb-kbd">or press Enter</span>}
          </div>
        )}
        {screen === 'year' && at > 0 && (
          <div><button type="button" className="af-link" onClick={back} style={{ ...linkStyle(t), fontSize: 13.5, fontWeight: 600, textDecorationColor: t.border, color: t.textMuted }}>Back</button></div>
        )}
      </form>
      <style>{'@media (max-width: 600px) { .onb-kbd { display: none } }'}</style>
    </AuthLayout>
  )
}
