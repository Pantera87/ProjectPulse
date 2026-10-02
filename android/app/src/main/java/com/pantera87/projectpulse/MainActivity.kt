package com.pantera87.projectpulse

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.pantera87.projectpulse.ui.AppRoot
import com.pantera87.projectpulse.ui.PpTheme
import com.pantera87.projectpulse.ui.ProjectPulseTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 12+: install the system splash controls (values-v31 theme:
        // branded logo on #04102A). The library holds the branded splash
        // window until the Compose tree first has focus, so the launch is one
        // continuous branded sequence instead of a plain window flash.
        installSplashScreen()
        // Draw edge-to-edge on every API level: the aurora backdrop extends
        // behind the transparent system bars (TopAppBars pad themselves by the
        // status-bar inset; RootNav pads the floating tab bar for the nav bar).
        enableEdgeToEdge()
        setContent {
            val themeId by App.instance.prefs.theme.collectAsState()
            ProjectPulseTheme(theme = PpTheme.fromId(themeId)) {
                // Splash → (onboarding → mode pick) → RootNav; the notification
                // permission prompt lives in AppRoot, deferred past the splash.
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppRoot()
                }
            }
        }
    }
}
