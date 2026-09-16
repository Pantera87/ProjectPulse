import { getDb } from "./db";
import type { SourceRow } from "./db";
import { checkSource, isDue } from "./check";

const g = globalThis as unknown as {
  __ppScheduler?: {
    started: boolean;
    running: boolean;
    lastTick: string | null;
    tickCount: number;
  };
};

function state() {
  return (g.__ppScheduler ??= {
    started: false,
    running: false,
    lastTick: null,
    tickCount: 0,
  });
}

export function schedulerStatus() {
  const s = state();
  return {
    running: s.started,
    busy: s.running,
    lastTick: s.lastTick,
    tickCount: s.tickCount,
    intervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES) || 5,
  };
}

async function tick() {
  const s = state();
  if (s.running) return; // never overlap
  s.running = true;
  try {
    const d = getDb();
    const rows = d
      .prepare("SELECT * FROM sources")
      .all() as SourceRow[];
    const due = rows.filter(isDue);
    for (const row of due) {
      try {
        const result = await checkSource(d, row);
        if (!result.ok)
          console.warn(`[scheduler] source ${row.id} (${row.type}) failed: ${result.error}`);
      } catch (e) {
        console.warn(`[scheduler] source ${row.id} crashed:`, e);
      }
    }
    s.lastTick = new Date().toISOString();
    s.tickCount++;
  } finally {
    s.running = false;
  }
}

export function startScheduler() {
  const s = state();
  if (s.started) return;
  s.started = true;
  const minutes = Number(process.env.SCHEDULER_INTERVAL_MINUTES) || 5;
  // Run once shortly after boot, then on interval
  setTimeout(() => void tick(), 10_000).unref();
  const t = setInterval(() => void tick(), minutes * 60_000);
  t.unref();
  console.log(`[scheduler] started (interval ${minutes}m)`);
}
