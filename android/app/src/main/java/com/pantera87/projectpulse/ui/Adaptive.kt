package com.pantera87.projectpulse.ui

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Adaptive (tablet) layout helpers.
 *
 * The app is designed as a single-column mobile experience. On tablets —
 * detected via Material's window size class (expanded width), which handles
 * foldables, rotation and split-screen correctly — the layout switches to a
 * side navigation rail, two-column grids and content capped at a readable
 * width.
 *
 * Mobile rendering is untouched: every helper degrades to a no-op on
 * [UiMode.Mobile].
 */
enum class UiMode {
    /** Compact window width: the original single-column layout. */
    Mobile,

    /** Expanded window width (tablet, or large phone in landscape). */
    Tablet,
}

/** The UI mode for the current window: tablet iff the width is expanded. */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun rememberUiMode(): UiMode {
    val wsc = calculateWindowSizeClass(LocalContext.current as Activity)
    return remember(wsc) {
        if (wsc.widthSizeClass == WindowWidthSizeClass.Expanded) UiMode.Tablet
        else UiMode.Mobile
    }
}

val UiMode.isTablet: Boolean
    get() = this == UiMode.Tablet

/**
 * Wraps [content] in a full-size, centered, width-capped box on tablet so
 * wide screens keep a readable column. On mobile the content is composed
 * exactly as-is (no extra layout node, pixel-identical layout).
 */
@Composable
fun AdaptiveContent(
    uiMode: UiMode,
    maxWidth: Dp = 720.dp,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    if (uiMode.isTablet) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Box(Modifier.fillMaxSize().widthIn(max = maxWidth)) { content() }
        }
    } else {
        content()
    }
}

/**
 * Simple two-column flow for tablet lists: [items] are split down the middle
 * into two balanced columns, reusing the same per-item components as the
 * single-column mobile list.
 */
@Composable
fun <T> TwoColumnList(
    items: List<T>,
    modifier: Modifier = Modifier,
    item: @Composable (index: Int, T) -> Unit,
) {
    val firstHalf = (items.size + 1) / 2
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items.forEachIndexed { i, t -> if (i < firstHalf) item(i, t) }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items.forEachIndexed { i, t -> if (i >= firstHalf) item(i, t) }
        }
    }
}
