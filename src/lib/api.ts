import { NextResponse } from "next/server";
import { AuthError, getCurrentUser, roleAtLeast } from "./auth";
import type { Role, User } from "@prisma/client";
import { ZodError } from "zod";

/** Route-handler helpers: consistent auth guards + error responses. */

export function json(data: unknown, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function withAuth<T>(
  handler: (user: User) => Promise<T | NextResponse>
): Promise<NextResponse> {
  return run(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError(401, "Not authenticated");
    return handler(user);
  });
}

export async function withRole<T>(
  min: Role,
  handler: (user: User) => Promise<T | NextResponse>
): Promise<NextResponse> {
  return run(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError(401, "Not authenticated");
    if (!roleAtLeast(user.role, min)) return apiError(403, "Insufficient permissions");
    return handler(user);
  });
}

async function run<T>(fn: () => Promise<T | NextResponse>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return apiError(err.code === "UNAUTHENTICATED" ? 401 : 403, err.message);
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return apiError(400, first ? `${first.path.join(".")}: ${first.message}` : "Invalid input");
    }
    console.error("[api]", err);
    return apiError(500, "Something went wrong");
  }
}
