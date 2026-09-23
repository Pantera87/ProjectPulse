@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.ApiResult
import kotlinx.coroutines.launch

private val PLACEHOLDERS = mapOf(
    "website" to "https://example.com/project",
    "github" to "owner/repo (or https://github.com/owner/repo)",
    "rss" to "https://example.com/feed.xml",
)

private val INTERVALS: List<Pair<Int, String>> = listOf(
    1 to "1h",
    6 to "6h",
    12 to "12h",
    24 to "1d",
    72 to "3d",
    168 to "1w",
)

/**
 * Create a new tracked source (website / GitHub / RSS) straight from the
 * phone — the mobile counterpart of the web add-source forms. POSTs to
 * /api/sources and, on success, jumps to the new source's detail screen.
 */
@Composable
fun AddSourceScreen(onCreated: (Int) -> Unit, onBack: () -> Unit) {
    val app = App.instance
    val scope = rememberCoroutineScope()

    var type by remember { mutableStateOf("website") }
    var url by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var interval by remember { mutableStateOf(6) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun submit() {
        val u = url.trim()
        if (u.isBlank()) {
            error = "Enter a URL or repository"
            return
        }
        busy = true
        error = null
        scope.launch {
            when (val r = app.api.addSource(type, u, name, interval)) {
                is ApiResult.Error -> {
                    if (r.needsAuth) {
                        app.prefs.markConfigured(false)
                        return@launch
                    }
                    error = r.message
                    busy = false
                }
                is ApiResult.Ok -> onCreated(r.value)
            }
        }
    }

    val uiMode = rememberUiMode()

    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Palette.TextSecondary)
                    }
                },
                title = {
                    GradText(
                        "Add source",
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
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(Modifier.fillMaxWidth()) {
                TypeOption(
                    label = "Website",
                    selected = type == "website",
                    onClick = { type = "website" },
                    modifier = Modifier.weight(1f).padding(horizontal = 3.dp),
                )
                TypeOption(
                    label = "GitHub",
                    selected = type == "github",
                    onClick = { type = "github" },
                    modifier = Modifier.weight(1f).padding(horizontal = 3.dp),
                )
                TypeOption(
                    label = "RSS",
                    selected = type == "rss",
                    onClick = { type = "rss" },
                    modifier = Modifier.weight(1f).padding(horizontal = 3.dp),
                )
            }
            GlassTextField(
                value = url,
                onValueChange = { url = it },
                placeholder = PLACEHOLDERS[type],
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (type == "github") KeyboardType.Text else KeyboardType.Uri,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            GlassTextField(
                value = name,
                onValueChange = { name = it },
                placeholder = "Name (optional)",
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            SectionLabel("Check interval")
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
            ) {
                INTERVALS.forEach { (hours, label) ->
                    IntervalOption(
                        label = label,
                        selected = interval == hours,
                        onClick = { interval = hours },
                    )
                }
            }
            if (busy) {
                Box(
                    Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = Palette.BrandViolet)
                }
            } else {
                GlassButton(
                    text = "Add",
                    onClick = { submit() },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            error?.let {
                Text(
                    it,
                    color = Palette.Error,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        }
    }
}

/** Segmented type picker option (Website / GitHub / RSS). */
@Composable
private fun TypeOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) Palette.BrandGradient else SolidColor(Palette.FieldFill))
            .border(
                width = 1.dp,
                color = if (selected) Color.Transparent else Palette.GlassBorder,
                shape = RoundedCornerShape(12.dp),
            )
            .clickable(onClick = onClick)
            .padding(vertical = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = 13.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) Color.White else Palette.TextSecondary,
        )
    }
}

/** Small interval chip (used in the scrollable interval row). */
@Composable
private fun IntervalOption(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .padding(horizontal = 4.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Palette.BrandGradient else SolidColor(Palette.FieldFill))
            .border(
                width = 1.dp,
                color = if (selected) Color.Transparent else Palette.GlassBorder,
                shape = RoundedCornerShape(10.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) Color.White else Palette.TextSecondary,
        )
    }
}
