# ProjectPulse — Standalone Android Port Plan

> Status as of 2026-09-27. Goal: port the server-side source checkers
> (GitHub, RSS, website) into the Android app as local Kotlin
> implementations so the app can run fully standalone (no server),
> with a compiling, packageable engine.

## Big picture

The app is dual-mode:

- **Remote mode (default):** UI talks to the self-hosted server
  (`PpApi` -> `RemoteBackend`). Fully functional.
- **Local mode:** the phone *is* the server - checkers run on-device
  in a WorkManager worker, all state lives in Room, and the UI
  reads/writes Room directly.

Server side (`src/lib/`) being ported: `check.ts` (orchestration),
`checkers/{github,rss,website}.ts`, `models.ts`, `text.ts`, `feed.ts`,
`github.ts`, `http.ts`, `rules.ts`, `notifiers.ts`, plus AI
(`ai.ts`, `ollama.ts`, `ai-activity.ts`, `ai-status.ts`).

| Area | Status |
|---|---|
| Phase 0 - Scaffolding & data layer | Done |
| Phase 1 - Engine core port | Done |
| Phase 2 - Checkers + notification/sync pipeline | Done (compile + package green) |
| Phase 3 - `LocalBackend` (local UI data path) | Done (on-device smoke test passed 2026-09-27) |
| Phase 4 - UI wiring for local mode | Done: screens → `app.backend`, data-source toggle in Settings, local bypass of the connect gate |
| Phase 5 - AI on device | Stub (graceful degradation works) |
| Phase 6 - On-device verification & QA | Partial (core runtime verified on-device 2026-09-27; engine/worker QA pending) |

## Phase 0 - Scaffolding & data layer (DONE)

- Room database `projectpulse.db`: tables `sources`, `snapshots`
  (versioned, index `[sourceId, version]`), `updates`, `meta`;
  `SourceDetailData` = source + its snapshot versions.
- `PpBackend` interface - 20 methods (health, login, dashboard,
  updates, sources, addSource, markRead, deleteUpdate, snapshotHtml,
  sourceDetail, checkSource, checkAll, checkAllProgress, deleteSource,
  patchSource, markAllReadForSource, saveRules, search, logo,
  pageHtml, fetchFavicon).
- `RemoteBackend` - complete (every method mapped to `PpApi`).
- `LocalBackend` - complete: all 20 `PpBackend` methods ported from the
  server API routes against Room + the on-device engine.
- `ServerPrefs` - Keystore-encrypted password, URL, `dataMode`
  ("remote" default / "local"), notification toggle + interval,
  `lastSeenUpdateId` dedup cursor, theme.
- `PpApi` (remote HTTP client) + `SessionCookieJar` (cookie login).
- `App.kt` mode switch: `dataMode == "local" -> LocalBackend()` else
  `RemoteBackend(api)`.

## Phase 1 - Engine core port (DONE)

Ports of the server's `lib/` primitives into `engine/`:

- `EngineModels.kt` (port of `models.ts`): source state bag,
  `touchSource` (`lastCheckedAt` / `lastError`), versioned snapshot
  store/prune (`storeSnapshot` / `pruneSnapshots` / `compressHtml`),
  `pp_feed_seen` dedup. Documented deviations: update search is a LIKE
  query; snapshot *asset* capture is server-only.
- `EngineText.kt` (port of `text.ts`): `parseHtml`, `contentOrNull`,
  README-move-to-top. **Key fix:** Maven TagSoup 1.2.1/1.2 is SAX-only
  (no `SimpleParser`); bridged with `Parser` (SAX) -> DOM via a
  `DefaultHandler` building the `org.w3c.dom` tree. Safe because
  TagSoup's scanner rectifies broken markup into matching start/end
  pairs.
- `EngineFeed.kt` (port of `feed.ts`): RSS/Atom items, `feedTitle`
  hoist, RSS goal backfill (goal = feed title -> `"auto"`, titles
  sample -> `"ai"`).
- `EngineHttp.kt` (port of `http.ts`): OkHttp fetch, UA, timeouts.
- `EngineGithub.kt` (port of `github.ts`): releases/commits API, token.
- `EngineRules.kt` (port of `rules.ts`): watch-rule keyword matching.
- `EngineNotifier.kt`: notifier interface + null/collector impls.
- `Engine.kt`: `PpEngine` object - `init(db)`, `check(db, source,
  notifier)`, `checkAll(db, notifier)` (port of `lib/check.ts`).
- `EngineAi.kt`: `EngineAi` interface + `LocalAi` stub (Phase 5).

## Phase 2 - Checkers + notification/sync pipeline (DONE)

- `CheckGithub.kt` (port of `checkers/github.ts`): releases + commit
  scanning, per-rule keyword matching, offline repo-page snapshot
  (README moved to top), hash-gated versioned store + pruning
  (best-effort: a snapshot failure logs, doesn't fail the check).
- `CheckRss.kt` (port of `checkers/rss.ts`): feed fetch/parse,
  `pp_feed_seen` dedup, goal backfill.
- `CheckWebsite.kt` (port of `checkers/website.ts`): baseline-first
  (first check stores a snapshot only, no update), prev-snapshot fetch
  before insert, hash-gated versioning, rebaseline after
  user-deleted snapshots, `snapshotVersion` in update payload.
- `notif/Notifier.kt`: channel `pp_updates`, `ensureChannel`.
- `notif/SyncScheduler.kt`: WorkManager periodic (system floor 15 min)
  + `runOnce` + `cancel`.
- `notif/PpWorker.kt`: `CoroutineWorker`, both modes -
  - remote: login -> fetch updates (limit 100) -> dedup by
    `lastSeenUpdateId` -> post notifications;
  - local (`runLocal`): `PpEngine.checkAll` with a `CollectorNotifier`
    -> notices become `UpdateEntity` rows + notifications.

**Verified:** `:app:compileDebugKotlin` BUILD SUCCESSFUL (only
pre-existing warnings); `:app:assembleDebug` BUILD SUCCESSFUL ->
4 per-ABI split APKs (`app-{arm64-v8a,armeabi-v7a,x86,x86_64}-debug.apk`,
~21.6 MB each). Zero remaining `SimpleParser` references.

**Accepted deviations / risks:**
- WorkManager periodic floor = 15 min (server scheduler can be finer).
- Snapshot *asset* archiving stays server-only.
- TagSoup SAX->DOM bridge is runtime-untested; bounded risk - both
  `parseHtml` / `moveReadmeToTop` call sites have try/catch fallbacks
  (empty `ParsedPage` / original-HTML passthrough).

## Phase 3 - `LocalBackend`: local mode serves the UI (DONE)

In local mode the worker already runs checks and writes to Room, but
the app has no local read/write path. Task: implement all 20
`PpBackend` methods against Room + engine. Order (reads first):

1. Trivial: `health()` (synthesize: up, `authEnabled=false`),
   `login()` (no-op success).
2. Reads: `sources(type)`, `updates(...)` (port the server's
   filter/`window` semantics to DAO queries), `dashboard()` (port
   `dashboard-aggregates.ts`), `sourceDetail(id)` (via
   `SourceDetailData`), `snapshotHtml(sourceId, version)` (decompress
   stored page), `search(query)` (LIKE over updates), `logo(sourceId)`
   (bytes cached by the checker).
3. Writes: `addSource` (validate, insert, return id, kick a one-shot
   check), `markRead`, `deleteUpdate`, `deleteSource` (cascade
   snapshots + state rows), `patchSource`, `markAllReadForSource`,
   `saveRules` (rules blob on the source row).
4. Actions: `checkSource` (`PpEngine.check`; decide inline vs
   `runOnce`), `checkAll` + `checkAllProgress` (enqueue
   `SyncScheduler.runOnce`, track progress in `meta` / in-memory),
   `pageHtml` / `fetchFavicon` (thin wrappers over `EngineHttp`).

**Acceptance:** every screen works with `dataMode = "local"`, an empty
Room DB, and no server running (airplane mode).

## Phase 4 - UI wiring for local mode (DONE)

The UI never uses `PpBackend`: every screen calls `app.api.*`
directly, so in local mode the UI still hits the remote server. Tasks:

1. Route screens through `app.backend` instead of `app.api`
   (mechanical - same signatures and `ApiResult`; treat `needsAuth`
   error flows as remote-only). Affected: Connect, Dashboard,
   SourceDetail, Snapshot, Search, AddSource screens.
2. `ConnectScreen` in local mode: skip URL/password; show local status
   (source count, last check, notification state).
3. Expose the remote/local toggle in `SettingsScreen` (the pref and
   `App.buildBackend` already react to it; the worker already
   branches on it).
4. Local affordances: "Check now" per source, storage/size display.
   - Done: storage/size display — the local-mode `ConnectScreen` status
     panel shows the Room database size (main + WAL/SHM files).
   - Open: per-source "Check now".

Done (2026-09-27, on-device verified): screens route through
`app.backend`; Settings shows the Server / On-device data-source
toggle; `RootNav` gates on `configured || dataMode == "local"`;
`ConnectScreen` in local mode skips URL/password and shows the local
status panel with database storage size.

**Acceptance:** with `dataMode = "local"` and no network the full app
is usable: add a source, check it, browse dashboard / updates / detail
/ snapshots, mark read, edit rules, delete.

## Phase 5 - AI on device (STUB, degrades gracefully)

`LocalAi` is the active implementation: `enabled = false`, every
method returns null. Checkers already handle nulls by design: goal
falls back to feed title (`"auto"`), summaries become plain-text
truncation, semantic matching is skipped. The server's AI stack is
Ollama-based (`ollama.ts`: detect/pull/unload/logs; `ai.ts`:
summarize/extractGoal/semanticMatch prompts; `ai-activity.ts` /
`ai-status.ts` + `/api/ai/*` routes for UI state).

| Option | Effort | Notes |
|---|---|---|
| A. Keep degradation (status quo) | 0 | Floor; recommended |
| B. LAN Ollama | Low-med | Phone -> user's Ollama host over the LAN (host:port in Settings, detect/health like the server, timeout, fallback to A). Reuses `ai.ts` prompts |
| C. On-device inference | High | llama.cpp/MLC - GBs of assets, thermal/battery cost. Not recommended |

Recommendation: ship A; add B behind a setting (local-mode users
typically already run Ollama since they self-host the server). Port
minimal `ai-activity`/`ai-status` semantics (last-call status +
latency) for the Settings screen.

**Acceptance:** with AI disabled, all three checkers complete without
crashing and produce updates; with option B, `extractGoal` /
`summarizeUpdate` return real text and timeouts never kill a check.

## Phase 6 - Verification & QA (PARTIAL)

Done: `:app:compileDebugKotlin` green, `:app:assembleDebug` green.
Remaining, in priority order:

1. **On-device smoke test of `PpWorker.runLocal`** (needs
   device/emulator) - the top next step:
   - GitHub source: `touchSource` updates `lastCheckedAt` /
     `lastError`, releases/commits produce updates, snapshot row
     stored (README at top), hash-gated re-store doesn't duplicate
     versions.
   - RSS source: `pp_feed_seen` dedup (second run adds nothing), goal
     backfill writes `goal` / `goalSource`.
   - Website source: baseline first, then a change produces a diff
     update with `snapshotVersion`.
2. **AI degradation check:** null `extractGoal` / `summarizeUpdate`
   never crash a checker.
3. **SAX->DOM sanity:** `parseHtml` on a real GitHub page -
   title/paragraphs non-empty, matching pre-`SimpleParser` behavior.
4. **Notifications:** channel creation, dedup (remote
   `lastSeenUpdateId` / local collector), toggle + interval honored.
5. **Scheduler/Doze:** periodic worker fires at ~15 min under Doze,
   survives force-stop, battery impact.
6. **Storage:** per-source snapshot pruning bounded, long-run DB size,
   `compressHtml` savings.
7. **Edge cases:** no-network run (error in `lastError`, source not
   wedged), malformed/empty feeds, huge pages, slow endpoints
   (timeouts in `EngineHttp`).
8. **Mode switching:** remote -> local -> remote round trip (separate
   stores by design - confirm the UX communicates this).

## Immediate next steps (ordered, updated 2026-09-27)

Done so far: Phases 3 and 4 (LocalBackend, UI wiring, data-source
toggle, local-aware ConnectScreen). Launcher icons regenerated from
`logowithbg.png` (all densities, square + round, baked into every
APK variant). On-device smoke test passed: server-mode dashboard,
remote -> local -> remote mode switching, Connect probe, local
status panel.

1. Device smoke test of `PpWorker.runLocal` with real GitHub + RSS +
   website sources - validates Phases 0-2 end to end. Do first.
2. Phase 5 decision: A (degradation only) vs B (LAN Ollama).
3. Phase 6 remainder: notifications, Doze, storage, edge cases,
   mode-switch UX.

## Out of scope for the local port (server-only by design)

- Snapshot *asset* archiving (images/fonts of archived pages).
- Ollama management (pull/unload/logs).
- Backup/restore endpoint.
- Multi-device sync.

## Scope note

UI wiring note (updated): the screens now route through `app.backend`
(PpBackend), so local mode is fully served on-device. `ConnectScreen`
still probes via `app.api` by design — it establishes the *remote*
server session before the mode switch; in local mode it shows a
status panel (database size) instead of the URL/password form.
`RootNav` treats `configured || dataMode == "local"` as ready, so
on-device mode works with no server configured. The
`UpdateSourceRow` 13-column positional contract is documented in
`Daos.kt`. Only remaining Phase-4 nice-to-have: per-source
"Check now".

