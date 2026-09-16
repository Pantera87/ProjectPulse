"use client";

import { useRouter } from "next/navigation";

export default function MarkAllRead() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        const res = await fetch("/api/updates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ids:
              (
                await fetch("/api/updates?unreadOnly=1&limit=500")
                  .then((r) => r.json())
                  .catch(() => ({ updates: [] }))
              ).updates.map((u: { id: number }) => u.id),
            read: true,
          }),
        });
        if (res.ok) router.refresh();
      }}
      className="btn-ghost px-3 py-1 text-xs"
    >
      Mark all read
    </button>
  );
}
