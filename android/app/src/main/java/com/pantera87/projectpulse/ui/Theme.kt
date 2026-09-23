package com.pantera87.projectpulse.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Dark-only Material3 scheme mapped from the web app's globals.css tokens
 * (the web sets `color-scheme: dark` and has no light mode). These are the
 * fallback surfaces — most UI uses the glass components in Glass.kt over the
 * shared aurora background.
 */
private val PulseDark = darkColorScheme(
    primary = Palette.BrandViolet,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF2B2158),
    onPrimaryContainer = Color(0xFFDCD4FF),
    secondary = Palette.BrandBlue,
    onSecondary = Color.White,
    tertiary = Palette.BrandPurple,
    onTertiary = Color(0xFF241B2F),
    background = Palette.Background,
    onBackground = Palette.Foreground,
    surface = Color(0xFF0A0F26),
    onSurface = Palette.Foreground,
    surfaceVariant = Color(0xFF11173A),
    onSurfaceVariant = Palette.MutedLabel,
    outline = Palette.GlassBorderPressed,
    error = Palette.Error,
    onError = Color.White,
)

@Composable
fun ProjectPulseTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = PulseDark, content = content)
}
