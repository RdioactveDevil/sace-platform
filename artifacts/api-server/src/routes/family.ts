import { Router, type Request, type Response } from "express";
import { requireUser, verifyPassword } from "../lib/auth";
import {
  FamilyError, addFamilyChild, canHaveFamily, contactEmail, familyIdOf, familyMembers,
} from "../lib/family";
import { cancelAllSubscriptions, getStripe } from "./billing";
import { deleteStoredFiles, oneOnOneRecordingFiles } from "./account";
import { logger } from "../lib/logger";

/**
 * Family accounts (lib/family.ts): one parent email, several children.
 *
 *   GET    /family                 the caller's family (the children, which one is open)
 *   POST   /family/children        { name } add a child; the parent then switches to them
 *   POST   /family/switch          { userId } → { token_hash }: the app signs in to that
 *                                  child with it (supabase.auth.verifyOtp), no password
 *   DELETE /family/children/:id    { password } remove an added child and their data
 *
 * Switching is open to any account in the family: they're one household's
 * children on the parent's devices, and each child's own account is all it
 * reaches. Removing a child needs the parent's password.
 */

const router = Router();

const fail = (res: Response, status: number, error: string) => void res.status(status).json({ error });

function failWith(res: Response, err: unknown, what: string) {
  if (err instanceof FamilyError) return fail(res, 400, err.message);
  logger.error({ err: err instanceof Error ? err.message : String(err) }, `family: ${what} failed`);
  fail(res, 500, "Something went wrong. Please try again.");
}

router.get("/family", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  try {
    const { admin, userId } = ctx;
    const familyId = await familyIdOf(admin, userId);
    const canAdd = familyId ? true : await canHaveFamily(admin, userId);
    if (!canAdd) return void res.json({ canAddChildren: false, children: [], parentEmail: null });
    const children = familyId ? await familyMembers(admin, familyId) : await familyMembers(admin, userId);
    res.json({
      canAddChildren: true,
      currentId: userId,
      parentEmail: await contactEmail(admin, familyId ?? userId),
      children,
    });
  } catch (err) {
    failWith(res, err, "load");
  }
});

router.post("/family/children", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  try {
    const child = await addFamilyChild(ctx.admin, ctx.userId, String(req.body?.name ?? ""));
    logger.info({ userId: ctx.userId, childId: child.id }, "family: child added");
    res.json({ child });
  } catch (err) {
    failWith(res, err, "add child");
  }
});

router.post("/family/switch", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const target = String(req.body?.userId ?? "");
  try {
    const { admin, userId } = ctx;
    const familyId = await familyIdOf(admin, userId);
    if (!familyId || !target || (await familyIdOf(admin, target)) !== familyId) {
      return fail(res, 403, "That account isn't in your family.");
    }
    const { data: user } = await admin.auth.admin.getUserById(target);
    const email = user?.user?.email;
    if (!email) return fail(res, 404, "That account no longer exists.");
    // A one-time sign-in token for the app to exchange; nothing is emailed.
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !data?.properties?.hashed_token) throw new Error(error?.message ?? "no sign-in token");
    res.json({ token_hash: data.properties.hashed_token });
  } catch (err) {
    failWith(res, err, "switch");
  }
});

router.delete("/family/children/:id", async (req: Request, res: Response) => {
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const target = String(req.params.id);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  try {
    const { admin, userId } = ctx;
    const familyId = await familyIdOf(admin, userId);
    if (!familyId || (await familyIdOf(admin, target)) !== familyId) return fail(res, 403, "That account isn't in your family.");
    if (target === familyId) return fail(res, 400, "This is the account you sign in to. Delete it from My Account instead.");
    if (target === userId) return fail(res, 400, "Switch to another child first, then remove this one.");
    if (!password) return fail(res, 400, "Enter your password to confirm.");
    const parentEmail = await contactEmail(admin, familyId);
    if (!parentEmail || !(await verifyPassword(parentEmail, password))) return fail(res, 403, "That password isn't right.");

    const { data: billing } = await admin.from("billing_customers").select("user_id").eq("user_id", target).maybeSingle();
    if (billing) {
      const stripe = getStripe();
      if (!stripe) return fail(res, 503, "We can't cancel this child's plan right now. Please try again later.");
      await cancelAllSubscriptions(admin, stripe, target);
    }
    await admin.from("draft_questions").update({ reviewed_by: null }).eq("reviewed_by", target);
    const recordings = await oneOnOneRecordingFiles(admin, target);
    const { error } = await admin.auth.admin.deleteUser(target);
    if (error) throw new Error(error.message);
    await deleteStoredFiles(admin, recordings, target);
    logger.info({ userId, childId: target }, "family: child removed");
    res.json({ ok: true });
  } catch (err) {
    failWith(res, err, "remove child");
  }
});

export default router;
