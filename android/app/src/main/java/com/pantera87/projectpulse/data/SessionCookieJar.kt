package com.pantera87.projectpulse.data

import java.io.IOException
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * In-memory cookie jar for the `pp_session` cookie. Deliberately NOT
 * persisted to disk: the password is the source of truth and re-login is a
 * single cheap POST on cold start.
 */
class SessionCookieJar : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        cookies.filter { it.matches(url) }

    override fun saveFromResponse(url: HttpUrl, responseCookies: List<Cookie>) {
        // Drop expired cookies, then replace any stored cookie with the same
        // name+domain+path before adding the fresh ones.
        val fresh = responseCookies.filter { it.expiresAt > System.currentTimeMillis() }
        val freshKeys = fresh.map { Triple(it.name, it.domain, it.path) }.toSet()
        cookies.removeAll { Triple(it.name, it.domain, it.path) in freshKeys }
        cookies.addAll(fresh)
    }

    fun clear() = cookies.clear()
}
