// Multi-brand (subdomain) support.
//
// gradefarm. ships three exam-domain brands on subdomains, all served by this
// single SPA (one Vercel deploy, the subdomains aliased to it):
//   • selective.gradefarm.com.au — Victorian selective-school entry
//   • vce.gradefarm.com.au        — Victorian Certificate of Education
//   • sace.gradefarm.com.au       — South Australian Certificate of Education
//
// The brand is resolved from the hostname (with a `?brand=` query override and a
// VITE_BRAND build override for local dev / previews). The brand drives the
// document title, the post-login home, and which subjects the Subject Picker
// shows — each brand owns a slice of the shared curricula catalogue via
// `matchSubject(name, level)`.

/** True when a subject/curriculum belongs to the selective-entry catalogue. */
function isSelectiveSubject(name) {
  return /^selective\b/i.test(String(name || '').trim())
}

/** True when a subject/curriculum belongs to the VCE catalogue. */
function isVceSubject(name, level) {
  return /\bvce\b|\bunit\s*\d/i.test(`${name || ''} ${level || ''}`)
}

export const BRANDS = {
  selective: {
    id: 'selective',
    productName: 'Selective Entry',
    logoSuffix: 'selective',
    accent: '#34d399',
    tagline: 'Selective school entry preparation',
    home: '/selective',
    matchSubject: (name) => isSelectiveSubject(name),
  },
  vce: {
    id: 'vce',
    productName: 'VCE',
    logoSuffix: 'vce',
    accent: '#60a5fa',
    tagline: 'Victorian Certificate of Education',
    home: '/question-bank',
    matchSubject: (name, level) => isVceSubject(name, level),
  },
  sace: {
    id: 'sace',
    productName: 'SACE',
    logoSuffix: 'sace',
    accent: '#f1be43',
    tagline: 'South Australian Certificate of Education',
    home: '/question-bank',
    // SACE owns everything that isn't explicitly selective or VCE.
    matchSubject: (name, level) => !isSelectiveSubject(name) && !isVceSubject(name, level),
  },
  // Apex / unknown host (e.g. gradefarm.com.au or a *.vercel.app preview) shows
  // the full catalogue and the default gold branding.
  default: {
    id: 'default',
    productName: '',
    logoSuffix: '',
    accent: '#f1be43',
    tagline: 'Adaptive exam preparation',
    home: '/question-bank',
    matchSubject: () => true,
  },
}

/** Resolve a brand id from a hostname (e.g. "selective.gradefarm.com.au"). */
export function brandIdFromHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  const sub = host.split('.')[0]
  if (BRANDS[sub] && sub !== 'default') return sub
  return 'default'
}

/** Resolve the active brand id (query override → env override → hostname). */
export function resolveBrandId() {
  // 1. Explicit ?brand= override (handy for local testing / previews).
  try {
    if (typeof window !== 'undefined' && window.location) {
      const q = new URLSearchParams(window.location.search).get('brand')
      if (q && BRANDS[q]) return q
    }
  } catch (_) { /* ignore */ }
  // 2. Build-time override.
  try {
    const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
    if (env.VITE_BRAND && BRANDS[env.VITE_BRAND]) return env.VITE_BRAND
  } catch (_) { /* ignore */ }
  // 3. Hostname.
  if (typeof window !== 'undefined' && window.location) {
    return brandIdFromHostname(window.location.hostname)
  }
  return 'default'
}

/** The active brand config for this load. */
export function getBrand() {
  return BRANDS[resolveBrandId()] || BRANDS.default
}

/** Full document title for a brand, e.g. "gradefarm. selective". */
export function brandTitle(brand) {
  return brand.logoSuffix ? `gradefarm. ${brand.logoSuffix}` : 'gradefarm.'
}
