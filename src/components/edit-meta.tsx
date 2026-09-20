"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AiBadge from "./ai-badge";

interface Props {
  sourceId: number;
  initial: {
    name: string | null;
    goal: string | null;
    goal_source: string | null;
    category: string | null;
    category_source: string | null;
    subcategory: string | null;
    subcategory_source: string | null;
    notes: string | null;
  };
}

const cls = "input-glass w-full";

/** Measure a string in the input's own font (canvas, computed style). */
let measureCanvas: HTMLCanvasElement | null = null;
function measureTextWidth(el: HTMLInputElement, text: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  const cs = window.getComputedStyle(el);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Input whose "AI" badge floats INSIDE the box at the top-right corner of the
 * typed text — right past the last character, following the text as it grows
 * (and clamped so it never leaves the box).
 */
function AiInput({
  value,
  onChange,
  ai,
  badgeTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  ai: boolean;
  badgeTitle: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !ai) {
      setLeft(0);
      return;
    }
    // padding-left of .input-glass is 0.75rem (12px).
    const x = 12 + measureTextWidth(el, value) + 3;
    setLeft(Math.min(x, Math.max(12, el.clientWidth - 32)));
  }, [value, ai]);
  return (
    <span className="relative block">
      <input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      {ai && (
        <span className="absolute top-1 z-10" style={{ left }}>
          <AiBadge title={badgeTitle} small />
        </span>
      )}
    </span>
  );
}

export default function EditMeta({ sourceId, initial }: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [goal, setGoal] = useState(initial.goal ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  const [subcategory, setSubcategory] = useState(initial.subcategory ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  // The "AI" badge shows while a field still holds the AI-generated value.
  // As soon as the user types something different the badge disappears
  // (and once saved, the server marks that field user-set, so it stays off).
  const goalAi =
    initial.goal_source === "ai" && goal === (initial.goal ?? "");
  const categoryAi =
    initial.category_source === "ai" && category === (initial.category ?? "");
  const subcategoryAi =
    initial.subcategory_source === "ai" && subcategory === (initial.subcategory ?? "");

  // `initial` gets a fresh value whenever the server re-renders this page
  // (e.g. `router.refresh()` after "Check now" — the AI just filled the
  // goal/category/subcategory). Adopt the new server value for every field
  // the user has NOT typed into, so populated fields appear without a page
  // reload while local edits are never clobbered.
  const prevInitial = useRef(initial);
  useEffect(() => {
    const prev = prevInitial.current;
    if (prev !== initial) {
      if (prev.name !== initial.name)
        setName((cur) => (cur === (prev.name ?? "") ? (initial.name ?? "") : cur));
      if (prev.goal !== initial.goal)
        setGoal((cur) => (cur === (prev.goal ?? "") ? (initial.goal ?? "") : cur));
      if (prev.category !== initial.category)
        setCategory((cur) => (cur === (prev.category ?? "") ? (initial.category ?? "") : cur));
      if (prev.subcategory !== initial.subcategory)
        setSubcategory((cur) => (cur === (prev.subcategory ?? "") ? (initial.subcategory ?? "") : cur));
      if (prev.notes !== initial.notes)
        setNotes((cur) => (cur === (prev.notes ?? "") ? (initial.notes ?? "") : cur));
    }
    prevInitial.current = initial;
  }, [initial]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    // Send only the fields the user actually changed — the server marks each
    // changed field user-set (clearing its "AI" badge), so untouched fields
    // keep their AI attribution.
    const payload: Record<string, unknown> = {};
    if (name !== (initial.name ?? "")) payload.name = name;
    if (goal !== (initial.goal ?? "")) payload.goal = goal;
    if (category !== (initial.category ?? "")) payload.category = category;
    if (subcategory !== (initial.subcategory ?? ""))
      payload.subcategory = subcategory;
    if (notes !== (initial.notes ?? "")) payload.notes = notes;
    await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
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
        <AiInput
          value={category}
          onChange={setCategory}
          ai={categoryAi}
          badgeTitle="Category assigned by AI — edit it to override"
        />
      </label>
      <label className="text-xs text-slate-400">
        Subcategory (specific, e.g. cnc-controller-firmware)
        <AiInput
          value={subcategory}
          onChange={setSubcategory}
          ai={subcategoryAi}
          badgeTitle="Subcategory assigned by AI — edit it to override"
        />
      </label>
      <label className="text-xs text-slate-400 sm:col-span-2">
        Goal (one line — auto-extracted, editable)
        <AiInput
          value={goal}
          onChange={setGoal}
          ai={goalAi}
          badgeTitle="Goal extracted by AI — edit it to override"
        />
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
