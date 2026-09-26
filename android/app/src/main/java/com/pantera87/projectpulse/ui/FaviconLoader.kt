package com.pantera87.projectpulse.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.RssFeed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URI
import java.util.concurrent.ConcurrentHashMap

/**
 * Project-card logo slot: GitHub repos use the stored logo (api.logo),
 * websites resolve a favicon at runtime (page <link> tag, then
 * /favicon.ico), RSS gets a brand tile. Any failure falls back to the
 * gradient initial tile. Decoded bitmaps are cached per source URL.
 */

private val bitmapCache = ConcurrentHashMap<String, Bitmap?>()

private val LINK_TAG = Regex("""<link\b[^>]*>""", RegexOption.IGNORE_CASE)
private val REL_ATTR = Regex("""rel\s*=\s*["']?([^"'\s>]*)""", RegexOption.IGNORE_CASE)
private val HREF_ATTR = Regex("""href\s*=\s*["']([^"']+)["']""", RegexOption.IGNORE_CASE)

/** First `<link rel="...icon...">` href in the page HTML, or null. */
internal fun iconHref(html: String): String? {
    for (tag in LINK_TAG.findAll(html)) {
        val t = tag.value
        val rel = REL_ATTR.find(t)?.groupValues?.get(1).orEmpty()
        if (!rel.lowercase().contains("icon")) continue
        HREF_ATTR.find(t)?.groupValues?.get(1)
            ?.takeIf { it.isNotBlank() && !it.startsWith("data:") }
            ?.let { return it }
    }
    return null
}

/** Resolve a (possibly relative) icon href against the page URL. */
internal fun resolveIconUrl(base: String, href: String): String? {
    val h = href.trim()
    return when {
        h.startsWith("//") -> "https:$h"
        h.startsWith("http") -> h
        else -> try {
            val u = URI(base).resolve(h)
            if (u.scheme == "http" || u.scheme == "https") u.toString() else null
        } catch (e: Exception) {
            null
        }
    }
}

@Composable
fun SourceLogoBox(source: Source, size: Dp, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    val shape = RoundedCornerShape(size / 4f)
    val cacheKey: String? = when {
        source.type == "github" && !source.logo.isNullOrEmpty() -> "id:${source.id}"
        source.type == "website" && source.url.isNotBlank() -> source.url
        else -> null
    }
    var bmp by remember(source.id) {
        mutableStateOf(cacheKey?.let { bitmapCache[it] })
    }

    LaunchedEffect(source.id, source.url, source.type, source.logo) {
        if (bmp != null || cacheKey == null) return@LaunchedEffect
        val bytes = withContext(Dispatchers.IO) {
            if (source.type == "github") {
                App.instance.api.logo(source.id)
            } else {
                val html = App.instance.api.pageHtml(source.url)
                val candidates = buildList {
                    html?.let { iconHref(it) }
                        ?.let { add(resolveIconUrl(source.url, it)) }
                    try {
                        add(URI(source.url).resolve("/favicon.ico").toString())
                    } catch (e: Exception) {
                        // unreachable base URL; skip the fallback candidate
                    }
                }.filterNotNull()
                candidates.firstNotNullOfOrNull { App.instance.api.fetchFavicon(it) }
            }
        }
        val decoded = if (bytes != null) {
            withContext(Dispatchers.IO) {
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }
        } else null
        if (decoded != null) {
            bitmapCache[cacheKey] = decoded
            bmp = decoded
        }
    }

    Box(modifier = modifier.size(size)) {
        val b = bmp
        when {
            b != null -> Image(
                bitmap = b.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize().clip(shape),
            )

            source.type == "rss" -> Box(
                Modifier
                    .fillMaxSize()
                    .clip(shape)
                    .background(brush = t.BrandBrush),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.RssFeed,
                    null,
                    modifier = Modifier.size(size * 0.55f),
                    tint = Color.White,
                )
            }

            else -> LogoTile(source.displayName, size)
        }
    }
}

/** Brand-gradient initial tile (web `.brand-tile`) — the logo fallback. */
@Composable
fun LogoTile(name: String, size: Dp, modifier: Modifier = Modifier) {
    val t = LocalPpTokens.current
    val letter =
        name.trim().firstOrNull { it.isLetterOrDigit() }?.uppercaseChar() ?: '#'
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(size / 4f))
            .background(brush = t.BrandBrush),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            letter.toString(),
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.45f).sp,
        )
    }
}
