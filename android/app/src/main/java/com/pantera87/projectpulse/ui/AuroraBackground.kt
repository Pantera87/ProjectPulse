package com.pantera87.projectpulse.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.unit.dp
import kotlin.math.sqrt

/**
 * The web app's backdrop, themed:
 *
 * - **Pulse** — the original look: a near-black base, three fixed soft tints,
 *   three slowly drifting blobs and a faint 26dp dot grid.
 * - **Aurora** — a static canvas: the `--aurora-bg` navy base with five fixed
 *   radial glows (the web's `:root[data-theme="aurora"] body` rule). No blobs,
 *   no dot grid, no animation.
 *
 * Compose has no backdrop blur, but the glass sits on this static,
 * pre-softened backdrop, so the blobs are painted as radial gradients
 * (the CSS `blur(90px)` blobs have no hard edges to preserve).
 */
@Composable
fun AuroraBackground(modifier: Modifier = Modifier) {
    val tokens = LocalPpTokens.current
    val isPulse = tokens.theme == PpTheme.PULSE
    // Theme switches crossfade the base color; the glow layers swap at once.
    val base by animateColorAsState(
        targetValue = if (isPulse) tokens.Background else tokens.BackdropBase,
        animationSpec = tween(250),
    )
    Box(modifier = modifier.fillMaxSize()) {
        if (isPulse) {
            PulseBackdrop(base)
        } else {
            AuroraStaticBackdrop(base)
        }
    }
}

/** Pulse: the original tints + dot grid + drifting blobs (unchanged). */
@Composable
private fun PulseBackdrop(base: Color) {
    val t = LocalPpTokens.current
    Box(Modifier.fillMaxSize()) {
        // ---- static: base + tints + dot grid ----
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            drawRect(base)
            // Web body background: fixed radial tints.
            drawRect(
                Brush.radialGradient(
                    listOf(t.TintBlue, Color.Transparent),
                    center = Offset(0.85f * w, -0.10f * h),
                    radius = 0.8f * w,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(t.TintViolet, Color.Transparent),
                    center = Offset(-0.10f * w, 0.20f * h),
                    radius = 0.75f * w,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(t.TintPurple, Color.Transparent),
                    center = Offset(0.55f * w, 1.15f * h),
                    radius = 0.75f * w,
                ),
            )
            // Dot grid: 26px white .05, masked by an ellipse at 50% 30%
            // (full inside 30%, faded out by 80%).
            val step = 26.dp.toPx()
            val cx = 0.5f * w
            val cy = 0.30f * h
            val rx = 0.45f * w
            val ry = 0.35f * h
            var x = 0f
            while (x <= w) {
                var y = 0f
                while (y <= h) {
                    val dx = (x - cx) / rx
                    val dy = (y - cy) / ry
                    val d = sqrt(dx * dx + dy * dy)
                    val a = ((0.8f - d) / 0.5f).coerceIn(0f, 1f)
                    if (a > 0f) {
                        drawCircle(
                            t.Dot.copy(alpha = t.Dot.alpha * a),
                            radius = 1.2f,
                            center = Offset(x, y),
                        )
                    }
                    y += step
                }
                x += step
            }
        }
        // ---- animated: drifting blobs (web aurora-drift-1/2/3, 26/32/38s) ----
        val transition = rememberInfiniteTransition(label = "aurora")
        val b1 by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                tween(26_000, easing = FastOutSlowInEasing),
                RepeatMode.Reverse,
            ),
            label = "blob1",
        )
        val b2 by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                tween(32_000, easing = FastOutSlowInEasing),
                RepeatMode.Reverse,
            ),
            label = "blob2",
        )
        val b3 by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                tween(38_000, easing = FastOutSlowInEasing),
                RepeatMode.Reverse,
            ),
            label = "blob3",
        )
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            // Web blobs are 46/42/30rem circles at `opacity: .5` with a 90px
            // blur, so painted alpha is half the palette value and each blob's
            // extent is roughly a third of the screen width (the CSS gradient
            // runs `color → transparent 70%` across the circle).
            val blue = t.BlobBlue.copy(alpha = t.BlobBlue.alpha * 0.5f)
            val violet = t.BlobViolet.copy(alpha = t.BlobViolet.alpha * 0.5f)
            val fuchsia = t.BlobFuchsia.copy(alpha = t.BlobFuchsia.alpha * 0.5f)
            drawRect(
                Brush.radialGradient(
                    listOf(blue, Color.Transparent),
                    center = Offset(0.85f * w - 64f * b1, 0.08f * h + 48f * b1),
                    radius = 0.55f * w,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(violet, Color.Transparent),
                    center = Offset(0.10f * w + 64f * b2, 0.93f * h - 48f * b2),
                    radius = 0.5f * w,
                ),
            )
            drawRect(
                Brush.radialGradient(
                    listOf(fuchsia, Color.Transparent),
                    center = Offset(0.55f * w - 48f * b3, 0.40f * h + 36f * b3),
                    radius = 0.3f * w,
                ),
            )
        }
    }
}

/** Aurora: the static layered glow canvas (no animation). */
@Composable
private fun AuroraStaticBackdrop(base: Color) {
    val t = LocalPpTokens.current
    Canvas(Modifier.fillMaxSize()) {
        drawRect(base)
        t.AuroraGlows.forEach { g ->
            drawEllipseGlow(
                cx = g.cx * size.width,
                cy = g.cy * size.height,
                rx = g.rx * size.width,
                ry = g.ry * size.width,
                color = g.color,
                fadeAt = g.fadeAt,
            )
        }
    }
}

/**
 * Paints a CSS-style `radial-gradient(rx ry at cx cy, color …, transparent)`:
 * an ellipse (rx/ry) whose color fades to transparent at [fadeAt] of the
 * radius. Compose only has circular radial brushes, so the Y axis is scaled
 * around the center — the circular gradient then sweeps out as the ellipse.
 */
private fun DrawScope.drawEllipseGlow(
    cx: Float,
    cy: Float,
    rx: Float,
    ry: Float,
    color: Color,
    fadeAt: Float,
) {
    if (rx <= 0f || ry <= 0f) return
    drawIntoCanvas { canvas ->
        canvas.save()
        canvas.translate(cx, cy)
        canvas.scale(1f, ry / rx)
        canvas.translate(-cx, -cy)
        drawRect(
            Brush.radialGradient(
                0f to color,
                fadeAt to color,
                1f to Color.Transparent,
                center = Offset(cx, cy),
                radius = rx,
            ),
        )
        canvas.restore()
    }
}
