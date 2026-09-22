@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Dashboard
import com.pantera87.projectpulse.data.Source
import com.pantera87.projectpulse.data.Update
import kotlinx.coroutines.delay

private const val POLL_MS = 30_000L

private data class SourceRow(
    val name: String,
    val latestTitle: String,
    val latestTime: String,
    val activity: List<Int>?,
)

@Composable
fun DashboardScreen(onOpenUpdates: () -> Unit) {
    val app = App.instance
    var dash by remember { mutableStateOf<Dashboard?>(null) }
    var sourceRows by remember { mutableStateOf<List<SourceRow>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
            val d = app.api.dashboard()
            when (d) {
                is ApiResult.Error -> {
                    if (d.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@LaunchedEffect
                    }
                    error = d.message
                }
                is ApiResult.Ok -> {
                    dash = d.value
                    error = null
                    // Join source names for the source cards.
                    val s = app.api.sources()
                    val names: Map<Int, Source> =
                        if (s is ApiResult.Ok) s.value.associateBy({ it.id }) else emptyMap()
                    sourceRows = d.value.latestBySource.map { entry ->
                        val sid = entry.key
                        val lu = entry.value
                        val src = names[sid.toIntOrNull() ?: -1]
                        SourceRow(
                            name = src?.displayName ?: "Source $sid",
                            latestTitle = lu.title,
                            latestTime = formatTime(lu.created_at),
                            activity = d.value.activityBySource[sid],
                        )
                    }
                }
            }
            delay(POLL_MS)
        }
    }

    val data = dash

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ProjectPulse") },
                actions = {
                    if (data != null && data.counts.total > 0) {
                        Text(
                            "${data.counts.total} unread",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 16.dp),
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            when {
                data == null && error == null -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator() }

                error != null && data == null -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) { Text(error!!, color = MaterialTheme.colorScheme.error) }

                else -> {
                    data?.let { d ->
                        if (d.counts.total > 0) UnreadSummary(d.counts.critical, d.counts.high, d.counts.normal)
                        if (d.attention.isNotEmpty()) {
                            SectionTitle("Needs attention")
                            d.attention.take(5).forEach { u ->
                                UpdateRow(u) { onOpenUpdates() }
                            }
                        }
                        SectionTitle("Latest")
                        d.latest.take(10).forEach { u ->
                            UpdateRow(u) { onOpenUpdates() }
                        }
                        if (sourceRows.isNotEmpty()) {
                            SectionTitle("Sources")
                            sourceRows.forEach { row ->
                                SourceCard(
                                    name = row.name,
                                    latestTitle = row.latestTitle,
                                    latestTime = row.latestTime,
                                    activity = row.activity,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 20.dp, bottom = 8.dp, start = 4.dp),
    )
}

@Composable
private fun UnreadSummary(critical: Int, high: Int, normal: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (critical > 0) UnreadChip("CRIT $critical", 0xFFFF5C7A)
        if (high > 0) UnreadChip("HIGH $high", 0xFFFF9E64)
        if (normal > 0) UnreadChip("$normal", 0xFF818CF8)
    }
}

@Composable
private fun UnreadChip(label: String, color: Long) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = androidx.compose.ui.graphics.Color(color).copy(alpha = 0.18f),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = androidx.compose.ui.graphics.Color(color),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
        )
    }
}

fun priorityColor(p: String): androidx.compose.ui.graphics.Color = when (p) {
    "critical" -> androidx.compose.ui.graphics.Color(0xFFFF5C7A)
    "high" -> androidx.compose.ui.graphics.Color(0xFFFF9E64)
    else -> androidx.compose.ui.graphics.Color(0xFF818CF8)
}

@Composable
fun UpdateRow(update: Update, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .padding(end = 12.dp)
                .size(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.fillMaxSize()) {
                drawCircle(color = priorityColor(update.priority), radius = size.minDimension / 2)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                update.title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatTime(update.created_at),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                update.source_name?.let {
                    Text(
                        "  ·  $it",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SourceCard(
    name: String,
    latestTitle: String,
    latestTime: String,
    activity: List<Int>?,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                Sparkline(values = activity)
            }
            Text(
                latestTitle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(
                latestTime,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/** Tiny bar sparkline over the last N hourly update counts (web: 24 buckets). */
@Composable
private fun Sparkline(values: List<Int>?) {
    val points = values?.takeLast(24).orEmpty()
    val peak = points.maxOfOrNull { it }?.takeIf { it > 0 } ?: 1
    Canvas(
        modifier = Modifier
            .size(width = 72.dp, height = 20.dp),
    ) {
        if (points.isEmpty()) return@Canvas
        val barW = size.width / points.size
        points.forEachIndexed { i, v ->
            val h = (v.toFloat() / peak * size.height).coerceAtLeast(1f)
            drawRect(
                color = priorityColor("normal").copy(alpha = 0.7f),
                topLeft = androidx.compose.ui.geometry.Offset(i * barW, size.height - h),
                size = androidx.compose.ui.geometry.Size(barW * 0.7f, h),
            )
        }
    }
}

/** "now" / "42m" / "3h" / "Mar 4" — the web UI's relative-time convention. */
fun formatTime(iso: String): String = try {
    val inst = java.time.Instant.parse(iso)
    val now = java.time.ZonedDateTime.now()
    val secs = java.time.Duration.between(inst, now).seconds
    when {
        secs < 60 -> "now"
        secs < 3600 -> "${secs / 60}m"
        secs < 86_400 -> "${secs / 3600}h"
        else -> java.time.format.DateTimeFormatter.ofPattern("MMM d")
            .format(inst.atZone(java.time.ZoneOffset.systemDefault()).toLocalDate())
    }
} catch (e: Exception) {
    iso
}

