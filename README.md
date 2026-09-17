# ProjectPulse

A self-hosted tracker for software projects. Two jobs:

1. **Save project websites** for later (offline snapshots) and optionally
   **watch them for changes** — new changelog entries, new mentions of keywords
   you care about.
2. **Track GitHub repos** — releases, milestones, labeled issues — with
   **priority keyword rules** (e.g. flag anything mentioning *kernel, linux* as
   *critical*) and automatic detection of big milestones (major version bumps,
   completed GitHub milestones).

Built with Next.js (standalone), SQLite, runs in a single Docker container,
deployable to TrueNAS SCALE as a Compose project.

## Quick start (Docker)

```bash
docker compose up -d --build
# open http://localhost:4701
```

AI runs out of the box on the bundled **Ollama** container: the app points at
`http://ollama:11434` by default, and `ollama-init` pre-downloads the default
model (`qwen2.5:7b`, override with `OLLAMA_MODEL`) once the server is up.
Downloaded models persist in the `ollama_data` Docker volume. To use a remote
provider instead, remove the two `ollama*` services from the compose file and
pick the provider in Settings.

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
- **Keyword rules** per site: e.g. critical rule `kernel, linux` → the moment
  those words appear in newly added page text, the update is *critical*.
  With AI enabled, a semantic second pass also flags text that *relates to*
  the rule's topics without using the exact words.
- Goal extraction: the project's one-line purpose is auto-extracted
  (meta description → first paragraph) and editable. The category is
  auto-assigned in two levels for every source type: a **generic category**
  for the broad domain/family (e.g. `cnc`) and a specific **subcategory**
  (e.g. `cnc-controller-firmware`). AI assigns both when available. For
  **GitHub** sources the classification is a priority cascade over the
  repo's own signals: its **topics** first, then topics + **about**
  section, and only when neither gives a confident answer is the **full
  README** ingested (the stored AI summary can substitute for the README
  when it is already present); websites and feeds are read from their full
  page/feed text whenever the stored goal/summary is too thin to classify
  from (a project name alone is not content); without AI a
  keyword-hint fallback assigns only the generic category — not very
  accurate, so those are marked with a "guessed" hint in the UI. Missing
  levels are backfilled automatically on every check (a subcategory left
  empty is completed by AI on a later check) — and keyword guesses are
  re-classified by AI on a later check once it becomes available. A
  category that simply repeats the project name (a known weak-model failure
  when it was given too little content) is treated as invalid and
  re-classified from content on the next check. Values
  set by AI or by the user are otherwise never overwritten, and both levels
  are always editable. The dashboard groups projects by category.

### GitHub
- Add as `owner/repo` or a GitHub URL.
- New **releases/tags** → update entries. Priority:
  - keyword rule match in release notes → the rule's priority (e.g. *critical*)
  - semver **major bump** or "stable/1.0" in the title → *high*
  - otherwise → *normal*
- **Milestones**: newly opened or completed GitHub milestones → *high*.
- **Label watching**: add issue labels to a rule (e.g. `linux`) — new open
  issues/PRs with that label are flagged at the rule's priority.
- **State-change scans**: README and the last 30 commits are scanned for
  keywords; you get one alert when a keyword *newly* appears
  (e.g. a watched keyword shows up in the README → instant critical alert).
  The alert links directly to the match: the commit whose message contains
  the keyword, or the README section it appears in.
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
AI powers five features: one-line **summaries of changes**, **goal
extraction** from pages without descriptions, **semantic keyword matching**
(the keyword matcher always runs first, AI only adds matches it never
vetoes), **two-level category assignment** of projects by intended use
(generic category + specific subcategory, reusing existing categories for
dashboard grouping), and a short **project summary** generated when a
project is added (shown on project cards and detail pages). All AI calls
are background/non-blocking with heuristic fallbacks — the app is fully
functional without it.

**Providers** (Settings → AI, or env as defaults):

| Provider | What it needs | Notes |
|---|---|---|
| **Ollama** (default) | bundled `ollama` service in `docker-compose.yml` — `OLLAMA_URL` defaults to `http://ollama:11434` | Local models (`qwen2.5:7b` default — very accurate; smaller models in the Settings catalog are moderately accurate or basic; override with `OLLAMA_MODEL`, pre-pulled on container startup by `ollama-init`). Models load on first use. |
| **OpenAI-compatible** | base URL (+ key for hosted APIs) | OpenAI, LM Studio, vLLM, Ollama's `/v1`, any gateway. |
| **Anthropic** | API key | Claude via the Messages API. |
| **MCP** | MCP server URL (Streamable HTTP) | Run the AI on another machine (e.g. a desktop with a GPU) and point ProjectPulse at an MCP server there; tool + argument are auto-detected (or set explicitly). |

**Model manager** (Ollama): Settings → AI lists a curated catalog of small
models (the standard Q4_K_M builds) with their size, context, an accuracy hint
(*very accurate* 7B+ / *moderately accurate* 3B / *basic* ≤ 2B) and a
hardware-fit hint for *this* server (based on system RAM — Node cannot read
VRAM). Status per model:
*installed / loaded / downloading %*, with one-click **Download** and
**Delete** per model, plus **Delete all models & reset AI** to wipe every
installed model and start over from the default. Before README text is
handed to a model, badges, images, inline HTML and license headers are
stripped so prompt contexts stay minimal (CPU prompt ingestion scales
linearly with length).

**RAG (Ollama ≥ 0.6.2 only):** instead of truncating long documents into
the prompt, ProjectPulse hands the full project content (README / page
text / feed) to Ollama's built-in RAG — the server chunks, embeds and
retrieves from it, so the model only sees the most relevant parts. Used by
category classification, project summaries, goal extraction and the
semantic keyword pass. On older Ollama versions (or non-Ollama providers)
the calls degrade to the in-prompt truncated prefix. Settings shows
*RAG ready / RAG off* for the Ollama server.

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
npm run dev        # http://localhost:4701, data in ./data
npm run build      # production build
```

## Architecture (short)

- `src/lib/db.ts` — SQLite schema (sources, snapshots, updates, FTS index)
- `src/lib/checkers/{website,github,rss}.ts` — per-type checkers
- `src/lib/rules.ts` — keyword rule engine (word-boundary, negation,
  priorities) + `findRuleHitSmart` (keyword pass first, optional AI
  semantic second pass)
- `src/lib/scheduler.ts` + `src/instrumentation.ts` — in-process scheduler
- `src/lib/ai.ts` — AI provider seam (Ollama, OpenAI-compatible, Anthropic,
  MCP) with per-feature fallbacks; `src/lib/ollama.ts` — Ollama client,
  model catalog + hardware hints, download registry
- `src/lib/project-context.ts` — gathers the full project content (README +
  meta for GitHub, page text for websites, feed text for RSS) for the AI
  summary + content-based category classification;
  `src/lib/project-summary.ts` — stores the AI summary (triggered on add +
  backfilled on first check); `src/lib/category.ts` — AI two-level category
  auto-assignment (generic category + subcategory) from project content
  (GitHub: tiered topics → about → full README, README only ingested when
  the light tiers are unsure; RAG document for the full tier) with
  keyword-hint fallback (backfilled on add + first check; name-echoing
  values are re-classified)
- `src/lib/notifiers.ts` — notifier seam (webhook implementation)
- `src/middleware.ts` — optional password auth gate
- API routes under `src/app/api/` mirror the pages; UI is Next.js App Router
  with server components reading SQLite directly.
