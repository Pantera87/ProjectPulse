@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.BuildConfig
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.notif.Notifier
import com.pantera87.projectpulse.notif.SyncScheduler

private val INTERVALS = listOf(15 to "15 min", 30 to "30 min", 60 to "1 h", 240 to "4 h")

/**
 * App-level settings: connection status + re-connect, and the background
 * notification poll (interval + immediate check).
 */
@Composable
fun SettingsScreen(onOpenConnect: () -> Unit) {
    val app = App.instance
    val context = LocalContext.current
    val prefs = app.prefs
    val url by prefs.url.collectAsState()
    val configured by prefs.configured.collectAsState()
    val notifEnabled by prefs.notificationsEnabled.collectAsState()
    val intervalMin by prefs.notifIntervalMin.collectAsState()
    var canPost by remember { mutableStateOf(Notifier.canNotify(context)) }
    var checkedNow by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Settings") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "Connection",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                url.ifBlank { "No server set" },
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(onClick = onOpenConnect, modifier = Modifier.fillMaxWidth()) {
                Text(if (configured) "Reconnect" else "Connect")

            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))

            Text(
                "Notifications",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Row {
                Column(Modifier.weight(1f)) {
                    Text("Notify about new updates")
                    Text(
                        "Checks the server in the background for unread updates.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(
                    checked = notifEnabled,
                    onCheckedChange = { v ->
                        prefs.setNotificationsEnabled(v)
                        if (v) {
                            SyncScheduler.schedule(app, intervalMin.toLong())
                        } else {
                            SyncScheduler.cancel(app)
                        }
                    },
                )
            }
            if (notifEnabled) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    INTERVALS.forEach { (min, label) ->
                        FilterChip(
                            selected = intervalMin == min,
                            onClick = {
                                if (intervalMin != min) {
                                    prefs.setNotifIntervalMin(min)
                                    SyncScheduler.schedule(app, min.toLong())
                                }
                            },
                            label = { Text(label) },
                        )
                    }
                }
                if (!canPost) {
                    Text(
                        "Notifications are disabled in the system settings — " +
                            "enable them for ProjectPulse in Settings → Apps.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                Button(
                    onClick = {
                        SyncScheduler.runOnce(app)
                        checkedNow = true
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Check now")
                }
                if (checkedNow) {
                    Text(
                        "A background check was queued. A notification appears " +
                            "if there are unread updates.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(Modifier.height(8.dp))

            Text(
                "About",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                "ProjectPulse companion · v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                "Your updates stay on your server. This app stores the URL, " +
                    "an encrypted password and a local cache of recent updates.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
            }