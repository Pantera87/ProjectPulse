package com.pantera87.projectpulse.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.R

/**
 * The ProjectPulse logo with an optional "heartbeat": two staggered rings
 * expanding out of the logo and fading, in the brand blue → fuchsia ramp
 * (the same read as the old splash Lottie placeholder, but with the real
 * logo art).
 *
 * [size] is the logo image size; the layout box is `2 × size` so the rings
 * have room to travel past the logo edge. Callers should place this in a
 * centered container — the logo sits at the box center.
 *
 * [pulse] must be constant for a given call site (it gates an animated
 * composable). Use `pulse = false` for quiet placements such as the
 * dashboard title bar.
 */
@Composable
fun PulseLogo(
    size: Dp,
    pulse: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val painter = painterResource(R.drawable.logo_1024)
    if (pulse) {
        val phase = rememberInfiniteTransition(label = "pulseLogo").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(1600, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "phase",
        ).value
        Box(
            modifier = modifier
                .size(size * 2f)
                .drawBehind {
                    // The lambda's implicit `size` receiver is shadowed by the
                    // `size` parameter above, so qualify explicitly.
                    val box = this.size
                    // base = logo radius in px (the logo fills half the box).
                    val base = box.width / 4f
                    val cx = box.width / 2f
                    val cy = box.height / 2f
                    // Two rings half a cycle apart — a steady heartbeat.
                    val lags = floatArrayOf(0f, 0.5f)
                    val colors = arrayOf(t.GradA, t.GradC)
                    lags.forEachIndexed { i, lag ->
                        val p = (phase + lag) % 1f
                        drawCircle(
                            color = colors[i].copy(alpha = (1f - p) * 0.55f),
                            radius = base * (1.02f + 0.68f * p),
                            center = Offset(cx, cy),
                            style = Stroke(width = 2.dp.toPx()),
                        )
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painter,
                contentDescription = "ProjectPulse logo",
                modifier = Modifier.size(size).clip(CircleShape),
            )
        }
    } else {
        Image(
            painter = painter,
            contentDescription = "ProjectPulse logo",
            modifier = modifier.size(size).clip(CircleShape),
        )
    }
}

/**
 * Branded empty state: the pulsing logo above one muted line, e.g.
 * "No sources yet" / "No updates".
 */
@Composable
fun BrandedEmptyState(
    text: String,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    Column(
        modifier = modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        PulseLogo(56.dp, pulse = true)
        Spacer(Modifier.height(12.dp))
        Text(text, color = t.TextTertiary)
    }
}
