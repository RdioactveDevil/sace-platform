import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Family accounts (migration 20261027000003_family_accounts.sql): one parent
// email for several children. The account the parent signs in to is one
// child's; each other child has their own account with a hidden sign-in
// address on FAMILY_EMAIL_DOMAIN, reached by switching (routes/family.ts).
// Nothing is ever sent to those addresses: mail for them goes to the parent.

/** Hidden sign-in addresses of added children. No mailbox exists here. */
export const FAMILY_EMAIL_DOMAIN = "family.gradefarm.com.au";
/** Children a parent can add besides the account they sign in to. */
export const MAX_ADDED_CHILDREN = 6;

const NAME_RE = /^[\p{L}][\p{L}' -]{0,39}$/u;

export const isFamilyLogin = (email: string | null | undefined): boolean =>
  !!email && email.trim().toLowerCase().endsWith(`@${FAMILY_EMAIL_DOMAIN}`);

export const validChildName = (name: string): boolean => NAME_RE.test(name);

/** "Mia" from "Mia Chen", for matching an invite's child to an account. */
export const firstName = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

export type FamilyMember = {
  id: string;
  name: string;
  year_level: string | number | null;
  set_up: boolean;
  /** The account the parent signs in to. */
  primary: boolean;
};

/** The family this account belongs to, or null. */
export async function familyIdOf(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from("family_members").select("family_id").eq("user_id", userId).maybeSingle<{ family_id: string }>();
  if (error) throw new Error(`family_members: ${error.message}`);
  return data?.family_id ?? null;
}

/** Everyone in a family, the account the parent signs in to first. */
export async function familyMembers(admin: SupabaseClient, familyId: string): Promise<FamilyMember[]> {
  const { data: rows, error } = await admin.from("family_members").select("user_id, created_at").eq("family_id", familyId).order("created_at");
  if (error) throw new Error(`family_members: ${error.message}`);
  const ids = (rows ?? []).map((r) => r.user_id as string);
  if (!ids.includes(familyId)) ids.unshift(familyId);
  const { data: profiles, error: pErr } = await admin.from("profiles").select("id, display_name, year_level, onboarding_completed").in("id", ids);
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    return [{
      id, name: (p.display_name as string | null)?.trim() || "Student", year_level: p.year_level ?? null,
      set_up: !!p.onboarding_completed, primary: id === familyId,
    }];
  }).sort((a, b) => Number(b.primary) - Number(a.primary));
}

/** The address mail for this sign-in email goes to: the parent's, for an added child. */
export async function contactEmailForLogin(admin: SupabaseClient, loginEmail: string): Promise<string | null> {
  if (!isFamilyLogin(loginEmail)) return loginEmail;
  const { data } = await admin.from("family_members").select("family_id").eq("login_email", loginEmail.trim().toLowerCase())
    .maybeSingle<{ family_id: string }>();
  if (!data) return null;
  const { data: primary } = await admin.auth.admin.getUserById(data.family_id);
  return primary?.user?.email ?? null;
}

/** The account's own email, or its parent's for an added child. */
export async function contactEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  return email ? contactEmailForLogin(admin, email) : null;
}

/**
 * Whether this account can have children added: the parent set it up
 * (account_holder 'parent'), or it's already in a family.
 */
export async function canHaveFamily(admin: SupabaseClient, userId: string): Promise<boolean> {
  if (await familyIdOf(admin, userId)) return true;
  const { data } = await admin.from("profiles").select("account_holder, is_tutor").eq("id", userId)
    .maybeSingle<{ account_holder: string | null; is_tutor: boolean | null }>();
  return data?.account_holder === "parent" && !data.is_tutor;
}

/**
 * Add a child to the family of `memberId` (any account in it, or the parent's
 * own account before it has a family). The child gets their own account with
 * a hidden sign-in address; the parent agrees on their behalf by adding them,
 * as on the parent sign-up. Returns the new child, or throws a message to show.
 */
export async function addFamilyChild(admin: SupabaseClient, memberId: string, rawName: string): Promise<FamilyMember> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!validChildName(name)) throw new FamilyError("Enter the child's first name (letters only).");
  if (!(await canHaveFamily(admin, memberId))) throw new FamilyError("Only an account a parent set up can add children.");

  const familyId = (await familyIdOf(admin, memberId)) ?? memberId;
  const { count, error: countErr } = await admin.from("family_members").select("user_id", { count: "exact", head: true })
    .eq("family_id", familyId).neq("user_id", familyId);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) >= MAX_ADDED_CHILDREN) throw new FamilyError(`A family can have up to ${MAX_ADDED_CHILDREN + 1} children.`);

  const [{ data: primaryUser }, { data: primary }] = await Promise.all([
    admin.auth.admin.getUserById(familyId),
    admin.from("profiles").select("parent_name").eq("id", familyId).maybeSingle<{ parent_name: string | null }>(),
  ]);
  const parentEmail = primaryUser?.user?.email?.toLowerCase();
  if (!parentEmail) throw new Error("the family's account has no email");

  const loginEmail = `child-${randomBytes(9).toString("hex")}@${FAMILY_EMAIL_DOMAIN}`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: loginEmail,
    // Never shown or used: the parent reaches this account by switching.
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: {
      display_name: name, signup_path: "parent", parent_name: primary?.parent_name ?? null,
      family_child: true, family_email: parentEmail,
    },
  });
  if (createErr || !created?.user) throw new Error(createErr?.message ?? "could not create the child's account");
  const childId = created.user.id;

  try {
    const { error: famErr } = await admin.from("family_members").upsert([
      { user_id: familyId, family_id: familyId, login_email: null },
      { user_id: childId, family_id: familyId, login_email: loginEmail },
    ], { onConflict: "user_id", ignoreDuplicates: true });
    if (famErr) throw new Error(famErr.message);
    const { error: profErr } = await admin.from("profiles").update({
      account_holder: "parent", parent_email: parentEmail, parent_name: primary?.parent_name ?? null,
      parent_consent_at: new Date().toISOString(),
    }).eq("id", childId);
    if (profErr) throw new Error(profErr.message);
  } catch (err) {
    await admin.auth.admin.deleteUser(childId).catch(() => {});
    throw err;
  }
  return { id: childId, name, year_level: null, set_up: false, primary: false };
}

/** A message for the person using the app (anything else is a 500). */
export class FamilyError extends Error {}
