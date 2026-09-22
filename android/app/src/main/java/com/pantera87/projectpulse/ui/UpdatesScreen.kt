@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Update


private val FILTERS = listOf("all", "critical", "high", "normal", "unreadOnly")

@Composable
fun UpdatesScreen() {
    val app = App.instance
    var updates by remember { mutableStateOf<List<Update>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf("all") }

    LaunchedEffect(filter) {
        loading = true
        error = null
        val r = app.api.updates(
            priority = if (filter == "all" || filter == "unreadOnly") null else filter,
            unreadOnly = filter == "unreadOnly",
        )
        when (r) {
            is ApiResult.Ok -> { updates = r.value.updates; loading = false }
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    app.prefs.markConfigured(false)
                    return@LaunchedEffect
                }
                error = r.message
                loading = false
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Updates") }) },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) {
                FILTERS.forEach { f ->
                    FilterChip(
                        selected = filter == f,
                        onClick = { filter = f },
                        label = { Text(if (f == "unreadOnly") "Unread" else f.replaceFirstChar { it.uppercase() }) },
                    )
                }
            }
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(error!!, color = MaterialTheme.colorScheme.error)
                }
                updates.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No updates", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                else -> LazyColumn(Modifier.fillMaxWidth()) {
                    items(updates, key = { it.id }) { u -> UpdateRow(u) {} }
                }
            }
        }
    }
}
