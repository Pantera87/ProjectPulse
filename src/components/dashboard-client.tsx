"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { SourceRow } from "@/lib/db";
import ClearUpdates from "./clear-updates";
import RefreshAll from "./refresh-all";
import Time from "./time";
import SourceCard from "./source-card";
import CategoryIcon from "./category-icon";
import { Glyph } from "./icons";

export interface LatestUpdate {
  id: number;
  priority: string;
  kind: string;
  title: string;
  summary: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
  source_name: string | null;
  source_type: string;
}

export interface Counts {
  critical: number;
  high: number;
  normal: number;
  total: number;
}

export type DashboardSource = SourceRow & { unread: number; muted: boolean };

interface Props {
  initialCounts: Counts;
  initialCategoryUnread: Record<string, number>;
  initialLatest: LatestUpdate[];
  sources: DashboardSource[];
}

type SortMode = "category" | "name" | "type" | "unread";

const catOf = (s: DashboardSource) => s.category ?? "uncategorized";
const byName = (a: DashboardSource, b: DashboardSource) =>
  (a.name ?? a.url).localeCompare(b.name ?? b.url);
const sumUnread = (items: DashboardSource[]) => items.reduce((n, s) => n + s.unread, 0);

const TILE_STYLES: Record<string, string> = {
  critical: "border-rose-500/40",
  high: "border-amber-400/40",
  normal: "",
  total: "border-violet-400/40",
};

const TILE_GLYPH: Record<string, string> = {
  critical: "alert",
  high: "flame",
  normal: "check",
  total: "inbox",
};

const ROW_STYLES: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 shadow-[0_0_22px_-8px_rgba(244,63,94,0.5)]",
  high: "border-amber-400/40 bg-amber-400/10",
  normal: "border-white/10 bg-white/5",
};

const delay = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

const chipCls = (active: boolean) => `chip ${active ? "chip-active" : ""}`;

export function PriorityDot({ priority }: { priority: string }) {
  const color =
    priority === "critical"
      ? "bg-rose-500 shadow-[0_0_8px_1px_rgba(244,63,94,0.6)]"
      : priority === "high"
        ? "bg-amber-400 shadow-[0_0_8px_1px_rgba(251,191,36,0.5)]"
        : "bg-slate-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function DashboardClient({
  initialCounts,
  initialCategoryUnread,
  initialLatest,
  sources,
}: Props) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [categoryUnread, setCategoryUnread] = useState<Record<string, number>>(
    initialCategoryUnread
  );
  const [latest, setLatest] = useState<LatestUpdate[]>(initialLatest);
  const [sort, setSort] = useState<SortMode>("category");
  const [grouped, setGrouped] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [density, setDensityState] = useState<"comfortable" | "compact">("compact");
  const [flashKey, setFlashKey] = useState(0);
  const prevTotal = useRef(initialCounts.total);

  // Density default is compact; a previously picked mode is restored from
  // localStorage after mount to avoid a hydration mismatch.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("pp-dashboard-density");
    } catch {
      // ignore
    }
    if (saved === "comfortable" || saved === "compact") {
      const chosen = saved;
      queueMicrotask(() => setDensityState(chosen));
    }
  }, []);
  const setDensity = (d: "comfortable" | "compact") => {
    setDensityState(d);
    try {
      window.localStorage.setItem("pp-dashboard-density", d);
    } catch {
      // ignore
    }
  };

  // Live poll: refresh unread counts + recent feed every 30 s, flash when
  // the total unread changes.
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      const j = (await r.json()) as {
        counts: Counts;
        categoryUnread: Record<string, number>;
        latest: LatestUpdate[];
      };
      setCounts(j.counts);
      setCategoryUnread(j.categoryUnread);
      setLatest(j.latest);
      if (j.counts.total !== prevTotal.current) setFlashKey((k) => k + 1);
      prevTotal.current = j.counts.total;
    } catch {
      // server momentarily unavailable — keep showing stale data
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const categories = useMemo(() => {
    const m = new Map<string, DashboardSource[]>();
    for (const s of sources) {
      const c = catOf(s);
      const list = m.get(c);
      if (list) list.push(s);
      else m.set(c, [s]);
    }
    return m;
  }, [sources]);

  const catList = useMemo(
    () => [...categories.keys()].sort((a, b) => a.localeCompare(b)),
    [categories]
  );

  const visible = useMemo(() => {
    const list = filter ? sources.filter((s) => catOf(s) === filter) : [...sources];
    switch (sort) {
      case "name":
        list.sort(byName);
        break;
      case "type":
        list.sort((a, b) => a.type.localeCompare(b.type) || byName(a, b));
        break;
      case "unread":
        list.sort((a, b) => b.unread - a.unread || byName(a, b));
        break;
      default:
        break;
    }
    return list;
  }, [sources, sort, filter]);

  const groupedRows = useMemo(() => {
    const rows = catList
      .filter((c) => !filter || c === filter)
      .map((c) => ({
        cat: c,
        items: (categories.get(c) ?? []).slice().sort(byName),
      }));
    if (sort === "unread") {
      rows.sort(
        (a, b) => sumUnread(b.items) - sumUnread(a.items) || a.cat.localeCompare(b.cat)
      );
    }
    return rows;
  }, [catList, categories, filter, sort]);

  const stats: [keyof Counts, string, number][] = [
    ["critical", "Critical", counts.critical],
    ["high", "High", counts.high],
    ["normal", "Normal", counts.normal],
    ["total", "Unread total", counts.total],
  ];

  const compact = density === "compact";
  const gridCls = compact
    ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 min-[2560px]:grid-cols-4 min-[3200px]:grid-cols-5"
    : "grid gap-3";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] min-[2560px]:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-6">
        {/* Unread counters */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([key, label, value], i) => (
          <Link
            key={key}
            href={key === "total" ? "/updates" : `/updates?priority=${key}`}
            className={`glass glass-hover glass-tile glass-shine rise p-4 ${TILE_STYLES[key]}`}
            style={delay(i * 60)}
          >
            <div
              key={key === "total" ? `flash-${flashKey}` : undefined}
              className={`grad-text text-3xl font-semibold ${
                key === "total" && flashKey > 0 ? "count-flash" : ""
              }`}
            >
              {value}
            </div>
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-400">
              <Glyph name={TILE_GLYPH[key] ?? "star"} className="h-3.5 w-3.5" />
              {label}
            </div>
          </Link>
        ))}
      </div>

      {/* Projects with category controls */}
      <section className="glass-strong rise space-y-4 p-4" style={delay(300)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Glyph name="grid" className="h-5 w-5 text-violet-300" />
            Projects
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <button onClick={() => setGrouped(true)} className={chipCls(grouped)}>
                grouped
              </button>
              <button onClick={() => setGrouped(false)} className={chipCls(!grouped)}>
                flat
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDensity("comfortable")}
                className={chipCls(density === "comfortable")}
                title="Full cards, single column"
              >
                comfortable
              </button>
              <button
                onClick={() => setDensity("compact")}
                className={chipCls(density === "compact")}
                title="Dense cards in a grid"
              >
                compact
              </button>
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="input-glass px-2 py-1 text-sm"
              title="Sort projects"
            >
              <option value="category">sort: category</option>
              <option value="name">sort: name</option>
              <option value="type">sort: type</option>
              <option value="unread">sort: unread</option>
            </select>
            <RefreshAll compact onDone={load} />
          </div>
        </div>

        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setFilter(null)} className={chipCls(!filter)}>
              <Glyph name="grid" className="mr-1.5 h-3 w-3" />
              all ({sources.length})
            </button>
            {catList.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(filter === c ? null : c)}
                className={chipCls(filter === c)}
              >
                <CategoryIcon category={c} size="sm" />
                <span className="ml-1.5">{c}</span>
                <span className="ml-1 opacity-70">({categories.get(c)?.length ?? 0})</span>
                {(categoryUnread[c] ?? 0) > 0 && (
                  <span className="ml-1 text-rose-300">· {categoryUnread[c]}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {sources.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing tracked yet — add projects under Websites, GitHub or Feeds.
          </p>
        ) : grouped ? (
          groupedRows.length === 0 ? (
            <p className="text-sm text-slate-500">No projects match this filter.</p>
          ) : (
            <div className="space-y-4">
              {groupedRows.map(({ cat, items }) => (
                <div
                  key={cat}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <button
                    onClick={() => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
                    title={collapsed[cat] ? "Expand" : "Collapse"}
                  >
                    <span
                      className={`text-slate-500 transition-transform ${
                        collapsed[cat] ? "" : "rotate-90"
                      }`}
                    >
                      ▸
                    </span>
                    <CategoryIcon category={cat} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {cat}
                    </span>
                    <span className="text-xs text-slate-600">({items.length})</span>
                    {(categoryUnread[cat] ?? 0) > 0 && (
                      <span className="badge border-rose-400/40 bg-rose-500/10 text-rose-300">
                        {categoryUnread[cat]} unread
                      </span>
                    )}
                  </button>
                  {!collapsed[cat] && (
                    <div className={`mt-2 ${gridCls}`}>
                      {items.map((s, i) => (
                        <div key={s.id} className="rise h-full" style={delay(i * 35)}>
                          <SourceCard source={s} muted={s.muted} compact={compact} unread={s.unread} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className={gridCls}>
            {visible.map((s, i) => (
              <div key={s.id} className="rise h-full" style={delay(i * 35)}>
                <SourceCard source={s} muted={s.muted} compact={compact} unread={s.unread} />
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* Recent updates sidebar */}
      <aside
        className="glass-strong rise space-y-3 p-4 lg:sticky lg:top-20"
        style={delay(240)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Glyph name="bell" className="h-5 w-5 text-violet-300" />
            Recent updates
          </h2>
          <div className="flex items-center gap-2">
            <ClearUpdates
              onCleared={() => {
                setLatest([]);
                setCounts({ critical: 0, high: 0, normal: 0, total: 0 });
                setCategoryUnread({});
                prevTotal.current = 0;
              }}
            />
            <Link href="/updates" className="text-sm text-indigo-300 hover:underline">
              View all →
            </Link>
          </div>
        </div>
        {latest.length === 0 ? (
          <p className="text-sm text-slate-500">
            No updates yet. Add a website, GitHub repo or feed and run “Check now”.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {latest.map((u, i) => (
              <li
                key={u.id}
                className={`rise rounded-xl border backdrop-blur-md ${
                  ROW_STYLES[u.priority] ?? ROW_STYLES.normal
                } ${u.read_at ? "opacity-60" : ""}`}
                style={delay(300 + i * 40)}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <PriorityDot priority={u.priority} />
                  <Link
                    href={`/updates/${u.id}`}
                    className="glass-hover min-w-0 flex-1 rounded-lg px-1 py-0.5 transition"
                  >
                    <span className="block truncate text-sm font-medium" title={u.title}>
                      {u.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {u.source_type} · {u.source_name} · <Time iso={u.created_at} />
                    </span>
                  </Link>
                  {u.url && (
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded px-1 text-indigo-300 hover:underline"
                      title={`Open ${u.source_name ?? "source"} ↗`}
                    >
                      ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}