package com.pantera87.projectpulse

import android.app.Application
import com.pantera87.projectpulse.data.PpApi
import com.pantera87.projectpulse.data.ServerPrefs
import com.pantera87.projectpulse.data.SessionCookieJar
import com.pantera87.projectpulse.notif.Notifier
import com.pantera87.projectpulse.notif.SyncScheduler

/**
 * Tiny service locator — the app has a single long-lived server session, so
 * a hand-rolled container keeps MainActivity and the screens dependency-free.
 */
class App : Application() {
    lateinit var prefs: ServerPrefs
        private set
    lateinit var api: PpApi
        private set
    lateinit var cookieJar: SessionCookieJar
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = ServerPrefs(this)
        cookieJar = SessionCookieJar()
        api = PpApi(prefs.url.value, cookieJar)
        Notifier.ensureChannel(this)
        if (prefs.configured.value && prefs.notificationsEnabled.value) {
            SyncScheduler.schedule(this, prefs.notifIntervalMin.value.toLong())
        }
    }

    /** Called from ConnectScreen once a session is established. */
    fun startBackgroundSync() {
        if (prefs.notificationsEnabled.value) {
            SyncScheduler.schedule(this, prefs.notifIntervalMin.value.toLong())
        }
    }

    /** Rebuilds the API client after the server URL changes. */
    fun rebuildApi(url: String) {
        cookieJar.clear()
        api = PpApi(url, cookieJar)
    }

    /**
     * A fresh client bound to the live cookie jar and current URL — used by
     * background workers so they share the in-memory session with the UI.
     */
    fun newApi(): PpApi = PpApi(prefs.url.value, cookieJar)

    companion object {
        lateinit var instance: App
            private set
    }
}
