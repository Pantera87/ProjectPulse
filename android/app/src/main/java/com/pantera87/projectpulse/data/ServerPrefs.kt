package com.pantera87.projectpulse.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Where the app keeps its connection state. The password goes into
 * EncryptedSharedPreferences (Keystore-backed); the URL and server flags are
 * harmless in plain preferences.
 */
class ServerPrefs(context: Context) {

    private val plain: SharedPreferences =
        context.getSharedPreferences("pp_prefs", Context.MODE_PRIVATE)
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val secret: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "pp_secret",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val _url = MutableStateFlow(plain.getString(KEY_URL, "http://192.168.1.100:4701") ?: "")
    private val _password = MutableStateFlow(secret.getString(KEY_PASSWORD, "") ?: "")
    private val _authEnabled = MutableStateFlow(plain.getBoolean(KEY_AUTH, false))
    private val _configured = MutableStateFlow(plain.getBoolean(KEY_CONFIGURED, false))
    private val _notifEnabled = MutableStateFlow(plain.getBoolean(KEY_NOTIF_ENABLED, true))
    private val _notifIntervalMin = MutableStateFlow(plain.getInt(KEY_NOTIF_INTERVAL, 15))
    private val _lastSeenId = MutableStateFlow(plain.getInt(KEY_LAST_SEEN_ID, 0))
    private val _theme = MutableStateFlow(plain.getString(KEY_THEME, "aurora") ?: "aurora")

    val url: StateFlow<String> = _url.asStateFlow()
    val password: StateFlow<String> = _password.asStateFlow()
    val authEnabled: StateFlow<Boolean> = _authEnabled.asStateFlow()
    val configured: StateFlow<Boolean> = _configured.asStateFlow()
    val notificationsEnabled: StateFlow<Boolean> = _notifEnabled.asStateFlow()
    val notifIntervalMin: StateFlow<Int> = _notifIntervalMin.asStateFlow()
    val lastSeenUpdateId: StateFlow<Int> = _lastSeenId.asStateFlow()
    val theme: StateFlow<String> = _theme.asStateFlow()

    fun saveUrl(value: String) {
        _url.value = value
        plain.edit().putString(KEY_URL, value).apply()
    }

    fun savePassword(value: String) {
        _password.value = value
        secret.edit().putString(KEY_PASSWORD, value).apply()
    }

    /** What /api/health told us about the server's auth gate. */
    fun serverRequiresAuth(value: Boolean) {
        _authEnabled.value = value
        plain.edit().putBoolean(KEY_AUTH, value).apply()
    }

    fun markConfigured(value: Boolean) {
        _configured.value = value
        plain.edit().putBoolean(KEY_CONFIGURED, value).apply()
    }

    fun clear() {
        markConfigured(false)
        savePassword("")
    }

    fun setNotificationsEnabled(value: Boolean) {
        _notifEnabled.value = value
        plain.edit().putBoolean(KEY_NOTIF_ENABLED, value).apply()
    }

    fun setNotifIntervalMin(value: Int) {
        _notifIntervalMin.value = value
        plain.edit().putInt(KEY_NOTIF_INTERVAL, value).apply()
    }

    /** The app's visual theme id ("aurora" / "pulse"), matching the web's `pp-theme`. */
    fun setTheme(id: String) {
        _theme.value = id
        plain.edit().putString(KEY_THEME, id).apply()
    }

    /** Highest update id this device has notified about; 0 = first run. */
    fun setLastSeenUpdateId(value: Int) {
        _lastSeenId.value = value
        plain.edit().putInt(KEY_LAST_SEEN_ID, value).apply()
    }

    companion object {
        private const val KEY_URL = "server_url"
        private const val KEY_PASSWORD = "server_password"
        private const val KEY_AUTH = "server_auth_enabled"
        private const val KEY_CONFIGURED = "configured"
        private const val KEY_NOTIF_ENABLED = "notif_enabled"
        private const val KEY_NOTIF_INTERVAL = "notif_interval_min"
        private const val KEY_LAST_SEEN_ID = "last_seen_update_id"
        private const val KEY_THEME = "pp_theme"
    }
}

