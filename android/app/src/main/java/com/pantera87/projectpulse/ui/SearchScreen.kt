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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.SearchPage
import com.pantera87.projectpulse.data.Update
import com.pantera87.projectpulse.data.Source
import kotlinx.coroutines.delay

/** Full-text search over updates + substring match on projects (server: /api/search). */
@Composable
fun SearchScreen(onBack: () -> Unit) {
    val app = App.instance
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<SearchPage?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Update?>(null) }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            results = null
            error = null
            loading = false
            return@LaunchedEffect
        }
        delay(400) // debounce: wait for the user to stop typing
        loading = true
        error = null
        val r = app.api.search(q)
        when (r) {
            is ApiResult.Ok -> {
                results = r.value
                loading = false
            }
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    app.prefs.markConfigured(false)
                    return@LaunchedEffect
                }
                error = r.message
                results = null
                loading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        placeholder = { Text("Search updates and projects…") },
                        keyboardOptions = KeyboardOptions(
                            imeAction = ImeAction.Search,
                            keyboardType = KeyboardType.Text,
                        ),
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(Icons.Default.Clear, "Clear")
                                }
                            }
                        },
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(error!!, color = MaterialTheme.colorScheme.error)
                }
                results == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        "Type at least 2 characters to search",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> {
                    val res = results!!
                    if (res.sources.isEmpty() && res.updates.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                "No results for “${query.trim()}”",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    } else {
                        LazyColumn(Modifier.fillMaxSize()) {
                            if (res.sources.isNotEmpty()) {
                                item { SectionHeader("Projects (${res.sources.size})") }
                                items(res.sources, key = { "s" + it.id }) { s ->
                                    SourceResultCard(s)
                                }
                            }
                            if (res.updates.isNotEmpty()) {
                                item { SectionHeader("Updates (${res.updates.size})") }
                                items(res.updates, key = { "u" + it.id }) { u ->
                                    UpdateRow(u) { selected = u }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    selected?.let { u ->
        UpdateDetailSheet(
            update = u,
            onDismiss = { selected = null },
            onReadStateChanged = { read ->
                val stamp = if (read) java.time.Instant.now().toString() else null
                selected = u.copy(read_at = stamp)
                val cur = results
                if (cur != null) results = cur.copy(updates = cur.updates.map { if (it.id == u.id) it.copy(read_at = stamp) else it })
            },
            onDeleteConfirmed = {
                val cur = results
                if (cur != null) results = cur.copy(updates = cur.updates.filter { it.id != u.id })
                selected = null
            },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp, start = 8.dp, end = 8.dp),
    )
}

@Composable
private fun SourceResultCard(s: Source) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    s.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    s.type,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            s.goal?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
