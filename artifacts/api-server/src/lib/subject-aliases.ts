/**
 * Canonical spellings of `questions.subject` / `draft_questions.subject` for the same bank
 * (SACE ordering, "Year N Title" vs "Title Year N", optional SACE prefix).
 */
export function normalizeSubjectLabel(raw: string): string {
  return raw.trim().replace(/[\s:;，、。]+$/u, "").trim();
}

/**
 * Some legacy `questions.subject` values end with stray colons/spaces (e.g. `"SACE Stage 2 Mathematical Methods : "`).
 * Expand one canonical label into every variant we should use in `.in("subject", …)` and rename cascades.
 */
export function expandSubjectRowStringsForDb(canonical: string): string[] {
  const trimmed = canonical.trim();
  if (!trimmed) return [];
  const normalized = normalizeSubjectLabel(trimmed);
  const bases = [...new Set([trimmed, normalized].filter((x) => x.length > 0))];
  const suffixes = [" :", " : ", ": ", ":"];
  const out = new Set<string>();
  for (const b of bases) {
    out.add(b);
    for (const suf of suffixes) {
      out.add(b + suf);
      out.add(b + suf + " ");
      out.add(b + suf + "  ");
    }
  }
  return [...out].filter((x) => x.length > 0);
}

function withSubjectRowJunkVariants(keyword: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const k of keyword) {
    for (const v of expandSubjectRowStringsForDb(k)) out.add(v);
  }
  return [...out];
}

/** Core alias spellings only (no trailing ` :` junk). */
export function collectSubjectAliasCore(primary: string): string[] {
  const s = normalizeSubjectLabel(primary);
  if (!s) return [];
  const out = new Set<string>([s]);

  const sace = s.match(/^SACE\s+Stage\s*([12])\s+(.+)$/i);
  if (sace) {
    const n = sace[1];
    const title = sace[2].trim();
    const st = `Stage ${n}`;
    out.add(`${title} ${st}`);
    out.add(`${st} ${title}`);
  }

  const stageAtEnd = s.match(/^(.+?)\s+Stage\s*([12])\s*$/i);
  if (stageAtEnd) {
    const title = stageAtEnd[1].trim();
    const n = stageAtEnd[2];
    const st = `Stage ${n}`;
    out.add(`${st} ${title}`);
    out.add(`SACE ${st} ${title}`);
    out.add(`SACE Stage ${n} ${title}`);
  }

  const stageAtStart = s.match(/^Stage\s*([12])\s+(.+)$/i);
  if (stageAtStart) {
    const n = stageAtStart[1];
    const title = stageAtStart[2].trim();
    const st = `Stage ${n}`;
    out.add(`${title} ${st}`);
    out.add(`SACE ${st} ${title}`);
  }

  const yearFirst = s.match(/^Year\s*(\d{1,2})\s+(.+)$/i);
  if (yearFirst) {
    const year = yearFirst[1];
    const rest = yearFirst[2].trim();
    out.add(`${rest} Year ${year}`);
  }

  const yearLast = s.match(/^(.+?)\s+Year\s*(\d{1,2})\s*$/i);
  if (yearLast) {
    const rest = yearLast[1].trim();
    const year = yearLast[2];
    out.add(`Year ${year} ${rest}`);
  }

  return [...out].filter((x) => x.length > 0);
}

export function subjectCountCandidates(primary: string): string[] {
  return withSubjectRowJunkVariants(collectSubjectAliasCore(primary));
}

/**
 * All `subject` strings that should be renamed when a curriculum display name changes.
 * Unions alias expansion of the stored name with titles rebuilt from {@param oldLevelLabel}
 * (e.g. after shortening "Mathematical Methods Stage 2" → "Mathematical Methods" with level Stage 2).
 */
export function expandCurriculumRenameSources(oldName: string, oldLevelLabel = ""): string[] {
  const out = new Set<string>();
  const name = normalizeSubjectLabel(oldName);
  if (!name) return [];

  for (const x of collectSubjectAliasCore(name)) out.add(x);

  const lv = oldLevelLabel.trim();
  if (!lv) return withSubjectRowJunkVariants(out);

  let base = name
    .replace(/\s+Stage\s*[12]\s*$/i, "")
    .replace(/^Stage\s*[12]\s+/i, "")
    .trim();
  if (!base) base = name;

  const st = lv.match(/^stage\s*([12])$/i);
  if (st) {
    const n = st[1];
    const forms = [base, `${base} Stage ${n}`, `Stage ${n} ${base}`, `SACE Stage ${n} ${base}`];
    for (const f of forms) {
      const t = f.trim();
      if (!t) continue;
      out.add(t);
      for (const x of collectSubjectAliasCore(t)) out.add(x);
    }
  }

  const yr = lv.match(/^year\s*(\d{1,2})$/i);
  if (yr) {
    const y = yr[1];
    const forms = [`Year ${y} ${base}`, `${base} Year ${y}`];
    for (const f of forms) {
      out.add(f);
      for (const x of collectSubjectAliasCore(f)) out.add(x);
    }
  }

  return withSubjectRowJunkVariants(out);
}
