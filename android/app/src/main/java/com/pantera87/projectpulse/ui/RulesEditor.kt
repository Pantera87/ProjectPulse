package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.data.WatchRule
import kotlinx.serialization.json.Json

private val rulesJsonCfg =
    Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

private fun parseRules(rulesJson: String?): List<WatchRule> {
    val s = rulesJson?.takeIf { it.isNotBlank() } ?: return emptyList()
    return try {
        rulesJsonCfg.decodeFromString<List<WatchRule>>(s)
    } catch (e: Exception) {
        emptyList()
    }
}

/** Web `SOURCE_OPTIONS`: the areas a rule can search, per source type. */
private fun sourceOptions(type: String): List<String> = when (type) {
    "github" -> listOf("releases", "readme", "commits")
    "rss" -> listOf("feed")
    else -> listOf("content")
}

/**
 * Web `addRule`: a fresh include-rule that searches every source area of the
 * type (releases + readme + commits for GitHub, "content" for websites,
 * "feed" for RSS).
 */
private fun newRule(type: String): WatchRule =
    WatchRule(type = "include", sources = sourceOptions(type))

private fun toCsv(list: List<String>): String = list.joinToString(", ")

private fun splitCsv(s: String): List<String> = s.split(',').map { it.trim() }

/**
 * Editor for a source's `rules_json` — a full-screen glass modal mirroring the
 * web rule-editor. The parent persists the result via PATCH.
 */
@Composable
fun RulesEditorDialog(
    type: String,
    initialRulesJson: String?,
    onDismiss: () -> Unit,
    onSave: (List<WatchRule>) -> Unit,
) {
    var rules by remember { mutableStateOf(parseRules(initialRulesJson)) }

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
                    onClick = onDismiss,
                ),
        )
        Column(
            Modifier
                .fillMaxSize()
                .padding(16.dp)
                .glass(strong = true, radius = 20.dp)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Watch rules",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = LocalPpTokens.current.Foreground,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Filled.Close, "Close", tint = LocalPpTokens.current.TextSecondary)
                    }
                }
                Text(
                    buildString {
                        append("Rules flag matching updates. Keywords are searched in the ")
                        append(if (type == "github") "release notes, README and commits" else "fetched content")
                        append(". Exclude rules set the priority of what they match.")
                    },
                    fontSize = 12.sp,
                    color = LocalPpTokens.current.TextSecondary,
                )
                Column(
                    Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (rules.isEmpty()) {
                        Text(
                            "No rules yet. Tap Add rule to create one.",
                            fontSize = 13.sp,
                            color = LocalPpTokens.current.TextTertiary,
                        )
                    }
                    rules.forEachIndexed { i, rule ->
                        RuleRow(
                            type = type,
                            rule = rule,
                            onChange = { updated ->
                                val m = rules.toMutableList()
                                m[i] = updated
                                rules = m
                            },
                            onRemove = {
                                val m = rules.toMutableList()
                                m.removeAt(i)
                                rules = m
                            },
                        )
                    }
                }
                GhostButton(
                    "Add rule",
                    onClick = { rules = rules + newRule(type) },
                    icon = {
                        Icon(
                            Icons.Filled.Add,
                            contentDescription = null,
                            tint = LocalPpTokens.current.GhostText,
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GhostButton(
                        "Cancel",
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    GlassButton(
                        "Save",
                        onClick = {
                            // Web `save()`: drop empty rules and backfill an
                            // empty sources list with every area of the type.
                            val opts = sourceOptions(type)
                            val cleaned = rules
                                .filter { r -> r.keywords.isNotEmpty() || r.labels.isNotEmpty() }
                                .map { r -> if (r.sources.isEmpty()) r.copy(sources = opts) else r }
                            onSave(cleaned)
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
        }
    }
}

@Composable
private fun RuleRow(
    type: String,
    rule: WatchRule,
    onChange: (WatchRule) -> Unit,
    onRemove: () -> Unit,
) {
    val isExclude = rule.type == "exclude"
    GlassCard(radius = 12.dp, modifier = Modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GlassChip(
                    "Include",
                    active = !isExclude,
                    onClick = { onChange(rule.copy(type = "include")) },
                )
                Spacer(Modifier.width(6.dp))
                GlassChip(
                    "Exclude",
                    active = isExclude,
                    onClick = { onChange(rule.copy(type = "exclude")) },
                )
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onRemove) {
                    Icon(Icons.Filled.Close, "Remove rule", tint = LocalPpTokens.current.TextSecondary)
                }
            }
            GlassTextField(
                value = toCsv(rule.keywords),
                onValueChange = { onChange(rule.copy(keywords = splitCsv(it))) },
                placeholder = "Keywords (comma-separated)",
            )
            GlassTextField(
                value = toCsv(rule.labels),
                onValueChange = { onChange(rule.copy(labels = splitCsv(it))) },
                placeholder = "Labels (comma-separated)",
            )
            // Web "Search keywords in:" — the source areas this rule scans.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Search keywords in:",
                    fontSize = 12.sp,
                    color = LocalPpTokens.current.TextSecondary,
                    modifier = Modifier.padding(end = 8.dp),
                )
                sourceOptions(type).forEach { opt ->
                    GlassChip(
                        opt,
                        active = opt in rule.sources,
                        onClick = {
                            onChange(
                                if (opt in rule.sources) {
                                    rule.copy(sources = rule.sources - opt)
                                } else {
                                    rule.copy(sources = rule.sources + opt)
                                }
                            )
                        },
                    )
                    Spacer(Modifier.width(6.dp))
                }
            }
            GlassTextField(
                value = toCsv(rule.negate),
                onValueChange = { onChange(rule.copy(negate = splitCsv(it))) },
                placeholder = "Also match when NOT (negate), optional",
            )
            if (isExclude) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Priority",
                        fontSize = 12.sp,
                        color = LocalPpTokens.current.TextSecondary,
                        modifier = Modifier.padding(end = 8.dp),
                    )
                    GlassChip(
                        "normal",
                        active = (rule.priority ?: "normal") == "normal",
                        onClick = { onChange(rule.copy(priority = "normal")) },
                    )
                    Spacer(Modifier.width(6.dp))
                    GlassChip(
                        "high",
                        active = rule.priority == "high",
                        onClick = { onChange(rule.copy(priority = "high")) },
                    )
                    Spacer(Modifier.width(6.dp))
                    GlassChip(
                        "critical",
                        active = rule.priority == "critical",
                        onClick = { onChange(rule.copy(priority = "critical")) },
                    )
                }
            }
        }
    }
}