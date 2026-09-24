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
import KpiCard from "./dashboard/kpi-card";
import AreaChart from "./dashboard/area-chart";
import BarChart, { VerticalBars } from "./dashboard/bar-chart";
import { SatisfactionGauge, RingGauge } from "./dashboard/gauges";
import { repoDisplayName } from "@/lib/format";
import type { DashboardAggregates } from "@/lib/dashboard-aggregates";
import { Glyph, KIND_ICON } from "./icons";
import EmptyPulse from "./empty-pulse";

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

/** Newest update per source (title row on compact cards). */
export interface LatestBySource {
  id: number;
  kind: string;
  priority: string;
  title: string;
  created_at: string;
}

interface Props {
  initialCounts: Counts;
  initialCategoryUnread: Record<string, number>;
  initialLatest: LatestUpdate[];
  initialLatestBySource: Record<number, LatestBySource>;
  initialActivity: Record<number, number[]>;
  initialAttention: LatestUpdate[];
  initialAggregates: DashboardAggregates;
  /** AI-picked glyph per category (categories table) — optional, old UIs pass none. */
  categoryIcons?: Record<string, string>;
  sources: DashboardSource[];
}

type SortMode = "category" | "name" | "type" | "unread";
type DensityMode = "comfortable" | "compact" | "minimal";

const catOf = (s: DashboardSource) => s.category ?? "uncategorized";
const byName = (a: DashboardSource, b: DashboardSource) =>
  (a.name ?? a.url).localeCompare(b.name ?? b.url);
const sumUnread = (items: DashboardSource[]) => items.reduce((n, s) => n + s.unread, 0);

// Short weekday names for the 7-day activity chart (UTC, hydration-safe).
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabels = (): string[] => {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date();
    dt.setUTCDate(dt.getUTCDate() - i);
    out.push(WEEKDAYS[dt.getUTCDay()]);
  }
  return out;
};

const ROW_STYLES: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 shadow-[0_0_22px_-8px_rgba(244,63,94,0.5)]",
  high: "border-amber-400/40 bg-amber-400/10",
  normal: "border-white/10 bg-white/5",
};

// Gradient edge on the left of a recent-update row, per priority.
const ROW_EDGE: Record<string, string> = {
  critical: "bg-gradient-to-b from-rose-500 to-rose-400",
  high: "bg-gradient-to-b from-amber-400 to-orange-400",
  normal: "bg-gradient-to-b from-slate-500 to-slate-600",
};

const TYPE_GLYPH: Record<string, string> = {
  website: "globe",
  github: "github",
  rss: "rss",
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
  initialLatestBySource,
  initialActivity,
  initialAttention,
  initialAggregates,
  categoryIcons = {},
  sources,
}: Props) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [categoryUnread, setCategoryUnread] = useState<Record<string, number>>(
    initialCategoryUnread
  );
  const [latest, setLatest] = useState<LatestUpdate[]>(initialLatest);
  const [latestBySource, setLatestBySource] = useState<Record<number, LatestBySource>>(
    initialLatestBySource
  );
  const [attention, setAttention] = useState<LatestUpdate[]>(initialAttention);
  const [activity, setActivity] = useState<Record<number, number[]>>(initialActivity);
  const [aggregates, setAggregates] = useState<DashboardAggregates>(initialAggregates);
  const [sort, setSort] = useState<SortMode>("category");
  const [grouped, setGrouped] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  // All categories start expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [density, setDensityState] = useState<DensityMode>("compact");
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
    if (saved === "comfortable" || saved === "compact" || saved === "minimal") {
      const chosen = saved;
      queueMicrotask(() => setDensityState(chosen));
    }
  }, []);
  const setDensity = (d: DensityMode) => {
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
        latestBySource: Record<number, LatestBySource>;
        activityBySource: Record<number, number[]>;
        attention: LatestUpdate[];
        aggregates?: DashboardAggregates;
      };
      setCounts(j.counts);
      setCategoryUnread(j.categoryUnread);
      setLatest(j.latest);
      setLatestBySource(j.latestBySource ?? {});
      setActivity(j.activityBySource ?? {});
      setAttention(j.attention ?? []);
      if (j.aggregates) setAggregates(j.aggregates);
      if (j.counts.total !== prevTotal.current) setFlashKey((k) => k + 1);
      prevTotal.current = j.counts.total;
    } catch {
      // server momentarily unavailable — keep showing stale data
    }
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      if (document.hidden) return; // no hidden-tab polling (visibilitychange reloads)
      load();
    }, 30_000);
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

  // Widget-row derivations: unread-by-category bars (top 6) + gauge fractions.
  const barItems = useMemo(
    () =>
      Object.entries(categoryUnread)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value })),
    [categoryUnread]
  );
  const labels = useMemo(() => dayLabels(), []);
  const readFraction =
    aggregates.totalUpdates > 0 ? aggregates.readUpdates / aggregates.totalUpdates : 0;
  const weekFraction =
    aggregates.sourcesTotal > 0
      ? aggregates.sourcesUpdatedThisWeek / aggregates.sourcesTotal
      : 0;
  const weekDelta = aggregates.updatesThisWeek - aggregates.updatesPrevWeek;

  const compact = density === "compact" || density === "minimal";
  const gridCls = compact
    ? "grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 min-[2560px]:grid-cols-4 min-[3200px]:grid-cols-5"
    : "grid gap-3";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] min-[2560px]:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-6">
        {/* Unread counters */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiCard
            label="Unread total"
            value={counts.total}
            glyph="inbox"
            href="/updates"
            flashTick={flashKey}
          />
          <KpiCard
            label="Critical"
            value={counts.critical}
            glyph="alert"
            href="/updates?priority=critical"
            delayMs={60}
          />
          <KpiCard
            label="High"
            value={counts.high}
            glyph="flame"
            href="/updates?priority=high"
            delayMs={120}
          />
          <KpiCard
            label="Normal"
            value={counts.normal}
            glyph="check"
            href="/updates?priority=normal"
            delayMs={180}
          />
        </div>

      {/* Unread critical/high updates — triage strip above the project grid */}
      {attention.length > 0 && (
        <section
          className="glass-strong rise relative flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
          style={delay(150)}
        >
          <span
            className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-amber-400 to-rose-500"
            aria-hidden="true"
          />
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-amber-300">
            <Glyph name="flame" className="h-4 w-4" />
            Needs attention
            <span className="badge border-rose-400/40 bg-rose-500/10 text-rose-300">
              {attention.length}
            </span>
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {attention.map((u) => (
              <Link
                key={u.id}
                href={`/updates/${u.id}`}
                className={`group flex max-w-64 items-center gap-1.5 rounded-full border py-1 pl-2 pr-2.5 text-xs transition hover:bg-white/10 ${
                  u.priority === "critical"
                    ? "border-rose-400/40 bg-rose-500/10"
                    : "border-amber-400/40 bg-amber-400/10"
                }`}
                title={`${u.title} (${repoDisplayName(u.source_type, u.source_name) ?? u.source_type})`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    u.priority === "critical"
                      ? "animate-pulse bg-rose-400"
                      : "bg-amber-400"
                  }`}
                />
                <Glyph
                  name={KIND_ICON[u.kind] ?? "layers"}
                  className="h-3 w-3 shrink-0 text-slate-400"
                />
                <span className="truncate text-slate-300 transition group-hover:text-white">
                  {u.title}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/updates?priority=high"
            className="shrink-0 text-xs text-indigo-300 hover:underline"
          >
            view all →
          </Link>
        </section>
      )}

      {/* Widget row: welcome hero + read-rate gauge + weekly-activity ring */}
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="glass-strong glass-shine rise relative overflow-hidden p-4" style={delay(220)}>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(30rem 22rem at 88% 38%, rgba(59,130,246,0.5) 0%, rgba(99,102,241,0.22) 48%, transparent 72%), radial-gradient(20rem 16rem at 72% 92%, rgba(16,185,129,0.18) 0%, transparent 68%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Welcome back
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
              ProjectPulse
            </h2>
            <p className="mt-2 max-w-[60%] text-sm leading-relaxed text-slate-400">
              {counts.total} unread update
              {counts.total === 1 ? "" : "s"} — {aggregates.updatesThisWeek} new from{" "}
              {aggregates.sourcesUpdatedThisWeek} of {aggregates.sourcesTotal} tracked source
              {aggregates.sourcesTotal === 1 ? "" : "s"} this week.
            </p>
            <div className="mt-4 grid w-full max-w-xs grid-cols-3 gap-2">
              <div className="stat-box rounded-xl border border-white/10 px-3 py-2">
                <div className="text-lg font-semibold text-white">{counts.total}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Unread</div>
              </div>
              <div className="stat-box rounded-xl border border-white/10 px-3 py-2">
                <div className="text-lg font-semibold text-[#35d28a]">
                  {aggregates.updatesThisWeek}
                </div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">This week</div>
              </div>
              <div className="stat-box rounded-xl border border-white/10 px-3 py-2">
                <div className="text-lg font-semibold text-white">{aggregates.sourcesTotal}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Sources</div>
              </div>
            </div>
          </div>
        </div>

        {/* Read rate — the demo's "Satisfaction Rate" card, as-is */}
        <div
          className="glass-strong rise flex flex-col"
          style={{
            ...delay(280),
            padding: 22,
            borderRadius: 20,
            background:
              "linear-gradient(127.09deg, rgba(6, 11, 40, 0.94) 19.41%, rgba(10, 14, 35, 0.49) 76.65%)",
          }}
        >
          <h2 className="text-lg font-bold text-white">Read rate</h2>
          <p className="text-sm text-[#a0aec0]">of all stored updates</p>
          <div className="mt-4 flex flex-1 flex-col items-center justify-center">
            <SatisfactionGauge
              fraction={readFraction}
              value={`${Math.round(readFraction * 100)}%`}
              caption={`${aggregates.readUpdates} of ${aggregates.totalUpdates} read`}
            />
          </div>
        </div>

        {/* This week — the demo's "Referral Tracking" card, as-is */}
        <div
          className="glass-strong rise flex flex-col"
          style={{
            ...delay(340),
            padding: 22,
            borderRadius: 20,
            background:
              "linear-gradient(126.97deg, rgba(6, 11, 40, 0.74) 28.26%, rgba(10, 14, 35, 0.71) 91.2%)",
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">This week</h2>
            <span className="flex gap-1 text-slate-500" aria-hidden="true">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
          </div>
          <div className="mt-4 flex flex-1 items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div>
                <div className="text-sm text-[#a0aec0]">Updates</div>
                <div className="text-lg font-bold text-white">
                  {aggregates.updatesThisWeek}
                </div>
              </div>
              <div>
                <div className="text-sm text-[#a0aec0]">Active sources</div>
                <div className="text-lg font-bold text-white">
                  {aggregates.sourcesUpdatedThisWeek}
                  <span className="font-medium text-[#a0aec0]">
                    {" "}
                    / {aggregates.sourcesTotal}
                  </span>
                </div>
              </div>
            </div>
            <RingGauge
              fraction={weekFraction}
              value={(weekFraction * 10).toFixed(1)}
              top="Pulse"
              bottom="Sources active"
              size="min(200px, 55%)"
            />
          </div>
        </div>
      </div>

      {/* Chart row: activity area chart with week delta + bars / unread by category */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass-strong rise p-4" style={delay(400)}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Glyph name="trending" className="section-accent h-4 w-4" />
              Activity overview
            </h2>
            <span
              className={`text-xs font-medium ${
                weekDelta >= 0 ? "text-[#35d28a]" : "text-[#ee5d50]"
              }`}
            >
              {weekDelta === 0
                ? "no change vs last week"
                : `(${weekDelta > 0 ? "+" : ""}${weekDelta}) ${
                    weekDelta > 0 ? "more" : "fewer"
                  } than last week`}
            </span>
          </div>
          <AreaChart data={aggregates.activityTotalByDay} labels={labels} />
        </div>
        <div className="glass-strong rise flex flex-col p-4" style={delay(460)}>
          <div className="stat-box rounded-[20px] p-3">
            <VerticalBars data={aggregates.activityTotalByDay} labels={labels} />
          </div>
          <h3 className="mb-3 mt-4 self-start text-xs font-semibold uppercase tracking-wider text-slate-400">
            Unread by category
          </h3>
          <div className="flex-1">
            <BarChart items={barItems} />
          </div>
        </div>
      </div>

      {/* Projects with category controls */}
      <section className="glass-strong rise space-y-4 p-4" style={delay(300)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Glyph name="grid" className="section-accent h-5 w-5" />
            Projects
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" title="Layout">
              <button
                onClick={() => setGrouped(true)}
                className={chipCls(grouped)}
                title="Group by category"
              >
                <Glyph name="grid" className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setGrouped(false)}
                className={chipCls(!grouped)}
                title="Flat list"
              >
                <Glyph name="rows" className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1" title="Card density">
              <button
                onClick={() => setDensity("comfortable")}
                className={chipCls(density === "comfortable")}
                title="Full cards, single column"
              >
                <Glyph name="inbox" className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDensity("compact")}
                className={chipCls(density === "compact")}
                title="Dense cards in a grid"
              >
                <Glyph name="rows" className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDensity("minimal")}
                className={chipCls(density === "minimal")}
                title="Minimal: name + status only"
              >
                <Glyph name="list" className="h-3.5 w-3.5" />
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
                title={`${categories.get(c)?.length ?? 0} projects`}
              >
                <CategoryIcon category={c} size="sm" icon={categoryIcons[c] ?? null} />
                <span className="ml-1.5">{c}</span>
                {(categoryUnread[c] ?? 0) > 0 && (
                  <span className="ml-1 flex items-center gap-1 text-rose-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    {categoryUnread[c]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {sources.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <EmptyPulse className="h-28 w-28" />
            <p className="text-sm text-slate-500">
              Nothing tracked yet — add projects under Websites, GitHub or Feeds.
            </p>
          </div>
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
                    <CategoryIcon category={cat} icon={categoryIcons[cat] ?? null} />
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
                          <SourceCard
                            source={s}
                            muted={s.muted}
                            density={density}
                            unread={s.unread}
                            latest={latestBySource[s.id] ?? null}
                            activity={activity[s.id] ?? null}
                            categoryIcon={categoryIcons[s.category ?? "uncategorized"] ?? null}
                          />
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
                <SourceCard
                  source={s}
                  muted={s.muted}
                  density={density}
                  unread={s.unread}
                  latest={latestBySource[s.id] ?? null}
                  activity={activity[s.id] ?? null}
                  categoryIcon={categoryIcons[s.category ?? "uncategorized"] ?? null}
                />
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
            <Glyph name="bell" className="section-accent h-5 w-5" />
            Recent updates
          </h2>
          <div className="flex items-center gap-2">
            <ClearUpdates
              onCleared={() => {
                setLatest([]);
                setLatestBySource({});
                setActivity({});
                setAttention([]);
                setCounts({ critical: 0, high: 0, normal: 0, total: 0 });
                setCategoryUnread({});
                setAggregates((a) => ({
                  ...a,
                  totalUpdates: 0,
                  readUpdates: 0,
                  updatesThisWeek: 0,
                  updatesPrevWeek: 0,
                  activityTotalByDay: [0, 0, 0, 0, 0, 0, 0],
                }));
                prevTotal.current = 0;
              }}
            />
            <Link href="/updates" className="text-sm text-indigo-300 hover:underline">
              View all →
            </Link>
          </div>
        </div>
        {latest.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <EmptyPulse className="h-24 w-24" />
            <p className="text-sm text-slate-500">
              No updates yet. Add a website, GitHub repo or feed and run “Check now”.
            </p>
          </div>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {latest.map((u, i) => (
              <li
                key={u.id}
                className={`rise relative overflow-hidden rounded-xl border backdrop-blur-md ${
                  ROW_STYLES[u.priority] ?? ROW_STYLES.normal
                } ${u.read_at ? "opacity-60" : ""}`}
                style={delay(300 + i * 40)}
              >
                <span
                  className={`absolute inset-y-1.5 left-0 w-1 rounded-r-full ${
                    ROW_EDGE[u.priority] ?? ROW_EDGE.normal
                  }`}
                  aria-hidden="true"
                />
                <div className="flex items-center gap-2 py-2 pl-4 pr-3">
                  <PriorityDot priority={u.priority} />
                  <Link
                    href={`/updates/${u.id}`}
                    className="glass-hover min-w-0 flex-1 rounded-lg px-1 py-0.5 transition"
                  >
                    <span className="block truncate text-sm font-medium" title={u.title}>
                      {u.title}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Glyph
                        name={KIND_ICON[u.kind] ?? "layers"}
                        className="h-3 w-3 shrink-0"
                      />
                      <Glyph
                        name={TYPE_GLYPH[u.source_type] ?? "box"}
                        className="h-3 w-3 shrink-0"
                      />
                      <span className="truncate">
                        {repoDisplayName(u.source_type, u.source_name)}
                      </span>
                      <span className="shrink-0">·</span>
                      <Time iso={u.created_at} />
                    </span>
                  </Link>
                  {u.url && (
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded px-1 text-indigo-300 hover:underline"
                      title={`Open ${repoDisplayName(u.source_type, u.source_name) ?? "source"} ↗`}
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