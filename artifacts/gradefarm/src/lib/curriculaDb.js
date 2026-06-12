import { supabase } from './supabase'
import { adminApiPost } from './adminApi'
import { inferCohortLabelFromCurriculumName } from './subjects'

/**
 * List all curricula with topic + subtopic counts and generation progress.
 * @returns {Promise<Array>}
 */
export async function listCurricula() {
  const { data, error } = await supabase
    .from('curricula')
    .select(`
      id, name, level_label, subject_description, generation_flags, status, created_at,
      curriculum_topics (
        id,
        curriculum_subtopics ( id, gen_status, questions_generated )
      )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data || []).map(c => {
    const topics = c.curriculum_topics || []
    const subtopics = topics.flatMap(t => t.curriculum_subtopics || [])
    return {
      id: c.id,
      name: c.name,
      level_label: c.level_label ?? '',
      subject_description: c.subject_description,
      generation_flags: c.generation_flags ?? {},
      status: c.status,
      created_at: c.created_at,
      topic_count: topics.length,
      subtopic_count: subtopics.length,
      questions_generated: subtopics.reduce((sum, s) => sum + (s.questions_generated || 0), 0),
      questions_total: subtopics.length * 5,
    }
  })
}

/**
 * Fetch one curriculum with its full topic/subtopic tree.
 * @param {string} id
 */
export async function getCurriculumDetail(id) {
  const { data: curriculum, error: cErr } = await supabase
    .from('curricula')
    .select('id, name, level_label, subject_description, status, created_at')
    .eq('id', id)
    .single()
  if (cErr) throw cErr

  // exam_context queried separately so a missing column (migration not yet
  // applied) degrades to an empty editor instead of breaking the detail screen.
  let examContext = ''
  {
    const { data: ctxRow } = await supabase
      .from('curricula')
      .select('exam_context')
      .eq('id', id)
      .maybeSingle()
    examContext = ctxRow?.exam_context ?? ''
  }

  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('id, name, order_index')
    .eq('curriculum_id', id)
    .order('order_index')
  if (tErr) throw tErr

  const topicIds = (topics || []).map(t => t.id)
  let subtopics = []
  if (topicIds.length > 0) {
    const { data: subs, error: sErr } = await supabase
      .from('curriculum_subtopics')
      .select('id, topic_id, name, order_index, gen_status, questions_generated')
      .in('topic_id', topicIds)
      .order('order_index')
    if (sErr) throw sErr
    subtopics = subs || []
  }

  return {
    ...curriculum,
    exam_context: examContext,
    topics: (topics || []).map(t => ({
      ...t,
      subtopics: subtopics.filter(s => s.topic_id === t.id),
    })),
  }
}

/**
 * Create a new curriculum with its full topic/subtopic tree.
 * @param {{ name: string, subject_description: string, topics: Array, level_label?: string }} data
 * @returns {Promise<string>} curriculum id
 */
export async function createCurriculum({ name, subject_description, topics, level_label = '', generation_flags = {} }) {
  const { data: curriculum, error: cErr } = await supabase
    .from('curricula')
    .insert({ name, subject_description, level_label: level_label || '', generation_flags: generation_flags || {}, status: 'draft' })
    .select('id')
    .single()
  if (cErr) throw cErr

  const curriculumId = curriculum.id
  await _replaceTopicsAndSubtopics(curriculumId, topics)
  return curriculumId
}

/**
 * Update an existing curriculum's name, description, and full topic/subtopic tree.
 * Replaces all existing topics/subtopics (full replace, not patch).
 * @param {string} id
 * @param {{ name?: string, subject_description?: string, level_label?: string, topics?: Array }} updates
 */
export async function updateCurriculum(id, { name, subject_description, level_label, generation_flags, exam_context, topics } = {}) {
  const { data: cur, error: curErr } = await supabase
    .from('curricula')
    .select('name, level_label')
    .eq('id', id)
    .single()
  if (curErr) throw curErr

  const oldName = cur.name
  const oldLevel = (cur.level_label ?? '').trim()

  if (name !== undefined && name !== oldName) {
    await adminApiPost('/api/admin/curriculum-rename-cascade', {
      oldSubject: oldName,
      newSubject: name,
      oldLevelLabel: oldLevel,
    })
  }

  if (level_label !== undefined) {
    const newLevel = String(level_label).trim()
    if (newLevel !== oldLevel) {
      const subjectForSubscriptions = name !== undefined ? name : oldName
      await adminApiPost('/api/admin/curriculum-subscription-stage', {
        subjectName: subjectForSubscriptions,
        oldStage: oldLevel,
        newStage: newLevel,
      })
    }
  }

  const patch = {}
  if (name !== undefined) patch.name = name
  if (subject_description !== undefined) patch.subject_description = subject_description
  if (level_label !== undefined) patch.level_label = level_label
  if (generation_flags !== undefined) patch.generation_flags = generation_flags || {}
  if (exam_context !== undefined) patch.exam_context = exam_context ?? ''

  if (Object.keys(patch).length > 0) {
    let { error } = await supabase.from('curricula').update(patch).eq('id', id)
    // If the exam_context migration hasn't been applied yet, retry without it
    // so the rest of the save still goes through.
    if (error && patch.exam_context !== undefined && /exam_context/i.test(error.message || '')) {
      const { exam_context: _omitted, ...rest } = patch
      if (Object.keys(rest).length > 0) {
        ;({ error } = await supabase.from('curricula').update(rest).eq('id', id))
      } else {
        error = null
      }
    }
    if (error) throw error
  }

  if (topics !== undefined) {
    await _replaceTopicsAndSubtopics(id, topics)
  }
}

/**
 * Update a curriculum's status field only.
 * @param {string} id
 * @param {'draft'|'generating'|'live'} status
 */
export async function updateCurriculumStatus(id, status) {
  const { error } = await supabase.from('curricula').update({ status }).eq('id', id)
  if (error) throw error
}

/**
 * Update one subtopic's gen_status and questions_generated count.
 * @param {string} subtopicId
 * @param {'pending'|'generating'|'done'|'failed'} genStatus
 * @param {number} [questionsGenerated]
 */
export async function updateSubtopicGenStatus(subtopicId, genStatus, questionsGenerated) {
  const patch = { gen_status: genStatus }
  if (questionsGenerated !== undefined) patch.questions_generated = questionsGenerated
  const { error } = await supabase.from('curriculum_subtopics').update(patch).eq('id', subtopicId)
  if (error) throw error
}

/**
 * Fetch all subtopics for a curriculum (for polling progress).
 * @param {string} curriculumId
 */
export async function getSubtopicStatuses(curriculumId) {
  const { data, error } = await supabase
    .from('curriculum_subtopics')
    .select('id, name, gen_status, questions_generated, topic_id')
    .eq('curriculum_id', curriculumId)
    .order('order_index')
  if (error) throw error
  return data || []
}

/**
 * Load all live/generating curricula topics into a cache-friendly format.
 * Returns: { [subjectName]: [{ code: string, name: string, topicName: string }] }
 */
export async function loadManagedCurriculaTopics() {
  const { data: curricula, error: cErr } = await supabase
    .from('curricula')
    .select('id, name, level_label')
    .in('status', ['live', 'generating'])
  if (cErr) throw cErr
  if (!curricula?.length) return {}

  const ids = curricula.map(c => c.id)
  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('id, curriculum_id, name, order_index')
    .in('curriculum_id', ids)
    .order('order_index')
  if (tErr) throw tErr

  const { data: subtopics, error: sErr } = await supabase
    .from('curriculum_subtopics')
    .select('id, topic_id, curriculum_id, name, order_index')
    .in('curriculum_id', ids)
    .order('order_index')
  if (sErr) throw sErr

  const result = {}
  for (const c of curricula) {
    const cTopics = (topics || []).filter(t => t.curriculum_id === c.id)
    const cSubtopics = []
    cTopics.forEach((t, ti) => {
      const subs = (subtopics || []).filter(s => s.topic_id === t.id)
      subs.forEach((s, si) => {
        cSubtopics.push({
          code: `T${ti + 1}.${si + 1}`,
          name: s.name,
          topicName: t.name,
        })
      })
    })
    result[c.name] = cSubtopics
  }
  return result
}

/**
 * Fetch live/generating curricula with their top-level topic names for display in SubjectPicker.
 * @returns {Promise<Array<{ id: string, name: string, level_label: string, status: string, topicNames: string[] }>>}
 */
export async function fetchLiveCurricula() {
  const { data: curricula, error: cErr } = await supabase
    .from('curricula')
    .select('id, name, level_label, status')
    .in('status', ['live', 'generating'])
    .order('created_at', { ascending: true })
  if (cErr) throw cErr
  if (!curricula?.length) return []

  const ids = curricula.map(c => c.id)
  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('curriculum_id, name')
    .in('curriculum_id', ids)
    .order('order_index')
  if (tErr) throw tErr

  return curricula.map(c => ({
    id: c.id,
    name: c.name,
    level_label: (c.level_label ?? '').trim(),
    status: c.status,
    topicNames: (topics || []).filter(t => t.curriculum_id === c.id).map(t => t.name),
  }))
}

/**
 * Fetch all curricula with status in ['draft', 'generating', 'live'], with topic names.
 * Used to show draft curricula as "Coming Soon" in SubjectPicker.
 * @returns {Promise<Array<{ id: string, name: string, level_label: string, status: string, topicNames: string[] }>>}
 */
export async function fetchAllActiveCurricula() {
  const { data: curricula, error: cErr } = await supabase
    .from('curricula')
    .select('id, name, level_label, status')
    .in('status', ['draft', 'generating', 'live'])
    .order('created_at', { ascending: true })
  if (cErr) throw cErr
  if (!curricula?.length) return []

  const ids = curricula.map(c => c.id)
  const { data: topics, error: tErr } = await supabase
    .from('curriculum_topics')
    .select('curriculum_id, name')
    .in('curriculum_id', ids)
    .order('order_index')
  if (tErr) throw tErr

  return curricula.map(c => ({
    id: c.id,
    name: c.name,
    level_label: (c.level_label ?? '').trim(),
    status: c.status,
    topicNames: (topics || []).filter(t => t.curriculum_id === c.id).map(t => t.name),
  }))
}

/**
 * Delete a curriculum and all its topics/subtopics (cascade).
 * @param {string} id
 */
export async function deleteCurriculum(id) {
  const { error } = await supabase.from('curricula').delete().eq('id', id)
  if (error) throw error
}

/**
 * Seed built-in hardcoded subjects into the curricula table if they don't exist yet.
 * Subjects already present (matched by name) are skipped.
 * @param {Array<{ name: string, description: string, topics: Array }>} builtIns
 */
export async function seedBuiltInSubjectsIfNeeded(builtIns) {
  const { data: existing } = await supabase.from('curricula').select('id, name')
  const existingMap = new Map((existing || []).map(c => [c.name, c.id]))

  for (const { name, description, topics, generation_flags } of builtIns) {
    const existingId = existingMap.get(name)
    if (existingId) {
      // If topics are still in the old "code — name" format, replace them with canonical names.
      // This runs once after a deploy; subsequent loads find no " — " and skip.
      const { data: firstSub } = await supabase
        .from('curriculum_subtopics')
        .select('name')
        .eq('curriculum_id', existingId)
        .limit(1)
        .maybeSingle()
      if (firstSub?.name?.includes(' \u2014 ')) {
        await _replaceTopicsAndSubtopics(existingId, topics, 'done')
      }
      continue
    }
    const level = inferCohortLabelFromCurriculumName(name)
    const { data: c, error } = await supabase
      .from('curricula')
      .insert({ name, subject_description: description || name, level_label: level, status: 'live', generation_flags: generation_flags || {} })
      .select('id')
      .single()
    if (error || !c) continue
    await _replaceTopicsAndSubtopics(c.id, topics, 'done')
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _replaceTopicsAndSubtopics(curriculumId, topics, defaultGenStatus = 'pending') {
  // Delete existing topics (cascade deletes subtopics)
  const { error: delErr } = await supabase
    .from('curriculum_topics')
    .delete()
    .eq('curriculum_id', curriculumId)
  if (delErr) throw delErr

  for (let ti = 0; ti < topics.length; ti++) {
    const topic = topics[ti]
    const { data: topicRow, error: tErr } = await supabase
      .from('curriculum_topics')
      .insert({ curriculum_id: curriculumId, name: topic.name, order_index: ti })
      .select('id')
      .single()
    if (tErr) throw tErr

    const subtopics = topic.subtopics || []
    if (subtopics.length > 0) {
      const subRows = subtopics.map((s, si) => ({
        topic_id: topicRow.id,
        curriculum_id: curriculumId,
        name: s.name,
        order_index: si,
        gen_status: defaultGenStatus,
        questions_generated: 0,
      }))
      const { error: sErr } = await supabase.from('curriculum_subtopics').insert(subRows)
      if (sErr) throw sErr
    }
  }
}

/**
 * Load curriculum topics and subtopics for a given curriculum name,
 * formatted as macroGroups for HomeScreen two-level topic display.
 * @param {string} curriculumName  e.g. 'Mathematical Methods Stage 2'
 * @returns {Promise<Array<{id:string,num:number,label:string,topics:string[]}>|null>}
 */
export async function loadCurriculumMacroGroups(curriculumName) {
  const { data: curriculum } = await supabase
    .from('curricula')
    .select('id')
    .eq('name', curriculumName)
    .single()
  if (!curriculum) return null

  const [{ data: topics }, { data: subtopics }] = await Promise.all([
    supabase
      .from('curriculum_topics')
      .select('id, name, order_index')
      .eq('curriculum_id', curriculum.id)
      .order('order_index'),
    supabase
      .from('curriculum_subtopics')
      .select('topic_id, name, order_index')
      .eq('curriculum_id', curriculum.id)
      .order('order_index'),
  ])

  if (!topics?.length) return null

  return topics.map((t, i) => ({
    id: `g${i + 1}`,
    num: i + 1,
    label: t.name,
    topics: (subtopics || [])
      .filter(s => s.topic_id === t.id)
      .map(s => s.name),
  }))
}
