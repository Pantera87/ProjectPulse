@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import com.pantera87.projectpulse.data.SourceDetail
import com.pantera87.projectpulse.data.Update
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch

/**
 * One source's detail page: metadata, its stored snapshots (tap → WebView),
 * and its recent updates (tap → detail sheet). Server: GET /api/sources/:id
 * + GET /api/updates?source_id=N.
 */
@Composable
fun SourceDetailScreen(
    sourceId: Int,
    onOpenSnapshot: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val app = App.instance
    val context = LocalContext.current
    var detail by remember { mutableStateOf<SourceDetail?>(null) }
    var updates by remember { mutableStateOf<List<Update>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<Update?>(null) }
    var checking by remember { mutableStateOf(false) }
    var checkMsg by remember { mutableStateOf<String?>(null) }
    var checkFailed by remember { mutableStateOf(false) }
    var checkCount by remember { mutableStateOf(0) }
    var showRules by remember { mutableStateOf(false) }
    var markingAll by remember { mutableStateOf(false) }
    var markAllMsg by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val uiMode = rememberUiMode()

    LaunchedEffect(sourceId) {
        when (val r = app.api.sourceDetail(sourceId)) {
            is ApiResult.Ok -> {
                detail = r.value
                loading = false
                when (val u = app.api.updates(sourceId = sourceId, limit = 50)) {
                    is ApiResult.Ok -> updates = u.value.updates
                    is ApiResult.Error -> { /* updates are secondary; ignore */ }
                }
            }
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

    fun runCheck() {
        if (checking) return
        checking = true
        checkMsg = null
        scope.launch {
            when (val r = app.api.checkSource(sourceId)) {
                is ApiResult.Error -> {
                    checking = false
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    checkFailed = true
                    checkCount = 0
                    checkMsg = r.message
                }
                is ApiResult.Ok -> {
                    val res = r.value
                    checking = false
                    if (!res.ok) {
                        checkFailed = true
                        checkCount = 0
                        checkMsg = res.error ?: "Check failed"
                    } else {
                        checkFailed = false
                        checkCount = res.updatesCreated
                        checkMsg = if (res.updatesCreated > 0) {
                            "Found ${res.updatesCreated} new update${if (res.updatesCreated == 1) "" else "s"}"
                        } else {
                            "Checked — no new updates"
                        }
                    }
                    // In-place refresh so the unread badge and recent updates
                    // reflect the check without a full-screen spinner.
                    when (val d = app.api.sourceDetail(sourceId)) {
                        is ApiResult.Error -> if (d.needsAuth) app.prefs.markConfigured(false)
                        is ApiResult.Ok -> detail = d.value
                    }
                    when (val u = app.api.updates(sourceId = sourceId, limit = 50)) {
                        is ApiResult.Error -> if (u.needsAuth) app.prefs.markConfigured(false)
                        is ApiResult.Ok -> updates = u.value.updates
                    }
                }
            }
        }
    }

    fun openUrl(u: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(u)))
        }
    }

    fun markAllRead() {
        if (markingAll || updates.isEmpty()) return
        markingAll = true
        markAllMsg = null
        scope.launch {
            when (val r = app.api.markAllReadForSource(sourceId)) {
                is ApiResult.Error -> {
                    markingAll = false
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    markAllMsg = r.message
                }
                is ApiResult.Ok -> {
                    markingAll = false
                    val stamp = java.time.Instant.now().toString()
                    updates = updates.map { if (it.isRead) it else it.copy(read_at = stamp) }
                    when (val d = app.api.sourceDetail(sourceId)) {
                        is ApiResult.Error -> if (d.needsAuth) app.prefs.markConfigured(false)
                        is ApiResult.Ok -> detail = d.value
                    }
                    markAllMsg = "Marked all updates as read"
                }
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
                    Text(
                        detail?.source?.displayName ?: "Source",
                        style = TextStyle(
                            fontSize = 17.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                        color = LocalPpTokens.current.Foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
            )
        },
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = LocalPpTokens.current.BrandViolet)
            }
            error != null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(error!!, color = LocalPpTokens.current.Error)
            }
            else -> {
                val d = detail!!
                AdaptiveContent(uiMode, maxWidth = 720.dp) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState())
                        .padding(start = 12.dp, top = 4.dp, end = 12.dp, bottom = 24.dp),
                ) {
                    GlassPanel(strong = true) {
                        Column(
                            Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                KindBadge(d.source.type)
                                d.source.category?.takeIf { it.isNotBlank() }?.let {
                                    KindBadge(it, modifier = Modifier.padding(start = 6.dp))
                                }
                                d.source.subcategory?.takeIf { it.isNotBlank() }?.let {
                                    KindBadge(it, modifier = Modifier.padding(start = 6.dp))
                                }
                                if (d.source.unread > 0) {
                                    GlassChip(
                                        text = "${d.source.unread} unread",
                                        active = true,
                                        onClick = {},
                                        modifier = Modifier.padding(start = 6.dp),
                                    )
                                }
                            }
                            Text(
                                d.source.url,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.bodySmall,
                                color = LocalPpTokens.current.Link,
                                modifier = Modifier.clickable { openUrl(d.source.url) },
                            )
                            d.source.goal?.takeIf { it.isNotBlank() }?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = LocalPpTokens.current.Foreground,
                                )
                            }
                            d.source.notes?.takeIf { it.isNotBlank() }?.let {
                                Text(
                                    it,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = LocalPpTokens.current.TextSecondary,
                                )
                            }
                        }
                    }
                    GlassButton(
                        text = if (checking) "Checking…" else "Check now",
                        onClick = { runCheck() },
                        enabled = !checking,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp),
                    )
                    GhostButton(
                        "Edit rules",
                        onClick = { showRules = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    )
                    checkMsg?.let { msg ->
                        Text(
                            msg,
                            modifier = Modifier.padding(top = 8.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = when {
                                checkFailed -> LocalPpTokens.current.Error
                                checkCount > 0 -> LocalPpTokens.current.Link
                                else -> LocalPpTokens.current.TextSecondary
                            },
                        )
                    }
                    SectionLabel(
                        "Snapshots (${d.snapshots.size})",
                        modifier = Modifier.padding(top = 20.dp, bottom = 8.dp),
                    )
                    if (d.snapshots.isEmpty()) {
                        Text(
                            "No snapshots stored yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = LocalPpTokens.current.TextSecondary,
                        )
                    }
                    d.snapshots.forEach { snap ->
                        GlassCard(
                            radius = 12.dp,
                            onClick = { onOpenSnapshot(snap.version) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .rise(),
                        ) {
                            Row(
                                Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    "v${snap.version}",
                                    style = MaterialTheme.typography.titleSmall,
                                    color = LocalPpTokens.current.Foreground,
                                    modifier = Modifier.weight(1f),
                                )
                                if (snap.archived == true) {
                                    KindBadge(
                                        "Archived",
                                        modifier = Modifier.padding(end = 8.dp),
                                    )
                                }
                                Text(
                                    listOf(snap.sizeLabel, formatTime(snap.fetched_at))
                                        .filter { it.isNotBlank() }
                                        .joinToString("  ·  "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = LocalPpTokens.current.TextSecondary,
                                )
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 20.dp, bottom = 4.dp),
                    ) {
                        SectionLabel(
                            "Recent updates (${updates.size})",
                            modifier = Modifier.weight(1f),
                        )
                        if (updates.isNotEmpty()) {
                            Text(
                                if (markingAll) "Marking…" else "Mark all read",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (markingAll) LocalPpTokens.current.TextSecondary else LocalPpTokens.current.Link,
                                modifier = Modifier
                                    .clickable(enabled = !markingAll) { markAllRead() }
                                    .padding(vertical = 4.dp, horizontal = 2.dp),
                            )
                        }
                    }
                    markAllMsg?.let { msg ->
                        Text(
                            msg,
                            modifier = Modifier.padding(bottom = 4.dp),
                            fontSize = 12.sp,
                            color = LocalPpTokens.current.Link,
                        )
                    }
                    if (updates.isEmpty()) {
                        Text(
                            "No updates yet",
                            style = MaterialTheme.typography.bodySmall,
                            color = LocalPpTokens.current.TextSecondary,
                        )
                    }
                    updates.forEach { u ->
                        UpdateRow(u, Modifier.padding(vertical = 2.dp)) { selected = u }
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

    detail?.let { d ->
        if (showRules) {
            RulesEditorDialog(
                type = d.source.type,
                initialRulesJson = d.source.rules_json,
                onDismiss = { showRules = false },
                onSave = { rules ->
                    showRules = false
                    scope.launch {
                        when (val r = app.api.saveRules(sourceId, d.source.type, rules)) {
                            is ApiResult.Error -> {
                                if (r.needsAuth) {
                                    app.prefs.markConfigured(false)
                                    return@launch
                                }
                                checkFailed = true
                                checkMsg = r.message
                            }
                            is ApiResult.Ok -> {
                                checkFailed = false
                                checkMsg = "Rules saved"
                            }
                        }
                    }
                },
            )
        }
    }
}
