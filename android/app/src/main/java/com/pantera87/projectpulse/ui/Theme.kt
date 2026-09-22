package com.pantera87.projectpulse.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Violet accent, matching the web UI's "hover:text-violet-300" identity.
private val LightColors = lightColorScheme(
    primary = Color(0xFF6D4AE8),
    secondary = Color(0xFF8B5CF6),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB3A0FF),
    secondary = Color(0xFF8B5CF6),
)

@Composable
fun ProjectPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
