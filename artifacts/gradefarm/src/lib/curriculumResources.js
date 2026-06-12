import { adminApiPost } from './adminApi'
import { supabase } from './supabase'

/** 50 MB — must match the curriculum-resources bucket cap. */
export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024

/** Parse a same-origin /api/* response safely (SPA rewrites can return HTML). */
async function parseJson(res) {
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(
      text.trim()
        ? `Invalid response (${res.status}): ${text.slice(0, 160)}`
        : `Empty response (${res.status})`
    )
  }
  if (!res.ok) throw new Error(data.error || data.detail || `Request failed (${res.status})`)
  return data
}

/** List the reference resources distilled for a curriculum. */
export async function listCurriculumResources(curriculumId) {
  const res = await fetch(`/api/curriculum-resources?curriculumId=${encodeURIComponent(curriculumId)}`)
  const data = await parseJson(res)
  return data.resources || []
}

/**
 * Upload a PDF to the curriculum-resources bucket, then ask the API to distill
 * per-subtopic exemplar packs from it. Resolves once processing completes.
 */
export async function uploadCurriculumResource(curriculumId, file, { title, resourceType } = {}) {
  if (file.size > MAX_RESOURCE_BYTES) {
    throw new Error(`PDF too large (${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB). Max 50 MB.`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${curriculumId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage
    .from('curriculum-resources')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

  return adminApiPost('/api/curriculum-resources', {
    curriculumId,
    storagePath,
    filename: file.name,
    fileSize: file.size,
    mimeType: 'application/pdf',
    title: title || file.name,
    resourceType: resourceType || 'resource',
  })
}

/** Delete a resource and all exemplar packs distilled from it. */
export async function deleteCurriculumResource(id) {
  const res = await fetch(`/api/curriculum-resources/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseJson(res)
}
