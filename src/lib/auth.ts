import { cookies } from "next/headers";
import { cache } from "react";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { User, Role } from "@prisma/client";

const SESSION_COOKIE = "academy_session";
const SESSION_TTL_DAYS = 30;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
    cookieStore.delete(SESSION_COOKIE);
  }
}

/**
 * Resolve the currently authenticated user from the session cookie.
 * Cached per-request so layouts + pages can call it freely.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.status === "SUSPENDED") return null;
  // Touch last activity at most once a minute to avoid write amplification
  const now = new Date();
  if (!session.user.lastActiveAt || now.getTime() - session.user.lastActiveAt.getTime() > 60_000) {
    db.user
      .update({ where: { id: session.user.id }, data: { lastActiveAt: now } })
      .catch(() => {});
  }
  return session.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  return user;
}

const ROLE_ORDER: Record<Role, number> = {
  LEARNER: 0,
  EMPLOYER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export function roleAtLeast(role: Role, min: Role) {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}

export function isStaff(role: Role) {
  return roleAtLeast(role, "MODERATOR");
}

export function isAdmin(role: Role) {
  return roleAtLeast(role, "ADMIN");
}

export async function requireRole(min: Role): Promise<User> {
  const user = await requireUser();
  if (!roleAtLeast(user.role, min)) throw new AuthError("FORBIDDEN");
  return user;
}

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
  }
}
