package com.pantera87.projectpulse.data

/**
 * The seam between the UI and the data source. [RemoteBackend] forwards every
 * call to the self-hosted ProjectPulse server ([PpApi]); [LocalBackend] runs
 * the same checkers on-device (Phases 2–3) and serves the same shapes from
 * Room. The screens only see this interface, so switching data modes is a
 * settings toggle, not a code fork.
 *
 * Method-for-method mirror of [PpApi]'s public surface — keep the two in
 * lockstep when an endpoint is added.
 */
interface PpBackend {
    /** Connection test + auth probe. Exempt from the server's auth gate. */
    suspend fun health(): ApiResult<Health>

    /** Authenticate — a no-op on the local backend (no session to start). */
    suspend fun login(password: String): ApiResult<Unit>

    suspend fun dashboard(): ApiResult<Dashboard>

    suspend fun updates(
        priority: String? = null,
        sourceId: Int? = null,
        unreadOnly: Boolean = false,
        window: String? = null,
        limit: Int = 100,
        offset: Int = 0,
    ): ApiResult<UpdatesPage>

    suspend fun sources(type: String? = null): ApiResult<List<Source>>

    /** Create a source; the local backend also fires the first check. */
    suspend fun addSource(
        type: String,
        url: String,
        name: String = "",
        checkIntervalHours: Int = 6,
    ): ApiResult<Int>

    suspend fun markRead(ids: List<Int>, read: Boolean = true): ApiResult<Unit>

    suspend fun deleteUpdate(id: Int): ApiResult<Unit>

    /** Raw HTML of a snapshot version — render in a sandboxed WebView. */
    suspend fun snapshotHtml(sourceId: Int, version: Int): ApiResult<String>

    /** The source row + its snapshot versions. */
    suspend fun sourceDetail(id: Int): ApiResult<SourceDetail>

    /** Run the checker for this source now. */
    suspend fun checkSource(id: Int): ApiResult<CheckResult>

    /** Start a background "check all" run (or report an in-flight one). */
    suspend fun checkAll(): ApiResult<CheckAllStarted>

    /** Live progress of a running check-all. */
    suspend fun checkAllProgress(): ApiResult<CheckAllProgress>

    /** Remove the source and its snapshots. */
    suspend fun deleteSource(id: Int): ApiResult<Unit>

    /** PATCH a source with a partial JSON body. */
    suspend fun patchSource(id: Int, body: String): ApiResult<Unit>

    /** Mark every update for a source as read. */
    suspend fun markAllReadForSource(sourceId: Int): ApiResult<Unit>

    /** Persist the editor's rule list as the source's rules_json. */
    suspend fun saveRules(id: Int, type: String, rules: List<WatchRule>): ApiResult<Unit>

    /** FTS over updates + substring over project fields. */
    suspend fun search(query: String): ApiResult<SearchPage>

    /** The stored project logo (GitHub repo avatar) as PNG, or null. */
    suspend fun logo(sourceId: Int): ByteArray?

    /** Plain GET of an external page's HTML (favicon discovery). Null on failure. */
    suspend fun pageHtml(url: String): String?

    /** Download one favicon file. Null when unreachable/wrong-typed/empty. */
    suspend fun fetchFavicon(url: String): ByteArray?
}
