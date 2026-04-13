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
