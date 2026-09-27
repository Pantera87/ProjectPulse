package com.pantera87.projectpulse.notif

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.engine.CollectorNotifier
import com.pantera87.projectpulse.engine.PpEngine
import com.pantera87.projectpulse.engine.nowIso
import com.pantera87.projectpulse.engine.toUpdate

/**
 * Background poll: in remote data mode it fetches recent updates from the
 * server and posts a local notification for anything newer than
 * [com.pantera87.projectpulse.data.ServerPrefs.lastSeenUpdateId]; in local
 * data mode it runs the on-device checkers ([PpEngine]) for all sources and
 * notifies for what they find.
 *
 * The session cookie is in-memory only, so after a process restart the worker
 * re-runs POST /api/auth first when the server gates the API.
 */
class PpWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as App
        val prefs = app.prefs

        // Local data mode: the on-device engine checks all sources directly.
        if (prefs.dataMode.value == "local") {
            return runLocal(app)
        }

        if (!prefs.configured.value) return Result.success()

        // Re-authenticate when the in-memory cookie was wiped with the process.
        if (prefs.authEnabled.value) {
            val pw = prefs.password.value
            if (pw.isNotEmpty()) {
                when (val r = app.newApi().login(pw)) {
                    is ApiResult.Error -> {
                        // Wrong password etc. The UI will surface the failure
                        // on its next poll; don't retry this work.
                    }
                    is ApiResult.Ok -> Unit
                }
            }
        }

        val r = app.newApi().updates(limit = 100)
        return when (r) {
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    prefs.markConfigured(false)
                    Result.success()
                } else {
                    Result.retry()
                }
            }
            is ApiResult.Ok -> {
                val list = r.value.updates
                val maxId = list.maxOfOrNull { it.id } ?: 0
                val last = prefs.lastSeenUpdateId.value
                // First run (last == 0): seed the watermark silently instead of
                // notifying about every existing update.
                val fresh = if (last > 0) list.filter { it.id > last && !it.isRead } else emptyList()
                if (maxId > last) prefs.setLastSeenUpdateId(maxId)
                if (prefs.notificationsEnabled.value) {
                    Notifier.post(app, fresh)
                }
                Result.success()
            }
        }
    }

    /**
     * Local mode: runs the on-device checkers for every watched source and
     * posts one notification for everything newly found (no server polling).
     */
    private suspend fun runLocal(app: App): Result {
        val db = app.db
        val prefs = app.prefs
        PpEngine.init(db)
        val collector = CollectorNotifier()
        for (source in db.sourceDao().all()) {
            if (!source.watchEnabled) continue
            try {
                PpEngine.check(db, source, collector)
            } catch (e: Exception) {
                // The checkers record their own last_error on known failures;
                // this catches only the unexpected and keeps the run going.
                db.sourceDao().setCheckState(source.id, nowIso(), null, e.message ?: e.toString())
            }
        }
        if (prefs.notificationsEnabled.value) {
            val fresh = collector.notices.map { it.toUpdate() }
            if (fresh.isNotEmpty()) Notifier.post(app, fresh)
        }
        return Result.success()
    }
}