package com.pantera87.projectpulse.data

/**
 * [PpBackend] backed by the on-device engine: the checkers (Phase 2) run in
 * a WorkManager worker, [PpWorker] flips to this backend for reads, and all
 * state lives in Room (Phase 0 wiring).
 *
 * Still a stub — every entry point throws [NotImplementedError] until Phases
 * 2–3 land. The [com.pantera87.projectpulse.data.ServerPrefs.dataMode] pref
 * defaults to "remote", so this class is not instantiated by default.
 */
class LocalBackend : PpBackend {

    private fun todo(): Nothing = throw NotImplementedError(
        "Local engine not implemented yet",
    )

    override suspend fun health(): ApiResult<Health> = todo()
    override suspend fun login(password: String): ApiResult<Unit> = todo()
    override suspend fun dashboard(): ApiResult<Dashboard> = todo()
    override suspend fun updates(
        priority: String?,
        sourceId: Int?,
        unreadOnly: Boolean,
        window: String?,
        limit: Int,
        offset: Int,
    ): ApiResult<UpdatesPage> = todo()
    override suspend fun sources(type: String?): ApiResult<List<Source>> = todo()
    override suspend fun addSource(
        type: String,
        url: String,
        name: String,
        checkIntervalHours: Int,
    ): ApiResult<Int> = todo()
    override suspend fun markRead(ids: List<Int>, read: Boolean): ApiResult<Unit> = todo()
    override suspend fun deleteUpdate(id: Int): ApiResult<Unit> = todo()
    override suspend fun snapshotHtml(sourceId: Int, version: Int): ApiResult<String> = todo()
    override suspend fun sourceDetail(id: Int): ApiResult<SourceDetail> = todo()
    override suspend fun checkSource(id: Int): ApiResult<CheckResult> = todo()
    override suspend fun checkAll(): ApiResult<CheckAllStarted> = todo()
    override suspend fun checkAllProgress(): ApiResult<CheckAllProgress> = todo()
    override suspend fun deleteSource(id: Int): ApiResult<Unit> = todo()
    override suspend fun patchSource(id: Int, body: String): ApiResult<Unit> = todo()
    override suspend fun markAllReadForSource(sourceId: Int): ApiResult<Unit> = todo()
    override suspend fun saveRules(id: Int, type: String, rules: List<WatchRule>): ApiResult<Unit> =
        todo()
    override suspend fun search(query: String): ApiResult<SearchPage> = todo()
    override suspend fun logo(sourceId: Int): ByteArray? = todo()
    override suspend fun pageHtml(url: String): String? = todo()
    override suspend fun fetchFavicon(url: String): ByteArray? = todo()
}
