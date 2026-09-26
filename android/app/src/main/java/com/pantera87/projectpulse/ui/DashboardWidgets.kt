package com.pantera87.projectpulse.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Dashboard widget-row boxes, ported from the web dashboard's KPI card,
 * "Satisfaction Rate" and "Referral Tracking" widgets.
 */

private val TYPE_TABS = listOf("All", "GitHub", "RSS", "Websites")

internal fun tabToType(tab: String): String? = when (tab) {
    "GitHub" -> "github"
    "RSS" -> "rss"
    "Websites" -> "website"
    else -> null
}

/**
 * Canvas port of the web `CircleProgress` (gauges.tsx): full 360-degree ring
 * starting at 12 o'clock, round caps, transparent-to-color gradient stroke,
 * 400 ms animate (Animatable + LaunchedEffect, not animateFloatAsState).
 */
@Composable
fun CircleGauge(
    fraction: Float,
    color: Color,
    size: Dp,
    modifier: Modifier = Modifier,
    trackColor: Color? = null,
    strokeWidth: Dp? = null,
    center: @Composable BoxScope.() -> Unit,
) {
    val sw = strokeWidth ?: size * 0.075f
    val target = fraction.coerceIn(0f, 1f)
    val anim = remember { Animatable(0f) }
    LaunchedEffect(target) {
        anim.animateTo(target, tween(400))
    }
    val density = LocalDensity.current
    val totalPx = with(density) { size.toPx() }
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val swPx = with(density) { sw.toPx() }
            val pad = swPx / 2f
            val arcSize = Size(totalPx - swPx, totalPx - swPx)
            val tl = Offset(pad, pad)
            if (trackColor != null && trackColor.alpha > 0f) {
                drawArc(
                    brush = SolidColor(trackColor),
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = tl,
                    size = arcSize,
                    style = Stroke(width = swPx),
                )
            }
            val f = anim.value.coerceIn(0f, 1f)
            if (f > 0.0005f) {
                drawArc(
                    // Web's SVG fade: the gradient vector is rotated 90° so the
                    // right side of the ring is transparent and the left side is
                    // full color — the arc head brightens as it sweeps around.
                    brush = Brush.linearGradient(
                        colors = listOf(color.copy(alpha = 0f), color),
                        start = Offset(totalPx, totalPx / 2f),
                        end = Offset(0f, totalPx / 2f),
                    ),
                    startAngle = -90f,
                    sweepAngle = 360f * f,
                    useCenter = false,
                    topLeft = tl,
                    size = arcSize,
                    style = Stroke(width = swPx, cap = StrokeCap.Round),
                )
            }
        }
        center()
    }
}

/**
 * Web dashboard hero card: "Welcome back / ProjectPulse", the unread
 * summary line, and three inset stat boxes (Unread / This week / Sources)
 * over a blue-emerald radial glow.
 */
@Composable
fun WelcomeBox(
    unread: Int,
    updatesThisWeek: Int,
    sourcesUpdatedThisWeek: Int,
    sourcesTotal: Int,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    GlassCard(
        modifier = modifier.fillMaxWidth(),
        strong = true,
        radius = 20.dp,
    ) {
        Box(Modifier.fillMaxSize()) {
            // Web: radial blue glow top-right, soft emerald bottom-right.
            Box(
                Modifier
                    .fillMaxSize()
                    .drawBehind {
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    Color(0xFF3B82F6).copy(alpha = 0.5f),
                                    Color(0xFF6366F1).copy(alpha = 0.22f),
                                    Color.Transparent,
                                ),
                                center = Offset(size.width * 0.88f, size.height * 0.38f),
                                radius = size.width * 0.62f,
                            ),
                        )
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    Color(0xFF10B981).copy(alpha = 0.18f),
                                    Color.Transparent,
                                ),
                                center = Offset(size.width * 0.72f, size.height * 0.92f),
                                radius = size.width * 0.45f,
                            ),
                        )
                    },
            )
            Column(Modifier.fillMaxSize().padding(16.dp)) {
                Text(
                    "WELCOME BACK",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 0.8.sp,
                    color = Color(0xFF94A3B8),
                )
                Text(
                    "ProjectPulse",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = t.Foreground,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    "$unread unread update${if (unread == 1) "" else "s"} — $updatesThisWeek new from $sourcesUpdatedThisWeek of $sourcesTotal tracked source${if (sourcesTotal == 1) "" else "s"} this week.",
                    fontSize = 13.sp,
                    color = Color(0xFF94A3B8),
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Spacer(Modifier.weight(1f))
                Row(
                    Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    StatMini(unread, "Unread", Color.White, Modifier.weight(1f))
                    StatMini(updatesThisWeek, "This week", Color(0xFF35D28A), Modifier.weight(1f))
                    StatMini(sourcesTotal, "Sources", Color.White, Modifier.weight(1f))
                }
            }
        }
    }
}

/** Web `.stat-box`: 5% white fill, 10% white border, value + uppercase label. */
@Composable
private fun StatMini(
    value: Int,
    label: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.05f))
            .drawBehind {
                drawRoundRect(
                    color = Color.White.copy(alpha = 0.1f),
                    topLeft = Offset(0.5f, 0.5f),
                    size = Size(size.width - 1f, size.height - 1f),
                    cornerRadius = CornerRadius(12.dp.toPx()),
                    style = Stroke(width = 1f),
                )
            }
            .padding(horizontal = 6.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "$value",
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                color = valueColor,
            )
            Text(
                label.uppercase(),
                fontSize = 11.sp,
                letterSpacing = 0.5.sp,
                color = t.TextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

/** Web "Satisfaction Rate" card: read-rate gauge, % value + caption centered. */
@Composable
fun ReadRateGaugeBox(
    totalUpdates: Int,
    readUpdates: Int,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val fraction = if (totalUpdates > 0) readUpdates.toFloat() / totalUpdates else 0f
    GlassCard(
        modifier = modifier.fillMaxWidth(),
        strong = true,
        radius = 20.dp,
    ) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Text(
                "Read rate",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = t.Foreground,
            )
            Text(
                "of all stored updates",
                fontSize = 12.sp,
                color = t.TextSecondary,
            )
            // Web SatisfactionGauge: "0%" / "100%" pinned to the left and
            // right of the circle, white check icon above the value.
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "0%",
                        fontSize = 12.sp,
                        color = t.TextSecondary,
                    )
                    Spacer(Modifier.width(10.dp))
                    CircleGauge(
                        fraction = fraction,
                        color = t.BrandBlue,
                        trackColor = Color(0xFF22234B),
                        size = 112.dp,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                                tint = Color.White,
                            )
                            Text(
                                "${(fraction * 100f).toInt()}%",
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Medium,
                                color = t.Foreground,
                            )
                            Text(
                                "$readUpdates of $totalUpdates read",
                                fontSize = 11.sp,
                                color = t.TextTertiary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "100%",
                        fontSize = 12.sp,
                        color = t.TextSecondary,
                    )
                }
            }
        }
    }
}

/**
 * Web "This week" card, restructured: the upper half is the "Pulse" meter —
 * the web's teal RingGauge (transparent→color fade) with the `Pulse` caption,
 * the value and `Sources active`, beside the weekly stats; the lower half is
 * the web's "Activity overview" — trending-icon header, week-over-week delta
 * and the 7-day area chart. [compact] centers a smaller gauge for the
 * tablet's three-across widget row.
 */
@Composable
fun ThisWeekBox(
    updatesThisWeek: Int,
    sourcesUpdatedThisWeek: Int,
    sourcesTotal: Int,
    updatesPrevWeek: Int = 0,
    activityByDay: List<Int> = emptyList(),
    compact: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val fraction =
        if (sourcesTotal > 0) sourcesUpdatedThisWeek.toFloat() / sourcesTotal else 0f
    val weekDelta = updatesThisWeek - updatesPrevWeek
    val activityPct =
        if (sourcesTotal > 0) sourcesUpdatedThisWeek * 100 / sourcesTotal else 0
    GlassCard(
        modifier = modifier.fillMaxWidth(),
        strong = true,
        radius = 20.dp,
    ) {
        Box(Modifier.fillMaxSize()) {
            // Background rework: stacked radial glows over the flat glass
            // fill — brand blue from the top-right, cyan from the bottom
            // left, mirroring the chart's #2152FF → #02C6F3 stroke gradient.
            Box(
                Modifier
                    .fillMaxSize()
                    .drawBehind {
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    Color(0xFF2152FF).copy(alpha = 0.28f),
                                    Color.Transparent,
                                ),
                                center = Offset(size.width * 0.85f, size.height * 0.15f),
                                radius = size.width * 0.55f,
                            ),
                        )
                        drawRect(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    Color(0xFF02C6F3).copy(alpha = 0.12f),
                                    Color.Transparent,
                                ),
                                center = Offset(size.width * 0.1f, size.height * 0.95f),
                                radius = size.width * 0.5f,
                            ),
                        )
                    },
            )
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "This week",
                    fontSize = if (compact) 16.sp else 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = t.Foreground,
                )
                Spacer(Modifier.weight(1f))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    repeat(3) {
                        Box(
                            Modifier
                                .size(3.dp)
                                .background(Color(0xFF64748B), CircleShape),
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                }
            }
            // Upper half: the pulse meter (web RingGauge: "Pulse", value,
            // "Sources active" inside a full teal gauge with the fade).
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (!compact) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Updates",
                            fontSize = 13.sp,
                            color = t.TextSecondary,
                        )
                        Text(
                            "$updatesThisWeek",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = t.Foreground,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "Active sources",
                            fontSize = 13.sp,
                            color = t.TextSecondary,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "$sourcesUpdatedThisWeek",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = t.Foreground,
                            )
                            Text(
                                " / $sourcesTotal",
                                fontSize = 13.sp,
                                color = t.TextSecondary,
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                } else {
                    Spacer(Modifier.weight(1f))
                }
                CircleGauge(
                    fraction = fraction,
                    color = Color(0xFF05CD99),
                    size = if (compact) 88.dp else 104.dp,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "Pulse",
                            fontSize = if (compact) 11.sp else 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = t.TextSecondary,
                        )
                        Text(
                            String.format("%.1f", fraction * 10f),
                            fontSize = if (compact) 16.sp else 22.sp,
                            fontWeight = FontWeight.Bold,
                            color = t.Foreground,
                        )
                        Text(
                            "Sources active",
                            fontSize = if (compact) 10.sp else 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = t.TextSecondary,
                            maxLines = 1,
                        )
                    }
                }
                if (compact) Spacer(Modifier.weight(1f))
            }
            // Lower half: the web "Activity overview" card, as-is — header
            // (trending icon + title + week delta) over the 7-day area chart.
            Row(
                Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Default.TrendingUp,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = t.BrandBlue,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "Activity overview",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = t.Foreground,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    when {
                        weekDelta == 0 -> "no change vs last week"
                        weekDelta > 0 -> "($weekDelta) more than last week"
                        else -> "($weekDelta) fewer than last week"
                    },
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = if (weekDelta >= 0) Color(0xFF35D28A) else Color(0xFFEE5D50),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            ActivityAreaChart(
                values = activityByDay,
                // Compact mode lives in a fixed-height tablet row: take exactly
                // the height left in the card so the summary row below always
                // keeps its space. Phone (unbounded scroll) keeps the natural
                // 420:190 aspect.
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp)
                    .then(if (compact) Modifier.weight(1f) else Modifier),
            )
            // Activity summary row: compact one-liner under the chart — the
            // week's update count and the share of sources that were active.
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "$updatesThisWeek",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = t.Foreground,
                )
                Text(
                    " updates  ·  ${activityPct}% of sources active",
                    fontSize = 11.sp,
                    color = t.TextSecondary,
                )
            }
        }
        }
    }
}

/**
 * The web "Activity overview" chart (dashboard/area-chart.tsx) ported 1:1:
 * the same 420x190 design stretched to fill whatever space the card allows
 * (x and y scaled independently), with a labelled dashed y-grid, the
 * Catmull-Rom-smoothed line with a #2152FF→#02C6F3 gradient stroke over a
 * soft #2152FF fill, a dot per day and weekday labels — the line always
 * spans the full width and the dots always sit over their day label.
 * Data: index 0 = 6 days ago … 6 = today (`Aggregates.activityTotalByDay`).
 */
@Composable
private fun ActivityAreaChart(values: List<Int>, modifier: Modifier = Modifier) {
    // Web contract: exactly 7 values, index 0 = 6 days ago … 6 = today.
    // Older servers or a partial fetch may send fewer — pad the FRONT with
    // zeros so today stays the last entry.
    val data = remember(values) {
        List(7) { i -> values.getOrNull(values.size - 7 + i) ?: 0 }
    }
    val labels = remember {
        val today = java.time.LocalDate.now(java.time.ZoneOffset.UTC)
        (0 until 7).map { i ->
            WEEKDAYS[today.minusDays((6 - i).toLong()).dayOfWeek.value % 7]
        }
    }
    BoxWithConstraints(modifier = modifier) {
        // The card does not always allow the full 420:190 aspect (the tablet
        // row squeezes it; phone portrait is a different width). Clamp the
        // height to what the card actually has, then scale the 420x190 virtual
        // canvas uniformly (min of both axes) and centre it — line, dots,
        // grid, tick labels and weekday labels always stay aligned with
        // each other, whatever the card's shape.
        val maxW = constraints.maxWidth
        val maxH = constraints.maxHeight
        // constraints.* are physical px (Int); work in Dp from here on. An
        // Int.MAX_VALUE edge means "unbounded" (scrollable phone column). The
        // box always takes the full width the card gives (fillMaxWidth).
        val outerDensity = LocalDensity.current
        val unboundedW = maxW == Int.MAX_VALUE
        val unboundedH = maxH == Int.MAX_VALUE
        val boxW = if (unboundedW) 0.dp else with(outerDensity) { maxW.toFloat().toDp() }
        val boxH =
            if (!unboundedH) minOf(boxW * 190f / 420f, with(outerDensity) { maxH.toFloat().toDp() })
            else boxW * 190f / 420f
        Box(Modifier.size(width = boxW, height = boxH)) {
            val density = LocalDensity.current
            val wPx = with(density) { boxW.toPx() }
            val hPx = with(density) { boxH.toPx() }
            // The 420x190 design is stretched to fill the box on each axis
            // independently: the line always spans the full chart width (no
            // letterboxing) and the dots stay exactly over the weekday labels,
            // whatever aspect ratio the card ends up with.
            val sx = wPx / 420f
            val sy = hPx / 190f
            val sAvg = (sx + sy) / 2f
            // The scale that renders a 9.sp label at exactly sAvg virtual units
            // (text units here are sp/em, so scale it).
            val k = 9f * sAvg / with(density) { (9.sp).toPx() }
            val labelColor = Color(0xFF64748B)
            val axisMax = remember(data) { niceMax(data.max().coerceAtLeast(1)) }
            // Evenly spaced INTEGER tick values: each label sits exactly on
            // its own grid line, so a dot for value N lines up with the
            // dashed "N" line (fixed fractions + rounded labels drifted
            // whenever max wasn't a multiple of 4, e.g. max 5 put the "1"
            // line at 1.25).
            val ticks = remember(axisMax) {
                val step =
                    when {
                        axisMax % 4 == 0 -> axisMax / 4
                        axisMax % 5 == 0 -> axisMax / 5
                        axisMax % 2 == 0 -> axisMax / 2
                        else -> axisMax
                    }
                (0..axisMax step step).toList()
            }
            Canvas(
                Modifier.fillMaxSize(),
            ) {
                val max = axisMax.toFloat()
                val plotH = 190f - 10f - 24f
                fun px(i: Int) = (34f + i * (420f - 34f - 8f) / 6f) * sx
                val pts = data.mapIndexed { i, v ->
                    Offset(px(i), (190f - 24f - v / max * plotH) * sy)
                }
                val baseY = (190f - 24f) * sy

                // Dashed y-grid (web: rgba(255,255,255,.07); tick labels overlay below).
                // One line per integer tick value, at its EXACT value position.
                ticks.forEach { v ->
                    val gy = (190f - 24f - v / max * plotH) * sy
                    drawLine(
                        color = Color.White.copy(alpha = 0.07f),
                        start = Offset(34f * sx, gy),
                        end = Offset(412f * sx, gy),
                        strokeWidth = 1f,
                        pathEffect = if (v == 0) null else PathEffect.dashPathEffect(floatArrayOf(3f * sx, 4f * sx), 0f),
                    )
                }

                // Smooth line (Catmull-Rom → cubic Bézier, the web's smoothPath).
                val line = Path().apply {
                    moveTo(pts[0].x, pts[0].y)
                    for (i in 0 until pts.size - 1) {
                        val p0 = pts[(i - 1).coerceAtLeast(0)]
                        val p1 = pts[i]
                        val p2 = pts[i + 1]
                        val p3 = pts[(i + 2).coerceAtMost(pts.size - 1)]
                        cubicTo(
                            p1.x + (p2.x - p0.x) / 6f,
                            p1.y + (p2.y - p0.y) / 6f,
                            p2.x - (p3.x - p1.x) / 6f,
                            p2.y - (p3.y - p1.y) / 6f,
                            p2.x,
                            p2.y,
                        )
                    }
                }
                Path().apply {
                    addPath(line)
                    lineTo(pts.last().x, baseY)
                    lineTo(pts.first().x, baseY)
                    close()
                }.let { area ->
                    drawPath(
                        area,
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                Color(0xFF2152FF).copy(alpha = 0.45f),
                                Color(0xFF2152FF).copy(alpha = 0.02f),
                            ),
                        ),
                    )
                }
                drawPath(
                    line,
                    style = Stroke(width = 2.5f * sAvg, cap = StrokeCap.Round),
                    brush = Brush.linearGradient(
                        colors = listOf(Color(0xFF2152FF), Color(0xFF02C6F3)),
                        start = Offset(0f, 0f),
                        end = Offset(wPx, 0f),
                    ),
                )
                pts.forEach { p ->
                    drawCircle(Color(0xFF0F1A33), radius = 3f * sAvg, center = p)
                    drawCircle(
                        Color(0xFF02C6F3),
                        radius = 3f * sAvg,
                        center = p,
                        style = Stroke(width = 1.5f * sAvg),
                    )
                }
            }

            // Y-axis tick labels (web: 9px #64748b): right edge at 28 virtual x
            // units, centred on their grid line. The label's layout height is
            // measured (onSizeChanged) rather than estimated — the theme's
            // inherited line-height makes the box far taller than a bare 9sp
            // font would suggest — so the centre is exact on any device.
            val spPx = with(density) { (9.sp).toPx() } / 9f
            val tickHeights = remember(axisMax) { IntArray(ticks.size) }
            val tickMeasured = remember { mutableStateOf(0) }
            ticks.forEachIndexed { ti, v ->
                val gy = (190f - 24f - v * (190f - 10f - 24f) / axisMax) * sy
                Text(
                    fmtTick(v),
                    color = labelColor,
                    fontSize = 9.sp,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset {
                            val lh = tickHeights[ti].toFloat()
                                .takeIf { h -> h > 0f } ?: 9f * spPx * 1.17f
                            IntOffset(
                                (28f * sx - wPx).toInt(),
                                (gy - lh / 2f).toInt(),
                            )
                        }
                        .onSizeChanged { sz: IntSize ->
                            tickHeights[ti] = sz.height
                            tickMeasured.value++
                        }
                        .graphicsLayer {
                            transformOrigin = TransformOrigin(1f, 0.5f)
                            scaleX = k
                            scaleY = k
                        },
                )
            }

            // Weekday labels under each point (web: 9px #64748b), centered on the
            // SAME x as their dot — (34 + i·62.67) virtual units stretched by sx —
            // so dots and labels can never drift apart.
            labels.forEachIndexed { i, l ->
                val x = (34f + i * (420f - 34f - 8f) / 6f) * sx
                Text(
                    l,
                    color = labelColor,
                    fontSize = 9.sp,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .offset {
                            IntOffset((x - wPx / 2f).toInt(), (175.7f * sy).toInt())
                        }
                        .graphicsLayer {
                            transformOrigin = TransformOrigin(0.5f, 0f)
                            scaleX = k
                            scaleY = k
                        },
                )
            }
        }
    }
}

/** Short weekday names, same convention as the web's `dayLabels` (UTC). */
private val WEEKDAYS = arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

/** Round a max up to a pleasant axis ceiling (1/2/2.5/5 × 10^k), as the web. */
private fun niceMax(v: Int): Int {
    if (v <= 5) return 5
    val p = Math.pow(10.0, Math.floor(Math.log10(v.toDouble()))).toInt()
    val f = v.toDouble() / p
    val nf = when {
        f <= 1 -> 1.0
        f <= 2 -> 2.0
        f <= 2.5 -> 2.5
        f <= 5 -> 5.0
        else -> 10.0
    }
    return (nf * p).toInt()
}

/** Web `fmtTick`: "1k" / "1.5k" above 1000. */
private fun fmtTick(v: Int): String =
    if (v >= 1000) {
        val k = v / 1000.0
        if (v % 1000 == 0) "${k.toInt()}k" else "%.1f".format(k) + "k"
    } else "$v"

/**
 * Borderless type-tab row (web project filter chips without the boxes):
 * plain text, the selected tab gets a brand-brush pill behind the label.
 */
@Composable
fun TypeTabs(
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    Row(modifier.fillMaxWidth().padding(top = 16.dp, bottom = 10.dp)) {
        TYPE_TABS.forEachIndexed { i, label ->
            val sel = label == selected
            Box(
                modifier = Modifier
                    .drawBehind {
                        if (sel) {
                            drawRoundRect(
                                brush = t.BrandBrush,
                                size = size,
                                cornerRadius = CornerRadius(size.height / 2f),
                            )
                        }
                    }
                    .clickable(
                        interactionSource = remember(label) { MutableInteractionSource() },
                        indication = null,
                        onClick = { onSelect(label) },
                    )
                    .padding(horizontal = 14.dp, vertical = 7.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    fontSize = 13.sp,
                    fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal,
                    color = t.Foreground.copy(alpha = if (sel) 1f else 0.75f),
                )
            }
            if (i < TYPE_TABS.lastIndex) Spacer(Modifier.width(6.dp))
        }
    }
}
