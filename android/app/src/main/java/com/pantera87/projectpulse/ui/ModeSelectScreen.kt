package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
/** Mode-picker choice (ui only — AppRoot maps it onto `prefs.dataMode`). */
enum class AppMode { COMPANION, LOCAL }

/**
 * One-time mode picker shown after onboarding: Companion (paired to a running
 * server) or Local (self-contained). Companion is pre-selected, following the
 * same pattern as the desktop "Choose your mode" start screen.
 */
@Composable
fun ModeSelectScreen(
    onContinue: (AppMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    var selected by remember { mutableStateOf(AppMode.COMPANION) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp)
            .padding(top = 56.dp, bottom = 28.dp),
    ) {
        Text(
            "Welcome to ProjectPulse",
            color = t.Foreground,
            textAlign = TextAlign.Center,
            style = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(10.dp))
        Text(
            "How do you want to run it?",
            color = t.TextSecondary,
            textAlign = TextAlign.Center,
            style = TextStyle(fontSize = 15.sp),
        )
        Spacer(Modifier.height(36.dp))

        ModeCard(
            icon = Icons.Outlined.Cloud,
            name = "Companion mode",
            subtitle = "Paired to your server. Full features, pushed for you.",
            selected = selected == AppMode.COMPANION,
            onSelect = { selected = AppMode.COMPANION },
            t = t,
        )
        Spacer(Modifier.height(16.dp))
        ModeCard(
            icon = Icons.Outlined.PhoneAndroid,
            name = "Local mode",
            subtitle = "This device only. Self-contained, no server required.",
            selected = selected == AppMode.LOCAL,
            onSelect = { selected = AppMode.LOCAL },
            t = t,
        )
        Spacer(Modifier.weight(1f))
        GlassButton(
            text = "Continue",
            onClick = { onContinue(selected) },
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
        )
    }
}

@Composable
private fun ModeCard(
    icon: ImageVector,
    name: String,
    subtitle: String,
    selected: Boolean,
    onSelect: () -> Unit,
    t: PpTokens,
) {
    val tokens = t
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .glass(strong = true, radius = 22.dp)
            .clickable(onClick = onSelect)
            .padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .glass(strong = true, tile = true, radius = 16.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(26.dp),
            )
        }
        Column(Modifier.weight(1f)) {
            Text(
                name,
                color = tokens.Foreground,
                style = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
            )
            Spacer(Modifier.height(2.dp))
            Text(
                subtitle,
                color = tokens.TextSecondary,
                style = TextStyle(fontSize = 14.sp, lineHeight = 19.sp),
            )
        }
        // Glassy radio: hollow ring → filled brand dot when selected.
        Box(
            modifier = Modifier
                .size(24.dp)
                .clip(CircleShape)
                .border(
                    width = 1.5.dp,
                    color = if (selected) tokens.BrandBlue else Color(0x59FFFFFF),
                    shape = CircleShape,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) {
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .clip(CircleShape)
                        .background(tokens.BrandBlue),
                )
            }
        }
    }
}