import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 (S3-compatible) storage for session recordings. Supabase's
 * Free plan caps uploads at 50 MB, which a few minutes of video exceeds, so
 * LiveKit Egress writes recordings here instead when R2 is configured.
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint: `https://${accountId}.r2.cloudflarestorage.com` };
}

function client(cfg: R2Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(cfg: R2Config, key: string): URL {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return new URL(`${cfg.endpoint}/${cfg.bucket}/${encodedKey}`);
}

/** Whether the object exists in the bucket. */
export async function r2ObjectExists(key: string): Promise<boolean> {
  const cfg = getR2Config();
  if (!cfg) return false;
  const res = await client(cfg).fetch(objectUrl(cfg, key).toString(), { method: "HEAD" });
  return res.ok;
}

/** Delete an object. Returns whether it is gone (already-missing counts). */
export async function r2DeleteObject(key: string): Promise<boolean> {
  const cfg = getR2Config();
  if (!cfg) return false;
  try {
    const res = await client(cfg).fetch(objectUrl(cfg, key).toString(), { method: "DELETE" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Presigned GET URL, optionally forcing a download with the given file name. */
export async function r2SignedUrl(
  key: string,
  ttlSeconds: number,
  opts: { download?: string } = {},
): Promise<string | null> {
  const cfg = getR2Config();
  if (!cfg) return null;
  const url = objectUrl(cfg, key);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
  if (opts.download) {
    const safe = opts.download.replace(/["\\\r\n]/g, "");
    url.searchParams.set("response-content-disposition", `attachment; filename="${safe}"`);
  }
  const signed = await client(cfg).sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
