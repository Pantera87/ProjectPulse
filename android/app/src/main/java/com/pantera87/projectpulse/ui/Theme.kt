package com.pantera87.projectpulse.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember

/**
 * App theme entry point. The active [PpTheme] decides which [PpTokens]
 * instance is provided to the composition; everything theme-sensitive (glass
 * components, backdrop, typography, Material fallbacks) reads
 * [LocalPpTokens], so switching themes updates the whole app live.
 */
@Composable
fun ProjectPulseTheme(
    theme: PpTheme,
    content: @Composable () -> Unit,
) {
    val tokens = remember(theme) { if (theme == PpTheme.AURORA) AuroraTokens else PulseTokens }
    MaterialTheme(colorScheme = tokens.colorScheme, typography = tokens.typography) {
        CompositionLocalProvider(LocalPpTokens provides tokens) { content() }
    }
}
