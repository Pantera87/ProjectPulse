package com.pantera87.projectpulse.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.core.content.ContextCompat
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.pantera87.projectpulse.App

/** Intro phases: splash → (onboarding → mode pick) → main app. */
private enum class Phase { SPLASH, ONBOARDING, MODE, ROOT }

/**
 * Root flow controller. Always plays the animated splash; after it, first-run
 * users get the onboarding tour and the mode pick, everyone else goes straight
 * to [RootNav] (which paints its own aurora backdrop).
 */
@Composable
fun AppRoot() {
    val prefs = App.instance.prefs
    val context = LocalContext.current
    val onboarded by prefs.onboarded.collectAsState()
    var phase by remember { mutableStateOf(Phase.SPLASH) }
    // Notification permission is only asked once the splash has finished
    // (not on top of the Lottie logo).
    var askedNotif by remember { mutableStateOf(false) }
    val notifLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    LaunchedEffect(phase, askedNotif) {
        if (phase != Phase.SPLASH &&
            !askedNotif &&
            Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            askedNotif = true
        }
    }

    Box(Modifier.fillMaxSize()) {
        // The aurora backdrop sits behind the intro screens; RootNav draws
        // its own (opaque) one, so it simply covers this during ROOT.
        AuroraBackground()
        AnimatedContent(
            targetState = phase,
            transitionSpec = {
                fadeIn(tween(350)) togetherWith fadeOut(tween(350))
            },
        ) { p ->
            when (p) {
                Phase.SPLASH -> SplashScreen(
                    onDone = {
                        phase = if (onboarded) Phase.ROOT else Phase.ONBOARDING
                    },
                )
                Phase.ONBOARDING -> OnboardingScreen(
                    onFinish = { phase = Phase.MODE },
                )
                Phase.MODE -> ModeSelectScreen(
                    onContinue = { mode ->
                        prefs.setDataMode(
                            if (mode == AppMode.COMPANION) "remote" else "local",
                        )
                        prefs.markOnboarded()
                        phase = Phase.ROOT
                    },
                )
                Phase.ROOT -> RootNav()
            }
        }
    }
}