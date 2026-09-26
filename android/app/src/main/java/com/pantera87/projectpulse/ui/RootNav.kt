@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.RssFeed
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.compose.material3.ExperimentalMaterial3Api
import com.pantera87.projectpulse.App

private const val DASHBOARD = "dashboard"
private const val UPDATES = "updates"
private const val SOURCES = "sources"
private const val SETTINGS = "settings"
private const val CONNECT = "connect"
private const val SEARCH = "search"
private const val SOURCE_DETAIL = "source/{sourceId}"
private const val SNAPSHOT = "snapshot/{sourceId}/{version}"
private const val ADD_SOURCE = "addSource"

/** Space the content clears below the floating glass tab bar. */
internal val FLOATING_BAR_BOTTOM_PADDING: Dp = 96.dp

/**
 * Routes between screens. Until the app is "configured" (a server that
 * answered /api/health), every tab renders the connect screen instead.
 *
 * Chrome: the aurora backdrop sits behind the NavHost; each screen paints
 * its own glass top bar. The bottom is a floating glass pill — the active
 * tab gets a brand-gradient chip (web `.tab-active`).
 */
@Composable
fun RootNav() {
    val app = App.instance
    val nav = rememberNavController()
    val configured by app.prefs.configured.collectAsState()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route
    val uiMode = rememberUiMode()
    // Tapping the already-active tab re-fetches the screen's data instead of
    // doing nothing (launchSingleTop keeps the entry, so the screen's load
    // effect would otherwise never re-run).
    var tabPulse by remember { mutableIntStateOf(0) }

    // Local composable so the NavHost can be placed either full-screen
    // (mobile) or beside the navigation rail (tablet) without duplication.
    val navHost: @Composable () -> Unit = {
        NavHost(
            navController = nav,
            startDestination = DASHBOARD,
            // Instant tab switches: the default 700ms crossfade keeps the
            // exiting screen's composition alive (and on top) for the whole
            // transition — an open UpdateDetailSheet scrim would keep
            // intercepting taps, and if the transition is interrupted before
            // it settles that ghost never goes away.
            enterTransition = { EnterTransition.None },
            exitTransition = { ExitTransition.None },
        ) {
            composable(DASHBOARD) {
                if (configured) DashboardScreen(
                    refreshPulse = tabPulse,
                    onOpenUpdates = { nav.navigate(UPDATES) },
                    onOpenSearch = { nav.navigate(SEARCH) },
                    onOpenSource = { id -> nav.navigate("source/$id") },
                )
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(UPDATES) { entry ->
                if (configured) UpdatesScreen(
                    refreshPulse = tabPulse,
                    onOpenSearch = { nav.navigate(SEARCH) },
                    isActive = nav.currentBackStackEntryAsState()?.value == entry,
                )
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(SOURCES) {
                if (configured) SourcesScreen(
                    refreshPulse = tabPulse,
                    onOpenSource = { id -> nav.navigate("source/$id") },
                    onAdd = { nav.navigate(ADD_SOURCE) },
                )
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(SETTINGS) {
                SettingsScreen(onOpenConnect = { nav.navigate(CONNECT) })
            }
            composable(CONNECT) {
                ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(SEARCH) { entry ->
                SearchScreen(
                    onBack = { nav.popBackStack() },
                    isActive = nav.currentBackStackEntryAsState()?.value == entry,
                )
            }
            composable(ADD_SOURCE) {
                if (configured) AddSourceScreen(
                    onCreated = { id ->
                        nav.navigate("source/$id") {
                            popUpTo(ADD_SOURCE) { inclusive = true }
                        }
                    },
                    onBack = { nav.popBackStack() },
                )
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(
                SOURCE_DETAIL,
                arguments = listOf(navArgument("sourceId") { type = NavType.IntType }),
            ) { entry ->
                val id = entry.arguments?.getInt("sourceId") ?: return@composable
                SourceDetailScreen(
                    sourceId = id,
                    onOpenSnapshot = { v -> nav.navigate("snapshot/$id/$v") },
                    onBack = { nav.popBackStack() },
                    isActive = nav.currentBackStackEntryAsState()?.value == entry,
                )
            }
            composable(
                SNAPSHOT,
                arguments = listOf(
                    navArgument("sourceId") { type = NavType.IntType },
                    navArgument("version") { type = NavType.IntType },
                ),
            ) { entry ->
                val id = entry.arguments?.getInt("sourceId") ?: return@composable
                val v = entry.arguments?.getInt("version") ?: return@composable
                SnapshotScreen(sourceId = id, version = v, onBack = { nav.popBackStack() })
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        AuroraBackground()
        if (uiMode.isTablet && configured) {
            // Tablet: glass navigation rail on the left, content beside it.
            Row(Modifier.fillMaxSize()) {
                TabletNavRail(
                    current = currentRoute,
                    onSelect = { route ->
                        if (route == currentRoute) tabPulse++ else navigate(nav, route)
                    },
                )
                Box(Modifier.fillMaxSize()) { navHost() }
            }
        } else {
            navHost()
            if (configured) {
                FloatingTabBar(
                    current = currentRoute,
                    onSelect = { route ->
                        if (route == currentRoute) tabPulse++ else navigate(nav, route)
                    },
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
        }
    }
}

// --------------------------------------------------------------------------
// Floating glass tab bar
// --------------------------------------------------------------------------

private data class TabSpec(
    val route: String,
    val label: String,
    val icon: @Composable (Color) -> Unit,
)

private val TABS: List<TabSpec> = listOf(
    TabSpec(DASHBOARD, "Home") { tint ->
        Icon(Icons.Default.Home, null, modifier = Modifier.size(18.dp), tint = tint)
    },
    TabSpec(UPDATES, "Updates") { tint ->
        Icon(Icons.Default.Notifications, null, modifier = Modifier.size(18.dp), tint = tint)
    },
    TabSpec(SOURCES, "Sources") { tint ->
        Icon(Icons.Outlined.RssFeed, null, modifier = Modifier.size(18.dp), tint = tint)
    },
    TabSpec(SETTINGS, "Settings") { tint ->
        Icon(Icons.Default.Settings, null, modifier = Modifier.size(18.dp), tint = tint)
    },
)

/** The web bottom tab bar as a floating glass pill. */
@Composable
private fun FloatingTabBar(
    current: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .glass(strong = true, radius = 20.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 6.dp),
        ) {
            TABS.forEach { tab ->
                TabItem(
                    label = tab.label,
                    active = current == tab.route,
                    onClick = { onSelect(tab.route) },
                    icon = tab.icon,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Tablet: the same glass pill, vertical — a nav rail beside the content. */
@Composable
private fun TabletNavRail(
    current: String?,
    onSelect: (String) -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxHeight()
            .width(88.dp)
            .glass(strong = true, radius = 20.dp),
    ) {
        // Edge-to-edge: the glass pill runs behind the status bar, but the
        // tabs themselves must start below it — otherwise the top item
        // (Home) sits under the clock in landscape.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            TABS.forEach { tab ->
                TabItem(
                    label = tab.label,
                    active = current == tab.route,
                    onClick = { onSelect(tab.route) },
                    icon = tab.icon,
                )
            }
        }
    }
}

@Composable
private fun TabItem(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
    modifier: Modifier = Modifier,
) {
    val t = LocalPpTokens.current
    Column(
        // Fill the whole weighted slot so the entire pill is tappable — a
        // 64dp hit area left dead zones that swallowed tab taps.
        modifier = modifier
            .padding(vertical = 8.dp)
            .drawBehind {
                if (active) {
                    drawRoundRect(
                        brush = t.BrandBrush,
                        size = Size(52.dp.toPx(), 30.dp.toPx()),
                        topLeft = Offset((size.width - 52.dp.toPx()) / 2f, 0f),
                        cornerRadius = CornerRadius(15.dp.toPx()),
                    )
                }
            }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .width(52.dp)
                .height(30.dp),
            contentAlignment = Alignment.Center,
        ) {
            icon(if (active) Color.White else LocalPpTokens.current.TextTertiary)
        }
        Text(
            label,
            fontSize = 10.sp,
            color = if (active) LocalPpTokens.current.Foreground else LocalPpTokens.current.TextTertiary,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

private fun navigate(
    nav: androidx.navigation.NavHostController,
    route: String,
) {
    if (route == DASHBOARD) {
        // Home is the popUpTo anchor of the tab-switch below. Using the
        // generic popUpTo + saveState + restoreState options for it is a
        // silent no-op: the pop attributes the saved state of the screens
        // above DASHBOARD to DASHBOARD itself, and restoreState then
        // re-pushes exactly that state, cancelling the navigation — the
        // old screen (and any open UpdateDetailSheet) stays on top.
        // Popping back to the start destination always lands on Home.
        if (!nav.popBackStack(DASHBOARD, inclusive = false)) {
            // DASHBOARD not found on the stack (should not happen): fall
            // back to a plain push so Home still works.
            nav.navigate(DASHBOARD)
        }
    } else {
        nav.navigate(route) {
            popUpTo(DASHBOARD) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
}