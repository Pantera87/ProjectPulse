@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Update
import kotlinx.coroutines.launch

/**
 * Full view of one update: body, payload, open-link, and the read/delete
 * actions (server: POST /api/updates/:id and DELETE /api/updates/:id).
 */
@Composable
fun UpdateDetailSheet(
    update: Update,
    onDismiss: () -> Unit,
    onReadStateChanged: (read: Boolean) -> Unit,
    onDeleteConfirmed: () -> Unit,
) {
    val app = App.instance
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 40.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PriorityDot(update.priority)
                Text(
                    update.kind,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 8.dp),
                )
                Text(
                    "  ·  ${formatTime(update.created_at)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                update.title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(top = 8.dp),
            )
            update.source_name?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            update.summary?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            prettyPayload(update.payload_json)?.let {
                Text(
                    "Details",
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.padding(top = 16.dp),
                )
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 6.dp),
                ) {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(10.dp),
                    )
                }
            }
            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
            Row(Modifier.padding(top = 20.dp)) {
                androidx.compose.material3.Button(
                    enabled = !busy,
                    onClick = {
                        val target = !update.isRead
                        scope.launch {
                            busy = true
                            error = null
                            val r = app.api.markRead(listOf(update.id), target)
                            busy = false
                            when (r) {
                                is ApiResult.Ok -> onReadStateChanged(target)
                                is ApiResult.Error -> {
                                    error = r.message
                                    if (r.needsAuth) app.prefs.markConfigured(false)
                                }
                            }
                        }
                    },
                ) {
                    Text(if (update.isRead) "Mark unread" else "Mark read")
                }
                if (update.url?.isNotBlank() == true) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = {
                            runCatching {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, android.net.Uri.parse(update.url)),
                                )
                            }
                        },
                        modifier = Modifier.padding(start = 8.dp),
                    ) { Text("Open link") }
                }
            }
            androidx.compose.material3.TextButton(
                enabled = !busy,
                onClick = { confirmDelete = true },
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Text("Delete", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDelete) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete update") },
            text = { Text("Update will be permanently deleted from the server.") },
            confirmButton = {
                androidx.compose.material3.Button(
                    enabled = !busy,
                    onClick = {
                        confirmDelete = false
                        scope.launch {
                            busy = true
                            val r = app.api.deleteUpdate(update.id)
                            busy = false
                            if (r is ApiResult.Ok) onDeleteConfirmed()
                        }
                    },
                ) { Text("Delete") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { confirmDelete = false }) {
                    Text("Cancel")
                }
            },
        )
    }
}

/** Pretty-prints a payload_json column value for display; null when empty. */
private fun prettyPayload(raw: String?): String? =
    raw?.takeIf { it.isNotBlank() && it != "{}" }
        ?.let {
            runCatching {
                prettyJson
                    .parseToJsonElement(it).toString()
            }.getOrNull()
        }

@Composable
private fun PriorityDot(priority: String) {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .padding(start = 0.dp)
            .size(10.dp),
    ) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            drawCircle(color = priorityColor(priority), radius = size.minDimension / 2)
        }
    }
}

private val prettyJson = kotlinx.serialization.json.Json { prettyPrint = true }
