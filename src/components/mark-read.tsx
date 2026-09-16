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
      className="btn-ghost px-2 py-0.5 text-xs"
    >
      {isRead ? "Mark unread" : "Mark read"}
    </button>
  );
}
