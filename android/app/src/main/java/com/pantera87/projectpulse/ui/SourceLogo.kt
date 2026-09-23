package com.pantera87.projectpulse.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.Dp
import com.pantera87.projectpulse.App
import com.pantera87.projectpulse.data.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

/**
 * Decoded repo logos keyed by source id. Held statically so a row that
 * scrolls off the LazyColumn and back doesn't re-download + re-decode.
 */
private val logoCache = ConcurrentHashMap<Int, Bitmap?>()

/**
 * The logo of a source's repository — the GitHub owner avatar the server
 * stores at `GET /api/sources/:id/logo`. Mirrors the web `SourceCard`, which
 * shows it only for `github` sources that have a stored `logo`. Every row
 * reserves the slot (a subtle placeholder otherwise) so the list stays aligned.
 */
@Composable
fun SourceLogo(source: Source, size: Dp, modifier: Modifier = Modifier) {
    val wantLogo = source.type == "github" && !source.logo.isNullOrEmpty()
    var bmp by remember(source.id) {
        mutableStateOf(if (wantLogo) logoCache[source.id] else null)
    }

    LaunchedEffect(source.id, wantLogo) {
        if (!wantLogo || bmp != null) return@LaunchedEffect
        val bytes = App.instance.api.logo(source.id) ?: return@LaunchedEffect
        val decoded = withContext(Dispatchers.IO) {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } ?: return@LaunchedEffect
        logoCache[source.id] = decoded
        bmp = decoded
    }

    val shape = RoundedCornerShape(size / 4)
    Box(modifier = modifier.size(size)) {
        when (val b = bmp) {
            null -> Box(
                Modifier
                    .fillMaxSize()
                    .clip(shape)
                    .background(Color.White.copy(alpha = 0.08f)),
            )
            else -> Image(
                bitmap = b.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .clip(shape),
            )
        }
    }
}