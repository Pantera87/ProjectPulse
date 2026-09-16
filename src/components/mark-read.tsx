"use client";

import { useRouter } from "next/navigation";

export default function MarkReadButton({
  id,
  isRead,
}: {
  id: number;
  isRead: boolean;
}) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch(`/api/updates/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ read: !isRead }),
        });
        router.refresh();
      }}
      className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
    >
      {isRead ? "Mark unread" : "Mark read"}
    </button>
  );
}
