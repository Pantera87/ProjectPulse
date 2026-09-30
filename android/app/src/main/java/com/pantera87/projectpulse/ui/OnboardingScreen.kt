package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * First-run tour (shown after the splash, before the mode pick): three
 * swipeable pages — one headline, one short line each — with a dot indicator,
 * a top-right Skip and a full-width Continue / Get started CTA.
 */
@Composable
fun OnboardingScreen(
    onFinish: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val pages = remember { OnboardingPages }
    val pagerState = rememberPagerState(initialPage = 0, pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val page = pagerState.currentPage
    // Swiping past the last page (no content to snap to) finishes the tour.
    LaunchedEffect(pagerState.settledPage) {
        if (pagerState.settledPage == pages.size) onFinish()
    }

    Box(modifier = modifier.fillMaxSize()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { index ->
            OnboardingPageView(pages[index])
        }

        // Top-right skip (Maiar-style: one corner action, never blocks swipes).
        Box(Modifier.align(Alignment.TopEnd)) {
            GhostButton(
                text = "Skip",
                onClick = onFinish,
                modifier = Modifier.padding(20.dp),
            )
        }

        // Dots + CTA pinned to the bottom.
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 28.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 22.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                pages.forEachIndexed { i, _ ->
                    val active = i == page
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 5.dp)
                            .size(if (active) 22.dp else 8.dp)
                            .clip(CircleShape)
                            .background(
                                if (active) t.BrandBlue
                                else Color(0x66FFFFFF),
                            ),
                    )
                }
            }
            GlassButton(
                text = if (page < pages.size - 1) "Continue" else "Get started",
                onClick = {
                    if (page < pages.size - 1) {
                        // Fire-and-forget: the pager may detach mid-animation.
                        scope.launch {
                            try {
                                pagerState.animateScrollToPage(page + 1)
                            } catch (_: java.util.concurrent.CancellationException) {
                            }
                        }
                    } else {
                        onFinish()
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            )
        }
    }
}

private data class OnboardPage(
    val icon: ImageVector,
    val title: String,
    val subtitle: String,
)

/** ECG "pulse" glyph — no stock material icon ships one, so it is drawn inline. */
private val PulseIcon: ImageVector = ImageVector.Builder(
    name = "Pulse",
    defaultWidth = 24.dp,
    defaultHeight = 24.dp,
    viewportWidth = 24f,
    viewportHeight = 24f,
).apply {
    // 1.7.6 idiom: the `path { }` builder DSL (no `buildPath` exists pre-1.8).
    // The line is stroked, not filled: an open polyline has no area to fill, and
    // the opaque-black stroke is recoloured by Icon(tint = ...) via the painter's
    // ColorFilter.
    path(
        stroke = SolidColor(Color.Black),
        strokeLineWidth = 2f,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(3f, 12f)
        lineTo(7f, 12f)
        lineTo(10f, 5f)
        lineTo(14f, 19f)
        lineTo(17f, 12f)
        lineTo(21f, 12f)
    }
}.build()

private val OnboardingPages = listOf(
    OnboardPage(
        icon = PulseIcon,
        title = "Know every project at a glance",
        subtitle = "Releases, commits, RSS and websites — one calm feed, one dashboard.",
    ),
    OnboardPage(
        icon = Icons.Outlined.Notifications,
        title = "Updates that find you",
        subtitle = "ProjectPulse checks your sources and pings you only when something real changes.",
    ),
    OnboardPage(
        icon = Icons.Outlined.Cloud,
        title = "Your data, your terms",
        subtitle = "Run it as a companion to your server — or fully on this device. You choose next.",
    ),
)

@Composable
private fun OnboardingPageView(page: OnboardPage) {
    val t = LocalPpTokens.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 36.dp)
            .padding(top = 48.dp, bottom = 150.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.weight(1f))
        // Brand-glass icon tile (`.glass-tile` glow).
        Box(
            modifier = Modifier
                .size(88.dp)
                .glass(strong = true, tile = true, radius = 24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = page.icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(40.dp),
            )
        }
        Spacer(Modifier.height(28.dp))
        Text(
            page.title,
            color = t.Foreground,
            textAlign = TextAlign.Center,
            style = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            page.subtitle,
            color = t.TextSecondary,
            textAlign = TextAlign.Center,
            style = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
        )
        Spacer(Modifier.weight(1f))
    }
}