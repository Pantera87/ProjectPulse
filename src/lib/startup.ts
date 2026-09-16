import { getDb } from "./db";
import { startScheduler } from "./scheduler";

let started = false;

/**
 * Ensures the database is initialized and the update-check scheduler is
 * running. Called from the layout (first page render) and the health endpoint
 * so the container is fully up right after boot.
 */
export function ensureStartup() {
  try {
    getDb();
  } catch (e) {
    console.warn("[startup] db init failed:", e);
    return;
  }
  if (started) return;
  started = true;
  startScheduler();
}
