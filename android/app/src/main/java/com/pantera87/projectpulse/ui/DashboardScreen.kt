@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
fun DashboardScreen(
    refreshPulse: Int = 0,
    onOpenUpdates: () -> Unit,
    onOpenSearch: () -> Unit,
) {
    val app = App.instance
    var refreshing by remember { mutableStateOf(false) }
    var refreshKey by remember { mutableStateOf(0) }
    var dash by remember { mutableStateOf<Dashboard?>(null) }
    var sourceRows by remember { mutableStateOf<List<SourceRow>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val uiMode = rememberUiMode()

    // Re-keyed on pull-to-refresh (and same-tab re-taps): restarting the
    // effect cancels the pending poll delay and fetches immediately.
    LaunchedEffect(refreshKey, refreshPulse) {
        while (true) {
            val d = app.api.dashboard()
            when (d) {
                is ApiResult.Error -> {
                    if (d.needsAuth) {
                        refreshing = false
                        app.prefs.markConfigured(false)
                        return@LaunchedEffect
                    }
                    error = d.message
                    refreshing = false
                }
                is ApiResult.Ok -> {
                    dash = d.value
                    error = null
                    refreshing = false
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
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = {
                    GradText(
                        "ProjectPulse",
                        style = TextStyle(
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-0.02f).sp,
                        ),
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
                actions = {
                    IconButton(onClick = onOpenSearch) {
                        Icon(
                            Icons.Default.Search,
                            "Search",
                            tint = Palette.GhostText,
                        )
                    }
                    if (data != null && data.counts.total > 0) {
                        Text(
                            "${data.counts.total} unread",
                            fontSize = 12.sp,
                            color = Palette.TextSecondary,
                            modifier = Modifier.padding(end = 12.dp),
                        )
                    }
                },
            )
        },
    ) { padding ->
        PullToRefresh(
            refreshing = refreshing,
            onRefresh = {
                refreshing = true
                refreshKey++
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            AdaptiveContent(uiMode, maxWidth = 720.dp) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(
                        start = 12.dp,
                        end = 12.dp,
                        top = 4.dp,
                        // The tablet nav rail replaces the floating pill: no
                        // bottom clearance needed.
                        bottom = if (uiMode.isTablet) 16.dp else FLOATING_BAR_BOTTOM_PADDING,
                    ),
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
                        var item = 0
                        if (d.counts.total > 0) {
                            Box(Modifier.rise(0)) {
                                UnreadSummary(d.counts.critical, d.counts.high, d.counts.normal)
                            }
                        }
                        if (d.attention.isNotEmpty()) {
                            SectionTitle("Needs attention")
                            val attention = d.attention.take(5)
                            if (uiMode.isTablet) {
                                TwoColumnList(attention) { _, u ->
                                    UpdateRow(u) { onOpenUpdates() }
                                }
                            } else {
                                attention.forEach { u ->
                                    UpdateRow(u, modifier = Modifier.rise(item++)) { onOpenUpdates() }
                                }
                            }
                        }
                        SectionTitle("Latest")
                        val latest = d.latest.take(10)
                        if (uiMode.isTablet) {
                            TwoColumnList(latest) { _, u ->
                                UpdateRow(u) { onOpenUpdates() }
                            }
                        } else {
                            latest.forEach { u ->
                                UpdateRow(u, modifier = Modifier.rise(item++)) { onOpenUpdates() }
                            }
                        }
                        if (sourceRows.isNotEmpty()) {
                            SectionTitle("Sources")
                            if (uiMode.isTablet) {
                                TwoColumnList(sourceRows) { _, row ->
                                    SourceCard(
                                        name = row.name,
                                        latestTitle = row.latestTitle,
                                        latestTime = row.latestTime,
                                        activity = row.activity,
                                    )
                                }
                            } else {
                                sourceRows.forEach { row ->
                                    SourceCard(
                                        name = row.name,
                                        latestTitle = row.latestTitle,
                                        latestTime = row.latestTime,
                                        activity = row.activity,
                                        index = item++,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            }
        }
        }
    }
}

/** Web `.section-title`: 12px, 600, letter-spacing 1.2, uppercase, #94a3b8. */
@Composable
private fun SectionTitle(text: String) {
    Text(
        text.uppercase(),
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.2.sp,
        color = Palette.TextSecondary,
        modifier = Modifier.padding(top = 22.dp, bottom = 10.dp, start = 4.dp),
    )
}

@Composable
private fun UnreadSummary(critical: Int, high: Int, normal: Int) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (critical > 0) StatChip("CRIT $critical", Palette.Critical)
        if (high > 0) StatChip("HIGH $high", Palette.High)
        if (normal > 0) StatChip("$normal", Palette.BrandBlue)
    }
}

/** Web `.stat` chip: 16% tint fill + 30% tint border, tinted label. */
@Composable
private fun StatChip(label: String, tint: Color) {
    Box(
        modifier = Modifier
            .background(color = tint.copy(alpha = 0.16f), shape = CircleShape)
            .drawBehind {
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = tint.copy(alpha = 0.3f),
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(size.height / 2f),
                    style = Stroke(width = stroke),
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = tint,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
        )
    }
}

fun priorityColor(p: String): androidx.compose.ui.graphics.Color = when (p) {
    "critical" -> androidx.compose.ui.graphics.Color(0xFFFF5C7A)
    "high" -> androidx.compose.ui.graphics.Color(0xFFFF9E64)
    else -> androidx.compose.ui.graphics.Color(0xFF818CF8)
}

@Composable
fun UpdateRow(
    update: Update,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    GlassCard(
        onClick = onClick,
        radius = 12.dp,
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .then(
                if (update.read_at != null) {
                    Modifier.graphicsLayer { alpha = 0.6f }
                } else Modifier,
            ),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PriorityDot(priority = update.priority)
                Text(
                    update.title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Foreground,
                    modifier = Modifier.weight(1f),
                )
                if (update.priority == "critical" || update.priority == "high") {
                    Spacer(Modifier.width(8.dp))
                    PriorityBadge(update.priority)
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatTime(update.created_at),
                    fontSize = 12.sp,
                    color = Palette.TextTertiary,
                )
                update.source_name?.let {
                    Text(
                        "  ·  $it",
                        fontSize = 12.sp,
                        color = Palette.TextTertiary,
                    )
                }
                if (update.kind.isNotBlank()) {
                    Spacer(Modifier.width(8.dp))
                    KindBadge(update.kind)
                }
            }
        }
    }
}

/** Web `.pri-dot`: solid dot with a soft glow ring. */
@Composable
private fun PriorityDot(priority: String, modifier: Modifier = Modifier) {
    val c = priorityColor(priority)
    Box(
        modifier = modifier
            .padding(end = 10.dp)
            .size(16.dp)
            .drawBehind {
                drawCircle(color = c.copy(alpha = 0.25f), radius = size.minDimension / 2f)
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color = c, shape = CircleShape),
        )
    }
}

@Composable
private fun SourceCard(
    name: String,
    latestTitle: String,
    latestTime: String,
    activity: List<Int>?,
    index: Int = 0,
) {
    GlassCard(
        radius = 12.dp,
        tile = true,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .rise(index),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    color = Palette.Foreground,
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                )
                Sparkline(values = activity)
            }
            Text(
                latestTitle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall,
                color = Palette.TextSecondary,
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(
                latestTime,
                style = MaterialTheme.typography.labelSmall,
                color = Palette.TextTertiary,
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
                color = Palette.BrandViolet.copy(alpha = 0.55f),
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

