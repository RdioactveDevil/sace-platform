// Multi-version (subdomain) platform registry.
//
// GradeFarm is one SPA + one engine (quiz, adaptive selection, remediation, AI
// bank top-up, writing) that ships as several **versions**, each a self-contained
// exam-domain product with its own built-in subjects:
//
//   selective.gradefarm.com.au — Victorian selective-school entry  (built-in subjects)
//   sace.gradefarm.com.au      — South Australian Certificate of Education
//   vce.gradefarm.com.au       — Victorian Certificate of Education
//   ucat.gradefarm.com.au      — UCAT (coming soon)
//   gamsat.gradefarm.com.au    — GAMSAT (coming soon)
//
// Built-in subjects are FIRST CLASS here: each version declares the subjects it
// ships (`subjects: [{ name, level }]`). Subject ownership — "which version does
// this curriculum belong to" — is derived from those declarations, so adding a
// new version (e.g. UCAT) is a registry entry + a seed migration and nothing
// else changes. `claimsRemainder` marks the catalogue version that owns any
// curriculum no other version claims; `match` lets a version auto-claim
// admin-created curricula by naming convention before they're listed explicitly.
//
// The active version is resolved from the hostname (with `?brand=<id>` and
// `VITE_BRAND` overrides for local/preview testing) and drives the document
// title, post-login home, sidebar logo suffix and the Subject Picker catalogue.

import { selectiveBuiltInSubjects } from './selectiveEntry.js'
import { vceBuiltInSubjects } from './vce.js'

/**
 * The version registry. Order matters only for the apex/default fallback.
 * Each version: { id, productName, logoSuffix, accent, tagline, home,
 *   subjects: [{ name, level }], match?: RegExp, claimsRemainder?: bool,
 *   comingSoon?: bool, ownsAll?: bool }
 */
export const VERSIONS = {
  selective: {
    id: 'selective',
    productName: 'Selective Entry',
    logoSuffix: 'selective',
    accent: '#34d399',
    tagline: 'Selective school entry preparation',
    home: '/selective',
    subjects: selectiveBuiltInSubjects(),
    landing: {
      eyebrow: 'Victorian Selective Entry',
      headline: 'Win a place at a selective school.',
      subhead: 'Adaptive practice for the Year 9 selective-entry exam — Reading, Verbal Reasoning, Numerical Reasoning, Mathematics and Written Expression, with AI feedback and a full timed mock.',
      primaryCta: 'Start practising free',
      bullets: [
        'Adaptive engine that targets exactly where you lose marks',
        'AI feedback on creative & persuasive writing tasks',
        'Full timed mock exam with indicative scoring',
      ],
    },
  },
  sace: {
    id: 'sace',
    productName: 'SACE',
    logoSuffix: 'sace',
    accent: '#f1be43',
    tagline: 'South Australian Certificate of Education',
    home: '/question-bank',
    subjects: [],
    // SACE owns only SACE curricula — Stage 1 / Stage 2 (by name or level_label),
    // or an explicit "SACE" tag. Unrelated subjects appear only on the apex
    // full catalogue, never on sace.
    match: /\bsace\b|\bstage\s*[12]\b/i,
    landing: {
      eyebrow: 'South Australian Certificate of Education',
      headline: 'Top your SACE.',
      subhead: 'Adaptive Stage 1 & Stage 2 practice that learns where you struggle and drills it — with AI tutoring, exam-mode papers and instant feedback.',
      primaryCta: 'Start studying free',
      bullets: [
        'Stage 1 & Stage 2 question banks that adapt to you',
        'Titan AI tutor explains every question',
        'Exam-mode papers that mirror the real thing',
      ],
    },
  },
  vce: {
    id: 'vce',
    productName: 'VCE',
    logoSuffix: 'vce',
    accent: '#60a5fa',
    tagline: 'Victorian Certificate of Education',
    home: '/question-bank',
    subjects: vceBuiltInSubjects(),
    // Also auto-claim any further admin-created VCE curricula by naming convention.
    match: /\bvce\b|\bunit\s*\d/i,
    landing: {
      eyebrow: 'Victorian Certificate of Education',
      headline: 'Master your VCE.',
      subhead: 'Adaptive Units 3 & 4 practice across Chemistry, Physics, Biology and Mathematical Methods, with an AI tutor, exam-mode papers and feedback that targets your study score.',
      primaryCta: 'Start studying free',
      bullets: [
        'Units 3 & 4 adaptive question banks',
        'Titan AI tutor on every concept',
        'Exam-mode practice papers',
      ],
    },
  },
  ucat: {
    id: 'ucat',
    productName: 'UCAT',
    logoSuffix: 'ucat',
    accent: '#f472b6',
    tagline: 'University Clinical Aptitude Test',
    home: '/question-bank',
    subjects: [], // shell — coming soon
    comingSoon: true,
    landing: {
      eyebrow: 'University Clinical Aptitude Test',
      headline: 'Ace the UCAT.',
      subhead: 'Adaptive drills across Verbal Reasoning, Decision Making, Quantitative Reasoning and Abstract Reasoning — timed, scored and tuned to your weak spots.',
      primaryCta: 'Join the waitlist',
      comingSoon: true,
      bullets: [
        'All five UCAT subtests, timed and adaptive',
        'Score analytics that pinpoint where to drill',
        'AI explanations for every question',
      ],
    },
  },
  gamsat: {
    id: 'gamsat',
    productName: 'GAMSAT',
    logoSuffix: 'gamsat',
    accent: '#22d3ee',
    tagline: 'Graduate Medical School Admissions Test',
    home: '/question-bank',
    subjects: [], // shell — coming soon
    comingSoon: true,
    landing: {
      eyebrow: 'Graduate Medical School Admissions Test',
      headline: 'Conquer the GAMSAT.',
      subhead: 'Adaptive practice across Section I (Humanities), Section II (Written Communication) and Section III (Sciences) — with AI feedback and full-length timed sittings.',
      primaryCta: 'Join the waitlist',
      comingSoon: true,
      bullets: [
        'All three sections with adaptive science drills',
        'AI feedback on Section II essays',
        'Full-length timed practice sittings',
      ],
    },
  },
  // Apex / unknown host (gradefarm.com.au, *.vercel.app previews): full catalogue,
  // default gold branding.
  default: {
    id: 'default',
    productName: '',
    logoSuffix: '',
    accent: '#f1be43',
    tagline: 'Adaptive exam preparation',
    home: '/question-bank',
    subjects: [],
    ownsAll: true,
  },
}

const REAL_VERSIONS = Object.values(VERSIONS).filter((v) => v.id !== 'default')

/**
 * Which version owns a given subject/curriculum. Resolution order:
 *   1. a version that declares it as a built-in subject (exact name)
 *   2. a version whose `match` pattern claims it (naming convention)
 *   3. the `claimsRemainder` catalogue version (SACE)
 */
export function subjectOwnerId(name, level) {
  const n = String(name || '').trim()
  for (const v of REAL_VERSIONS) {
    if (v.subjects?.some((s) => s.name === n)) return v.id
  }
  const hay = `${name || ''} ${level || ''}`
  for (const v of REAL_VERSIONS) {
    if (v.match && v.match.test(hay)) return v.id
  }
  const remainder = REAL_VERSIONS.find((v) => v.claimsRemainder)
  return remainder ? remainder.id : 'default'
}

// Derive each version's catalogue predicate from the registry. The default
// (apex) version shows the full catalogue.
for (const v of Object.values(VERSIONS)) {
  v.matchSubject = v.ownsAll
    ? () => true
    : (name, level) => subjectOwnerId(name, level) === v.id
}

// Back-compat alias — earlier code imports `BRANDS`.
export const BRANDS = VERSIONS

/** Resolve a version id from a hostname (e.g. "selective.gradefarm.com.au"). */
export function brandIdFromHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  const sub = host.split('.')[0]
  if (VERSIONS[sub] && sub !== 'default') return sub
  return 'default'
}

/** Resolve the active version id (query override → env override → hostname). */
export function resolveBrandId() {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const q = new URLSearchParams(window.location.search).get('brand')
      if (q && VERSIONS[q]) return q
    }
  } catch (_) { /* ignore */ }
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
    if (env.VITE_BRAND && VERSIONS[env.VITE_BRAND]) return env.VITE_BRAND
  } catch (_) { /* ignore */ }
  if (typeof window !== 'undefined' && window.location) {
    return brandIdFromHostname(window.location.hostname)
  }
  return 'default'
}

/** The active version config for this load. */
export function getBrand() {
  return VERSIONS[resolveBrandId()] || VERSIONS.default
}

/** Full document title for a version, e.g. "gradefarm. selective". */
export function brandTitle(brand) {
  return brand.logoSuffix ? `gradefarm. ${brand.logoSuffix}` : 'gradefarm.'
}
