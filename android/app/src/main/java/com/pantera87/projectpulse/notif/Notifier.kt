package com.pantera87.projectpulse.notif

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import com.pantera87.projectpulse.MainActivity
import com.pantera87.projectpulse.data.Update

/**
 * Posts local notifications for new updates. There is no server push — the
 * WorkManager worker polls the server and calls [post] with what it finds.
 * A single slot (id 1) is reused, so the notification always shows the most
 * recent batch.
 */
object Notifier {
    const val CHANNEL_ID = "pp_updates"

    /** Must run before posting; channel creation is idempotent. */
    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "New updates",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = "New updates from watched projects" }
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    /** False when the user denied the Android 13+ runtime permission. */
    fun canNotify(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33) {
            return context.checkSelfPermission(
                android.Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    fun post(context: Context, updates: List<Update>) {
        if (updates.isEmpty() || !canNotify(context)) return
        ensureChannel(context)

        val latest = updates.first()
        val title = if (updates.size == 1) {
            latest.title.ifBlank { "New update" }
        } else {
            "${updates.size} new updates — ${latest.title}"
        }
        val lines = updates.take(5).map { u ->
            val src = u.source_name?.takeIf { it.isNotBlank() }?.let { "[$it] " } ?: ""
            "$src${u.title.ifBlank { "New update" }}"
        }
        val body = if (updates.size > 5) lines + listOf("…and ${updates.size - 5} more") else lines

        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body.first())
            .setStyle(NotificationCompat.BigTextStyle().bigText(body.joinToString("\n")))
            .setNumber(updates.size)
            .setGroup("pp_updates")
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        context.getSystemService(NotificationManager::class.java).notify(1, notification)
    }
}