@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Update
import kotlinx.coroutines.launch


private val FILTERS = listOf("all", "critical", "high", "normal", "unreadOnly")

/** /api/updates page size — the list loads more pages as you scroll. */
private const val PAGE_SIZE = 50

@Composable
fun UpdatesScreen(onOpenSearch: () -> Unit) {
    val app = App.instance
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    var updates by remember { mutableStateOf<List<Update>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var hasMore by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var filter by remember { mutableStateOf("all") }
    var refreshKey by remember { mutableStateOf(0) }
    var selected by remember { mutableStateOf<Update?>(null) }

    fun filterArgs(): Pair<String?, Boolean> {
        val p = if (filter == "all" || filter == "unreadOnly") null else filter
        return p to (filter == "unreadOnly")
    }

    LaunchedEffect(filter, refreshKey) {
        loading = true
        error = null
        val (p, uo) = filterArgs()
        val r = app.api.updates(priority = p, unreadOnly = uo, limit = PAGE_SIZE)
        when (r) {
            is ApiResult.Ok -> {
                updates = r.value.updates
                hasMore = r.value.updates.size == PAGE_SIZE
                loading = false
                refreshing = false
            }
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    refreshing = false
                    app.prefs.markConfigured(false)
                    return@LaunchedEffect
                }
                error = r.message
                loading = false
                refreshing = false
            }
        }
    }

    /** Appends the next page once the list is scrolled near the end. */
    fun loadMore() {
        if (loadingMore || !hasMore || updates.isEmpty()) return
        scope.launch {
            loadingMore = true
            val (p, uo) = filterArgs()
            val r = app.api.updates(
                priority = p,
                unreadOnly = uo,
                limit = PAGE_SIZE,
                offset = updates.size,
            )
            when (r) {
                is ApiResult.Ok -> {
                    val new = r.value.updates
                    updates = (updates + new).distinctBy { it.id }
                    hasMore = new.size == PAGE_SIZE
                }
                // Keep the loaded list if it exists; only surface a hard error
                // when there is nothing on screen yet.
                is ApiResult.Error -> if (updates.isEmpty()) error = r.message
            }
            loadingMore = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Updates") },
                actions = {
                    IconButton(onClick = onOpenSearch) {
                        Icon(Icons.Default.Search, "Search")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefresh(
            refreshing = refreshing,
            onRefresh = {
                refreshing = true
                refreshKey++
            },
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            Column(Modifier.fillMaxSize()) {
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
                        itemsIndexed(updates, key = { _, u -> u.id }) { index, u ->
                            UpdateRow(u) { selected = u }
                            if (index >= updates.size - 8 && hasMore && !loadingMore) {
                                loadMore()
                            }
                        }
                        if (loadingMore) {
                            item {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(Modifier.size(24.dp))
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
                updates = updates.map { if (it.id == u.id) it.copy(read_at = stamp) else it }
            },
            onDeleteConfirmed = {
                updates = updates.filter { it.id != u.id }
                selected = null
            },
        )
    }
}
