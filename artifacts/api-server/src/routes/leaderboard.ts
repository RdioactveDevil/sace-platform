import { Router } from "express";
import { requireUser } from "../lib/auth";
import { currentStreak } from "../lib/streak";

const router = Router();

interface ClassRow {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  tutor_id: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  xp: number | null;
  level: number | null;
  streak: number | null;
  last_active: string | null;
  recent_correct: number | null;
  recent_answers: number | null;
  hide_from_leaderboard: boolean | null;
}

// GET /api/leaderboard/classes — one leaderboard per class, ranked by XP.
// Students get the classes they're in; tutors also get the classes they own
// or co-teach; admins get every class. Class membership and other students'
// profiles aren't readable by students directly, so this runs with the
// service role and returns only public leaderboard fields. Students who turned
// on "Hide me from leaderboards" are left off the board other students see;
// the class's tutors and admins still see them, marked hidden: true.
router.get("/leaderboard/classes", async (req, res) => {
  try {
    const caller = await requireUser(req, res);
    if (!caller) return;
    const { admin, userId } = caller;

    let classIds: string[];
    // Classes where the caller is staff (owner or co-teacher; admins: all).
    let staffClassIds = new Set<string>();
    if (caller.isAdmin) {
      const { data, error } = await admin.from("tutor_classes").select("id");
      if (error) return res.status(500).json({ error: error.message });
      classIds = (data ?? []).map((c: { id: string }) => c.id);
      staffClassIds = new Set(classIds);
    } else {
      const [memberRes, ownedRes, coRes] = await Promise.all([
        admin.from("tutor_class_members").select("class_id").eq("student_id", userId),
        caller.isTutor
          ? admin.from("tutor_classes").select("id").eq("tutor_id", userId)
          : Promise.resolve({ data: [], error: null }),
        caller.isTutor
          ? admin.from("tutor_class_tutors").select("class_id").eq("tutor_id", userId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (memberRes.error) return res.status(500).json({ error: memberRes.error.message });
      if (ownedRes.error) return res.status(500).json({ error: ownedRes.error.message });
      if (coRes.error) return res.status(500).json({ error: coRes.error.message });
      staffClassIds = new Set([
        ...((ownedRes.data ?? []) as { id: string }[]).map((r) => r.id),
        ...((coRes.data ?? []) as { class_id: string }[]).map((r) => r.class_id),
      ]);
      classIds = [...new Set([
        ...((memberRes.data ?? []) as { class_id: string }[]).map((r) => r.class_id),
        ...((ownedRes.data ?? []) as { id: string }[]).map((r) => r.id),
        ...((coRes.data ?? []) as { class_id: string }[]).map((r) => r.class_id),
      ])];
    }
    if (classIds.length === 0) return res.json({ classes: [] });

    const [classRes, membersRes] = await Promise.all([
      admin.from("tutor_classes").select("id, name, subject, color, tutor_id").in("id", classIds).order("name"),
      admin.from("tutor_class_members").select("class_id, student_id").in("class_id", classIds),
    ]);
    if (classRes.error) return res.status(500).json({ error: classRes.error.message });
    if (membersRes.error) return res.status(500).json({ error: membersRes.error.message });
    const members = (membersRes.data ?? []) as { class_id: string; student_id: string }[];

    const studentIds = [...new Set(members.map((m) => m.student_id))];
    const profiles: Record<string, ProfileRow> = {};
    if (studentIds.length > 0) {
      const { data: profs, error: pErr } = await admin
        .from("profiles")
        .select("id, display_name, xp, level, streak, last_active, recent_correct, recent_answers, hide_from_leaderboard")
        .in("id", studentIds)
        .is("deactivated_at", null);
      if (pErr) return res.status(500).json({ error: pErr.message });
      for (const p of (profs ?? []) as ProfileRow[]) profiles[p.id] = p;
    }

    const classes = ((classRes.data ?? []) as ClassRow[]).map((c) => {
      // Staff see every student, ranked together; students see only those who
      // haven't hidden themselves, ranked among themselves (so the positions
      // don't give away that someone is missing).
      const isStaff = staffClassIds.has(c.id);
      const ranked = members
        .filter((m) => m.class_id === c.id && profiles[m.student_id])
        .map((m) => profiles[m.student_id])
        .filter((p) => isStaff || !p.hide_from_leaderboard)
        .map((p) => ({
          id: p.id,
          display_name: p.display_name || "Student",
          xp: p.xp ?? 0,
          level: p.level ?? null,
          streak: currentStreak(p.streak, p.last_active),
          // Ranks need recent accuracy as well as XP; the app works it out from these.
          recent_correct: p.recent_correct ?? 0,
          recent_answers: p.recent_answers ?? 0,
          ...(isStaff ? { hidden: !!p.hide_from_leaderboard } : {}),
        }))
        .sort((a, b) => b.xp - a.xp);
      // Equal XP shares a position (1, 2, 2, 4), like the old global board.
      let position = 0;
      const board = ranked.map((r, i) => {
        if (i === 0 || r.xp !== ranked[i - 1].xp) position = i + 1;
        return { ...r, position };
      });
      return {
        id: c.id,
        name: c.name,
        subject: c.subject,
        color: c.color,
        is_member: members.some((m) => m.class_id === c.id && m.student_id === userId),
        is_staff: isStaff,
        board,
      };
    });

    return res.json({ classes });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});

export default router;
