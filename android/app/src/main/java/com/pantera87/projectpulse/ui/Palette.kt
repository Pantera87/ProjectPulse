package com.pantera87.projectpulse.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * Design tokens ported 1:1 from the web app's globals.css.
 *
 * ProjectPulse is dark-only (the web sets `color-scheme: dark`), so this
 * palette is the app theme: near-black navy base, blue/violet/purple brand
 * trio, translucent "liquid glass" surfaces.
 */
object Palette {
    // --background / --foreground
    val Background = Color(0xFF060814)
    val Foreground = Color(0xFFE8EBFF)

    // --brand-blue / --brand-violet / --brand-purple
    val BrandBlue = Color(0xFF4F8CFF)
    val BrandViolet = Color(0xFF8B5CF6)
    val BrandPurple = Color(0xFFC084FC)

    // Muted text (the web uses the tailwind slate scale)
    val TextSecondary = Color(0xFF94A3B8)   // slate-400
    val TextTertiary = Color(0xFF64748B)    // slate-500
    val MutedLabel = Color(0xFFAAB4E0)      // .chip / .badge text
    val Placeholder = Color(0xFF6B7699)     // .input-glass placeholder
    val GhostText = Color(0xFFC7CEF0)       // .btn-ghost text
    val Link = Color(0xFFA5B4FC)            // indigo-300
    val Error = Color(0xFFFB7185)           // rose-400

    // ---------- glass (.glass / .glass-strong) ----------
    val GlassBorder = Color(0x1FFFFFFF)       // rgba(255,255,255,.12)
    val GlassBorderPressed = Color(0x738B5CF6) // rgba(139,92,246,.45) — .glass-hover
    val GlassHighlight = Color(0x17FFFFFF)    // inset 0 1px 0 white .09
    val GlassDeepBase = Color(0x59080C20)     // rgba(8,12,32,.35) — .glass-strong base
    val FieldFill = Color(0x8C080C20)         // rgba(8,12,32,.55) — .input-glass

    // Glow / focus (buttons, inputs, hover)
    val GlowIndigo = Color(0x8C6366F1)        // rgba(99,102,241,.55) — .btn-primary shadow
    val GlowAccent = Color(0x596366F1)        // rgba(99,102,241,.35) — .glass-hover halo
    val FocusBorder = Color(0xA68B5CF6)       // rgba(139,92,246,.65)
    val FocusRing = Color(0x2E8B5CF6)         // rgba(139,92,246,.18)
    val FocusGlowBlue = Color(0x594F8CFF)     // rgba(79,140,255,.35)

    // ---------- priority (update-item.tsx STYLES / PRIORITY_BADGE) ----------
    val Critical = Color(0xFFF43F5E)          // rose-500
    val CriticalBorder = Color(0x66F43F5E)    // rose-500/40
    val CriticalGlow = Color(0x80F43F5E)      // rgba(244,63,94,.5)
    val CriticalBadgeBorder = Color(0x80FB7185) // rose-400/50
    val CriticalBadgeBg = Color(0x33F43F5E)   // rose-500/20
    val CriticalBadgeText = Color(0xFFFDA4AF)  // rose-300

    val High = Color(0xFFFBBF24)              // amber-400
    val HighBorder = Color(0x66FBBF24)        // amber-400/40
    val HighBadgeBorder = Color(0x80FBBF24)   // amber-400/50
    val HighBadgeBg = Color(0x33FBBF24)       // amber-400/20
    val HighBadgeText = Color(0xFFFCD34D)     // amber-300

    val NormalBorder = Color(0x1AFFFFFF)      // white/10
    val NormalBadgeBorder = Color(0x26FFFFFF) // white/15
    val NormalBadgeBg = Color(0x1AFFFFFF)     // white/10
    val NormalBadgeText = Color(0xFFCBD5E1)   // slate-300

    // ---------- aurora background ----------
    // Static tints from the web body background (fixed radial gradients).
    val TintBlue = Color(0x294F8CFF)     // rgba(79,140,255,.16)
    val TintViolet = Color(0x248B5CF6)    // rgba(139,92,247,.14)
    val TintPurple = Color(0x1AC084FC)    // rgba(192,132,252,.10)
    // Drifting blobs (.aurora-blob-1/2/3), painted pre-softened.
    val BlobBlue = Color(0x8C4F8CFF)     // rgba(79,140,255,.55)
    val BlobViolet = Color(0x80A855F7)    // rgba(168,85,247,.5)
    val BlobFuchsia = Color(0x38E879F9)   // rgba(232,121,249,.22)
    val Dot = Color(0x0DFFFFFF)           // dot grid: white .05

    // ---------- brushes ----------
    /** .btn-primary / .chip-active: 135° blue → violet → purple. */
    val BrandGradient = Brush.linearGradient(
        colors = listOf(BrandBlue, BrandViolet, BrandPurple),
        start = Offset.Zero,
        end = Offset.Infinite,
    )

    /** .grad-text: 90° #60a5fa → #a78bfa 55% → #e879f9 (horizontal). */
    val GradText = Brush.linearGradient(
        colors = listOf(Color(0xFF60A5FA), Color(0xFFA78BFA), Color(0xFFE879F9)),
        start = Offset.Zero,
        end = Offset(Float.MAX_VALUE, 0f),
    )

    /** .glass fill: 150° white .08 → white .02 → violet .06. */
    val GlassFill = Brush.linearGradient(
        colors = listOf(Color(0x14FFFFFF), Color(0x05FFFFFF), Color(0x0F8B5CF6)),
        start = Offset.Zero,
        end = Offset.Infinite,
    )

    /** .glass-strong fill: 150° white .06 → white .015 → violet .05. */
    val GlassStrongFill = Brush.linearGradient(
        colors = listOf(Color(0x0FFFFFFF), Color(0x04FFFFFF), Color(0x0D8B5CF6)),
        start = Offset.Zero,
        end = Offset.Infinite,
    )
}