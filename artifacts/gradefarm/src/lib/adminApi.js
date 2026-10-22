import { supabase } from './supabase'

/** 50 MB — must match the admin-uploads bucket cap. */
const MAX_DOC_BYTES = 50 * 1024 * 1024

/**
 * Turn a curriculum document the admin picked into request fields for
 * /api/admin/curriculum-plan and /curriculum-revise. A PDF goes to the
 * admin-uploads bucket and only its path is sent (the API downloads it and
 * deletes it), because a PDF inlined as base64 overflows Vercel's 4.5 MB
 * request-body limit. A .txt file is small, so its text is sent directly.
 *
 * @returns {Promise<{ docStoragePath: string } | { sourceText: string }>}
 */
export async function prepareCurriculumDoc(file) {
  const isText = file.type === 'text/plain' || /\.txt$/i.test(file.name)
  if (isText) return { sourceText: await file.text() }
  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`PDF too large (${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB). Max 50 MB.`)
  }
  const docStoragePath = `curriculum-docs/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error } = await supabase.storage
    .from('admin-uploads')
    .upload(docStoragePath, file, { contentType: 'application/pdf', upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  return { docStoragePath }
}

/**
 * POST to same-origin /api/* routes with JSON body.
 * Parses JSON safely — Vercel SPA rewrites and some errors return HTML, which breaks res.json().
 */
export async function adminApiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const t = text.trimStart()
    if (t.startsWith('<') || t.toLowerCase().startsWith('<!doctype')) {
      throw new Error(
        'The server returned a web page instead of data (often a routing or deploy issue). If you are the developer, check that /api/* is not rewritten to index.html in vercel.json.'
      )
    }
    throw new Error(
      text.trim()
        ? `Invalid response (${res.status}): ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}`
        : `Empty response (${res.status})`
    )
  }
  if (!res.ok) {
    throw new Error(data.error || data.detail || `Request failed (${res.status})`)
  }
  return data
}
