import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for third-party credentials people store in their
 * account (for example a Zoom client secret). AES-256-GCM with a key derived
 * from CREDENTIALS_SECRET, falling back to SESSION_SECRET so a fresh install
 * works without another variable. Rotating the key makes stored secrets
 * unreadable — people then re-enter them.
 *
 * Ciphertext format: "v1:<iv>:<auth tag>:<data>" (base64url pieces).
 */

const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("CREDENTIALS_SECRET or SESSION_SECRET must be set to store credentials");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognized stored secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
