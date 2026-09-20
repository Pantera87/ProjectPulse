import { getDb } from "@/lib/db";
import { aiState, readAIConfig } from "@/lib/ai";
import { CATALOG, hardwareHint } from "@/lib/ollama";
import { readChannels, recentLog } from "@/lib/notifiers";
import RestoreForm from "@/components/restore-form";
import AISettings from "@/components/ai-settings";
import NotifySettings from "@/components/notify-settings";
import SnapshotSettings from "@/components/snapshot-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const d = getDb();
  const counts = d
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM sources) AS sources,
         (SELECT COUNT(*) FROM snapshots) AS snapshots,
         (SELECT COUNT(*) FROM updates) AS updates`
    )
    .get() as { sources: number; snapshots: number; updates: number };
  const ai = await aiState();
  const cfg = readAIConfig();
  const catalog = CATALOG.map((m) => ({ ...m, hint: hardwareHint(m) }));
  const channels = readChannels(d);
  const notifyLog = recentLog(d, 20);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="glass space-y-2 p-4">
        <h2 className="font-semibold">Data</h2>
        <p className="text-sm text-slate-400">
          {counts.sources} sources · {counts.snapshots} snapshots · {counts.updates}{" "}
          updates — stored in the <code>DATA_DIR</code> volume (SQLite).
        </p>
        <RestoreForm />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Snapshots &amp; summaries</h2>
        <SnapshotSettings />
      </section>

      <section className="glass space-y-2 p-4">
        <h2 className="font-semibold">AI</h2>
        <AISettings
          initial={ai}
          initialConfig={{
            provider: cfg.provider,
            model: cfg.model,
            ollamaUrl: cfg.ollamaUrl,
            openaiUrl: cfg.openaiUrl,
            openaiKey: cfg.openaiKey,
            anthropicKey: cfg.anthropicKey,
            mcpUrl: cfg.mcpUrl,
            mcpTool: cfg.mcpTool,
            mcpArg: cfg.mcpArg,
            ollamaKeepAlive: cfg.ollamaKeepAlive,
          }}
          catalog={catalog}
          authEnabled={Boolean(process.env.AUTH_PASSWORD)}
        />
      </section>

      <section className="glass space-y-3 p-4">
        <h2 className="font-semibold">Alerts</h2>
        <NotifySettings
          initialChannels={channels}
          initialLog={notifyLog}
          authEnabled={Boolean(process.env.AUTH_PASSWORD)}
        />
        {process.env.WEBHOOK_URL && (
          <p className="text-xs text-slate-500">
            Note: WEBHOOK_URL is also set in the environment — it is used as an extra webhook
            channel until you save a webhook channel here.
          </p>
        )}
      </section>
    </div>
  );
}
