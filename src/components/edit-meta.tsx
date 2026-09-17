"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sourceId: number;
  initial: {
    name: string | null;
    goal: string | null;
    category: string | null;
    subcategory: string | null;
    notes: string | null;
  };
}

const cls = "input-glass w-full";

export default function EditMeta({ sourceId, initial }: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [goal, setGoal] = useState(initial.goal ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [subcategory, setSubcategory] = useState(initial.subcategory ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, goal, category, subcategory, notes }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-slate-400">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={cls} />
      </label>
      <label className="text-xs text-slate-400">
        Category (generic domain, e.g. gpu, cnc)
        <input value={category} onChange={(e) => setCategory(e.target.value)} className={cls} />
      </label>
      <label className="text-xs text-slate-400">
        Subcategory (specific, e.g. cnc-controller-firmware)
        <input
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          className={cls}
        />
      </label>
      <label className="text-xs text-slate-400 sm:col-span-2">
        Goal (one line — auto-extracted, editable)
        <input value={goal} onChange={(e) => setGoal(e.target.value)} className={cls} />
      </label>
      <label className="text-xs text-slate-400 sm:col-span-2">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cls} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary px-4 py-1.5 text-sm">
          Save
        </button>
        {saved && <span className="text-xs text-emerald-400">Saved</span>}
      </div>
    </form>
  );
}
