const Database = require("better-sqlite3");
const db = new Database("data/projectpulse.db", { readonly: true });
console.log("snapshots:", JSON.stringify(db.prepare("SELECT id, source_id, version, fetched_at, LENGTH(html) html_len, LENGTH(html_local) local_len, title FROM snapshots").all()));
console.log("rules/state:", JSON.stringify(db.prepare("SELECT id, name, rules_json, state_json FROM sources").all()));
console.log("updates:", JSON.stringify(db.prepare("SELECT id, source_id, priority, kind, title, summary, url, read_at, created_at FROM updates ORDER BY id").all()));
console.log("sources meta:", JSON.stringify(db.prepare("SELECT id, name, goal, project_summary, category, subcategory, watch_enabled, track_releases, track_readme, track_commits FROM sources").all().map((s) => ({ ...s, goal: s.goal ? String(s.goal).slice(0, 80) : s.goal, project_summary: s.project_summary ? String(s.project_summary).slice(0, 80) : s.project_summary }))));
db.close();
