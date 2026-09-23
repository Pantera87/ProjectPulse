package com.pantera87.projectpulse.ui

import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * Minimal pull-to-refresh (M4): material3 has no stable SwipeRefresh as of
 * 1.4.0, so the app ships its own indicator.
 *
 * Caller contract:
 *  - [onRefresh] fires once the user drags past the threshold and releases;
 *    flip [refreshing] to true in it.
 *  - Flip [refreshing] back to false when the reload finishes; while true the
 *    content stays pinned under the spinner and gestures are ignored.
 *  - The wrapped content must be scrolled to the top for the gesture to arm
 *    (the same rule as any pull-to-refresh widget).
 */
@Composable
fun PullToRefresh(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    var offset by remember { mutableFloatStateOf(0f) }

    val pinnedPx = with(density) { 48.dp.toPx() }
    val thresholdPx = with(density) { 72.dp.toPx() }
    val maxPx = with(density) { 96.dp.toPx() }
    val contentOffset = if (refreshing) pinnedPx else offset

    // Re-keys when `refreshing` flips: the detector is cancelled mid-gesture
    // on commit, and re-installed when the refresh settles.
    Box(
        modifier.pointerInput(refreshing) {
            if (!refreshing) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        if (offset >= thresholdPx) onRefresh()
                        offset = 0f
                    },
                    onDragCancel = { offset = 0f },
                    onVerticalDrag = { change, delta ->
                        val next = if (delta > 0f) {
                            var v = (offset + delta).coerceAtMost(maxPx)
                            if (v > thresholdPx) v = thresholdPx + (v - thresholdPx) * 0.4f
                            v
                        } else {
                            (offset + delta).coerceIn(0f, maxPx)
                        }
                        offset = next
                        change.consume()
                    },
                )
            }
        },
    ) {
        // Content first (below). Left transparent: the aurora backdrop from
        // RootNav shows through, and the spinner is clipped to the gap above
        // the content's translated top edge, so it never overlaps it.
        Box(
            Modifier
                .fillMaxSize()
                .graphicsLayer { translationY = contentOffset },
        ) {
            content()
        }
        // Indicator on top, living in the gap above the content. Skipped
        // entirely at rest: a zero-height box would still compose the 32dp
        // child, and (no clipping by default) its lower half would draw over
        // the content as a permanent half-ring. Clip keeps the ring inside
        // the revealed gap while it grows.
        if (contentOffset > 0f) {
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(with(density) { contentOffset.toDp() })
                    .clip(RectangleShape)
                    .align(Alignment.TopCenter),
            ) {
                CircularProgressIndicator(
                    Modifier
                        .align(Alignment.Center)
                        .size(32.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    strokeWidth = 3.dp,
                )
            }
        }
    }
}