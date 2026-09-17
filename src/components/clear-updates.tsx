"use client";

import { useRouter } from "next/navigation";

/**
 * Destructive bulk clear of updates (DELETE /api/updates). Guards with a
 * confirm dialog; optional onCleared for local state resets, then refreshes
 * server components.
 */
export default function ClearUpdates({ onCleared }: { onCleared?: () => void }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!window.confirm("Delete ALL updates? This cannot be undone.")) return;
        const res = await fetch("/api/updates", { method: "DELETE" });
        if (res.ok) {
          onCleared?.();
          router.refresh();
        }
      }}
      className="btn-ghost px-3 py-1 text-xs text-rose-300"
    >
      Clear updates
    </button>
  );
}