"use client";

import Link from "next/link";
import { useState } from "react";
import { FormError, useAuthSubmit } from "@/components/auth/AuthForm";

export default function SignInPage() {
  const [mode, setMode] = useState<"email" | "code">("email");
  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <p className="text-sm text-ink-mid mt-1 mb-6">Sign in to continue your training.</p>
      {mode === "email" ? <EmailForm /> : <CodeForm />}
      <button
        type="button"
        className="text-sm text-accent-hi font-semibold hover:underline mt-4 block mx-auto"
        onClick={() => setMode(mode === "email" ? "code" : "email")}
      >
        {mode === "email" ? "Have an access code instead?" : "Sign in with email instead"}
      </button>
      <p className="text-sm text-ink-mid mt-4 text-center">
        New to the academy?{" "}
        <Link href="/signup" className="text-accent-hi font-semibold hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

function EmailForm() {
  const { submit, error, loading } = useAuthSubmit("/api/auth/signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ email, password });
      }}
    >
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
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Password</label>
          <Link href="/forgot-password" className="text-xs text-ink-mid hover:text-accent-hi mb-1.5">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function CodeForm() {
  const { submit, error, loading } = useAuthSubmit("/api/auth/access-code");
  const [code, setCode] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ code });
      }}
    >
      <div>
        <label className="label" htmlFor="access-code">Access code</label>
        <input
          id="access-code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="input tracking-widest uppercase"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <p className="text-xs text-ink-dim mt-1.5">
          Your admin gave you this code — dashes and capitalization don&apos;t matter.
        </p>
      </div>
      <FormError error={error} />
      <button className="btn btn-primary w-full" disabled={loading || !code.trim()}>
        {loading ? "Signing in…" : "Sign in with code"}
      </button>
    </form>
  );
}
