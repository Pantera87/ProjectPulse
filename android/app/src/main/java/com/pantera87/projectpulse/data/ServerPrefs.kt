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
    private val _dataMode = MutableStateFlow(plain.getString(KEY_DATA_MODE, "remote") ?: "remote")
    private val _ollamaEnabled = MutableStateFlow(plain.getBoolean(KEY_OLLAMA_ENABLED, false))
    private val _ollamaUrl = MutableStateFlow(plain.getString(KEY_OLLAMA_URL, DEFAULT_OLLAMA_URL) ?: DEFAULT_OLLAMA_URL)
    private val _ollamaModel = MutableStateFlow(plain.getString(KEY_OLLAMA_MODEL, DEFAULT_OLLAMA_MODEL) ?: DEFAULT_OLLAMA_MODEL)

    val url: StateFlow<String> = _url.asStateFlow()
    val password: StateFlow<String> = _password.asStateFlow()
    val authEnabled: StateFlow<Boolean> = _authEnabled.asStateFlow()
    val configured: StateFlow<Boolean> = _configured.asStateFlow()
    val notificationsEnabled: StateFlow<Boolean> = _notifEnabled.asStateFlow()
    val notifIntervalMin: StateFlow<Int> = _notifIntervalMin.asStateFlow()
    val lastSeenUpdateId: StateFlow<Int> = _lastSeenId.asStateFlow()
    val theme: StateFlow<String> = _theme.asStateFlow()
    /** Which data source the app uses: "remote" (server) or "local" (on-device engine). */
    val dataMode: StateFlow<String> = _dataMode.asStateFlow()
    /** LAN Ollama AI (local data mode only): on/off, endpoint, model. */
    val ollamaEnabled: StateFlow<Boolean> = _ollamaEnabled.asStateFlow()
    val ollamaUrl: StateFlow<String> = _ollamaUrl.asStateFlow()
    val ollamaModel: StateFlow<String> = _ollamaModel.asStateFlow()

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

    /** Switch between the remote server and the local on-device engine. */
    fun setDataMode(mode: String) {
        _dataMode.value = mode
        plain.edit().putString(KEY_DATA_MODE, mode).apply()
    }

    fun setOllamaEnabled(value: Boolean) {
        _ollamaEnabled.value = value
        plain.edit().putBoolean(KEY_OLLAMA_ENABLED, value).apply()
    }

    fun setOllamaUrl(value: String) {
        _ollamaUrl.value = value
        plain.edit().putString(KEY_OLLAMA_URL, value).apply()
    }

    fun setOllamaModel(value: String) {
        _ollamaModel.value = value
        plain.edit().putString(KEY_OLLAMA_MODEL, value).apply()
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
        private const val KEY_DATA_MODE = "data_mode"
        private const val KEY_OLLAMA_ENABLED = "ollama_enabled"
        private const val KEY_OLLAMA_URL = "ollama_url"
        private const val KEY_OLLAMA_MODEL = "ollama_model"

        /** Same default model the server uses (DEFAULT_OLLAMA_MODEL). */
        const val DEFAULT_OLLAMA_MODEL = "qwen3.5:4b"
        /** Same LAN default as the server URL pref (the self-host box). */
        const val DEFAULT_OLLAMA_URL = "http://192.168.1.100:11434"
    }
}

