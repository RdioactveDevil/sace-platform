// Small, dependency-free CSV helpers. `rowsToCsv` is pure so it can be unit
// tested; `downloadCsv` performs the browser download side-effect.

/** Escape a single CSV cell per RFC 4180 (quote if it contains , " or newline). */
export function escapeCsvValue(value) {
  if (value === null || value === undefined) return ''
  let str
  if (typeof value === 'object') {
    try { str = JSON.stringify(value) } catch { str = String(value) }
  } else {
    str = String(value)
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert an array of row objects to a CSV string.
 * @param {object[]} rows
 * @param {Array<{ key: string, label?: string, get?: (row:object)=>any }>} columns
 * @returns {string}
 */
export function rowsToCsv(rows, columns) {
  if (!Array.isArray(columns) || columns.length === 0) return ''
  const header = columns.map(c => escapeCsvValue(c.label ?? c.key)).join(',')
  const body = (rows || []).map(row =>
    columns.map(c => escapeCsvValue(c.get ? c.get(row) : row?.[c.key])).join(',')
  )
  return [header, ...body].join('\r\n')
}

/** Trigger a client-side download of CSV text. No-op outside the browser. */
export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return
  // Prepend a UTF-8 BOM so Excel opens accented characters correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Convenience: build CSV from rows+columns and download it. */
export function exportRowsToCsv(filename, rows, columns) {
  downloadCsv(filename, rowsToCsv(rows, columns))
}
