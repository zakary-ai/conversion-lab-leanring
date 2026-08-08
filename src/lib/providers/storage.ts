import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Object storage provider abstraction for uploads (resumes, attachments,
 * thumbnails, video files). Large media never goes into the database — only
 * a storage key is persisted.
 *
 * Built-in providers:
 *  - LocalDiskStorage (default in development): files under ./storage,
 *    served by /api/files/[...key]
 *  - S3-compatible storage: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID,
 *    S3_SECRET_ACCESS_KEY and implement/enable S3Storage. The interface is
 *    already what an S3 client needs, so no LMS code changes are required.
 */

export interface StorageProvider {
  readonly name: string;
  put(opts: { data: Buffer; filename: string; contentType: string; prefix?: string }): Promise<{ key: string }>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL path the app serves this key from. */
  urlFor(key: string): string;
}

const STORAGE_ROOT = path.join(process.cwd(), "storage");

class LocalDiskStorage implements StorageProvider {
  readonly name = "local-disk";

  async put(opts: { data: Buffer; filename: string; contentType: string; prefix?: string }) {
    const safeName = opts.filename.replace(/[^\w.\-]/g, "_").slice(0, 80);
    const key = `${opts.prefix ?? "uploads"}/${crypto.randomBytes(8).toString("hex")}-${safeName}`;
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
    return `/api/files/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}

export function getStorageProvider(): StorageProvider {
  // S3 credentials present → an S3Storage implementation would be returned
  // here. Local disk is the development default.
  return new LocalDiskStorage();
}
