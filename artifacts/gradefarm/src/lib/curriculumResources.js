import { adminApiPost } from './adminApi'
import { supabase } from './supabase'

/** 50 MB — must match the curriculum-resources bucket cap. */
export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024

/** The file types reference material can be (the bucket allows these, see migration 20261122000002). */
export const RESOURCE_MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
/** For the file picker's accept attribute. */
export const RESOURCE_ACCEPT = Object.entries(RESOURCE_MIME).flatMap(([ext, mime]) => [mime, `.${ext}`]).join(',')

/** 'pdf', 'docx' or 'pptx' for a file we can read; null otherwise (old .doc/.ppt, images, …). */
export function resourceFileFormat(file) {
  const ext = /\.([a-z0-9]+)$/i.exec(file?.name || '')?.[1]?.toLowerCase()
  if (ext && RESOURCE_MIME[ext]) return ext
  const byType = Object.entries(RESOURCE_MIME).find(([, mime]) => mime === file?.type)
  return byType ? byType[0] : null
}

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
 * Upload a PDF, Word or PowerPoint file to the curriculum-resources bucket, then ask the API to distill
 * per-subtopic exemplar packs from it. Resolves once processing completes.
 *
 * Whole textbooks are split server-side into page-range chunks (long Word and
 * PowerPoint files into parts of their text); this drives one
 * /process-chunk request per chunk (each is a single Claude call, keeping every
 * request under the serverless time limit) and reports progress via onProgress.
 *
 * @param {(processed: number, total: number) => void} [onProgress]
 */
export async function uploadCurriculumResource(curriculumId, file, { title, resourceType, onProgress } = {}) {
  const format = resourceFileFormat(file)
  if (!format) throw new Error('Upload a PDF, Word (.docx) or PowerPoint (.pptx) file.')
  const mimeType = RESOURCE_MIME[format]
  if (file.size > MAX_RESOURCE_BYTES) {
    throw new Error(`File too large (${Math.round((file.size / (1024 * 1024)) * 10) / 10} MB). Max 50 MB.`)
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${curriculumId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage
    .from('curriculum-resources')
    .upload(storagePath, file, { contentType: mimeType, upsert: false })
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

  const res = await adminApiPost('/api/curriculum-resources', {
    curriculumId,
    storagePath,
    filename: file.name,
    fileSize: file.size,
    mimeType,
    title: title || file.name,
    resourceType: resourceType || 'resource',
  })

  // Small document: distilled inline, already done.
  if (res.status === 'ready' || !res.totalChunks || res.totalChunks <= 1) {
    onProgress?.(res.processedChunks ?? 1, res.totalChunks ?? 1)
    return res
  }

  // Large document: drive each remaining chunk to completion.
  const total = res.totalChunks
  let processed = res.processedChunks || 0
  onProgress?.(processed, total)
  let last = res
  for (let i = processed; i < total; i++) {
    last = await adminApiPost(`/api/curriculum-resources/${res.id}/process-chunk`, { chunkIndex: i })
    processed = last.processedChunks ?? i + 1
    onProgress?.(processed, total)
  }
  return last
}

/** Delete a resource and all exemplar packs distilled from it. */
export async function deleteCurriculumResource(id) {
  const res = await fetch(`/api/curriculum-resources/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseJson(res)
}
