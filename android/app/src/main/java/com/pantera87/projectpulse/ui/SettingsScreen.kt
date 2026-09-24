@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.BuildConfig
import com.pantera87.projectpulse.notif.Notifier
import com.pantera87.projectpulse.notif.SyncScheduler

private val INTERVALS = listOf(15 to "15 min", 30 to "30 min", 60 to "1 h", 240 to "4 h")

/**
 * App-level settings: connection status + reconnect, and the background
 * notification polling (interval + immediate check).
 *
 * Sections are `.glass-strong` panels over the aurora backdrop, headed by
 * web-style `.section-title` labels.
 */
@Composable
fun SettingsScreen(onOpenConnect: () -> Unit) {
    val app = App.instance
    val context = LocalContext.current
    val prefs = app.prefs
    val url by prefs.url.collectAsState()
    val configured by prefs.configured.collectAsState()
    val notifEnabled by prefs.notificationsEnabled.collectAsState()
    val intervalMin by prefs.notifIntervalMin.collectAsState()
    val theme = PpTheme.fromId(prefs.theme.value)
    var canPost by remember { mutableStateOf(Notifier.canNotify(context)) }
    var checkedNow by remember { mutableStateOf(false) }
    val uiMode = rememberUiMode()

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = {
                    GradText(
                        "Settings",
                        style = TextStyle(
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
            )
        },
    ) { padding ->
        AdaptiveContent(uiMode, maxWidth = 560.dp) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(start = 12.dp, top = 4.dp, end = 12.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            SectionLabel("Connection", modifier = Modifier.padding(top = 12.dp, bottom = 8.dp))
            GlassPanel(strong = true) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        url.ifBlank { "No server set" },
                        style = MaterialTheme.typography.bodyMedium,
                        color = LocalPpTokens.current.Foreground,
                    )
                    GlassButton(
                        text = if (configured) "Reconnect" else "Connect",
                        onClick = onOpenConnect,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            SectionLabel(
                "Notifications",
                modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
            )
            GlassPanel(strong = true) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                "Notify about new updates",
                                style = MaterialTheme.typography.bodyMedium,
                                color = LocalPpTokens.current.Foreground,
                            )
                            Text(
                                "Checks the server in the background for unread updates.",
                                style = MaterialTheme.typography.bodySmall,
                                color = LocalPpTokens.current.TextSecondary,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                        Switch(
                            checked = notifEnabled,
                            onCheckedChange = { v ->
                                prefs.setNotificationsEnabled(v)
                                if (v) SyncScheduler.schedule(app, intervalMin.toLong())
                                else SyncScheduler.cancel(app)
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = LocalPpTokens.current.BrandViolet,
                                uncheckedThumbColor = Color(0xB3FFFFFF),
                                uncheckedTrackColor = Color(0x26FFFFFF),
                                uncheckedBorderColor = Color(0x26FFFFFF),
                            ),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    if (notifEnabled) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            INTERVALS.forEach { (min, label) ->
                                GlassChip(
                                    text = label,
                                    active = intervalMin == min,
                                    onClick = {
                                        if (intervalMin != min) {
                                            prefs.setNotifIntervalMin(min)
                                            SyncScheduler.schedule(app, min.toLong())
                                        }
                                    },
                                )
                            }
                        }
                        if (!canPost) {
                            Text(
                                "Notifications are disabled in the system settings — " +
                                    "enable them for ProjectPulse in Settings → Apps.",
                                style = MaterialTheme.typography.bodySmall,
                                color = LocalPpTokens.current.Error,
                            )
                        }
                        GlassButton(
                            text = "Check now",
                            onClick = {
                                SyncScheduler.runOnce(app)
                                checkedNow = true
                            },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (checkedNow) {
                            Text(
                                "A background check was queued. A notification appears " +
                                    "if there are unread updates.",
                                style = MaterialTheme.typography.bodySmall,
                                color = LocalPpTokens.current.TextSecondary,
                            )
                        }
                    }
                }
            }

            SectionLabel("Theme", modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
            GlassPanel(strong = true) {
                Row(
                    Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    ThemeOption(
                        theme = PpTheme.AURORA,
                        name = "Aurora",
                        description = "Reference theme — blue-dominant navy, emerald accents.",
                        selected = theme == PpTheme.AURORA,
                        onSelect = { prefs.setTheme(it.id) },
                        modifier = Modifier.weight(1f),
                    )
                    ThemeOption(
                        theme = PpTheme.PULSE,
                        name = "Pulse",
                        description = "The original ProjectPulse theme — violet glow.",
                        selected = theme == PpTheme.PULSE,
                        onSelect = { prefs.setTheme(it.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            SectionLabel("About", modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
            GlassPanel(strong = true) {
                Column(
                    Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        "ProjectPulse companion · v${BuildConfig.VERSION_NAME}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = LocalPpTokens.current.Foreground,
                    )
                    Text(
                        "Your updates stay on your server. This app stores the URL, " +
                            "an encrypted password and a local cache of recent updates.",
                        style = MaterialTheme.typography.bodySmall,
                        color = LocalPpTokens.current.TextSecondary,
                    )
                }
            }

            // Footer: app version
            Text(
                "v${BuildConfig.VERSION_NAME}",
                style = MaterialTheme.typography.bodySmall,
                color = LocalPpTokens.current.TextTertiary,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 20.dp),
            )
        }
        }
    }
}

/**
 * Theme picker card: a brand-gradient preview swatch, name and a short
 * description (mirroring the web's theme settings). Selecting a theme is
 * applied immediately — the whole app re-themes live and the choice is
 * persisted to plain prefs.
 */
@Composable
private fun ThemeOption(
    theme: PpTheme,
    name: String,
    description: String,
    selected: Boolean,
    onSelect: (PpTheme) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = if (theme == PpTheme.AURORA) AuroraTokens else PulseTokens
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val borderColor by animateColorAsState(
        targetValue = when {
            selected -> tokens.ChipActiveBorder
            pressed -> Color(0x40FFFFFF)
            else -> Color(0x1FFFFFFF)
        },
        animationSpec = tween(250),
    )
    val scale = remember { Animatable(if (selected) 1f else 0.96f) }
    LaunchedEffect(selected) {
        scale.animateTo(if (selected) 1f else 0.96f, tween(250))
    }
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
            }
            .shadow(
                elevation = if (selected) 12.dp else 0.dp,
                shape = shape,
                ambientColor = tokens.GlowAccent,
                spotColor = tokens.GlowAccent,
            )
            .drawBehind {
                val stroke = 1.dp.toPx()
                drawRoundRect(
                    color = borderColor,
                    topLeft = Offset(stroke / 2f, stroke / 2f),
                    size = Size(size.width - stroke, size.height - stroke),
                    cornerRadius = CornerRadius(12.dp.toPx()),
                    style = Stroke(width = stroke),
                )
            }
            .clip(shape)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = { onSelect(theme) },
            )
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(40.dp)
                .clip(RoundedCornerShape(9.dp))
                .background(brush = tokens.BrandBrush),
        )
        Text(
            name,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else LocalPpTokens.current.GhostText,
        )
        Text(
            description,
            style = MaterialTheme.typography.bodySmall,
            color = LocalPpTokens.current.TextSecondary,
        )
    }
}
