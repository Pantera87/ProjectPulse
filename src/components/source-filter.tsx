"use client";

import { useRouter } from "next/navigation";

export default function SourceFilter({
  sources,
  current,
}: {
  sources: { id: number; name: string | null; url: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <select
      defaultValue={current}
      onChange={(e) => {
        const url = new URL(window.location.href);
        if (e.target.value) url.searchParams.set("source_id", e.target.value);
        else url.searchParams.delete("source_id");
        router.push(url.toString());
      }}
      className="input-glass px-2 py-1 text-sm"
    >
      <option value="">all sources</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name || s.url}
        </option>
      ))}
    </select>
  );
}