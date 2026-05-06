import { supabase } from './supabase'

export async function saveWritingAttempt(userId, {
  subject, essayType, mode, prompt, imageUrl,
  content, feedback, timed, durationSeconds, actualSeconds,
}) {
  const { data, error } = await supabase
    .from('writing_attempts')
    .insert({
      user_id: userId,
      subject,
      essay_type: essayType,
      mode,
      prompt,
      image_url: imageUrl || null,
      content,
      feedback: feedback || null,
      timed,
      duration_seconds: durationSeconds || null,
      actual_seconds: actualSeconds || null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateWritingAttemptFeedback(attemptId, feedback) {
  const { error } = await supabase
    .from('writing_attempts')
    .update({ feedback })
    .eq('id', attemptId)
  if (error) throw error
}

export async function getWritingAttempts(userId, subject) {
  const { data, error } = await supabase
    .from('writing_attempts')
    .select('id, essay_type, mode, prompt, image_url, created_at, feedback')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}
