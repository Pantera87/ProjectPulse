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

/**
 * First-launch / re-authentication screen: server URL + password.
 * Probes GET /api/health (auth-exempt) to learn whether the server is
 * gated, then POST /api/auth when it is.
 */
@Composable
fun ConnectScreen(onSuccess: () -> Unit) {
    val app = App.instance
    val prefs = app.prefs
    val scope = rememberCoroutineScope()

    var url by remember { mutableStateOf(prefs.url.value) }
    var password by remember { mutableStateOf(prefs.password.value) }
    var requiresAuth by remember { mutableStateOf(prefs.authEnabled.value) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val uiMode = rememberUiMode()

    fun connect() {
        val u = url.trim().removeSuffix("/")
        if (u.isBlank()) {
            error = "Enter your server URL"
            return
        }
        busy = true
        error = null
        scope.launch {
            // A new client bound to this URL before probing it.
            app.rebuildApi(u)
            val health = app.api.health()
            if (health is ApiResult.Error) {
                busy = false
                error = health.message
                return@launch
            }
            val h = (health as ApiResult.Ok<Health>).value
            val needsAuth = h.auth
            if (needsAuth) {
                val a = app.api.login(password)
                if (a is ApiResult.Error) {
                    busy = false
                    error = a.message
                    return@launch
                }
            }
            prefs.saveUrl(u)
            prefs.savePassword(password)
            prefs.serverRequiresAuth(needsAuth)
            prefs.markConfigured(true)
            app.startBackgroundSync()
            busy = false
            onSuccess()
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
            GlassTextField(
                value = url,
                onValueChange = { url = it },
                placeholder = "http://192.168.1.100:4701",
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
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