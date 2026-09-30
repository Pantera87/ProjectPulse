package com.pantera87.projectpulse.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.text.TextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.rememberLottieComposition
import com.pantera87.projectpulse.R
import kotlinx.coroutines.delay

/**
 * First-run splash: the animated app logo (Lottie, `R.raw.splash_logo`) over
 * the aurora backdrop, held for [SPLASH_MS]. Fixed duration, no skip — the
 * intro just plays and [onDone] fires.
 *
 * The asset in `res/raw/splash_logo.json` is a placeholder; drop the final
 * logo animation over the same filename and no code changes are needed.
 */
@Composable
fun SplashScreen(
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val compositionResult = rememberLottieComposition(
        spec = LottieCompositionSpec.RawRes(R.raw.splash_logo),
    )
    val composition = compositionResult.value
    // Wordmark fades in while the logo is settling.
    val wordmarkAlpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(600)
        wordmarkAlpha.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
    }
    LaunchedEffect(Unit) {
        delay(SPLASH_MS)
        onDone()
    }
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (composition != null) {
                LottieAnimation(
                    composition = composition,
                    modifier = Modifier.size(200.dp),
                    iterations = 1, // one-shot: the splash holds its duration
                )
            }
            GradText(
                "ProjectPulse",
                modifier = Modifier
                    .alpha(wordmarkAlpha.value)
                    .padding(top = 12.dp),
                style = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
            )
        }
    }
}

/** Fixed splash hold (no tap-to-skip by design). */
private const val SPLASH_MS: Long = 2000