package com.pantera87.projectpulse.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.data.Source

/**
 * Project grid (web project card): eager rows of [columns] weight-1f cards —
 * logo tile, name, category (and subcategory), unread badge. Sources are few,
 * so no LazyColumn here.
 */
@Composable
fun ProjectGrid(
    sources: List<Source>,
    columns: Int,
    onOpenSource: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        sources.chunked(columns).forEach { row ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                row.forEach { s ->
                    ProjectCard(
                        source = s,
                        onClick = { onOpenSource(s.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(columns - row.size) {
                    Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun ProjectCard(
    source: Source,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    val category = source.category?.takeIf { it.isNotBlank() }
    val subcategory = source.subcategory?.takeIf { it.isNotBlank() }
    GlassCard(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 100.dp),
        radius = 12.dp,
        tile = true,
        onClick = onClick,
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(12.dp)
                .padding(end = if (source.unread > 0) 18.dp else 0.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            SourceLogoBox(
                source = source,
                size = 36.dp,
            )
            Text(
                source.displayName,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = t.Foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
            )
            if (category != null) {
                CategoryBadge(
                    text = category,
                    modifier = Modifier.padding(top = 5.dp),
                )
            }
            if (subcategory != null) {
                Text(
                    subcategory,
                    fontSize = 12.sp,
                    color = t.TextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                )
            }
        }
        if (source.unread > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(horizontal = 10.dp, vertical = 10.dp),
            ) {
                UnreadChip(source.unread)
            }
        }
    }
}

/** Category pill: brand-gradient fill (like the icon tiles), bold white label. */
@Composable
private fun CategoryBadge(text: String, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    Box(
        modifier = modifier
            .background(brush = t.BrandBrush, shape = RoundedCornerShape(20.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Unread badge: brand-pill count, top-right of the card. */
@Composable
fun UnreadChip(count: Int, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    Box(
        modifier = modifier
            .background(brush = t.BrandBrush, shape = CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "$count",
            color = Color.White,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}
