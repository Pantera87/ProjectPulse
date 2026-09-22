@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import kotlinx.coroutines.launch


/**
 * First-run / re-auth screen: server URL + password. Probes
 * GET /api/health (auth-exempt) to learn whether the server gates the
 * API, then POSTs /api/auth when it does.
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

    fun connect() {
        val u = url.trim().trimEnd('/')
        if (u.isEmpty()) { error = "Enter the server URL"; return }
        if (!u.startsWith("http://") && !u.startsWith("https://")) {
            error = "URL must start with http:// or https://"
            return
        }
        busy = true
        error = null
        prefs.saveUrl(u)
        app.rebuildApi(u)
        scope.launch {
            when (val h = app.api.health()) {
                is ApiResult.Error -> {
                    error = h.message
                    busy = false
                    return@launch
                }
                is ApiResult.Ok -> {
                    prefs.serverRequiresAuth(h.value.auth)
                    requiresAuth = h.value.auth
                    if (!h.value.auth) {
                        prefs.savePassword("")
                        prefs.markConfigured(true)
                        app.startBackgroundSync()
                        busy = false
                        onSuccess()
                        return@launch
                    }
                    val pw = password
                    if (pw.isEmpty()) {
                        busy = false
                        error = "This server requires a password"
                        return@launch
                    }
                    when (val l = app.api.login(pw)) {
                        is ApiResult.Error -> { error = l.message; busy = false }
                        is ApiResult.Ok -> {
                            prefs.savePassword(pw)
                            prefs.markConfigured(true)
                            app.startBackgroundSync()
                            busy = false
                            onSuccess()
                        }
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Connect to ProjectPulse") }) },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Server URL") },
                placeholder = { Text("http://192.168.1.100:4701") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth(),
            )
            if (requiresAuth || password.isNotEmpty()) {
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    leadingIcon = { Icon(Icons.Default.Lock, null) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Button(
                onClick = { connect() },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.height(20.dp))
                } else {
                    Text("Connect")
                }
            }
            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Text(
                "The URL and password are stored on this device only. The " +
                    "password is kept in Android's encrypted storage; the " +
                    "session cookie is held in memory and re-created on launch.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

