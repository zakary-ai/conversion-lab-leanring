"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, useAuthSubmit } from "@/components/auth/AuthForm";

export default function SignUpPage() {
  const { submit, error, loading } = useAuthSubmit("/api/auth/signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight">Join the academy</h1>
      <p className="text-sm text-ink-mid mt-1 mb-6">
        Start at 0 Stars. Train, pass assessments, and unlock everything.
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit({ name, email, password });
        }}
      >
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input
            id="name"
            required
            autoComplete="name"
            className="input"
            placeholder="Alex Carter"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <FormError error={error} />
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-ink-mid mt-6 text-center">
        Already a member?{" "}
        <Link href="/signin" className="text-accent-hi font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
