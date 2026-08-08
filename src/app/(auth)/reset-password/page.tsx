"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FormError, useAuthSubmit } from "@/components/auth/AuthForm";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { submit, error, loading } = useAuthSubmit("/api/auth/reset");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">This reset link is invalid.</p>
        <Link href="/forgot-password" className="btn btn-secondary mt-4">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold text-good">Password updated.</p>
        <p className="text-sm text-ink-mid mt-1">Sign in with your new password.</p>
        <Link href="/signin" className="btn btn-primary mt-4 w-full">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
      <form
        className="space-y-4 mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ token, password }).then((ok) => ok && setDone(true));
        }}
      >
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <FormError error={error} />
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
