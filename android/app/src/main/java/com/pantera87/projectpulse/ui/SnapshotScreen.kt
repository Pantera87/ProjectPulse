@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import android.content.Intent
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.viewinterop.AndroidView
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult

/**
 * Renders one stored snapshot page in a sandboxed WebView: no JavaScript,
 * no page-initiated file access, no page-initiated navigation. The HTML is
 * injected in-memory with loadDataWithBaseURL (file:// paths into the app's
 * own cache are denied by modern WebView). Server:
 * GET /api/sources/:id/snapshots?version=N.
 */
@Composable
fun SnapshotScreen(
    sourceId: Int,
    version: Int,
    onBack: () -> Unit,
) {
    val app = App.instance
    val context = LocalContext.current
    var html by remember { mutableStateOf<String?>(null) }
    var sourceName by remember { mutableStateOf<String?>(null) }
    var sourceUrl by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loadedHtml by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(sourceId, version) {
        error = null
        when (val r = app.api.snapshotHtml(sourceId, version)) {
            is ApiResult.Ok -> {
                html = r.value
                // The source name/URL only power the title + open-in-browser button.
                val d = app.api.sourceDetail(sourceId)
                if (d is ApiResult.Ok) {
                    sourceName = d.value.source.displayName
                    sourceUrl = d.value.source.url
                }
            }
            is ApiResult.Error -> {
                if (r.needsAuth) {
                    app.prefs.markConfigured(false)
                    return@LaunchedEffect
                }
                error = r.message
            }
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Snapshot v$version" + (sourceName?.let { "  ·  $it" } ?: ""),
                        color = Palette.Foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            "Back",
                            tint = Palette.GhostText,
                        )
                    }
                },
                actions = {
                    sourceUrl?.takeIf { it.isNotBlank() }?.let { url ->
                        IconButton(
                            onClick = {
                                runCatching {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)),
                                    )
                                }
                            },
                        ) { Icon(Icons.Default.OpenInBrowser, "Open source in browser", tint = Palette.GhostText) }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors().copy(
                    containerColor = Color.Transparent,
                ),
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                error != null -> Text(error!!, color = Palette.Error)
                html == null -> CircularProgressIndicator(color = Palette.BrandViolet)
                else -> {
                    val h = html!!
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            WebView(ctx).apply {
                                settings.apply {
                                    javaScriptEnabled = false
                                    allowFileAccess = false
                                    allowContentAccess = false
                                    cacheMode = WebSettings.LOAD_NO_CACHE
                                    builtInZoomControls = true
                                    displayZoomControls = false
                                }
                                // Block every page-initiated navigation (links in
                                // the snapshot); the app loads the file itself.
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(
                                        view: WebView,
                                        request: WebResourceRequest,
                                    ): Boolean = true
                                }
                            }
                        },
                        update = { wv ->
                            if (loadedHtml != h) {
                                // loadDataWithBaseURL has a ~2 MB limit (UTF-16
                                // chars); the source URL as base lets relative
                                // asset URLs resolve to the origin.
                                if (h.length <= 2_000_000) {
                                    wv.loadDataWithBaseURL(
                                        sourceUrl,
                                        h,
                                        "text/html",
                                        "utf-8",
                                        null,
                                    )
                                } else {
                                    // Fall back to the error text — snapshots
                                    // this big are effectively nonexistent.
                                    wv.loadData(
                                        "<html><body><h3>Snapshot too large to display " +
                                            "(${h.length / 1024} KB).</h3></body></html>",
                                        "text/html",
                                        "utf-8",
                                    )
                                }
                                loadedHtml = h
                            }
                        },
                    )
                }
            }
        }
    }
}