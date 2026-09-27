package com.pantera87.projectpulse.engine

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.StringReader

/**
 * Port of src/lib/feed.ts — RSS 2.0 / Atom feed parsing. Uses Android's
 * XmlPullParser (the same pull parser the server's `rss-parser` walks); the
 * item fields mirror what rss-parser exposes (guid, title, link, isoDate,
 * contentSnippet, content).
 */

/** One feed entry (same fields the checkers use from rss-parser's items). */
data class FeedItem(
    val guid: String,
    val title: String,
    val link: String?,
    val isoDate: String?,
    val contentSnippet: String?,
    val content: String?,
)

/**
 * Fetches and parses a feed URL. Returns the raw XML plus the parsed items
 * (port of `fetchFeed`).
 */
suspend fun fetchFeed(url: String): Pair<String, List<FeedItem>> {
    val xml = fetchText(
        url,
        FetchOpts(
            timeoutMs = 30_000,
            headers = mapOf("accept" to "application/rss+xml, application/atom+xml, application/xml, */*"),
            maxBytes = 2_000_000,
        )
    )
    return xml to parseFeedXml(xml)
}

/** Parses RSS 2.0 `<item>` and Atom `<entry>` elements from a feed document. */
fun parseFeedXml(xml: String): List<FeedItem> {
    val items = mutableListOf<FeedItem>()
    return try {
        val parser = Xml.newPullParser()
        try {
            parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
        } catch (e: Exception) {
            // Some parser implementations don't expose the feature flag; the
            // prefix-stripping in localName() still keeps tag matching correct.
        }
        parser.setInput(StringReader(xml))

        // Item accumulation state.
        var itemOpen = false
        var itemDepth = -1
        var isAtom = false
        var field: String? = null
        var fieldDepth = -1
        var text = StringBuilder()
        val item = mutableMapOf<String, String?>()

        // XmlPullParser only exposes the qualified name (getName()); drop any
        // namespace prefix (dc:creator → creator, atom:id → id).
        fun localName(p: XmlPullParser): String {
            val n = p.name
            val i = n.indexOf(':')
            return if (i >= 0) n.substring(i + 1) else n
        }

        fun finishItem() {
            if (!itemOpen) return
            itemOpen = false
            val title = item["title"]?.trim().orEmpty()
            val link = item["link"]?.trim()?.takeIf { it.isNotEmpty() }
            val guid = (item["guid"] ?: link ?: title)?.takeIf { it.isNotEmpty() }
                ?: "item-${items.size}"
            items.add(
                FeedItem(
                    guid = guid,
                    title = title,
                    link = link,
                    isoDate = item["date"]?.trim()?.takeIf { it.isNotEmpty() },
                    contentSnippet = item["description"]?.trim()?.takeIf { it.isNotEmpty() },
                    content = item["encoded"]?.takeIf { it.isNotBlank() },
                )
            )
            item.clear()
        }

        var depth = 0
        var eventType = parser.eventType
        while (eventType != XmlPullParser.END_DOCUMENT) {
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    val name = localName(parser)
                    if (!itemOpen) {
                        if (name == "item" || name == "entry") {
                            itemOpen = true
                            itemDepth = depth
                            isAtom = name == "entry"
                        }
                    } else if (field == null && depth == itemDepth + 1) {
                        when {
                            name == "guid" || (isAtom && name == "id") -> field = "guid"
                            name == "title" -> field = "title"
                            name == "pubDate" || name == "date" ||
                                (isAtom && (name == "updated" || name == "published")) -> field = "date"
                            name == "description" || (isAtom && name == "summary") -> field = "description"
                            name == "encoded" || (isAtom && name == "content") -> field = "encoded"
                            name == "link" -> {
                                val href = parser.getAttributeValue(null, "href")
                                if (!href.isNullOrBlank() && item["link"].isNullOrEmpty()) {
                                    item["link"] = href.trim()
                                }
                                if (!isAtom) { field = "link"; text = StringBuilder() }
                            }
                        }
                    }
                    if (field != null) {
                        fieldDepth = depth
                        text = StringBuilder()
                    }
                    depth++
                }
                XmlPullParser.TEXT -> {
                    if (field != null && depth == fieldDepth + 1) {
                        text.append(parser.text)
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (field != null && depth == fieldDepth) {
                        val t = text.toString().trim()
                        if (t.isNotEmpty()) item[field!!] = t
                        field = null
                    }
                    if (itemOpen && depth == itemDepth) finishItem()
                    depth--
                }
            }
            eventType = parser.next()
        }
        items
    } catch (e: Exception) {
        items
    }
}
