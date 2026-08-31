import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage provider abstraction for uploads (resumes, attachments,
 * thumbnails, video files). Large media never goes into the database — only
 * a storage key is persisted.
 *
 * Built-in providers:
 *  - LocalDiskStorage (default in development): files under ./storage,
 *    served by /api/files/[...key]
 *  - S3Storage: enabled when S3_BUCKET, S3_ACCESS_KEY_ID and
 *    S3_SECRET_ACCESS_KEY are set (S3_ENDPOINT/S3_REGION for non-AWS
 *    S3-compatible stores like Cloudflare R2 or Backblaze B2). Supports
 *    presigned PUTs so large files upload straight from the browser to the
 *    bucket without passing through a serverless function.
 */

export interface StorageProvider {
  readonly name: string;
  put(opts: { data: Buffer; filename: string; contentType: string; prefix?: string }): Promise<{ key: string }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL path the app serves this key from. */
  urlFor(key: string): string;
  /**
   * Presigned direct-upload URL for the browser to PUT the file to, or null
   * when the provider only supports server-side put() (local disk).
   */
  presignPut(opts: { filename: string; contentType: string; prefix?: string }): Promise<{ url: string; key: string } | null>;
  /**
   * Presigned/short-lived download URL to redirect to, or null when the
   * provider serves bytes itself via get().
   */
  presignGet(key: string): Promise<string | null>;
}

/** Generate an unguessable, path-safe storage key. */
function makeKey(prefix: string | undefined, filename: string): string {
  const safeName = filename.replace(/[^\w.\-]/g, "_").slice(0, 80);
  return `${prefix ?? "uploads"}/${crypto.randomBytes(8).toString("hex")}-${safeName}`;
}

function appUrlFor(key: string): string {
  return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const STORAGE_ROOT = path.join(process.cwd(), "storage");

class LocalDiskStorage implements StorageProvider {
  readonly name = "local-disk";

  async put(opts: { data: Buffer; filename: string; contentType: string; prefix?: string }) {
    const key = makeKey(opts.prefix, opts.filename);
    const filePath = path.join(STORAGE_ROOT, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, opts.data);
    await fs.writeFile(`${filePath}.meta`, JSON.stringify({ contentType: opts.contentType }));
    return { key };
  }

  async get(key: string) {
    // Prevent path traversal
    const filePath = path.join(STORAGE_ROOT, key);
    if (!filePath.startsWith(STORAGE_ROOT)) return null;
    try {
      const [data, metaRaw] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(`${filePath}.meta`, "utf8").catch(() => "{}"),
      ]);
      const meta = JSON.parse(metaRaw) as { contentType?: string };
      return { data, contentType: meta.contentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const filePath = path.join(STORAGE_ROOT, key);
    if (!filePath.startsWith(STORAGE_ROOT)) return;
    await fs.rm(filePath, { force: true });
    await fs.rm(`${filePath}.meta`, { force: true });
  }

  urlFor(key: string) {
    return appUrlFor(key);
  }

  async presignPut() {
    return null;
  }

  async presignGet() {
    return null;
  }
}

class S3Storage implements StorageProvider {
  readonly name = "s3";
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      // Path-style addressing is required by most S3-compatible stores
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async put(opts: { data: Buffer; filename: string; contentType: string; prefix?: string }) {
    const key = makeKey(opts.prefix, opts.filename);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: opts.data, ContentType: opts.contentType })
    );
    return { key };
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      const data = Buffer.from(await res.Body.transformToByteArray());
      return { data, contentType: res.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  urlFor(key: string) {
    return appUrlFor(key);
  }

  async presignPut(opts: { filename: string; contentType: string; prefix?: string }) {
    const key = makeKey(opts.prefix, opts.filename);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }),
      { expiresIn: 60 * 60 }
    );
    return { url, key };
  }

  async presignGet(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: 60 * 60,
    });
  }
}

let cached: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (!cached) {
    const s3Configured =
      process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;
    cached = s3Configured ? new S3Storage() : new LocalDiskStorage();
  }
  return cached;
}
