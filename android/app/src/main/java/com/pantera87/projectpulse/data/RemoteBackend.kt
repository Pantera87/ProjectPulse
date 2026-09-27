package com.pantera87.projectpulse.data

/**
 * [PpBackend] backed by the self-hosted server. Pure delegation to [PpApi] —
 * the OkHttp client, the cookie jar and the session logic all live there.
 */
class RemoteBackend(private val api: PpApi) : PpBackend {

    override suspend fun health(): ApiResult<Health> = api.health()
    override suspend fun login(password: String): ApiResult<Unit> = api.login(password)
    override suspend fun dashboard(): ApiResult<Dashboard> = api.dashboard()

    override suspend fun updates(
        priority: String?,
        sourceId: Int?,
        unreadOnly: Boolean,
        window: String?,
        limit: Int,
        offset: Int,
    ): ApiResult<UpdatesPage> = api.updates(priority, sourceId, unreadOnly, window, limit, offset)

    override suspend fun sources(type: String?): ApiResult<List<Source>> = api.sources(type)

    override suspend fun addSource(
        type: String,
        url: String,
        name: String,
        checkIntervalHours: Int,
    ): ApiResult<Int> = api.addSource(type, url, name, checkIntervalHours)

    override suspend fun markRead(ids: List<Int>, read: Boolean): ApiResult<Unit> =
        api.markRead(ids, read)

    override suspend fun deleteUpdate(id: Int): ApiResult<Unit> = api.deleteUpdate(id)

    override suspend fun snapshotHtml(sourceId: Int, version: Int): ApiResult<String> =
        api.snapshotHtml(sourceId, version)

    override suspend fun sourceDetail(id: Int): ApiResult<SourceDetail> = api.sourceDetail(id)
    override suspend fun checkSource(id: Int): ApiResult<CheckResult> = api.checkSource(id)
    override suspend fun checkAll(): ApiResult<CheckAllStarted> = api.checkAll()
    override suspend fun checkAllProgress(): ApiResult<CheckAllProgress> = api.checkAllProgress()
    override suspend fun deleteSource(id: Int): ApiResult<Unit> = api.deleteSource(id)
    override suspend fun patchSource(id: Int, body: String): ApiResult<Unit> =
        api.patchSource(id, body)

    override suspend fun markAllReadForSource(sourceId: Int): ApiResult<Unit> =
        api.markAllReadForSource(sourceId)

    override suspend fun saveRules(id: Int, type: String, rules: List<WatchRule>): ApiResult<Unit> =
        api.saveRules(id, type, rules)

    override suspend fun search(query: String): ApiResult<SearchPage> = api.search(query)
    override suspend fun logo(sourceId: Int): ByteArray? = api.logo(sourceId)
    override suspend fun pageHtml(url: String): String? = api.pageHtml(url)
    override suspend fun fetchFavicon(url: String): ByteArray? = api.fetchFavicon(url)
}
