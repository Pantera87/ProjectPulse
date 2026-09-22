package com.pantera87.projectpulse

import android.app.Application
import com.pantera87.projectpulse.data.PpApi
import com.pantera87.projectpulse.data.ServerPrefs
import com.pantera87.projectpulse.data.SessionCookieJar

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
    }

    /** Rebuilds the API client after the server URL changes. */
    fun rebuildApi(url: String) {
        cookieJar.clear()
        api = PpApi(url, cookieJar)
    }

    companion object {
        lateinit var instance: App
            private set
    }
}
