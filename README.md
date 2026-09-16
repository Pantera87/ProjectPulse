# ProjectPulse

A self-hosted tracker for software projects. Two jobs:

1. **Save project websites** for later (offline snapshots) and optionally
   **watch them for changes** — new changelog entries, new mentions of keywords
   you care about.
2. **Track GitHub repos** — releases, milestones, labeled issues — with
   **priority keyword rules** (e.g. flag anything mentioning *rocm/amd* as
   *critical*) and automatic detection of big milestones (major version bumps,
   completed GitHub milestones).

Built with Next.js (standalone), SQLite, runs in a single Docker container,
deployable to TrueNAS SCALE as a Compose project.

## Quick start (Docker)

```bash
docker compose up -d --build
# open http://localhost:3000
```

All data (SQLite DB + snapshots) lives in `./data`. To move to TrueNAS:

1. Copy the project folder (or the repo) to TrueNAS.
2. In **Apps → Compose Projects**, add the `docker-compose.yml`.
3. Make sure the `./data` path is writable by the container user (uid 1000).
4. `docker compose up -d --build`.

### TrueNAS SCALE notes

- Use a **Dataset** with `user` set to the same uid the compose file runs as.
- The container is non-root (`node` user, uid 1000). If your existing `data`
  folder was created by root, run `chown -R 1000:1000 data` on the host.
- To upgrade: replace the files, `docker compose build && docker compose up -d`.
  The `./data` volume is untouched.

## Features

### Websites
- **Add a URL** → an HTML snapshot is captured immediately (read offline,
  rendered in a sandboxed iframe; last 10 versions kept).
- **Track updates**: a scheduled check extracts the page's main text,
  normalizes it and hashes it. On change: a new snapshot version is stored and
  an update entry with a text diff is created.
- **Keyword rules** per site: e.g. critical rule `rocm, amd, hip` → the moment
  those words appear in newly added page text, the update is *critical*.
- Goal extraction: the project's one-line purpose is auto-extracted
  (meta description → first paragraph) and editable. Category is suggested
  from the goal (`gpu`, `ml-inference`, …) — the dashboard groups projects by it.

### GitHub
- Add as `owner/repo` or a GitHub URL.
- New **releases/tags** → update entries. Priority:
  - keyword rule match in release notes → the rule's priority (e.g. *critical*)
  - semver **major bump** or "stable/1.0" in the title → *high*
  - otherwise → *normal*
- **Milestones**: newly opened or completed GitHub milestones → *high*.
- **Label watching**: add issue labels to a rule (e.g. `rocm`) — new open
  issues/PRs with that label are flagged at the rule's priority.
- **State-change scans**: README and the last 30 commits are scanned for
  keywords; you get one alert when a keyword *newly* appears
  (e.g. "ROCm" shows up in the README → instant critical alert).
- Unauthenticated GitHub API: 60 requests/h per IP. Set `GITHUB_TOKEN` for 5000/h.

### Feeds
RSS/Atom feeds are first-class sources — often the most reliable way to track
a project's changelog. New entries land in the updates feed; keyword rules
apply.

### Updates feed
- Priority-sorted (critical first), filter by priority / source / time window
  (1d / 7d / 30d digests), mark read/unread, mute a source for 30 days.
- Dashboard shows unread counters per priority and projects grouped by
  category (extracted goal).
- Full-text search over project goals/names and update history (SQLite FTS5).
- **Backup/restore**: download the whole database as JSON, restore later
  (Settings page) — handy across a TrueNAS migration.

### Optional extras (env-driven, all off by default)
| Variable | Effect |
|---|---|
| `AUTH_PASSWORD` | enables a login screen (single shared password) |
| `WEBHOOK_URL` | POSTs every new update as JSON `{title, url, priority, kind, …}` |
| `OLLAMA_URL` / `OLLAMA_MODEL` | AI via local Ollama (see [AI](#ai-optional)) |
| `OLLAMA_KEEP_ALIVE` | minutes a model stays loaded after use before Ollama frees the RAM (default 5; also settable in Settings) |
| `OPENAI_URL` / `OPENAI_API_KEY` | AI via any OpenAI-compatible endpoint |
| `ANTHROPIC_API_KEY` | AI via Anthropic (Claude) |
| `MCP_URL` | AI via a remote MCP server (Streamable HTTP) |
| `GITHUB_TOKEN` | higher GitHub API rate limit |
| `SCHEDULER_INTERVAL_MINUTES` | scheduler wake-up cadence (default 5) |
| `SNAPSHOT_KEEP_VERSIONS` | snapshot history depth (default 10) |

### AI (optional)
AI powers four features: one-line **summaries of changes**, **goal
extraction** from pages without descriptions, **semantic keyword matching**
("added AMD GPU support" matches a `rocm` rule), and a short **project
summary** generated when a project is added (shown on project cards and
detail pages). All AI calls are background/non-blocking with heuristic
fallbacks — the app is fully functional without it.

**Providers** (Settings → AI, or env as defaults):

| Provider | What it needs | Notes |
|---|---|---|
| **Ollama** (default) | `OLLAMA_URL` (separate Ollama container ships commented out in `docker-compose.yml`) | Tiny local models (`qwen2.5:1.5b` default). Models load on first use. |
| **OpenAI-compatible** | base URL (+ key for hosted APIs) | OpenAI, LM Studio, vLLM, Ollama's `/v1`, any gateway. |
| **Anthropic** | API key | Claude via the Messages API. |
| **MCP** | MCP server URL (Streamable HTTP) | Run the AI on another machine (e.g. a desktop with a GPU) and point ProjectPulse at an MCP server there; tool + argument are auto-detected (or set explicitly). |

**Model manager** (Ollama): Settings → AI lists a curated catalog of small
models with their size, context and a hardware-fit hint for *this* server
(based on system RAM — Node cannot read VRAM). Status per model:
*installed / loaded / downloading %*, with one-click **Download** (manual).

**Auto-download (the only automatic download):** if AI is enabled and the
selected Ollama model is not on the machine, ProjectPulse starts the pull
automatically the next time AI is used (e.g. when you add a project); the
navbar badge then shows the download percentage, and the pending summary is
retried on the next scheduled check. Every other model is downloaded
manually.

`AI_ENABLED=false` is a hard kill-switch (the UI toggle can re-enable only
when this is not set). A **Test connection** button in Settings runs a
trivial generation through the active provider. The navbar badge always
shows the AI state: off / not configured / downloading / ready (model
loaded).

> If you store API keys in Settings and the app has no `AUTH_PASSWORD`,
> anyone with network access can read them — enable the shared password for
> non-localhost deployments.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000, data in ./data
npm run build      # production build
```

## Architecture (short)

- `src/lib/db.ts` — SQLite schema (sources, snapshots, updates, FTS index)
- `src/lib/checkers/{website,github,rss}.ts` — per-type checkers
- `src/lib/rules.ts` — keyword rule engine (word-boundary, negation, priorities)
- `src/lib/scheduler.ts` + `src/instrumentation.ts` — in-process scheduler
- `src/lib/ai.ts` — AI provider seam (Ollama, OpenAI-compatible, Anthropic,
  MCP) with per-feature fallbacks; `src/lib/ollama.ts` — Ollama client,
  model catalog + hardware hints, download registry
- `src/lib/project-summary.ts` — gathers project context and stores the AI
  summary (triggered on add + backfilled on first check)
- `src/lib/notifiers.ts` — notifier seam (webhook implementation)
- `src/middleware.ts` — optional password auth gate
- API routes under `src/app/api/` mirror the pages; UI is Next.js App Router
  with server components reading SQLite directly.
