@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.SourceDetail
import com.pantera87.projectpulse.data.Update

/**
 * One source's detail page: metadata, its stored snapshots (tap → WebView),
 * and its recent updates (tap → detail sheet). Server: GET /api/sources/:id
 * + GET /api/updates?source_id=N.
 */
@Composable
fun SourceDetailScreen(
    sourceId: Int,
    onOpenSnapshot: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val app = App.instance
    val context = LocalContext.current
    var detail by remember { mutableStateOf<SourceDetail?>(null) }
    var updates by remember { mutableStateOf<List<Update>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Update?>(null) }

    LaunchedEffect(sourceId) {
        when (val r = app.api.sourceDetail(sourceId)) {
            is ApiResult.Ok -> {
                detail = r.value
                loading = false
                when (val u = app.api.updates(sourceId = sourceId, limit = 50)) {
                    is ApiResult.Ok -> updates = u.value.updates
                    is ApiResult.Error -> { /* updates are secondary; ignore */ }
                }
            }
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    app.prefs.markConfigured(false)
                    return@LaunchedEffect
                }
                error = r.message
                loading = false
            }
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(detail?.source?.displayName ?: "Source") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error!!, color = MaterialTheme.colorScheme.error)
            }
            else -> {
                val d = detail!!
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                ) {
                    Row {
                        Text(
                            d.source.type,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        d.source.category?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                "  ·  $it",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        d.source.subcategory?.takeIf { it.isNotBlank() }?.let {
                            Text(
                                "  ·  $it",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Text(
                        d.source.url,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .clickable {
                                runCatching {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(d.source.url)),
                                    )
                                }
                            },
                    )
                    d.source.goal?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    d.source.notes?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                    DetailSectionTitle(
                        "Snapshots (${d.snapshots.size})",
                        modifier = Modifier.padding(top = 20.dp),
                    )
                    if (d.snapshots.isEmpty()) {
                        Text(
                            "No snapshots stored yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    d.snapshots.forEach { snap ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenSnapshot(snap.version) }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "v${snap.version}",
                                style = MaterialTheme.typography.titleSmall,
                                modifier = Modifier.weight(1f),
                            )
                            if (snap.archived == true) {
                                Text(
                                    "archived",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(end = 8.dp),
                                )
                            }
                            Text(
                                "${snap.sizeLabel}  ·  ${formatTime(snap.fetched_at)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    DetailSectionTitle(
                        "Recent updates (${updates.size})",
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    if (updates.isEmpty()) {
                        Text(
                            "No updates yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    updates.forEach { u ->
                        UpdateRow(u) { selected = u }
                    }
                }
            }
        }
    }

    selected?.let { u ->
        UpdateDetailSheet(
            update = u,
            onDismiss = { selected = null },
            onReadStateChanged = { read ->
                val stamp = if (read) java.time.Instant.now().toString() else null
                selected = u.copy(read_at = stamp)
                updates = updates.map { if (it.id == u.id) it.copy(read_at = stamp) else it }
            },
            onDeleteConfirmed = {
                updates = updates.filter { it.id != u.id }
                selected = null
            },
        )
    }
}

@Composable
private fun DetailSectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(bottom = 4.dp),
    )
}
