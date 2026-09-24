package com.pantera87.projectpulse.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.composed
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Liquid-glass components ported from the web app's CSS (`.glass`,
 * `.glass-strong`, `.glass-tile`, `.btn-primary`, `.btn-ghost`, `.chip`,
 * `.badge`). Every theme-sensitive value comes from [LocalPpTokens], so the
 * active/pulse themes switch live.
 *
 * Compose has no backdrop blur, but the glass sits on the static,
 * pre-softened backdrop, so translucency + border + inset highlight reproduces
 * the web look without a blur filter.
 */

/**
 * Translucent glass fill + 1px border + inset top highlight.
 *
 * @param strong `.glass-strong` (deeper base, larger radius default).
 * @param radius explicit override; defaults to the theme's card/strong radius.
 * @param tile `.glass-tile` (adds the radial glow at the top).
 */
fun Modifier.glass(
    strong: Boolean = false,
    radius: Dp? = null,
    tile: Boolean = false,
): Modifier = composed {
    val t = LocalPpTokens.current
    val r = radius ?: if (strong) t.StrongRadius else t.CardRadius
    val shape = RoundedCornerShape(r)
    val cr = CornerRadius(with(LocalDensity.current) { r.toPx() })
    this
        .shadow(
            elevation = if (strong) 8.dp else 4.dp,
            shape = shape,
            ambientColor = t.GlassStrongShadow,
            spotColor = t.GlassStrongShadow,
        )
        .drawBehind {
            if (strong) {
                drawRoundRect(color = t.GlassDeepBase, size = size, cornerRadius = cr)
            }
            t.CardGradient?.let {
                drawRoundRect(brush = it.brush(size), size = size, cornerRadius = cr)
            } ?: run {
                drawRoundRect(
                    brush = if (strong) t.GlassStrongFill else t.GlassFill,
                    size = size,
                    cornerRadius = cr,
                )
            }
            val stroke = 1.dp.toPx()
            drawRoundRect(
                color = t.GlassBorder,
                topLeft = Offset(stroke / 2f, stroke / 2f),
                size = Size(size.width - stroke, size.height - stroke),
                cornerRadius = cr,
                style = Stroke(width = stroke),
            )
            if (t.GlassHighlight.alpha > 0f) {
                drawLine(
                    color = t.GlassHighlight,
                    start = Offset(r.toPx(), stroke / 2f),
                    end = Offset(size.width - r.toPx(), stroke / 2f),
                    strokeWidth = stroke,
                )
            }
            if (tile) {
                // .glass-tile::before — glow, ellipse 120% 90% at 50% -20%.
                drawRect(
                    Brush.radialGradient(
                        listOf(
                            t.TileGlowColor.copy(
                                alpha = t.TileGlowColor.alpha * t.TileGlowOpacity,
                            ),
                            Color.Transparent,
                        ),
                        center = Offset(size.width / 2f, -0.2f * size.height),
                        radius = 0.9f * size.width / 0.6f,
                    ),
                )
            }
        }
}

/**
 * Interactive glass card. Pressed state mirrors the web `.glass-hover`:
 * border shifts to the theme accent and a soft halo appears.
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    strong: Boolean = false,
    radius: Dp? = null,
    tile: Boolean = false,
    onClick: (() -> Unit)? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    val t = LocalPpTokens.current
    val r = radius ?: if (strong) t.StrongRadius else t.CardRadius
    val interaction = remember { MutableInteractionSource() }
    val pressed = interaction.collectIsPressedAsState().value
    val shape = RoundedCornerShape(r)
    val cr = CornerRadius(with(LocalDensity.current) { r.toPx() })
    val halo = t.GlowAccent
    Box(
        modifier = modifier
            .then(
                if (onClick != null) {
                    Modifier.clickable(
                        interactionSource = interaction,
                        indication = null,
                        onClick = onClick,
                    )
                } else Modifier,
            )
            .shadow(
                elevation = if (strong) 8.dp else 4.dp,
                shape = shape,
                ambientColor = t.GlassStrongShadow,
                spotColor = t.GlassStrongShadow,
            )
            .then(
                if (pressed) {
                    // .glass-hover halo
                    Modifier.shadow(
                        elevation = 14.dp,
                        shape = shape,
                        ambientColor = halo,
                        spotColor = halo,
                    )
                } else Modifier,
            )
            .drawBehind {
                if (strong) {
                    drawRoundRect(color = t.GlassDeepBase, size = size, cornerRadius = cr)
                }
                t.CardGradient?.let {
                    drawRoundRect(brush = it.brush(size), size = size, cornerRadius = cr)
                } ?: run {
                    drawRoundRect(
                        brush = if (strong) t.GlassStrongFill else t.GlassFill,
                        size = size,
                        cornerRadius = cr,
                    )
                }
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = if (pressed) t.GlassBorderPressed else t.GlassBorder,
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = cr,
                    style = Stroke(width = stroke),
                )
                if (t.GlassHighlight.alpha > 0f) {
                    drawLine(
                        color = t.GlassHighlight,
                        start = Offset(r.toPx(), stroke / 2f),
                        end = Offset(size.width - r.toPx(), stroke / 2f),
                        strokeWidth = stroke,
                    )
                }
                if (tile) {
                    drawRect(
                        Brush.radialGradient(
                            listOf(
                                t.TileGlowColor.copy(
                                    alpha = t.TileGlowColor.alpha * t.TileGlowOpacity,
                                ),
                                Color.Transparent,
                            ),
                            center = Offset(size.width / 2f, -0.2f * size.height),
                            radius = 0.9f * size.width / 0.6f,
                        ),
                    )
                }
            },
        content = content,
    )
}

// --------------------------------------------------------------------------
// Buttons
// --------------------------------------------------------------------------

/** `.btn-primary`: 135° 5-stop brand ramp, white .28 border, accent glow. */
@Composable
fun GlassButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: (@Composable RowScope.() -> Unit)? = null,
) {
    val t = LocalPpTokens.current
    val interaction = remember { MutableInteractionSource() }
    val pressed = interaction.collectIsPressedAsState().value
    val shape = RoundedCornerShape(10.4.dp)
    Row(
        modifier = modifier
            .shadow(
                elevation = 8.dp,
                shape = shape,
                ambientColor = t.GlowIndigo,
                spotColor = t.GlowIndigo,
            )
            .background(brush = t.BrandBrush, shape = shape)
            .drawBehind {
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = Color(0x47FFFFFF),
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(10.4.dp.toPx()),
                    style = Stroke(width = stroke),
                )
                drawLine(
                    color = Color(0x4DFFFFFF),
                    start = Offset(10.4.dp.toPx(), stroke / 2f),
                    end = Offset(size.width - 10.4.dp.toPx(), stroke / 2f),
                    strokeWidth = stroke,
                )
            }
            .clip(shape)
            .graphicsLayer {
                alpha = if (enabled) 1f else 0.45f
                val s = if (pressed && enabled) 0.98f else 1f
                scaleX = s
                scaleY = s
            }
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            icon()
            Text(
                text = " ",
                modifier = Modifier.width(4.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Text(text, color = Color.White, fontWeight = FontWeight.Medium, fontSize = 14.sp)
    }
}

/** `.btn-ghost`: white .05 fill, white .12 border, #c7cef0 text. */
@Composable
fun GhostButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: (@Composable RowScope.() -> Unit)? = null,
) {
    val t = LocalPpTokens.current
    val interaction = remember { MutableInteractionSource() }
    val pressed = interaction.collectIsPressedAsState().value
    val shape = RoundedCornerShape(10.4.dp)
    Row(
        modifier = modifier
            .background(
                color = if (pressed) Color(0x1AFFFFFF) else Color(0x0DFFFFFF),
                shape = shape,
            )
            .drawBehind {
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = if (pressed) Color(0x40FFFFFF) else Color(0x1FFFFFFF),
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(10.4.dp.toPx()),
                    style = Stroke(width = stroke),
                )
            }
            .clip(shape)
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f }
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (icon != null) {
            icon()
            Text(
                text = " ",
                modifier = Modifier.width(4.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Text(
            text,
            color = if (pressed) Color.White else t.GhostText,
            fontWeight = FontWeight.Medium,
            fontSize = 14.sp,
        )
    }
}

// --------------------------------------------------------------------------
// Fields & chips
// --------------------------------------------------------------------------

/** `.input-glass`: deep-navy fill, theme border; focus border + ring. */
fun Modifier.glassField(focused: Boolean = false): Modifier = composed {
    val t = LocalPpTokens.current
    val shape = RoundedCornerShape(10.4.dp)
    this
        .background(color = t.FieldFill, shape = shape)
        .drawBehind {
            val stroke = 1.dp.toPx()
            drawRoundRect(
                color = if (focused) t.FocusBorder else t.GlassBorder,
                topLeft = Offset(stroke / 2f, stroke / 2f),
                size = Size(size.width - stroke, size.height - stroke),
                cornerRadius = CornerRadius(10.4.dp.toPx()),
                style = Stroke(width = stroke),
            )
            if (focused) {
                val ring = 3.dp
                val ringPx = ring.toPx()
                drawRoundRect(
                    color = t.FocusRing,
                    topLeft = Offset(ringPx, ringPx),
                    size = Size(size.width - ringPx * 2f, size.height - ringPx * 2f),
                    cornerRadius = CornerRadius((10.4.dp - ring).toPx()),
                    style = Stroke(width = ringPx),
                )
            }
        }
}

/** `.chip` / `.chip-active`: filter & interval chips. */
@Composable
fun GlassChip(
    text: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val interaction = remember { MutableInteractionSource() }
    val pressed = interaction.collectIsPressedAsState().value
    val shape = RoundedCornerShape(8.dp)
    val cr = CornerRadius(with(LocalDensity.current) { 8.dp.toPx() })
    val halo = t.ChipActiveHalo
    Box(
        modifier = modifier
            .then(
                if (active && halo != null) {
                    Modifier.shadow(
                        elevation = 8.dp,
                        shape = shape,
                        ambientColor = halo,
                        spotColor = halo,
                    )
                } else Modifier,
            )
            .background(
                color = when {
                    active -> Color.Transparent
                    pressed -> Color(0x1AFFFFFF)
                    else -> Color(0x0AFFFFFF)
                },
                shape = shape,
            )
            .drawBehind {
                if (active) {
                    t.ChipActive?.let {
                        drawRoundRect(brush = it.brush(size), size = size, cornerRadius = cr)
                    } ?: run {
                        drawRoundRect(brush = t.BrandBrush, size = size, cornerRadius = cr)
                    }
                }
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = when {
                        active -> t.ChipActiveBorder
                        pressed -> Color(0x40FFFFFF)
                        else -> Color(0x1FFFFFFF)
                    },
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = cr,
                    style = Stroke(width = stroke),
                )
            }
            .clip(shape)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 13.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (active) Color.White else t.MutedLabel,
            fontSize = 12.sp,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

// --------------------------------------------------------------------------
// Badges
// --------------------------------------------------------------------------

/** Uppercase pill, colored per priority (web `PRIORITY_BADGE`). */
@Composable
fun PriorityBadge(priority: String, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    val (border, bg, text) = when (priority.lowercase()) {
        "critical" -> Triple(
            t.CriticalBadgeBorder,
            t.CriticalBadgeBg,
            t.CriticalBadgeText,
        )

        "high" -> Triple(t.HighBadgeBorder, t.HighBadgeBg, t.HighBadgeText)

        else -> Triple(t.NormalBadgeBorder, t.NormalBadgeBg, t.NormalBadgeText)
    }
    BadgePill(modifier = modifier, border = border, fill = bg) {
        Text(
            text = priority.uppercase(),
            color = text,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
        )
    }
}

/** `.badge`: kind/source pill (white .06 fill, white .14 border, #aab4e0 text). */
@Composable
fun KindBadge(text: String, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    BadgePill(modifier = modifier, border = Color(0x24FFFFFF), fill = Color(0x0FFFFFFF)) {
        Text(
            text = text.uppercase(),
            color = t.MutedLabel,
            fontSize = 10.sp,
            letterSpacing = 0.5.sp,
        )
    }
}

/** Shared pill: rounded, 1px border, 10sp uppercase-ish label. */
@Composable
private fun BadgePill(
    modifier: Modifier,
    border: Color,
    fill: Color,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .background(color = fill, shape = CircleShape)
            .drawBehind {
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = border,
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(size.height / 2f),
                    style = Stroke(width = stroke),
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)) { content() }
    }
}

// --------------------------------------------------------------------------
// Text & motion
// --------------------------------------------------------------------------

/**
 * `.grad-text`: brand-gradient headline text.
 *
 * Compose's TextStyle only takes a solid color, so the gradient is faked with
 * per-character spans across the 5-stop ramp (A, oklab(A,B), B, oklab(B,C), C)
 * — the same stops the web paints, so the hue interpolates evenly.
 */
@Composable
fun GradText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.headlineSmall,
) {
    val t = LocalPpTokens.current
    val stops = remember(t) {
        listOf(
            t.GradA,
            oklabMix(t.GradA, t.GradB, 0.5f),
            t.GradB,
            oklabMix(t.GradB, t.GradC, 0.5f),
            t.GradC,
        )
    }
    val spanned: AnnotatedString = remember(text, t) {
        val builder = AnnotatedString.Builder()
        val n = text.length.coerceAtLeast(1)
        for (i in text.indices) {
            val u = if (n == 1) 0f else i.toFloat() / (n - 1)
            val seg = (u * 4f).coerceIn(0f, 3f)
            val idx = seg.toInt()
            val c = lerpColor(stops[idx], stops[idx + 1], seg - idx)
            builder.pushStyle(SpanStyle(color = c))
            builder.append(text[i])
            builder.pop()
        }
        builder.toAnnotatedString()
    }
    Text(spanned, modifier = modifier, style = style)
}

private fun lerpColor(a: Color, b: Color, f: Float): Color {
    val t = f.coerceIn(0f, 1f)
    fun mix(x: Float, y: Float) = x + (y - x) * t
    return Color(
        red = mix(a.red, b.red),
        green = mix(a.green, b.green),
        blue = mix(a.blue, b.blue),
        alpha = mix(a.alpha, b.alpha),
    )
}

/** Pulsing brand-violet dot (web `.empty-dot` / `.count-flash` energy). */
@Composable
fun PulseDot(
    modifier: Modifier = Modifier,
    color: Color? = null,
    size: Dp = 12.dp,
) {
    val t = LocalPpTokens.current
    val c = color ?: t.BrandViolet
    val transition = rememberInfiniteTransition(label = "pulse")
    val a by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(2400, easing = FastOutSlowInEasing),
            RepeatMode.Reverse,
        ),
        label = "pulse",
    )
    Box(modifier = modifier.size(size).background(color = c.copy(alpha = 0.9f - 0.55f * a), shape = CircleShape))
}

/**
 * `.rise` entrance: fade in + 10dp upward, staggered per list index
 * (the web staggers via inline `--delay: i * 40ms`, capped at 400ms).
 */
fun Modifier.rise(index: Int = 0, delayMs: Long = (index * 40L).coerceAtMost(400L)): Modifier =
    composed {
        val anim = remember { Animatable(0f) }
        LaunchedEffect(Unit) {
            anim.snapTo(0f)
            delay(delayMs)
            anim.animateTo(1f, tween(500, easing = FastOutSlowInEasing))
        }
        this.graphicsLayer {
            alpha = anim.value
            translationY = (1f - anim.value) * 10.dp.toPx()
        }
    }

/** Full-width glass panel (settings sections, sheets, dialogs). */
@Composable
fun GlassPanel(
    modifier: Modifier = Modifier,
    strong: Boolean = false,
    content: @Composable BoxScope.() -> Unit,
) {
    GlassCard(modifier = modifier.fillMaxWidth(), strong = strong, content = content)
}

// --------------------------------------------------------------------------
// Section labels, sheet grabber & fields
// --------------------------------------------------------------------------

/** Web `.section-title`: 12px, 600, letter-spacing 1.2, uppercase, #94a3b8. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    Text(
        text.uppercase(),
        modifier = modifier,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.2.sp,
        color = t.TextSecondary,
    )
}

/** Bottom-sheet grabber pill (44×4, white .2, rounded). */
@Composable
fun GlassGrabber(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(width = 44.dp, height = 4.dp)
            .background(color = Color(0x33FFFFFF), shape = RoundedCornerShape(2.dp)),
    )
}

/**
 * `.input-glass` text field: deep-navy fill with a 1px theme border;
 * focus border + soft ring in the theme accent. The Material field is painted
 * transparent over [glassField] so the glass fill stays visible.
 */
@Composable
fun GlassTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    onImeAction: ((ImeAction) -> Unit)? = null,
) {
    val t = LocalPpTokens.current
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Box(modifier = modifier.glassField(focused)) {
        TextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { placeholder?.let { Text(it, color = t.Placeholder) } },
            singleLine = singleLine,
            maxLines = maxLines,
            keyboardOptions = keyboardOptions,
            keyboardActions = if (onImeAction != null) {
                KeyboardActions(onSearch = { onImeAction(ImeAction.Search) })
            } else {
                KeyboardActions.Default
            },
            visualTransformation = visualTransformation,
            leadingIcon = leadingIcon,
            trailingIcon = trailingIcon,
            interactionSource = interaction,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                disabledContainerColor = Color.Transparent,
                errorContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                cursorColor = t.BrandViolet,
                focusedTextColor = t.Foreground,
                unfocusedTextColor = t.Foreground,
                disabledTextColor = t.Foreground,
                errorTextColor = t.Foreground,
                focusedLabelColor = t.BrandViolet,
                unfocusedLabelColor = t.TextSecondary,
                focusedLeadingIconColor = t.TextSecondary,
                unfocusedLeadingIconColor = t.TextSecondary,
                focusedTrailingIconColor = t.TextSecondary,
                unfocusedTrailingIconColor = t.TextSecondary,
            ),
        )
    }
}
