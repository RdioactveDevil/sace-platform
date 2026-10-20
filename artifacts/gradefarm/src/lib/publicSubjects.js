import { useEffect, useState } from 'react'

/**
 * Live subjects for signed-out pages (landing, pricing), from
 * GET /api/public-subjects. `subjects` is null while loading and [] if the
 * request fails, so callers can fall back to generic copy.
 * @returns {{ name: string, level: string }[] | null}
 */
export function usePublicSubjects() {
  const [subjects, setSubjects] = useState(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/public-subjects')
      .then(res => (res.ok ? res.json() : { subjects: [] }))
      .then(data => { if (!cancelled) setSubjects(Array.isArray(data?.subjects) ? data.subjects : []) })
      .catch(() => { if (!cancelled) setSubjects([]) })
    return () => { cancelled = true }
  }, [])
  return subjects
}
