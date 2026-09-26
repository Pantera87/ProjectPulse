@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.Aggregates
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Dashboard
import com.pantera87.projectpulse.data.Source
import com.pantera87.projectpulse.data.Update
import kotlinx.coroutines.delay

private const val POLL_MS = 30_000L

/**
 * Home tab — the web dashboard ported: widget-row boxes on top (welcome hero,
 * read-rate gauge, "this week" ring), a borderless type-tab row, a 2-3 column
 * project grid, and the two update lists ("Needs attention", "Latest").
 * On tablet the update lists move into a fixed rail beside the main pane.
 */
@Composable
fun DashboardScreen(
    refreshPulse: Int = 0,
    onOpenUpdates: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenSource: (Int) -> Unit,
) {
    val app = App.instance
    var refreshing by remember { mutableStateOf(false) }
    var refreshKey by remember { mutableStateOf(0) }
    var dash by remember { mutableStateOf<Dashboard?>(null) }
    var sources by remember { mutableStateOf<List<Source>>(emptyList()) }
    var selectedTab by remember { mutableStateOf("All") }
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
                    val s = app.api.sources()
                    if (s is ApiResult.Ok) sources = s.value
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
                            tint = LocalPpTokens.current.GhostText,
                        )
                    }
                    if (data != null && data.counts.total > 0) {
                        Text(
                            "${data.counts.total} unread",
                            fontSize = 12.sp,
                            color = LocalPpTokens.current.TextSecondary,
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
            // The denser tablet two-pane layout needs more room than the old
            // 720dp column cap.
            AdaptiveContent(uiMode, maxWidth = 1100.dp) {
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

                        else -> data?.let { d ->
                            val agg = d.aggregates ?: Aggregates()
                            if (uiMode.isTablet) {
                                TabletDashboard(
                                    d = d,
                                    agg = agg,
                                    sources = sources,
                                    selectedTab = selectedTab,
                                    onSelectedTab = { selectedTab = it },
                                    onOpenUpdates = onOpenUpdates,
                                    onOpenSource = onOpenSource,
                                )
                            } else {
                                PhoneDashboard(
                                    d = d,
                                    agg = agg,
                                    sources = sources,
                                    selectedTab = selectedTab,
                                    onSelectedTab = { selectedTab = it },
                                    onOpenUpdates = onOpenUpdates,
                                    onOpenSource = onOpenSource,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Phone: KPI + gauge side by side, full-width "This week", tabs, grid. */
@Composable
private fun PhoneDashboard(
    d: Dashboard,
    agg: Aggregates,
    sources: List<Source>,
    selectedTab: String,
    onSelectedTab: (String) -> Unit,
    onOpenUpdates: () -> Unit,
    onOpenSource: (Int) -> Unit,
) {
    Row(
        // Fixed height: the row lives in a vertically scrolling column, where
        // an unbounded height would let fillMaxHeight children collapse.
        Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
            .height(224.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        WelcomeBox(
            unread = d.counts.total,
            updatesThisWeek = agg.updatesThisWeek,
            sourcesUpdatedThisWeek = agg.sourcesUpdatedThisWeek,
            sourcesTotal = agg.sourcesTotal,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
        ReadRateGaugeBox(
            totalUpdates = agg.totalUpdates,
            readUpdates = agg.readUpdates,
            modifier = Modifier.weight(1f).fillMaxHeight(),
        )
    }
    ThisWeekBox(
        updatesThisWeek = agg.updatesThisWeek,
        sourcesUpdatedThisWeek = agg.sourcesUpdatedThisWeek,
        sourcesTotal = agg.sourcesTotal,
        updatesPrevWeek = agg.updatesPrevWeek,
        activityByDay = agg.activityTotalByDay,
        modifier = Modifier.padding(vertical = 5.dp),
    )
    TypeTabs(selected = selectedTab, onSelect = onSelectedTab)
    ProjectGrid(
        sources = filteredSources(sources, selectedTab),
        columns = 2,
        onOpenSource = onOpenSource,
    )
    UpdateLists(
        d = d,
        onOpenUpdates = onOpenUpdates,
    )
}

/**
 * Tablet: full-width stacked rows — gauge row on top, then the update
 * lists as horizontal rows, then the type tabs and the 3-col project grid.
 */
@Composable
private fun TabletDashboard(
    d: Dashboard,
    agg: Aggregates,
    sources: List<Source>,
    selectedTab: String,
    onSelectedTab: (String) -> Unit,
    onOpenUpdates: () -> Unit,
    onOpenSource: (Int) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            // Fixed height bounds the row inside the scrolling column so the
            // fillMaxHeight boxes stretch instead of collapsing. The "This
            // week" card grew (pulse meter on top, activity overview below),
            // so the row is taller than the old gauge-only layout.
            Modifier
                .fillMaxWidth()
                .padding(vertical = 5.dp)
                .height(336.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            WelcomeBox(
                unread = d.counts.total,
                updatesThisWeek = agg.updatesThisWeek,
                sourcesUpdatedThisWeek = agg.sourcesUpdatedThisWeek,
                sourcesTotal = agg.sourcesTotal,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            ReadRateGaugeBox(
                totalUpdates = agg.totalUpdates,
                readUpdates = agg.readUpdates,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            ThisWeekBox(
                updatesThisWeek = agg.updatesThisWeek,
                sourcesUpdatedThisWeek = agg.sourcesUpdatedThisWeek,
                sourcesTotal = agg.sourcesTotal,
                updatesPrevWeek = agg.updatesPrevWeek,
                activityByDay = agg.activityTotalByDay,
                compact = true,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }
        AttentionGrid(
            updates = d.attention.take(5),
            onOpenUpdates = onOpenUpdates,
        )
        UpdatesRow(
            title = "Latest",
            updates = d.latest.take(10),
            onOpenUpdates = onOpenUpdates,
        )
        TypeTabs(selected = selectedTab, onSelect = onSelectedTab)
        ProjectGrid(
            sources = filteredSources(sources, selectedTab),
            columns = 5,
            onOpenSource = onOpenSource,
        )
    }
}

private fun filteredSources(sources: List<Source>, tab: String): List<Source> {
    val type = tabToType(tab) ?: return sources
    return sources.filter { it.type == type }
}

/** Phone: "Needs attention" (top 5) + "Latest" (top 10) as vertical lists. */
@Composable
private fun UpdateLists(
    d: Dashboard,
    onOpenUpdates: () -> Unit,
) {
    if (d.attention.isNotEmpty()) {
        SectionTitle("Needs attention")
        d.attention.take(5).forEachIndexed { i, u ->
            UpdateRow(u, modifier = Modifier.rise(i)) { onOpenUpdates() }
        }
    }
    SectionTitle("Latest")
    d.latest.take(10).forEachIndexed { i, u ->
        UpdateRow(u, modifier = Modifier.rise(i)) { onOpenUpdates() }
    }
}

/**
 * Tablet: one horizontal row of compact update cards. Hidden entirely when
 * the list is empty.
 */
@Composable
private fun UpdatesRow(
    title: String,
    updates: List<Update>,
    onOpenUpdates: () -> Unit,
) {
    if (updates.isEmpty()) return
    SectionTitle(title)
    LazyRow(
        contentPadding = PaddingValues(horizontal = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(updates) { u ->
            CompactUpdateCard(
                u,
                onClick = onOpenUpdates,
                modifier = Modifier.width(320.dp),
            )
        }
    }
}

/**
 * Tablet: "Needs attention" as a 4-per-row grid of compact cards. Hidden
 * entirely when the list is empty.
 */
@Composable
private fun AttentionGrid(
    updates: List<Update>,
    onOpenUpdates: () -> Unit,
) {
    if (updates.isEmpty()) return
    SectionTitle("Needs attention")
    updates.chunked(4).forEach { rowItems ->
        Row(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            rowItems.forEach { u ->
                CompactUpdateCard(
                    u,
                    onClick = onOpenUpdates,
                    modifier = Modifier.weight(1f),
                )
            }
            repeat(4 - rowItems.size) {
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Fixed-width card for the tablet horizontal update rows. */
@Composable
private fun CompactUpdateCard(
    update: Update,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassCard(
        onClick = onClick,
        radius = 12.dp,
        modifier = modifier
            .then(
                if (update.read_at != null) {
                    Modifier.graphicsLayer { alpha = 0.6f }
                } else Modifier,
            ),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PriorityDot(priority = update.priority)
                Text(
                    update.title,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    color = LocalPpTokens.current.Foreground,
                    modifier = Modifier.weight(1f),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatTime(update.created_at),
                    fontSize = 12.sp,
                    color = LocalPpTokens.current.TextTertiary,
                )
                update.source_name?.let {
                    Text(
                        "  ·  $it",
                        fontSize = 12.sp,
                        color = LocalPpTokens.current.TextTertiary,
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

/** Web `.section-title`: 12px, 600, letter-spacing 1.2, uppercase, #94a3b8. */
@Composable
private fun SectionTitle(text: String) {
    Text(
        text.uppercase(),
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.2.sp,
        color = LocalPpTokens.current.TextSecondary,
        modifier = Modifier.padding(top = 22.dp, bottom = 10.dp, start = 4.dp),
    )
}

fun priorityColor(p: String): Color = when (p) {
    "critical" -> Color(0xFFFF5C7A)
    "high" -> Color(0xFFFF9E64)
    else -> Color(0xFF818CF8)
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
                    color = LocalPpTokens.current.Foreground,
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
                    color = LocalPpTokens.current.TextTertiary,
                )
                update.source_name?.let {
                    Text(
                        "  ·  $it",
                        fontSize = 12.sp,
                        color = LocalPpTokens.current.TextTertiary,
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
