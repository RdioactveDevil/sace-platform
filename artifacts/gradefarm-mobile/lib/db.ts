import { supabase } from "./supabase";
import { nextReviewTime, type Question, type StruggleMap } from "./engine";

export interface Profile {
  id: string;
  display_name: string;
  school?: string;
  xp: number;
  streak: number;
  best_streak: number;
  last_active?: string;
  onboarding_completed?: boolean;
}

export interface LeaderboardEntry {
  id: string;
  display_name: string;
  school?: string;
  xp: number;
  rank?: number;
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  school?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  if (data.user && school) {
    await supabase.from("profiles").update({ school }).eq("id", data.user.id);
  }
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) throw error;
}

export async function getQuestions(subject = "Chemistry Stage 1"): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("subject", subject);
  if (error) throw error;
  return (data || []).map((q) => ({
    ...q,
    options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
    concept_tag:
      q.concept_tag || `${q.subject}|${q.topic}|${q.subtopic}`.toLowerCase(),
  })) as Question[];
}

export async function getStruggleMap(userId: string): Promise<StruggleMap> {
  const { data, error } = await supabase
    .from("struggle_profiles")
    .select("question_id, attempts, wrong, last_seen, next_review")
    .eq("user_id", userId);
  if (error) throw error;
  return Object.fromEntries((data || []).map((r) => [r.question_id, r]));
}

export async function recordAnswer(
  userId: string,
  questionId: string,
  correct: boolean,
  selected = 0
) {
  const { data: existing } = await supabase
    .from("struggle_profiles")
    .select("*")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .single();

  const attempts = (existing?.attempts ?? 0) + 1;
  const wrong = (existing?.wrong ?? 0) + (correct ? 0 : 1);
  const next_review = nextReviewTime(attempts, wrong).toISOString();
  const last_seen = new Date().toISOString();

  if (existing) {
    await supabase
      .from("struggle_profiles")
      .update({ attempts, wrong, last_seen, next_review })
      .eq("user_id", userId)
      .eq("question_id", questionId);
  } else {
    await supabase.from("struggle_profiles").insert({
      user_id: userId,
      question_id: questionId,
      attempts,
      wrong,
      last_seen,
      next_review,
    });
  }

  await supabase.from("answer_log").insert({
    user_id: userId,
    question_id: questionId,
    selected,
    correct,
  });
}

export async function addXP(
  userId: string,
  xpEarned: number,
  newStreak: number,
  currentProfile: Profile
): Promise<number> {
  const newXP = Math.max(0, currentProfile.xp + xpEarned);
  const today = new Date().toDateString();
  const lastActive = currentProfile.last_active
    ? new Date(currentProfile.last_active).toDateString()
    : null;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const validStreak = lastActive === today || lastActive === yesterday;

  await updateProfile(userId, {
    xp: newXP,
    streak: validStreak ? newStreak : newStreak === 0 ? 0 : 1,
    best_streak: Math.max(currentProfile.best_streak ?? 0, newStreak),
    last_active: new Date().toISOString(),
  });
  return newXP;
}

export async function getLeaderboard(limit = 25): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .limit(limit);
  if (error) throw error;
  return (data || []) as LeaderboardEntry[];
}

export async function getSubscriptions(userId: string) {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw error;
  return data || [];
}
