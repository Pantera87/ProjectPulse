import type { Priority, UpdateKind } from "./db";

/**
 * Notifier interface — the extension point for alerts beyond the in-app
 * feed. v1 ships with a generic webhook notifier (WEBHOOK_URL env); the same
 * interface can be used later for ntfy, Telegram, email, etc.
 */
export interface UpdateEvent {
  id: number;
  title: string;
  summary: string | null;
  url: string | null;
  priority: Priority;
  kind: UpdateKind;
  sourceName: string;
  sourceUrl: string | null;
}

export interface Notifier {
  send(event: UpdateEvent): Promise<void>;
}

class WebhookNotifier implements Notifier {
  private url: string;
  constructor(url: string) {
    this.url = url;
  }
  async send(event: UpdateEvent): Promise<void> {
    try {
      await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...event,
          app: "projectpulse",
          sent_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      console.warn("[notifier] webhook failed:", e);
    }
  }
}

class NullNotifier implements Notifier {
  async send(): Promise<void> {}
}

let notifier: Notifier | null = null;

export function getNotifier(): Notifier {
  if (notifier) return notifier;
  const url = process.env.WEBHOOK_URL;
  notifier = url ? new WebhookNotifier(url) : new NullNotifier();
  return notifier;
}

/** Fire-and-forget: never block or crash the checker on notification errors. */
export async function notify(event: UpdateEvent): Promise<void> {
  try {
    await getNotifier().send(event);
  } catch (e) {
    console.warn("[notifier] error:", e);
  }
}
