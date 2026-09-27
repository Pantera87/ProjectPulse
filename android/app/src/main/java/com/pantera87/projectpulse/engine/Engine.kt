package com.pantera87.projectpulse.engine

import com.pantera87.projectpulse.data.CheckResult
import com.pantera87.projectpulse.data.db.AppDatabase
import com.pantera87.projectpulse.data.db.SourceEntity

/**
 * On-device checker coordinator (port of src/lib/check.ts): dispatches each
 * source to its checker and runs "check all" across the watched sources.
 * [init] must run once before any GitHub check (wires the local
 * `github_token` from the meta table).
 */
object PpEngine {
    @Volatile
    private var initialised = false

    /** Idempotent — safe to call from every worker run. */
    fun init(db: AppDatabase) {
        if (!initialised) {
            synchronized(this) {
                if (!initialised) {
                    EngineGithub.init(db.metaDao())
                    initialised = true
                }
            }
        }
    }

    /** Runs the checker matching [source]'s type. */
    suspend fun check(db: AppDatabase, source: SourceEntity, notifier: EngineNotifier = NullNotifier): CheckResult =
        when (source.type) {
            "github" -> checkGithub(db, source, ai, notifier)
            "rss" -> checkRss(db, source, ai, notifier)
            "website" -> checkWebsite(db, source, ai, notifier)
            else -> CheckResult(ok = false, changed = false, updatesCreated = 0, error = "Unknown source type: ${source.type}")
        }

    /**
     * Checks every watch-enabled source, isolated — one source's failure
     * never stops the rest (port of `checkAllSources`). Returns the number of
     * sources that checked OK.
     */
    suspend fun checkAll(db: AppDatabase, notifier: EngineNotifier = NullNotifier): Int {
        init(db)
        var okCount = 0
        for (source in db.sourceDao().all()) {
            if (!source.watchEnabled) continue
            try {
                if (check(db, source, notifier).ok) okCount++
            } catch (e: Exception) {
                // The checkers record their own last_error on known failures;
                // this catches only the unexpected and keeps the run going.
            }
        }
        return okCount
    }
}
