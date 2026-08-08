"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, FormMessage, useAuthSubmit } from "@/components/auth/AuthForm";

export default function ForgotPasswordPage() {
  const { submit, error, message, loading } = useAuthSubmit("/api/auth/forgot");
  const [email, setEmail] = useState("");

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
      <p className="text-sm text-ink-mid mt-1 mb-6">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ email });
        }}
      >
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            className="input"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <FormError error={error} />
        <FormMessage message={message} />
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-sm text-ink-mid mt-6 text-center">
        <Link href="/signin" className="text-accent-hi font-semibold hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
