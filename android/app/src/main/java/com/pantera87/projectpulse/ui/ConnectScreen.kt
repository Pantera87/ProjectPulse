@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.R
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Health
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * First-launch / re-authentication screen: server URL + password.
 * Probes GET /api/health (auth-exempt) to learn whether the server is
 * gated, then POST /api/auth when it is.
 *
 * In on-device (local) data mode there is nothing to connect to, so the
 * form is replaced by a local status panel with the database storage size.
 */
@Composable
fun ConnectScreen(onSuccess: () -> Unit) {
    val app = App.instance
    val prefs = app.prefs
    val scope = rememberCoroutineScope()

    val dataMode by prefs.dataMode.collectAsState()
    val isLocal = dataMode == "local"
    var url by remember { mutableStateOf(prefs.url.value) }
    var localUrl by remember { mutableStateOf(prefs.fallbackUrl.value) }
    var password by remember { mutableStateOf(prefs.password.value) }
    var requiresAuth by remember { mutableStateOf(prefs.authEnabled.value) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val uiMode = rememberUiMode()

    // Normalizes a user-entered address: trims it, defaults to http:// when no
    // scheme is present, and returns null when OkHttp can't parse it — a
    // malformed URL would otherwise crash the health/login probe.
    fun normalize(raw: String): String? {
        val t = raw.trim().removeSuffix("/")
        if (t.isBlank()) return null
        val withScheme =
            if (t.startsWith("http://") || t.startsWith("https://")) t else "http://$t"
        return withScheme.toHttpUrlOrNull()?.let { withScheme }
    }

    fun connect() {
        val primary = normalize(url)
        if (url.isNotBlank() && primary == null) {
            error = "That doesn't look like a valid MagicDNS address"
            return
        }
        val fallback = normalize(localUrl)
        if (localUrl.isNotBlank() && fallback == null) {
            error = "That doesn't look like a valid local address"
            return
        }
        // Try the MagicDNS address first, then the local address. Blanks and
        // duplicates collapse into a single candidate.
        val candidates = listOfNotNull(primary, fallback).distinct()
        if (candidates.isEmpty()) {
            error = "Enter your MagicDNS address (and optionally a local address)"
            return
        }
        busy = true
        error = null
        scope.launch {
            // The first address whose /api/health answers (and which logs in,
            // if the server is gated) wins and becomes the active server.
            var lastError = "Cannot reach the server — check the URL and that " +
                "the server is running"
            for (candidate in candidates) {
                app.rebuildApi(candidate)
                val health = app.api.health()
                if (health is ApiResult.Error) {
                    lastError = health.message
                    continue
                }
                val h = (health as ApiResult.Ok<Health>).value
                val needsAuth = h.auth
                if (needsAuth) {
                    val a = app.api.login(password)
                    if (a is ApiResult.Error) {
                        lastError = a.message
                        continue
                    }
                }
                prefs.saveUrl(candidate)
                prefs.saveFallbackUrl(fallback ?: "")
                prefs.savePassword(password)
                prefs.serverRequiresAuth(needsAuth)
                prefs.markConfigured(true)
                app.startBackgroundSync()
                busy = false
                onSuccess()
                return@launch
            }
            busy = false
            error = lastError
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = {
                    GradText(
                        "Connect to ProjectPulse",
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
        AdaptiveContent(uiMode, maxWidth = 480.dp) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(start = 20.dp, top = 8.dp, end = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_1024),
                contentDescription = "ProjectPulse logo",
                modifier = Modifier
                    .size(112.dp)
                    .padding(top = 8.dp),
            )
            if (isLocal) {
                val dbSize = remember { localDbSize(app) }
                GlassPanel {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        SectionLabel("On-device mode")
                        Text(
                            "Data is stored and checked on this device — no " +
                                "server connection is needed.",
                            color = LocalPpTokens.current.TextSecondary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text(
                            "Database storage: ${formatBytes(dbSize)}",
                            color = LocalPpTokens.current.TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                        Text(
                            "Switch the data source in Settings to use the " +
                                "server again.",
                            color = LocalPpTokens.current.TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            } else {
                SectionLabel("Tailscale address (MagicDNS)")
                GlassTextField(
                    value = url,
                    onValueChange = { url = it },
                    placeholder = "http://myhost.tailnet.ts.net",
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                SectionLabel("Local address (fallback)")
                GlassTextField(
                    value = localUrl,
                    onValueChange = { localUrl = it },
                    placeholder = "http://192.168.1.100:4701",
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "The Tailscale address is tried first. If it can't be " +
                        "reached (Tailscale off or MagicDNS unavailable), the " +
                        "local address is used instead. The local address is " +
                        "optional.",
                    color = LocalPpTokens.current.TextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
                if (requiresAuth || password.isNotEmpty()) {
                    GlassTextField(
                        value = password,
                        onValueChange = { password = it },
                        placeholder = "Password",
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        leadingIcon = {
                            Icon(Icons.Default.Lock, null, tint = LocalPpTokens.current.TextSecondary)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (busy) {
                    CircularProgressIndicator(color = LocalPpTokens.current.BrandViolet)
                } else {
                    GlassButton(
                        text = "Connect",
                        onClick = { connect() },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                error?.let {
                    Text(
                        it,
                        color = LocalPpTokens.current.Error,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Text(
                    "The URL and password are stored on this device only. The " +
                        "password is kept in Android's encrypted storage; the " +
                        "session cookie is held in memory and re-created on launch.",
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalPpTokens.current.TextSecondary,
                )
            }
        }
        }
    }
}

/**
 * Total size in bytes of the Room database files (main file + WAL/SHM
 * sidecars) — the on-device storage the local status panel reports.
 */
private fun localDbSize(app: App): Long {
    val base = app.getDatabasePath("projectpulse.db")
    val dir = base.parentFile ?: return 0L
    return dir.listFiles { f -> f.isFile && f.name.startsWith(base.name) }
        ?.sumOf { it.length() } ?: 0L
}

private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024L * 1024 -> String.format("%.1f KB", bytes / 1024.0)
    else -> String.format("%.1f MB", bytes / (1024.0 * 1024))
}