import { getDb } from "@/lib/db";
import { schedulerStatus } from "@/lib/scheduler";
import { getAI } from "@/lib/ai";
import RestoreForm from "@/components/restore-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const d = getDb();
  const counts = d
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sources) AS sources,
         (SELECT COUNT(*) FROM snapshots) AS snapshots,
         (SELECT COUNT(*) FROM updates) AS updates`
    )
    .get() as { sources: number; snapshots: number; updates: number };
  const sched = schedulerStatus();
  const ai = getAI();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">Data</h2>
        <p className="text-sm text-slate-400">
          {counts.sources} sources · {counts.snapshots} snapshots · {counts.updates}{" "}
          updates — stored in the <code>DATA_DIR</code> volume (SQLite).
        </p>
        <RestoreForm />
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">Scheduler</h2>
        <p className="text-sm text-slate-400">
          Status: {sched.running ? "running" : "stopped"} · checks every{" "}
          {sched.intervalMinutes} min · last tick:{" "}
          {sched.lastTick ?? "—"} · {sched.tickCount} ticks
        </p>
        <p className="text-xs text-slate-500">
          Each source is checked on its own interval (set per source). Set{" "}
          <code>SCHEDULER_INTERVAL_MINUTES</code> to change the polling cadence.
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">AI enhancements</h2>
        <p className="text-sm text-slate-400">
          {ai.enabled
            ? `Ollama connected (model: ${process.env.OLLAMA_MODEL}). Change summaries, goal extraction and semantic keyword matching are active.`
            : "Disabled. Set OLLAMA_URL (e.g. http://localhost:11434) and optionally OLLAMA_MODEL to enable change summaries, goal extraction and semantic keyword matching. Everything works without it."}
        </p>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">Alerts</h2>
        <p className="text-sm text-slate-400">
          {process.env.WEBHOOK_URL
            ? `Webhook enabled: POSTs each new update (with priority) to ${process.env.WEBHOOK_URL}.`
            : "No webhook configured. Set WEBHOOK_URL to forward every new update as JSON ({title, url, priority, kind, …}) to any endpoint."}
        </p>
        {process.env.AUTH_PASSWORD && (
          <p className="text-sm text-emerald-400">Password auth is enabled (AUTH_PASSWORD set).</p>
        )}
      </section>
    </div>
  );
}
