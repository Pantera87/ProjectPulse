@file:OptIn(ExperimentalMaterial3Api::class)

package com.pantera87.projectpulse.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pantera87.projectpulse.App

private const val DASHBOARD = "dashboard"
private const val UPDATES = "updates"
private const val SOURCES = "sources"
private const val CONNECT = "connect"

/**
 * Routes between screens. Until the app is "configured" (a server that
 * answered /api/health), every tab renders the connect screen instead.
 */
@Composable
fun RootNav() {
    val app = App.instance
    val nav = rememberNavController()
    val configured by app.prefs.configured.collectAsState()
    val backStack by nav.currentBackStackEntryAsState()
    val currentRoute = backStack?.destination?.route

    Scaffold(
        bottomBar = {
            if (configured) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == DASHBOARD,
                        onClick = { navigate(nav, DASHBOARD) },
                        icon = { Icon(Icons.Default.Home, "Home") },
                        label = { Text("Home") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == UPDATES,
                        onClick = { navigate(nav, UPDATES) },
                        icon = { Icon(Icons.Default.List, "Updates") },
                        label = { Text("Updates") },
                    )
                    NavigationBarItem(
                        selected = currentRoute == SOURCES,
                        onClick = { navigate(nav, SOURCES) },
                        icon = { Icon(Icons.Default.Settings, "Sources") },
                        label = { Text("Sources") },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = DASHBOARD,
            modifier = Modifier.padding(padding),
        ) {
            composable(DASHBOARD) {
                if (configured) DashboardScreen(onOpenUpdates = { nav.navigate(UPDATES) })
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(UPDATES) {
                if (configured) UpdatesScreen()
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(SOURCES) {
                if (configured) SourcesScreen()
                else ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
            composable(CONNECT) {
                ConnectScreen(onSuccess = { nav.popBackStack(DASHBOARD, inclusive = true) })
            }
        }
    }
}

private fun navigate(
    nav: androidx.navigation.NavHostController,
    route: String,
) {
    nav.navigate(route) {
        popUpTo(DASHBOARD) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}


