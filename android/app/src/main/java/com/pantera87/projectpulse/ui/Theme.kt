package com.pantera87.projectpulse.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density

/**
 * App theme entry point. The active [PpTheme] decides which [PpTokens]
 * instance is provided to the composition; everything theme-sensitive (glass
 * components, backdrop, typography, Material fallbacks) reads
 * [LocalPpTokens], so switching themes updates the whole app live.
 *
 * Also installs the resolution-based UI scale ([rememberScreenScale]):
 * phones narrower than the design baseline get a slightly lower
 * [LocalDensity], which shrinks every `dp` dimension and `sp` text size in
 * the tree proportionally so fixed-size desktop-ported widgets stop
 * overlapping on small screens.
 */
@Composable
fun ProjectPulseTheme(
    theme: PpTheme,
    content: @Composable () -> Unit,
) {
    val tokens = remember(theme) { if (theme == PpTheme.AURORA) AuroraTokens else PulseTokens }
    val density = LocalDensity.current
    val scale = rememberScreenScale()
    MaterialTheme(colorScheme = tokens.colorScheme, typography = tokens.typography) {
        CompositionLocalProvider(
            LocalPpTokens provides tokens,
            LocalDensity provides Density(
                density = density.density * scale,
                fontScale = density.fontScale,
            ),
        ) { content() }
    }
}
