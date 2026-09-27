package com.pantera87.projectpulse

import android.app.Application
import androidx.room.Room
import com.pantera87.projectpulse.data.LocalBackend
import com.pantera87.projectpulse.data.PpApi
import com.pantera87.projectpulse.data.PpBackend
import com.pantera87.projectpulse.data.RemoteBackend
import com.pantera87.projectpulse.data.ServerPrefs
import com.pantera87.projectpulse.data.SessionCookieJar
import com.pantera87.projectpulse.data.db.AppDatabase
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

    /**
     * The screens' data source. Selected by the `data_mode` pref (default
     * "remote"): [RemoteBackend] wraps the server session, [LocalBackend]
     * will run the on-device engine once Phases 2–3 land.
     */
    lateinit var backend: PpBackend
        private set

    @Volatile
    private var _db: AppDatabase? = null

    /**
     * Room database for the local engine. Created lazily on first access, so
     * remote mode (the default) never touches Room.
     */
    val db: AppDatabase
        get() = _db ?: synchronized(this) {
            _db ?: Room.databaseBuilder(this, AppDatabase::class.java, "projectpulse.db")
                .fallbackToDestructiveMigration()
                .build()
                .also { _db = it }
        }

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = ServerPrefs(this)
        cookieJar = SessionCookieJar()
        api = PpApi(prefs.url.value, cookieJar)
        backend = buildBackend()
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
        backend = buildBackend()
    }

    /**
     * A fresh client bound to the live cookie jar and current URL — used by
     * background workers so they share the in-memory session with the UI.
     */
    fun newApi(): PpApi = PpApi(prefs.url.value, cookieJar)

    private fun buildBackend(): PpBackend = when (prefs.dataMode.value) {
        "local" -> LocalBackend()
        else -> RemoteBackend(api)
    }

    companion object {
        lateinit var instance: App
            private set
    }
}
