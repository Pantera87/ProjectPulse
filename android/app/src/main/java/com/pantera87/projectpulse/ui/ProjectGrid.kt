package com.pantera87.projectpulse.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.NotificationsOff
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.RssFeed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.data.LatestUpdate
import com.pantera87.projectpulse.data.Source
import java.time.Instant

/**
 * Card density for the dashboard project grid (web `density` prop):
 * [Compact] drops the latest-update and goal lines, [Comfortable] shows them.
 */
enum class SourceCardDensity {
    Compact,
    Comfortable,
}

/**
 * Home tab project grid — the web dashboard's source-card grid, ported.
 * Column count adapts to the available width: as many columns as fit given
 * each card's minimum width (170 dp compact / 260 dp comfortable) and the
 * 10 dp gutter, between 1 and 6.
 */
@Composable
fun ProjectGrid(
    sources: List<Source>,
    density: SourceCardDensity = SourceCardDensity.Compact,
    /** Per-source 7-day update counts, keyed by source id (web `activityBySource`). */
    activityBySource: Map<String, List<Int>> = emptyMap(),
    /** Updates created since each source's last check (web `newsSinceCheck`). */
    newsSinceCheck: Map<String, Int> = emptyMap(),
    /** Newest update of each source, shown on comfortable cards. */
    latestBySource: Map<String, LatestUpdate> = emptyMap(),
    onOpenSource: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (sources.isEmpty()) {
        Box(
            modifier = modifier.fillMaxWidth().height(120.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                "No projects yet",
                fontSize = 14.sp,
                color = LocalPpTokens.current.GhostText,
                textAlign = TextAlign.Center,
            )
        }
        return
    }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val minCol = if (density == SourceCardDensity.Comfortable) 260.dp else 170.dp
        val cols = (maxWidth / (minCol + 10.dp) + 0.5f).toInt().coerceIn(1, 6)
        LazyVerticalGrid(
            columns = GridCells.Fixed(cols),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(vertical = 5.dp),
        ) {
            items(sources, key = { it.id }) { s ->
                SourceCard(
                    source = s,
                    density = density,
                    activity = activityBySource[s.id.toString()],
                    newsSinceCheck = newsSinceCheck[s.id.toString()] ?: 0,
                    latest = latestBySource[s.id.toString()],
                    onClick = { onOpenSource(s.id) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

/**
 * Source stat card — the web `source-card.tsx` comfortable/compact tile:
 * aurora stripe on the left edge, name row with the type glyph tile, the
 * metric row (big unread number, sparkline, "+N since last check"), and the
 * category labels; comfortable cards add the latest-update line, the goal
 * text and the check-health status line.
 */
@Composable
private fun SourceCard(
    source: Source,
    density: SourceCardDensity,
    activity: List<Int>?,
    newsSinceCheck: Int,
    latest: LatestUpdate?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val comfortable = density == SourceCardDensity.Comfortable
    GlassCard(
        modifier = modifier,
        radius = 12.dp,
        onClick = onClick,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    // Web `.aurora-stripe`: 3dp brand-gradient bar pinned to
                    // the left edge, inset 10dp top and bottom.
                    val stripe = 3.dp.toPx()
                    val inset = 10.dp.toPx()
                    drawRoundRect(
                        brush = t.BrandBrush,
                        topLeft = Offset.Zero,
                        size = Size(stripe, size.height - 2 * inset),
                        cornerRadius = CornerRadius(stripe / 2f, stripe / 2f),
                    )
                }
                .padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    source.displayName,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = t.Foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (source.isMuted) {
                    Spacer(Modifier.size(6.dp))
                    Icon(
                        Icons.Outlined.NotificationsOff,
                        contentDescription = "Muted",
                        modifier = Modifier.size(14.dp),
                        tint = Color(0xFFFFD28A),
                    )
                }
                Spacer(Modifier.size(6.dp))
                TypeGlyphTile(source.type)
            }

            // Metric row: big unread number + logo on the left; sparkline,
            // since-check badge and category labels on the right.
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        source.unread.toString(),
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        maxLines = 1,
                    )
                    Text(
                        "UNREAD",
                        fontSize = 9.sp,
                        letterSpacing = 0.8.sp,
                        color = t.TextTertiary,
                        maxLines = 1,
                    )
                }
                if (!source.logo.isNullOrEmpty()) {
                    Spacer(Modifier.size(10.dp))
                    SourceLogoBox(source = source, size = 30.dp)
                }
                Spacer(Modifier.weight(1f))
                if (activity != null && activity.size >= 2) {
                    Sparkline(
                        data = activity,
                        modifier = Modifier.size(width = 72.dp, height = 28.dp),
                    )
                }
                if (newsSinceCheck > 0) {
                    Spacer(Modifier.size(6.dp))
                    SinceCheckBadge(newsSinceCheck)
                }
                val cat = source.category?.takeIf { it.isNotBlank() }
                val sub = source.subcategory?.takeIf { it.isNotBlank() }
                if (cat != null || sub != null) {
                    Spacer(Modifier.size(8.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        if (cat != null) CategoryPill(cat.asCategoryLabel())
                        if (sub != null) {
                            Text(
                                sub.asCategoryLabel(),
                                fontSize = 10.sp,
                                color = t.TextTertiary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                    }
                }
            }

            if (comfortable && latest != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier
                            .size(6.dp)
                            .background(color = priorityColor(latest.priority), shape = CircleShape),
                    )
                    Spacer(Modifier.size(5.dp))
                    Text(
                        latest.title,
                        fontSize = 12.sp,
                        color = t.TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.size(6.dp))
                    Text(
                        formatTime(latest.created_at),
                        fontSize = 11.sp,
                        color = t.TextTertiary,
                        maxLines = 1,
                    )
                }
            }
            if (comfortable && !source.goal.isNullOrBlank()) {
                Text(
                    source.goal.orEmpty(),
                    fontSize = 12.sp,
                    color = t.TextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            source.last_checked_at?.let { checked ->
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SourceStatusDot(
                        lastCheckedAt = source.last_checked_at,
                        intervalHours = source.check_interval_hours,
                        lastError = source.last_error,
                    )
                    Spacer(Modifier.size(5.dp))
                    Text(
                        "last checked ${formatTime(checked)}",
                        fontSize = 11.sp,
                        color = t.TextTertiary,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * Thin 7-day line sparkline (web `dashboard/sparkline.tsx`): brand-gradient
 * polyline over the last 7 daily update counts (index 0 = 6 days ago) with a
 * subtle area fill. All-zero data renders a flat baseline.
 */
@Composable
private fun Sparkline(data: List<Int>, modifier: Modifier = Modifier) {
    val max = (data.maxOrNull() ?: 1).coerceAtLeast(1)
    val flat = data.sum() == 0
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val n = data.size
        if (n < 2) return@Canvas
        val step = w / (n - 1)
        val pts = List(n) { i ->
            val v = data[i].toFloat() / max
            val y = if (flat) h - 1.5f else h - 1.5f - v * (h - 3f)
            Offset(i * step, y)
        }
        // Area fill below the line (web `spk-area` gradient).
        drawPath(
            brush = Brush.verticalGradient(listOf(Color(0x38E879F9), Color.Transparent)),
            path = Path().apply {
                moveTo(0f, h)
                pts.forEach { lineTo(it.x, it.y) }
                lineTo(w, h)
                close()
            },
        )
        // Line: Compose has no gradient stroke, so each segment takes its
        // position in the violet→fuchsia ramp as a solid color.
        val c0 = Color(0xFF8B5CF6)
        val c1 = Color(0xFFE879F9)
        for (i in 0 until n - 1) {
            val f = if (n > 2) i / (n - 2).toFloat() else 0f
            drawLine(
                color = lerp(c0, c1, f),
                start = pts[i],
                end = pts[i + 1],
                strokeWidth = 1.5.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }
    }
}

/** Check health of a source (web `status-dot.tsx` `SourceStatus`). */
private enum class SourceStatus { Never, Fresh, Stale, Error }

/** Web `statusOf`: overdue when the source went 50% past its check interval. */
private fun sourceStatus(
    lastCheckedAt: String?,
    intervalHours: Int?,
    lastError: String?,
): SourceStatus {
    if (!lastError.isNullOrBlank()) return SourceStatus.Error
    val last = lastCheckedAt ?: return SourceStatus.Never
    val ageH = try {
        (System.currentTimeMillis() - Instant.parse(last).toEpochMilli()) / 3_600_000.0
    } catch (e: Exception) {
        0.0
    }
    val interval = (intervalHours ?: 6).toFloat()
    return if (ageH > interval * 1.5f) SourceStatus.Stale else SourceStatus.Fresh
}

private fun SourceStatus.dotColor(): Color = when (this) {
    SourceStatus.Never -> Color(0xFF64748B) // slate-500
    SourceStatus.Fresh -> Color(0xFF34D399) // emerald-400
    SourceStatus.Stale -> Color(0xFFFBBF24) // amber-400
    SourceStatus.Error -> Color(0xFFF87171) // red-400
}

/** 8dp check-health dot (web `StatusDot` minus the tooltip text). */
@Composable
private fun SourceStatusDot(
    lastCheckedAt: String?,
    intervalHours: Int?,
    lastError: String?,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .size(8.dp)
            .background(
                color = sourceStatus(lastCheckedAt, intervalHours, lastError).dotColor(),
                shape = CircleShape,
            ),
    )
}

/**
 * 20dp brand-gradient tile with the source-type glyph (web `.brand-tile` +
 * `TYPE_ICON` map: globe / github / rss).
 */
@Composable
private fun TypeGlyphTile(type: String, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    val icon = when (type) {
        "github" -> Icons.Outlined.Code
        "rss" -> Icons.Outlined.RssFeed
        else -> Icons.Outlined.Public
    }
    Box(
        modifier = modifier
            .size(20.dp)
            .background(brush = t.BrandBrush, shape = RoundedCornerShape(6.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = type,
            modifier = Modifier.size(12.dp),
            tint = Color.White,
        )
    }
}

/** "+N since last check" pill (web: emerald border, fill and text). */
@Composable
private fun SinceCheckBadge(count: Int, modifier: Modifier = Modifier) {
    Text(
        "+$count since last check",
        fontSize = 10.sp,
        color = Color(0xFF6EE7B7),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .border(1.dp, Color(0x6634D399), RoundedCornerShape(20.dp))
            .background(Color(0x1A34D399), RoundedCornerShape(20.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Category pill (web: white rounded pill, bold uppercase dark label). */
@Composable
private fun CategoryPill(label: String, modifier: Modifier = Modifier) {
    Text(
        label.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFF0F172A),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier
            .background(Color.White, RoundedCornerShape(20.dp))
            .padding(horizontal = 10.dp, vertical = 3.dp),
    )
}
