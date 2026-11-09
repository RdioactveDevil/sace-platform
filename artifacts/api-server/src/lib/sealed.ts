import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Sealed tokens: data the app carries for the server but can't read or change
// (AES-256-GCM). Used for freshly generated extra-practice questions, whose
// answers aren't in the database yet: the app gets the question and a sealed
// copy of its answer, and hands the sealed copy back when the student answers.

function key(purpose: string): Buffer {
  const secret = process.env.REMEDIATION_SIGNING_SECRET || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new Error("No signing secret configured");
  return createHash("sha256").update(`sealed:${purpose}:${secret}`).digest();
}

/** Seal `data` for `purpose`; only unseal() with the same purpose opens it. */
export function seal(purpose: string, data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The sealed data, or null if the token isn't one of ours (or was changed). */
export function unseal<T = unknown>(purpose: string, token: unknown): T | null {
  if (typeof token !== "string" || token.length < 40 || token.length > 200_000) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
