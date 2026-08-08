"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-secondary btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/notifications/mark-read", { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Mark all read
    </button>
  );
}
