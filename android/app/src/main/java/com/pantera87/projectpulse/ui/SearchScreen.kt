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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
fun SearchScreen(onBack: () -> Unit, isActive: Boolean = true) {
    val app = App.instance
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<SearchPage?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Update?>(null) }
    val uiMode = rememberUiMode()

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
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            "Back",
                            tint = LocalPpTokens.current.GhostText,
                        )
                    }
                },
                title = {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        GlassTextField(
                            value = query,
                            onValueChange = { query = it },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            placeholder = "Search updates and projects…",
                            keyboardOptions = KeyboardOptions(
                                imeAction = ImeAction.Search,
                                keyboardType = KeyboardType.Text,
                            ),
                            leadingIcon = {
                                Icon(Icons.Default.Search, null, tint = LocalPpTokens.current.TextSecondary)
                            },
                            trailingIcon = {
                                if (query.isNotEmpty()) {
                                    IconButton(onClick = { query = "" }) {
                                        Icon(
                                            Icons.Default.Clear,
                                            "Clear",
                                            tint = LocalPpTokens.current.TextSecondary,
                                        )
                                    }
                                }
                            },
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = LocalPpTokens.current.BrandViolet)
                }
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(error!!, color = LocalPpTokens.current.Error)
                }
                results == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        PulseDot()
                        Text(
                            "Type at least 2 characters to search",
                            color = LocalPpTokens.current.TextSecondary,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                }
                else -> {
                    val res = results!!
                    if (res.sources.isEmpty() && res.updates.isEmpty()) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                PulseDot()
                                Text(
                                    "No results for “${query.trim()}”",
                                    color = LocalPpTokens.current.TextSecondary,
                                    modifier = Modifier.padding(top = 12.dp),
                                )
                            }
                        }
                    } else {
                        AdaptiveContent(uiMode, maxWidth = 720.dp) {
                        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                            if (res.sources.isNotEmpty()) {
                                item {
                                    SectionLabel(
                                        "Projects (${res.sources.size})",
                                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                                    )
                                }
                                items(res.sources, key = { "s" + it.id }) { s ->
                                    SourceResultCard(s)
                                }
                            }
                            if (res.updates.isNotEmpty()) {
                                item {
                                    SectionLabel(
                                        "Updates (${res.updates.size})",
                                        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                                    )
                                }
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
        if (isActive) selected?.let { u ->
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
}

/** One project match: a glass card with name, type badge and goal. */
@Composable
private fun SourceResultCard(s: Source) {
    GlassCard(
        radius = 12.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .rise(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    s.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    color = LocalPpTokens.current.Foreground,
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                )
                KindBadge(s.type)
            }
            s.goal?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodySmall,
                    color = LocalPpTokens.current.TextSecondary,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
        }
    }
}