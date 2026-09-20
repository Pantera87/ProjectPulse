"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side "Delete snapshots" button for the snapshot viewer: removes
 * every snapshot of a source (rows + archived assets).
 */
export default function SnapshotDeleteButton({ sourceId }: { sourceId: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function del() {
    if (
      !confirm(
        "Delete ALL stored snapshots of this project (stored pages and offline archives)?"
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/sources/${sourceId}/snapshots`, { method: "DELETE" });
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
      title="Delete all stored snapshots of this project"
    >
      {busy ? "Deleting…" : "Delete snapshots"}
    </button>
  );
}