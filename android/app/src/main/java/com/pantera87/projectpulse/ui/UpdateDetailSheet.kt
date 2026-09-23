package com.pantera87.projectpulse.ui

import android.content.Intent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Update
import kotlin.math.abs
import kotlinx.coroutines.launch

/**
 * Full view of one update: body, payload, open-link, and the read/delete
 * actions (server: POST /api/updates/:id and DELETE /api/updates/:id).
 *
 * Rendered as a custom glass bottom sheet (scrim + `.glass-strong` panel)
 * instead of the Material bottom sheet, to match the web design language.
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
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val scrimInteraction = remember { MutableInteractionSource() }
    val uiMode = rememberUiMode()
    val density = LocalDensity.current
    // Mobile sheet expansion: 0f = compact (480dp cap), 1f = full page.
    var dragRangePx by remember { mutableStateOf(0f) }
    val collapsedPx = with(density) { 480.dp.toPx() }
    val barInsetPx = if (uiMode.isTablet) 0f else with(density) { FLOATING_BAR_BOTTOM_PADDING.toPx() }
    val handleHeightPx = with(density) { 44.dp.toPx() }
    // At full page the sheet slides under the status bar (edge-to-edge on
    // targetSdk 35), so the content is pushed down by the status-bar inset
    // as the expansion fraction grows.
    val topInsetPx = run {
        val res = context.resources
        val id = res.getIdentifier("status_bar_height", "dimen", "android")
        if (id > 0) res.getDimensionPixelSize(id).toFloat() else 0f
    }
    val expandAnim = remember { Animatable(0f) }
    val fraction = expandAnim.asState()

    fun settleExpand() {
        scope.launch {
            expandAnim.animateTo(
                if (expandAnim.value > 0.5f) 1f else 0f,
                tween(240, easing = FastOutSlowInEasing),
            )
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        // How many px the sheet can grow between compact and full page.
        LaunchedEffect(maxHeight) {
            dragRangePx = (with(density) { maxHeight.toPx() } - barInsetPx)
                .coerceAtLeast(collapsedPx) - collapsedPx
        }
        // Dimming scrim — tap to dismiss.
        Box(
            Modifier
                .fillMaxSize()
                .background(Color(0x99020414))
                .clickable(
                    interactionSource = scrimInteraction,
                    indication = null,
                    onClick = {
                        onDismiss()
                    },
                ),
        )
        Box(
            Modifier
                // On tablet the sheet becomes a centered dialog-sized panel;
                // on mobile it sits above the floating tab bar and can be
                // dragged up to full page (see the grabber handle below).
                .then(
                    if (uiMode.isTablet) {
                        Modifier.align(Alignment.Center).widthIn(max = 640.dp)
                    } else {
                        Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(bottom = FLOATING_BAR_BOTTOM_PADDING)
                    },
                )
                .heightIn(
                    max = if (uiMode.isTablet) {
                        480.dp
                    } else {
                        with(density) { (collapsedPx + fraction.value * dragRangePx).toDp() }
                    },
                )
                // Once expansion starts, fill the (growing) height cap so the
                // panel actually reaches the top of the screen at full page
                // instead of stopping at the content's natural height. While
                // collapsed we apply NO height fill (a `fillMaxHeight(0f)`
                // would clamp the panel to zero height and hide the sheet).
                .then(
                    when {
                        uiMode.isTablet -> Modifier
                        fraction.value > 0.02f -> Modifier.fillMaxHeight()
                        else -> Modifier
                    },
                )
                .glass(strong = true, radius = 20.dp),
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    // Slide the content down out of the status bar as the
                    // sheet rises to full page (no-op while compact).
                    .padding(top = with(density) { (topInsetPx * fraction.value).toDp() }),
            ) {
                // Visual drag handle. The expand/collapse gesture is tracked
                // by the top-aligned hit area added after this panel — a
                // gesture attached to this row would die mid-drag, because
                // the sheet top (and the row with it) moves out from under
                // the finger as the panel resizes.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    GlassGrabber()
                }
                Column(
                    Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp)
                        .padding(bottom = 28.dp),
                ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PriorityDot(update.priority)
                    KindBadge(
                        update.kind,
                        modifier = Modifier.padding(start = 10.dp, end = 8.dp),
                    )
                    Text(
                        formatTime(update.created_at),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.TextSecondary,
                    )
                }
                Text(
                    update.title,
                    style = MaterialTheme.typography.titleLarge,
                    color = Palette.Foreground,
                    modifier = Modifier.padding(top = 12.dp),
                )
                update.source_name?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.TextSecondary,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                update.summary?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Foreground,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                prettyPayload(update.payload_json)?.let {
                    SectionLabel(
                        "Details",
                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                    )
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .glass(radius = 12.dp),
                    ) {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            color = Palette.TextSecondary,
                            modifier = Modifier.padding(10.dp),
                        )
                    }
                }
                error?.let {
                    Text(
                        it,
                        color = Palette.Error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
                Row(
                    Modifier.padding(top = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    GlassButton(
                        text = if (update.isRead) "Mark unread" else "Mark read",
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
                    )
                    if (update.url?.isNotBlank() == true) {
                        GhostButton(
                            text = "Open link",
                            onClick = {
                                runCatching {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(update.url)),
                                    )
                                }
                            },
                        )
                    }
                }
                TextButton(
                    enabled = !busy,
                    onClick = { confirmDelete = true },
                    modifier = Modifier.padding(top = 4.dp),
                ) {
                    Text("Delete", color = Palette.Error)
                }
                }
            }
        }
        // Mobile: stable hit area covering the scrim + grabber row, but NOT the
        // panel content below the grabber. It is top-aligned, so its top-left
        // origin stays fixed at the screen origin even as its height changes
        // with expansion — the drag delta is measured in a stable coordinate
        // space. It handles the grabber drag/tap and the tap-the-scrim-to-
        // dismiss, so the panel content below it is never blocked.
        if (!uiMode.isTablet && dragRangePx > 0f) {
            val screenHpx = with(density) { maxHeight.toPx() }
            val grabberTopPx = screenHpx - barInsetPx -
                (collapsedPx + fraction.value * dragRangePx) + topInsetPx * fraction.value
            val hitBoxHeightPx = (grabberTopPx + handleHeightPx).coerceAtLeast(0f)
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .height(with(density) { hitBoxHeightPx.toDp() })
                    .pointerInput(Unit) {
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            val f0 = expandAnim.value
                            val gTop = screenHpx - barInsetPx -
                                (collapsedPx + f0 * dragRangePx) + topInsetPx * f0
                            if (down.position.y in gTop..(gTop + handleHeightPx)) {
                                // Grabber zone: drag to expand/collapse, or a
                                // plain tap toggles full page.
                                down.consume()
                                var moved = false
                                var lastY = down.position.y
                                while (true) {
                                    val event = awaitPointerEvent(PointerEventPass.Main)
                                    val change = event.changes.first()
                                    if (!change.pressed) break
                                    if (!moved &&
                                        abs(change.position.y - down.position.y) > viewConfiguration.touchSlop
                                    ) {
                                        moved = true
                                    }
                                    if (moved) {
                                        change.consume()
                                        val delta = change.position.y - lastY
                                        lastY = change.position.y
                                        val f = (expandAnim.value - delta / dragRangePx)
                                            .coerceIn(0f, 1f)
                                        scope.launch { expandAnim.snapTo(f) }
                                    }
                                }
                                if (moved) {
                                    settleExpand()
                                } else {
                                    // Plain tap on the handle: toggle full page.
                                    scope.launch {
                                        expandAnim.animateTo(
                                            if (expandAnim.value > 0.5f) 0f else 1f,
                                            tween(260, easing = FastOutSlowInEasing),
                                        )
                                    }
                                }
                            } else {
                                // Scrim region (above the grabber): a plain tap
                                // dismisses the sheet.
                                down.consume()
                                var moved = false
                                while (true) {
                                    val event = awaitPointerEvent(PointerEventPass.Main)
                                    val change = event.changes.first()
                                    if (!change.pressed) break
                                    if (abs(change.position.y - down.position.y) > viewConfiguration.touchSlop) {
                                        moved = true
                                    }
                                }
                                if (!moved) onDismiss()
                            }
                        }
                    },
            )
        }
    }

    if (confirmDelete) {
        // Glass dialog: scrim + centered strong panel.
        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0x99020414))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { confirmDelete = false },
                    ),
            )
            GlassPanel(
                strong = true,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 32.dp),
            ) {
                Column(
                    Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        "Delete update",
                        style = MaterialTheme.typography.titleMedium,
                        color = Palette.Foreground,
                    )
                    Text(
                        "Update will be permanently deleted from the server.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.TextSecondary,
                    )
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                    ) {
                        GhostButton(
                            text = "Cancel",
                            onClick = { confirmDelete = false },
                            modifier = Modifier.padding(end = 8.dp),
                        )
                        GlassButton(
                            text = "Delete",
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
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PriorityDot(priority: String) {
    Box(modifier = Modifier.size(10.dp)) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(color = priorityColor(priority), radius = size.minDimension / 2)
        }
    }
}

/** Pretty-prints a payload_json column value for display; null when empty. */
private fun prettyPayload(raw: String?): String? =
    raw?.takeIf { it.isNotBlank() && it != "{}" }
        ?.let {
            runCatching {
                prettyJson.parseToJsonElement(it).toString()
            }.getOrNull()
        }

private val prettyJson = kotlinx.serialization.json.Json { prettyPrint = true }