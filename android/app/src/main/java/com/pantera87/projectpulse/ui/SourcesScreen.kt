@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.Source
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch


@Composable
fun SourcesScreen(
    refreshPulse: Int = 0,
    onOpenSource: (Int) -> Unit,
    onAdd: () -> Unit,
) {
    val app = App.instance
    var refreshing by remember { mutableStateOf(false) }
    var sources by remember { mutableStateOf<List<Source>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableStateOf(0) }
    var checkingAll by remember { mutableStateOf(false) }
    var checkAllMsg by remember { mutableStateOf<String?>(null) }
    var progressRunning by remember { mutableStateOf(false) }
    var pendingManage by remember { mutableStateOf<Source?>(null) }
    var managing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val uiMode = rememberUiMode()
    // Group sources by `category` into section rows (headers + items); uncategorized last.
    val sectionRows: List<SourceSectionRow> = remember(sources) { buildSections(sources) }

    LaunchedEffect(refreshKey, refreshPulse) {
        loading = true
        error = null
        when (val r = app.api.sources()) {
            is ApiResult.Ok -> { sources = r.value; loading = false; refreshing = false }
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

    fun runCheckAll() {
        if (checkingAll) return
        checkingAll = true
        checkAllMsg = null
        scope.launch {
            when (val r = app.api.checkAll()) {
                is ApiResult.Error -> {
                    checkingAll = false
                    progressRunning = false
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    checkAllMsg = r.message
                }
                is ApiResult.Ok -> {
                    checkingAll = false
                    val n = r.value.count ?: sources.size
                    if (r.value.running == true) {
                        progressRunning = true
                        checkAllMsg = "Checking $n source${if (n == 1) "" else "s"}... (0/$n)"
                    } else {
                        progressRunning = false
                        checkAllMsg = if (r.value.started == false) {
                            "A check is already running"
                        } else {
                            "Checked $n source${if (n == 1) "" else "s"}"
                        }
                    }
                    refreshKey++
                }
            }
        }
    }

    LaunchedEffect(progressRunning) {
        while (progressRunning) {
            delay(1500)
            when (val r = app.api.checkAllProgress()) {
                is ApiResult.Error -> {
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@LaunchedEffect
                    }
                    progressRunning = false
                }
                is ApiResult.Ok -> {
                    val p = r.value
                    if (p.running == true) {
                        checkAllMsg = "Checking sources... ${p.checked}/${p.total}"
                    } else {
                        val base = "Checked ${p.checked} source${if (p.checked == 1) "" else "s"}"
                        checkAllMsg = if (p.failed > 0) "$base (${p.failed} failed)" else base
                        progressRunning = false
                        refreshKey++
                    }
                }
            }
        }
    }

    fun doSetArchive(src: Source, toArchive: Boolean) {
        managing = true
        scope.launch {
            when (
                val r = app.api.patchSource(
                    src.id,
                    """{"watch_enabled":${if (toArchive) 0 else 1}}""",
                )
            ) {
                is ApiResult.Error -> {
                    managing = false
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    pendingManage = null
                    checkAllMsg = r.message
                }
                is ApiResult.Ok -> {
                    managing = false
                    pendingManage = null
                    refreshKey++
                }
            }
        }
    }

    fun doDelete(src: Source) {
        managing = true
        scope.launch {
            when (val r = app.api.deleteSource(src.id)) {
                is ApiResult.Error -> {
                    managing = false
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    pendingManage = null
                    checkAllMsg = r.message
                }
                is ApiResult.Ok -> {
                    managing = false
                    pendingManage = null
                    refreshKey++
                }
            }
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = {
                    GradText(
                        "Sources",
                        style = TextStyle(
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                        ),
                    )
                },
                actions = {
                    IconButton(
                        onClick = { runCheckAll() },
                        enabled = !checkingAll,
                    ) {
                        Icon(
                            Icons.Filled.Refresh,
                            "Check all",
                            tint = if (checkingAll) LocalPpTokens.current.Link else LocalPpTokens.current.TextSecondary,
                        )
                    }
                    IconButton(onClick = onAdd) {
                        Icon(Icons.Filled.Add, "Add source", tint = LocalPpTokens.current.TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
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
            AdaptiveContent(uiMode, maxWidth = 900.dp) {
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(error!!, color = LocalPpTokens.current.Error)
                }
                sources.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No sources yet", color = LocalPpTokens.current.TextTertiary)
                }
                else -> if (uiMode.isTablet) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (checkAllMsg != null) {
                            item(span = { GridItemSpan(2) }) {
                                Text(
                                    checkAllMsg!!,
                                    modifier = Modifier.padding(bottom = 8.dp),
                                    fontSize = 12.sp,
                                    color = LocalPpTokens.current.Link,
                                )
                            }
                        }
                        sectionRows.forEach { row ->
                            item(
                                key = when (row) {
                                    is SourceSectionRow.Header -> "h:${row.label.lowercase()}"
                                    is SourceSectionRow.Item -> "s:${row.source.id}"
                                },
                                span = {
                                    // Section headers span the full width; cards fill a column.
                                    if (row is SourceSectionRow.Header) GridItemSpan(2) else GridItemSpan(1)
                                },
                            ) {
                                when (row) {
                                    is SourceSectionRow.Header -> SectionHeader(row.label)
                                    is SourceSectionRow.Item -> SourceRowCard(
                                        source = row.source,
                                        index = row.index,
                                        onOpen = { onOpenSource(row.source.id) },
                                        onManage = { pendingManage = row.source },
                                    )
                                }
                            }
                        }
                        item(span = { GridItemSpan(2) }) {
                            Box(Modifier.fillMaxWidth().height(16.dp))
                        }
                    }
                } else {
                    LazyColumn(
                        Modifier
                            .fillMaxSize()
                            .padding(12.dp),
                    ) {
                        if (checkAllMsg != null) {
                            item {
                                Text(
                                    checkAllMsg!!,
                                    modifier = Modifier.padding(bottom = 8.dp),
                                    fontSize = 12.sp,
                                    color = LocalPpTokens.current.Link,
                                )
                            }
                        }
                        items(
                            sectionRows,
                            key = { row ->
                                when (row) {
                                    is SourceSectionRow.Header -> "h:${row.label.lowercase()}"
                                    is SourceSectionRow.Item -> "s:${row.source.id}"
                                }
                            },
                        ) { row ->
                            when (row) {
                                is SourceSectionRow.Header -> SectionHeader(row.label)
                                is SourceSectionRow.Item -> SourceRowCard(
                                    source = row.source,
                                    index = row.index,
                                    onOpen = { onOpenSource(row.source.id) },
                                    onManage = { pendingManage = row.source },
                                )
                            }
                        }
                        item {
                            Box(Modifier.fillMaxWidth().height(FLOATING_BAR_BOTTOM_PADDING))
                        }
                    }
                }
            }
            }
        }
        }

    pendingManage?.let { src ->
        // In-layout scrim + glass panel: a Compose Dialog would paint the
        // platform's white dialog window behind the glass.
        Box(Modifier.fillMaxSize()) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0x99020414))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { pendingManage = null },
                    ),
            )
            GlassPanel(
                strong = true,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 24.dp)
                    .then(if (uiMode.isTablet) Modifier.widthIn(max = 480.dp) else Modifier),
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                        Text(
                            "Manage source",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = LocalPpTokens.current.Foreground,
                        )
                        Text(
                            src.displayName,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            fontSize = 13.sp,
                            color = LocalPpTokens.current.TextSecondary,
                        )
                        val archived = src.watch_enabled == 0
                        GhostButton(
                            if (archived) "Unarchive" else "Archive",
                            onClick = { doSetArchive(src, archived) },
                            enabled = !managing,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        GhostButton(
                            "Delete",
                            onClick = { doDelete(src) },
                            enabled = !managing,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        if (managing) {
                            Text(
                                "Working...",
                                fontSize = 12.sp,
                                color = LocalPpTokens.current.TextSecondary,
                            )
                        }
                }
            }
        }
    }
}

/** Label for sources with no `category` tag — always rendered last. */
private const val UNCATEGORIZED = "Uncategorized"

private data class CategoryGroup(
    val label: String,
    val sources: MutableList<Source>,
)

/** One renderable row of the grouped Sources list: a section header or a source card. */
private sealed class SourceSectionRow {
    data class Header(val label: String) : SourceSectionRow()
    data class Item(val source: Source, val index: Int) : SourceSectionRow()
}

/**
 * Groups sources into ordered section rows by their `category` tag (trimmed,
 * case-insensitive). Categories keep their display casing, are sorted
 * alphabetically, and the uncategorized bucket is always placed last.
 */
private fun buildSections(sources: List<Source>): List<SourceSectionRow> {
    val uncategorizedKey = UNCATEGORIZED.lowercase()
    val groups = linkedMapOf<String, CategoryGroup>()
    sources.forEach { s ->
        val raw = s.category?.trim().orEmpty()
        val key = raw.lowercase().ifEmpty { uncategorizedKey }
        val group = groups.getOrPut(key) {
            CategoryGroup(raw.ifEmpty { UNCATEGORIZED }, mutableListOf())
        }
        group.sources.add(s)
    }
    val ordered = groups.values
        .filter { it.label.lowercase() != uncategorizedKey }
        .sortedBy { it.label.lowercase() }
        .toMutableList()
    groups.values.firstOrNull { it.label.lowercase() == uncategorizedKey }?.let { ordered.add(it) }

    val rows = mutableListOf<SourceSectionRow>()
    var index = 0
    ordered.forEach { group ->
        rows.add(SourceSectionRow.Header(group.label))
        group.sources.forEach { s -> rows.add(SourceSectionRow.Item(s, index++)) }
    }
    return rows
}

/** Web `.section-title` styling for a category group header. */
@Composable
private fun SectionHeader(text: String) {
    Text(
        text.uppercase(),
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 1.2.sp,
        color = LocalPpTokens.current.TextSecondary,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp, start = 4.dp),
    )
}

@Composable
private fun SourceRowCard(
    source: Source,
    index: Int,
    onOpen: () -> Unit,
    onManage: () -> Unit,
) {
    val s = source
    GlassCard(
        onClick = onOpen,
        radius = 12.dp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .rise(index),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                SourceLogo(
                    source = s,
                    size = 22.dp,
                    modifier = Modifier.padding(end = 10.dp),
                )
                Text(
                    s.displayName,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.titleSmall,
                    color = LocalPpTokens.current.Foreground,
                    modifier = Modifier.weight(1f).padding(end = 8.dp),
                )
                if (s.unread > 0) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PulseDot(size = 8.dp)
                        Text(
                            "${s.unread} new",
                            fontSize = 12.sp,
                            color = LocalPpTokens.current.Link,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                Icon(
                    Icons.Filled.MoreVert,
                    contentDescription = "Manage source",
                    tint = LocalPpTokens.current.TextTertiary,
                    modifier = Modifier
                        .size(24.dp)
                        .padding(6.dp)
                        .clickable { onManage() },
                )
            }
            Text(
                "${s.type} · ${s.url}",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                fontSize = 12.sp,
                color = LocalPpTokens.current.TextSecondary,
            )
        }
    }
}