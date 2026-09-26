package com.pantera87.projectpulse.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.R
import kotlin.math.cos
import kotlin.math.cbrt
import kotlin.math.pow
import kotlin.math.sin

/** Theme ids, matching the web app's `pp-theme` localStorage values. */
enum class PpTheme(val id: String) {
    AURORA("aurora"),
    PULSE("pulse");

    companion object {
        /** Unknown/missing ids fall back to the aurora default. */
        fun fromId(id: String?): PpTheme = if (id == PULSE.id) PULSE else AURORA
    }
}

// --------------------------------------------------------------------------
// Shared helpers
// --------------------------------------------------------------------------

/**
 * One radial glow for the aurora canvas. Positions are fractions of the
 * canvas; the radius is a fraction of the canvas *short side*, so a glow
 * keeps the same relative size in portrait and landscape.
 */
data class GlowSpec(
    val cx: Float,
    val cy: Float,
    val radius: Float,
    val color: Color,
    /** Fraction of the radius at which the color has faded to transparent. */
    val fadeAt: Float,
)

/**
 * A CSS-style `linear-gradient(θdeg, c1 p1%, c2 p2%, …)`: angle clockwise
 * from "to top" (0 = up, 90 = right, 135 = down-right). The stops are
 * relative to the gradient line projected onto [size], so the painted ramp
 * spans the whole view — matching the CSS behavior, which the naive
 * `Offset.Zero → Offset.Infinite` brush only approximates.
 */
data class AngleGradient(
    val angleDeg: Double,
    val colors: List<Color>,
    val stops: List<Float>,
) {
    fun brush(size: Size): Brush {
        val rad = Math.toRadians(angleDeg)
        val dx = sin(rad).toFloat()
        val dy = -cos(rad).toFloat()
        var lo = Float.MAX_VALUE
        var hi = -Float.MAX_VALUE
        for (px in floatArrayOf(0f, size.width)) {
            for (py in floatArrayOf(0f, size.height)) {
                val p = px * dx + py * dy
                if (p < lo) lo = p
                if (p > hi) hi = p
            }
        }
        if (hi <= lo) return SolidColor(colors.first())
        return Brush.linearGradient(
            colorStops = stops.zip(colors).toTypedArray(),
            start = Offset(dx * lo, dy * lo),
            end = Offset(dx * hi, dy * hi),
        )
    }
}

internal fun DrawScope.drawAngle(gradient: AngleGradient) {
    drawRect(gradient.brush(size))
}

/**
 * The 135° 5-stop brand ramp: `[A, oklab(A,B), B, oklab(B,C), C]` — the web's
 * `.btn-primary` / `.glyph-tile` gradient, where the 25/75% half-stops are
 * `color-mix(in oklab, …)` so hue interpolates evenly.
 */
internal fun brandBrush(a: Color, b: Color, c: Color): Brush =
    Brush.linearGradient(
        colors = listOf(a, oklabMix(a, b, 0.5f), b, oklabMix(b, c, 0.5f), c),
        start = Offset.Zero,
        end = Offset.Infinite,
    )

/**
 * Interpolate two colors in OKLab — the small port of the web's
 * `color-mix(in oklab, a 50%, b 50%)` gradient half-stops (standard
 * sRGB→OKLab→lerp→sRGB round trip).
 */
fun oklabMix(a: Color, b: Color, f: Float): Color {
    fun toLinear(c: Float): Float =
        if (c <= 0.04045f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)

    fun toGamma(c: Float): Float {
        val g = if (c <= 0.0031308f) 12.92f * c else 1.055f * c.pow(1f / 2.4f) - 0.055f
        return g.coerceIn(0f, 1f)
    }

    fun toOklab(c: Color): Triple<Float, Float, Float> {
        val r = toLinear(c.red)
        val g = toLinear(c.green)
        val bl = toLinear(c.blue)
        val l = 0.8189330101f * r + 0.3618667434f * g - 0.1288594108f * bl
        val m = 0.0325441168f * r + 0.9292171487f * g - 0.0625721361f * bl
        val s = 0.0482003036f * r + 0.2643668604f * g + 0.6338511736f * bl
        val lt = cbrt(l)
        val mt = cbrt(m)
        val st = cbrt(s)
        return Triple(
            0.2104542553f * lt + 0.7936177850f * mt - 0.0040720468f * st,
            1.9779984951f * lt - 2.4285922050f * mt + 0.4505937099f * st,
            0.0259040371f * lt + 0.7827717662f * mt - 0.8086757660f * st,
        )
    }

    fun fromOklab(l: Float, a: Float, b: Float): Triple<Float, Float, Float> {
        val lt = l + 0.3963377774f * a + 0.2158037573f * b
        val mt = l - 0.1055613458f * a - 0.0638541728f * b
        val st = l - 0.0894841775f * a - 1.2914855480f * b
        val x = lt * lt * lt
        val y = mt * mt * mt
        val z = st * st * st
        return Triple(
            toGamma(4.0767416621f * x - 3.3077115913f * y + 0.2309699292f * z),
            toGamma(-1.2684380046f * x + 2.6097574011f * y - 0.3413193965f * z),
            toGamma(-0.0041960863f * x - 0.7034186147f * y + 1.7076147010f * z),
        )
    }

    val t = f.coerceIn(0f, 1f)
    val (la, aa, ba) = toOklab(a)
    val (lb, ab, bb) = toOklab(b)
    val (r, g, bl) = fromOklab(
        la + (lb - la) * t,
        aa + (ab - aa) * t,
        ba + (bb - ba) * t,
    )
    return Color(r, g, bl, a.alpha + (b.alpha - a.alpha) * t)
}

// --------------------------------------------------------------------------
// Tokens
// --------------------------------------------------------------------------

/**
 * Every theme-sensitive design token, ported 1:1 from the web's globals.css.
 * The pulse values are the original `Palette` object verbatim; aurora re-tints
 * them per `:root[data-theme="aurora"]`. Priority badge colors, error/rose
 * colors and scrims are shared (the web doesn't re-tint them).
 */
class PpTokens(
    val theme: PpTheme,

    // --background / --foreground
    val Background: Color,
    /** Canvas base fill painted before the glows (--aurora-bg for aurora). */
    val BackdropBase: Color,
    val Foreground: Color,

    // --brand-blue / --brand-violet / --brand-purple
    val BrandBlue: Color,
    val BrandViolet: Color,
    val BrandPurple: Color,

    // Muted text (the web uses the tailwind slate scale)
    val TextSecondary: Color,
    val TextTertiary: Color,
    val MutedLabel: Color,
    val Placeholder: Color,
    val GhostText: Color,
    val Link: Color,
    val Error: Color,

    // ---------- glass (.glass / .glass-strong) ----------
    val GlassBorder: Color,
    val GlassBorderPressed: Color,
    /** Inset 1px top highlight; transparent in aurora (box-shadow: none). */
    val GlassHighlight: Color,
    /** Base color under the .glass-strong fill (transparent in aurora). */
    val GlassDeepBase: Color,
    val FieldFill: Color,
    /** Ambient/spot shadow color for glass cards. */
    val GlassStrongShadow: Color,

    // Glow / focus (buttons, inputs, hover)
    val GlowIndigo: Color,
    val GlowAccent: Color,
    val FocusBorder: Color,
    val FocusRing: Color,
    val FocusGlowBlue: Color,

    // ---------- priority (shared by both themes) ----------
    val Critical: Color,
    val CriticalBorder: Color,
    val CriticalGlow: Color,
    val CriticalBadgeBorder: Color,
    val CriticalBadgeBg: Color,
    val CriticalBadgeText: Color,
    val High: Color,
    val HighBorder: Color,
    val HighBadgeBorder: Color,
    val HighBadgeBg: Color,
    val HighBadgeText: Color,
    val NormalBorder: Color,
    val NormalBadgeBorder: Color,
    val NormalBadgeBg: Color,
    val NormalBadgeText: Color,

    // ---------- radii (.glass / .glass-strong) ----------
    val CardRadius: Dp,
    val StrongRadius: Dp,

    // ---------- .glass-tile::before ----------
    val TileGlowColor: Color,
    val TileGlowOpacity: Float,

    // ---------- .chip-active / .nav-item-active ----------
    /** null → the 5-stop brand brush (pulse). */
    val ChipActive: AngleGradient?,
    val ChipActiveBorder: Color,
    /** Halo behind the active chip; null = no halo (aurora: box-shadow: none). */
    val ChipActiveHalo: Color?,

    // ---------- .stat-box (inset boxes) ----------
    /** null → white .05 solid (pulse). */
    val StatBoxFill: AngleGradient?,
    val StatBoxBorder: Color,

    // ---------- fills & gradients ----------
    val GlassFill: Brush,
    val GlassStrongFill: Brush,
    /** aurora-only `--aurora-card` gradient; null in pulse. */
    val CardGradient: AngleGradient?,
    /** aurora-only `--aurora-menu` gradient (chip-active); null in pulse. */
    val MenuGradient: AngleGradient?,
    /** aurora-only `--aurora-card-deep` gradient (stat-box); null in pulse. */
    val CardDeepGradient: AngleGradient?,
    val BrandBrush: Brush,
    val GradA: Color,
    val GradB: Color,
    val GradC: Color,

    // ---------- backdrop canvas (pulse: tints + blobs + dots; aurora: glows) ----------
    val TintBlue: Color,
    val TintViolet: Color,
    val TintPurple: Color,
    val BlobBlue: Color,
    val BlobViolet: Color,
    val BlobFuchsia: Color,
    val Dot: Color,

    // Material3 fallback surfaces
    val colorScheme: ColorScheme,
    val typography: Typography,
)

// --------------------------------------------------------------------------
// Bundled fonts (OFL, bundled per theme like the web's next/font setup)
// --------------------------------------------------------------------------

val AuroraFontFamily = FontFamily(
    Font(R.font.plus_jakarta_sans, FontWeight.Normal),
    Font(R.font.plus_jakarta_sans_medium, FontWeight.Medium),
    Font(R.font.plus_jakarta_sans_semibold, FontWeight.SemiBold),
    Font(R.font.plus_jakarta_sans_bold, FontWeight.Bold),
)

val PulseFontFamily = FontFamily(
    Font(R.font.geist, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
    Font(R.font.geist_bold, FontWeight.Bold),
)

private fun typography(family: FontFamily): Typography {
    val base = Typography()
    fun of(style: TextStyle) = style.copy(fontFamily = family)
    return Typography(
        displayLarge = of(base.displayLarge),
        displayMedium = of(base.displayMedium),
        displaySmall = of(base.displaySmall),
        headlineLarge = of(base.headlineLarge),
        headlineMedium = of(base.headlineMedium),
        headlineSmall = of(base.headlineSmall),
        titleLarge = of(base.titleLarge),
        titleMedium = of(base.titleMedium),
        titleSmall = of(base.titleSmall),
        bodyLarge = of(base.bodyLarge),
        bodyMedium = of(base.bodyMedium),
        bodySmall = of(base.bodySmall),
        labelLarge = of(base.labelLarge),
        labelMedium = of(base.labelMedium),
        labelSmall = of(base.labelSmall),
    )
}

// --------------------------------------------------------------------------
// Material3 fallback schemes (most UI uses the glass components)
// --------------------------------------------------------------------------

private val PulseDark = darkColorScheme(
    primary = Color(0xFF8B5CF6),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF2B2158),
    onPrimaryContainer = Color(0xFFDCD4FF),
    secondary = Color(0xFF4F8CFF),
    onSecondary = Color.White,
    tertiary = Color(0xFFC084FC),
    onTertiary = Color(0xFF241B2F),
    background = Color(0xFF060814),
    onBackground = Color(0xFFE8EBFF),
    surface = Color(0xFF0A0F26),
    onSurface = Color(0xFFE8EBFF),
    surfaceVariant = Color(0xFF11173A),
    onSurfaceVariant = Color(0xFFAAB4E0),
    outline = Color(0x738B5CF6),
    error = Color(0xFFFB7185),
    onError = Color.White,
)

private val AuroraDark = darkColorScheme(
    primary = Color(0xFF0075FF),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF0B1E3A),
    onPrimaryContainer = Color(0xFFD6E4FF),
    secondary = Color(0xFF4318FF),
    onSecondary = Color.White,
    tertiary = Color(0xFF9F7AEA),
    onTertiary = Color(0xFF241B2F),
    background = Color(0xFF030C1D),
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF060B28),
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF0A0E23),
    onSurfaceVariant = Color(0xFFAAB4E0),
    outline = Color(0x730075FF),
    error = Color(0xFFFB7185),
    onError = Color.White,
)

/**
 * Aurora = the web's `:root[data-theme="aurora"]` reference look:
 * blue-dominant navy, static layered glow, blue→cyan→emerald ramps.
 */
val AuroraTokens = PpTokens(
    theme = PpTheme.AURORA,
    Background = Color(0xFF030C1D),
    BackdropBase = Color(0xFF04102A),   // --vision-bg
    Foreground = Color(0xFFF1F5F9),
    BrandBlue = Color(0xFF0075FF),
    BrandViolet = Color(0xFF4318FF),
    BrandPurple = Color(0xFF9F7AEA),
    TextSecondary = Color(0xFF94A3B8),
    TextTertiary = Color(0xFF64748B),
    MutedLabel = Color(0xFFAAB4E0),
    Placeholder = Color(0xFF6B7699),
    GhostText = Color(0xFFC7CEF0),
    Link = Color(0xFF8F7BFF),           // --accent-soft
    Error = Color(0xFFFB7185),
    GlassBorder = Color(0x2994A3C8),     // rgba(148,163,200,.16)
    GlassBorderPressed = Color(0x730075FF), // rgba(0,117,255,.45)
    GlassHighlight = Color.Transparent,   // box-shadow: none
    GlassDeepBase = Color.Transparent,
    FieldFill = Color(0x8C080C20),        // rgba(8,12,32,.55), unchanged
    GlassStrongShadow = Color.Transparent, // web vision: box-shadow: none
    GlowIndigo = Color(0x8C4318FF),       // rgba(67,24,255,.55)
    GlowAccent = Color(0x594318FF),       // rgba(67,24,255,.35)
    FocusBorder = Color(0xA60075FF),      // rgba(0,117,255,.65)
    FocusRing = Color(0x2E0075FF),        // rgba(0,117,255,.18)
    FocusGlowBlue = Color(0x594F8CFF),    // rgba(79,140,255,.35), shared
    Critical = Color(0xFFF43F5E),
    CriticalBorder = Color(0x66F43F5E),
    CriticalGlow = Color(0x80F43F5E),
    CriticalBadgeBorder = Color(0x80FB7185),
    CriticalBadgeBg = Color(0x33F43F5E),
    CriticalBadgeText = Color(0xFFFDA4AF),
    High = Color(0xFFFBBF24),
    HighBorder = Color(0x66FBBF24),
    HighBadgeBorder = Color(0x80FBBF24),
    HighBadgeBg = Color(0x33FBBF24),
    HighBadgeText = Color(0xFFFCD34D),
    NormalBorder = Color(0x1AFFFFFF),
    NormalBadgeBorder = Color(0x26FFFFFF),
    NormalBadgeBg = Color(0x1AFFFFFF),
    NormalBadgeText = Color(0xFFCBD5E1),
    CardRadius = 14.dp,
    StrongRadius = 18.dp,
    TileGlowColor = Color(0x290075FF),    // rgba(0,117,255,.16)
    TileGlowOpacity = 0.45f,              // .glass-tile::before opacity
    ChipActive = AngleGradient(
        angleDeg = 126.97,
        colors = listOf(Color(0xFF05153F), Color(0xFF072561)),
        stops = listOf(0.2826f, 0.912f),
    ),
    ChipActiveBorder = Color(0x590075FF), // rgba(0,117,255,.35)
    ChipActiveHalo = null,
    StatBoxFill = AngleGradient(
        angleDeg = 126.97,
        colors = listOf(Color(0xFF060B28), Color(0xFF0A0E23)),
        stops = listOf(0.2826f, 0.912f),
    ),
    StatBoxBorder = Color(0x1F94A3C8),    // rgba(148,163,200,.12)
    GlassFill = SolidColor(Color.Transparent), // drawn via CardGradient
    GlassStrongFill = SolidColor(Color.Transparent),
    CardGradient = AngleGradient(
        angleDeg = 127.09,
        colors = listOf(Color(0xF0060B28), Color(0x7D0A0E23)),
        stops = listOf(0.1941f, 0.7665f),
    ),
    MenuGradient = AngleGradient(
        angleDeg = 126.97,
        colors = listOf(Color(0xFF05153F), Color(0xFF072561)),
        stops = listOf(0.2826f, 0.912f),
    ),
    CardDeepGradient = AngleGradient(
        angleDeg = 126.97,
        colors = listOf(Color(0xFF060B28), Color(0xFF0A0E23)),
        stops = listOf(0.2826f, 0.912f),
    ),
    BrandBrush = brandBrush(
        Color(0xFF4F8CFF),
        Color(0xFF21D4FD),
        Color(0xFF34D399),
    ),
    GradA = Color(0xFF4F8CFF),
    GradB = Color(0xFF21D4FD),
    GradC = Color(0xFF34D399),
    TintBlue = Color.Transparent,
    TintViolet = Color.Transparent,
    TintPurple = Color.Transparent,
    BlobBlue = Color.Transparent,
    BlobViolet = Color.Transparent,
    BlobFuchsia = Color.Transparent,
    Dot = Color.Transparent,
    // The aurora canvas draws a random scatter of bright-blue glows at
    // composition time (see AuroraBackground); a fixed width-normalized list
    // washes out on wide/landscape canvases, so none is stored here.
    colorScheme = AuroraDark,
    typography = typography(AuroraFontFamily),
)

/**
 * Pulse = the original look: the first `Palette` values verbatim, with the
 * gradient ramps upgraded to the web's 5-stop oklab-mixed ramps.
 */
val PulseTokens = PpTokens(
    theme = PpTheme.PULSE,
    Background = Color(0xFF060814),
    BackdropBase = Color(0xFF060814),
    Foreground = Color(0xFFE8EBFF),
    BrandBlue = Color(0xFF4F8CFF),
    BrandViolet = Color(0xFF8B5CF6),
    BrandPurple = Color(0xFFC084FC),
    TextSecondary = Color(0xFF94A3B8),
    TextTertiary = Color(0xFF64748B),
    MutedLabel = Color(0xFFAAB4E0),
    Placeholder = Color(0xFF6B7699),
    GhostText = Color(0xFFC7CEF0),
    Link = Color(0xFFA5B4FC),
    Error = Color(0xFFFB7185),
    GlassBorder = Color(0x1FFFFFFF),
    GlassBorderPressed = Color(0x738B5CF6),
    GlassHighlight = Color(0x17FFFFFF),
    GlassDeepBase = Color(0x59080C20),
    FieldFill = Color(0x8C080C20),
    GlassStrongShadow = Color(0x26020414),
    GlowIndigo = Color(0x8C6366F1),
    GlowAccent = Color(0x596366F1),
    FocusBorder = Color(0xA68B5CF6),
    FocusRing = Color(0x2E8B5CF6),
    FocusGlowBlue = Color(0x594F8CFF),
    Critical = Color(0xFFF43F5E),
    CriticalBorder = Color(0x66F43F5E),
    CriticalGlow = Color(0x80F43F5E),
    CriticalBadgeBorder = Color(0x80FB7185),
    CriticalBadgeBg = Color(0x33F43F5E),
    CriticalBadgeText = Color(0xFFFDA4AF),
    High = Color(0xFFFBBF24),
    HighBorder = Color(0x66FBBF24),
    HighBadgeBorder = Color(0x80FBBF24),
    HighBadgeBg = Color(0x33FBBF24),
    HighBadgeText = Color(0xFFFCD34D),
    NormalBorder = Color(0x1AFFFFFF),
    NormalBadgeBorder = Color(0x26FFFFFF),
    NormalBadgeBg = Color(0x1AFFFFFF),
    NormalBadgeText = Color(0xFFCBD5E1),
    CardRadius = 16.dp,
    StrongRadius = 20.dp,
    TileGlowColor = Color(0x24A855F7),    // rgba(168,85,247,.14)
    TileGlowOpacity = 1f,
    ChipActive = null,
    ChipActiveBorder = Color(0x59FFFFFF),
    ChipActiveHalo = Color(0x596366F1),
    StatBoxFill = null,
    StatBoxBorder = Color(0x0DFFFFFF),
    GlassFill = Brush.linearGradient(
        colors = listOf(Color(0x14FFFFFF), Color(0x05FFFFFF), Color(0x0F8B5CF6)),
        start = Offset.Zero,
        end = Offset.Infinite,
    ),
    GlassStrongFill = Brush.linearGradient(
        colors = listOf(Color(0x0FFFFFFF), Color(0x04FFFFFF), Color(0x0D8B5CF6)),
        start = Offset.Zero,
        end = Offset.Infinite,
    ),
    CardGradient = null,
    MenuGradient = null,
    CardDeepGradient = null,
    BrandBrush = brandBrush(
        Color(0xFF60A5FA),
        Color(0xFFA78BFA),
        Color(0xFFE879F9),
    ),
    GradA = Color(0xFF60A5FA),
    GradB = Color(0xFFA78BFA),
    GradC = Color(0xFFE879F9),
    TintBlue = Color(0x294F8CFF),
    TintViolet = Color(0x248B5CF6),
    TintPurple = Color(0x1AC084FC),
    BlobBlue = Color(0x8C4F8CFF),
    BlobViolet = Color(0x80A855F7),
    BlobFuchsia = Color(0x38E879F9),
    Dot = Color(0x0DFFFFFF),
    // Pulse theme: the aurora canvas is not used (PulseBackdrop instead).
    colorScheme = PulseDark,
    typography = typography(PulseFontFamily),
)

/** Active tokens for the composition; pulse is the fallback default. */
val LocalPpTokens = compositionLocalOf { PulseTokens }
