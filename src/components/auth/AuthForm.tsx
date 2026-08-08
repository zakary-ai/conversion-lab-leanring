"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shared submit logic for auth forms: POST JSON, show error, follow redirect. */
export function useAuthSubmit(endpoint: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(payload: Record<string, unknown>, fallbackRedirect?: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return false;
      }
      if (data.message) setMessage(data.message);
      const target = data.redirect ?? fallbackRedirect;
      if (target) {
        router.push(target);
        router.refresh();
      }
      return true;
    } finally {
      setLoading(false);
    }
  }

  return { submit, error, message, loading, setError };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-sm text-bad bg-bad/10 border border-bad/25 rounded-lg px-3 py-2 animate-fade">
      {error}
    </p>
  );
}

export function FormMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-good bg-good/10 border border-good/25 rounded-lg px-3 py-2 animate-fade">
      {message}
    </p>
  );
}
