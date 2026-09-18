"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side "Delete screenshot" button for the repo detail page: removes
 * the stored GitHub repository screenshot. A fresh one is captured
 * automatically on the next check (missing file → backfill).
 */
export default function ScreenshotDeleteButton({ sourceId }: { sourceId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function del() {
    if (!confirm("Delete the stored repository screenshot?")) return;
    setBusy(true);
    try {
      await fetch(`/api/sources/${sourceId}/screenshot?repo=1`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="btn-ghost px-2.5 py-1 text-xs !border-red-500/40 !text-red-300 hover:!bg-red-500/15"
      title="Delete the stored repository screenshot"
    >
      {busy ? "Deleting…" : "Delete screenshot"}
    </button>
  );
}