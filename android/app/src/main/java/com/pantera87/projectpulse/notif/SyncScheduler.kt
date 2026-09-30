package com.pantera87.projectpulse.notif

import android.content.Context
import android.os.Build
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Owns the WorkManager schedule. [schedule] keeps a unique periodic worker at
 * the chosen interval (the system floors periodic work at 15 min); [runOnce]
 * triggers an immediate check for the settings screen's "Check now" button.
 */
object SyncScheduler {
    const val WORK_NAME = "pp-updates-sync"
    private const val ONCE_NAME = "pp-updates-once"

    fun schedule(context: Context, intervalMinutes: Long) {
        val request = PeriodicWorkRequestBuilder<PpWorker>(
            intervalMinutes.coerceAtLeast(15L),
            TimeUnit.MINUTES,
        ).build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun runOnce(context: Context) {
        val builder = OneTimeWorkRequestBuilder<PpWorker>()
        // "Check now" should surface quickly even while Doze is deferring
        // background work. An expedited one-shot runs outside the deferral
        // window; if the system's expedited quota is exhausted it degrades
        // gracefully to a regular (possibly deferred) run.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        }
        WorkManager.getInstance(context)
            .enqueueUniqueWork(ONCE_NAME, ExistingWorkPolicy.REPLACE, builder.build())
    }

    fun cancel(context: Context) {
        val wm = WorkManager.getInstance(context)
        wm.cancelUniqueWork(WORK_NAME)
        wm.cancelUniqueWork(ONCE_NAME)
    }
}