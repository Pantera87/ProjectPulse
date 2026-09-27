package com.pantera87.projectpulse.engine

import android.util.Base64
import org.ccil.cowan.tagsoup.Parser
import org.w3c.dom.Attr
import org.w3c.dom.Document
import org.w3c.dom.Element
import org.w3c.dom.Node
import org.xml.sax.InputSource
import org.xml.sax.helpers.DefaultHandler
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.zip.Deflater
import java.util.zip.Inflater
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Port of src/lib/text.ts — the on-device text/HTML utilities the checkers
 * share. `parseHtml` / `moveReadmeToTop` parse lenient HTML with the
 * bundled TagSoup SAX parser (Maven artifact; it ships no `SimpleParser`
 * DOM shortcut, so [parseHtmlDoc] builds the org.w3c.dom tree from the SAX
 * events) and serialize it back with a hand-rolled DOM serializer
 * (android.jar ships org.w3c.dom but no DOM Level 3 serializer).
 */

/** Parsed HTML page (same shape as `ParsedPage` in src/lib/text.ts). */
data class ParsedPage(
    val title: String,
    val metaDescription: String?,
    val paragraphs: List<String>,
    val text: String,
)

/** Truncates to `max` characters (port of `truncate`). */
fun truncate(s: String, max: Int): String = if (s.length > max) s.take(max) else s

/** SHA-256 hex digest (port of `hashText`). */
fun hashText(s: String): String {
    val d = MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8))
    return d.joinToString("") { "%02x".format(it) }
}

/** Compresses HTML to a `zlib:` base64 string (port of `compressHtml`). */
fun compressHtml(html: String): String {
    val deflater = Deflater()
    deflater.setInput(html.toByteArray(Charsets.UTF_8))
    deflater.finish()
    val out = ByteArrayOutputStream()
    val buf = ByteArray(4096)
    while (!deflater.finished()) {
        val n = deflater.deflate(buf)
        out.write(buf, 0, n)
    }
    deflater.end()
    return "zlib:" + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

/** Inverse of [compressHtml]; passes through raw HTML (port of `readHtml`). */
fun readHtml(stored: String): String {
    if (stored.startsWith("zlib:")) {
        val raw = Base64.decode(stored.substring(5), Base64.DEFAULT)
        val inflater = Inflater()
        inflater.setInput(raw)
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8192)
        while (!inflater.finished()) {
            val n = inflater.inflate(buf)
            out.write(buf, 0, n)
        }
        inflater.end()
        return out.toString("UTF-8")
    }
    return stored
}

private val SKIP_TAGS = setOf("script", "style", "noscript", "svg", "iframe", "canvas", "template")

/** Depth-first element search (the framework DOM has no querySelector). */
private fun findElement(root: Node, predicate: (Element) -> Boolean): Element? {
    if (root.nodeType == Node.ELEMENT_NODE) {
        val el = root as Element
        if (predicate(el)) return el
    }
    val children = root.childNodes
    for (i in 0 until children.length) {
        val hit = findElement(children.item(i), predicate)
        if (hit != null) return hit
    }
    return null
}

/** All text content of a node (like cheerio's `.text()`), skipping skip-tags. */
private fun elText(el: Node): String {
    val sb = StringBuilder()
    fun visit(n: Node) {
        when (n.nodeType) {
            Node.TEXT_NODE -> sb.append(n.nodeValue ?: "")
            Node.ELEMENT_NODE -> {
                if (n.nodeName.lowercase() in SKIP_TAGS) return
                val children = n.childNodes
                for (i in 0 until children.length) visit(children.item(i))
            }
        }
    }
    visit(el)
    return sb.toString()
}

/**
 * Parses lenient HTML into a W3C DOM [Document]. TagSoup's Maven artifact is
 * SAX-based (no `SimpleParser`), so feed [Parser] an [InputSource] with a
 * small [ContentHandler] that builds the tree. The TagSoup scanner rectifies
 * broken markup (implicit parents, forced end tags), so the event stream is
 * well-formed and start/end pairs always match.
 */
private fun parseHtmlDoc(html: String): Document {
    val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().newDocument()
    val builder = object : DefaultHandler() {
        private val stack = ArrayDeque<Element>()

        override fun startElement(uri: String?, localName: String?, qName: String, attrs: org.xml.sax.Attributes) {
            val el = doc.createElement(localName ?: qName)
            for (i in 0 until attrs.length) {
                try {
                    el.setAttribute(attrs.getQName(i), attrs.getValue(i))
                } catch (e: Exception) {
                    // Keep the element even if the DOM impl rejects a mangled
                    // attribute name.
                }
            }
            (stack.lastOrNull() ?: doc).appendChild(el)
            stack.addLast(el)
        }

        override fun endElement(uri: String?, localName: String?, qName: String) {
            if (stack.isNotEmpty()) stack.removeLast()
        }

        override fun characters(ch: CharArray?, start: Int, length: Int) {
            if (ch == null || length <= 0) return
            (stack.lastOrNull() ?: doc).appendChild(doc.createTextNode(String(ch, start, length)))
        }
    }
    val parser = Parser()
    parser.setContentHandler(builder)
    parser.parse(InputSource(ByteArrayInputStream(html.toByteArray(Charsets.UTF_8))))
    return doc
}

/**
 * Parses HTML into a [ParsedPage] (port of `parseHtml`): strips
 * script/style/noscript/svg/iframe/canvas, keeps the first `<title>`, the
 * first description meta tag, and text from h1/h2/p/li (20-1000 chars each).
 */
fun parseHtml(html: String): ParsedPage {
    return try {
        val doc: Document = parseHtmlDoc(html)
        var title = ""
        var metaDescription: String? = null
        val paragraphs = mutableListOf<String>()

        fun visit(el: Node) {
            if (el.nodeType != Node.ELEMENT_NODE) return
            val tag = el.nodeName.lowercase()
            when (tag) {
                "title" -> if (title.isEmpty()) title = elText(el).trim()
                "meta" -> {
                    if (metaDescription == null) {
                        val e = el as Element
                        val name = e.getAttribute("name")
                        val prop = e.getAttribute("property")
                        val content = e.getAttribute("content")
                        if (name.equals("description", true) || prop.equals("og:description", true)) {
                            if (content.isNotBlank()) metaDescription = content.trim()
                        }
                    }
                }
                "h1", "h2", "p", "li" -> {
                    val t = elText(el).replace(WS_RE, " ").trim()
                    if (t.length in 20..1000) paragraphs.add(t)
                }
            }
            val children = el.childNodes
            for (i in 0 until children.length) {
                val c = children.item(i)
                if (c.nodeType == Node.ELEMENT_NODE && c.nodeName.lowercase() in SKIP_TAGS) continue
                visit(c)
            }
        }
        visit(doc)

        val seen = HashSet<String>()
        val unique = paragraphs.filter { seen.add(it.lowercase()) }
        ParsedPage(title, metaDescription, unique, unique.joinToString("\n"))
    } catch (e: Exception) {
        ParsedPage("", null, emptyList(), "")
    }
}

/**
 * Moves the GitHub readme block (`#readme`, falling back to the first
 * `.markdown-body` article) to the top of the document, wrapped in a
 * `container-xl` div (port of `moveReadmeToTop`). Falls back to the original
 * HTML if parsing or DOM surgery fails.
 */
fun moveReadmeToTop(html: String): String {
    return try {
        val doc: Document = parseHtmlDoc(html)
        val body = findElement(doc) { it.nodeName.lowercase() == "body" } ?: return html
        var block = findElement(body) { it.getAttribute("id").equals("readme", true) }
        if (block == null) {
            block = findElement(body) {
                it.nodeName.lowercase() == "article" && it.getAttribute("class").contains("markdown-body", true)
            }
        }
        if (block == null) return html

        val wrapper = doc.createElement("div")
        wrapper.setAttribute("class", "container-xl")
        block.parentNode?.removeChild(block)
        wrapper.appendChild(block)
        val first = body.firstChild
        if (first != null) body.insertBefore(wrapper, first) else body.appendChild(wrapper)
        domToHtml(doc)
    } catch (e: Exception) {
        html
    }
}

/** Serializes a DOM node tree to HTML (android.jar ships no L3 serializer). */
internal fun domToHtml(node: Node): String {
    return when (node.nodeType) {
        Node.ELEMENT_NODE -> {
            val el = node as Element
            val tag = el.nodeName.lowercase()
            val attrs = el.attributes
            val attrStr = (0 until attrs.length).joinToString(" ") { i ->
                val a = attrs.item(i) as Attr
                " ${a.name}=\"${escapeAttr(a.value)}\""
            }
            if (tag in VOID_TAGS) return "<$tag$attrStr>"
            val inner = StringBuilder()
            val children = node.childNodes
            for (i in 0 until children.length) inner.append(domToHtml(children.item(i)))
            "<$tag$attrStr>$inner</$tag>"
        }
        Node.TEXT_NODE -> escapeText(node.nodeValue ?: "")
        else -> ""
    }
}

private val VOID_TAGS = setOf(
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
)

private fun escapeText(s: String): String =
    s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

private fun escapeAttr(s: String): String =
    s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")

/**
 * Normalizes text before hashing so trivial changes (dates, timestamps, CSRF
 * tokens, whitespace) don't count as content changes (port of `normalizeForHash`).
 */
fun normalizeForHash(text: String): String =
    text.lines()
        .map { it.replace(WS_RE, " ").trim() }
        .filter { it.isNotEmpty() }
        .filter { !DATE_START.containsMatchIn(it) }
        .filter { !TIME_START.containsMatchIn(it) }
        .filter { !TOKEN_RE.containsMatchIn(it) }
        .joinToString("\n")

/** JS-compatible \s (ASCII whitespace + Unicode space separators). */
private val WS_RE = Regex("[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+")
private val DATE_START = Regex("^\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}")
private val TIME_START = Regex("^\\d{1,2}:\\d{2}")
private val TOKEN_RE = Regex("csrf|sessionid|token", RegexOption.IGNORE_CASE)

/**
 * Extracts a goal from a parsed page: meta description (60-1000 chars) first,
 * then the longest paragraph in that range (port of `extractGoalFromPage`).
 */
fun extractGoalFromPage(page: ParsedPage): String {
    val meta = page.metaDescription
    if (meta != null && meta.length in 60..1000) return meta
    val paragraph = page.paragraphs.maxByOrNull { it.length } ?: ""
    if (paragraph.length in 60..1000) return paragraph
    return ""
}

/**
 * Salient bullet lines from release notes — the longest lines (min 30 chars),
 * longest-first, up to `limit` (port of `salientNotesLines`).
 */
fun salientNotesLines(notes: String, limit: Int = 15): String =
    notes.lines()
        .map { it.trim().removePrefix("*").removePrefix("-").trim() }
        .filter { it.length >= 30 }
        .distinct()
        .sortedByDescending { it.length }
        .take(limit)
        .joinToString("\n") { "- $it" }

/**
 * GitHub markdown anchor for a section heading containing the keyword
 * (port of `markdownSectionAnchor`).
 */
fun markdownSectionAnchor(text: String, keyword: String): String? {
    val lower = keyword.lowercase()
    for (line in text.lines()) {
        val m = Regex("^#{1,6}\\s+(.+)$").find(line) ?: continue
        val heading = m.groupValues[1].trim()
        if (heading.lowercase().contains(lower)) {
            return heading
                .lowercase()
                .replace(Regex("[`*_~\\[\\](){}]"), "")
                .replace(Regex("[^\\p{L}\\p{N}\\s-]"), "")
                .replace(Regex("\\s+"), "-")
                .trim('-')
        }
    }
    return null
}

// ---------------------------------------------------------------------------
// Line diffing — a Myers O(ND) implementation (same algorithm as the server's
// `diff` library) plus a js-diff-style `createPatch` unified-diff renderer.
// ---------------------------------------------------------------------------

/** One line of a line-level diff. */
internal enum class DiffOp { KEEP, ADD, DELETE }

internal data class DiffLine(val op: DiffOp, val line: String)

/**
 * Myers O(ND) diff of two line lists (in-place, with a backtracking trace).
 * Falls back to full-replace when the edit budget is too large (> 20k lines)
 * so the worker never hangs on a huge page.
 */
internal fun myersDiff(old: List<String>, new: List<String>): List<DiffLine> {
    // Trim common prefix and suffix.
    var start = 0
    while (start < old.size && start < new.size && old[start] == new[start]) start++
    var end = 0
    while (end < old.size - start && end < new.size - start && old[old.size - 1 - end] == new[new.size - 1 - end]) end++
    val a = old.subList(start, old.size - end)
    val b = new.subList(start, new.size - end)
    val n = a.size + b.size
    if (n == 0) return emptyList()
    if (n > 20000) {
        return a.map { DiffLine(DiffOp.DELETE, it) } + b.map { DiffLine(DiffOp.ADD, it) }
    }

    val max = n
    val v = IntArray(2 * max + 1)
    val trace = ArrayList<IntArray>(n + 1)
    var dFound = -1

    outer@ for (d in 0..n) {
        for (k in d downTo -d step 2) {
            val idx = k + max
            var x = if (k == -d || (k != d && v[idx - 1] < v[idx + 1])) v[idx + 1] else v[idx - 1] + 1
            var y = x - k
            while (x < a.size && y < b.size && a[x] == b[y]) {
                x++; y++
            }
            v[idx] = x
            if (x >= a.size && y >= b.size) {
                dFound = d
                break@outer
            }
        }
        trace.add(v.copyOf())
    }

    val ops = ArrayList<DiffLine>()
    if (dFound >= 0) {
        var x2 = a.size
        var y2 = b.size
        for (dd in dFound downTo 1) {
            val k = x2 - y2
            val prev = trace[dd - 1]
            val kPrev = if (k == -dd || (k != dd && prev[k - 1 + max] < prev[k + 1 + max])) k + 1 else k - 1
            val xPrev = prev[kPrev + max]
            val yPrev = xPrev - kPrev
            if (kPrev == k + 1) {
                ops.add(DiffLine(DiffOp.ADD, b[yPrev])) // down move: inserted from b
            } else {
                ops.add(DiffLine(DiffOp.DELETE, a[xPrev])) // right move: deleted from a
            }
            var xEdit = if (kPrev == k + 1) xPrev else xPrev + 1
            var yEdit = if (kPrev == k + 1) yPrev + 1 else yPrev
            while (xEdit < x2) {
                ops.add(DiffLine(DiffOp.KEEP, a[xEdit]))
                xEdit++; yEdit++
            }
            x2 = xPrev
            y2 = yPrev
        }
        var xEdit = 0
        while (xEdit < x2) {
            ops.add(DiffLine(DiffOp.KEEP, a[xEdit]))
            xEdit++
        }
        ops.reverse()
    }
    val head = (0 until start).map { DiffLine(DiffOp.KEEP, old[it]) }
    val tail = (0 until end).map { DiffLine(DiffOp.KEEP, old[old.size - 1 - it]) }.reversed()
    return head + ops + tail
}

/**
 * Builds a unified-diff patch string (js-diff `createPatch` shape):
 * `Index:` / `---` / `+++` headers, then `@@ -a,b +c,d @@` hunks with
 * `context` unchanged lines on each side.
 */
fun createPatch(name: String, oldText: String, newText: String, oldHeader: String = "before", newHeader: String = "after", context: Int = 3): String {
    val oldLines = oldText.lines()
    val diff = myersDiff(oldLines, newText.lines())

    // oldPosOf[i] = the 0-based old-line index diff entry i sits at (KEEP/DELETE)
    // or after (ADD).
    val oldPosOf = IntArray(diff.size)
    var op = 0
    for (i in diff.indices) {
        oldPosOf[i] = op
        if (diff[i].op != DiffOp.ADD) op++
    }

    // Expand each edit's old position by `context` and merge overlapping runs.
    val hunks = mutableListOf<IntArray>()
    for (i in diff.indices) {
        if (diff[i].op == DiffOp.KEEP) continue
        val s = (oldPosOf[i] - context).coerceIn(0, oldLines.size)
        val e = (oldPosOf[i] + context).coerceIn(0, oldLines.size)
        if (hunks.isNotEmpty() && s <= hunks.last()[1] + 1) {
            if (e > hunks.last()[1]) hunks.last()[1] = e
        } else {
            hunks.add(intArrayOf(s, e))
        }
    }

    val stamp = java.time.Instant.now().toString()
    val sb = StringBuilder()
    sb.append("Index: ").append(name).append('\n')
    sb.append("--- ").append(oldHeader).append('\t').append(stamp).append('\n')
    sb.append("+++ ").append(newHeader).append('\t').append(stamp).append('\n')
    for (h in hunks) {
        val s = h[0]
        val e = h[1]
        var oldBefore = 0
        var newBefore = 0
        for (i in diff.indices) {
            if (oldPosOf[i] in s..e) break
            if (diff[i].op != DiffOp.ADD) oldBefore++
            if (diff[i].op != DiffOp.DELETE) newBefore++
        }
        val hunkLines = mutableListOf<String>()
        var oldCount = 0
        var newCount = 0
        for (i in diff.indices) {
            if (oldPosOf[i] !in s..e) continue
            when (diff[i].op) {
                DiffOp.KEEP -> { hunkLines.add(" " + diff[i].line); oldCount++; newCount++ }
                DiffOp.DELETE -> { hunkLines.add("-" + diff[i].line); oldCount++ }
                DiffOp.ADD -> { hunkLines.add("+" + diff[i].line); newCount++ }
            }
        }
        sb.append("@@ -").append(if (oldCount > 0) oldBefore + 1 else oldBefore).append(',').append(oldCount)
            .append(" +").append(if (newCount > 0) newBefore + 1 else newBefore).append(',').append(newCount).append(" @@\n")
        if (hunkLines.isNotEmpty()) sb.append(hunkLines.joinToString("\n")).append('\n')
    }
    return sb.toString()
}

/** Added lines of a unified patch (the server's `filter(startsWith("+"))` minus `+++` headers). */
fun addedLines(patch: String): List<String> =
    patch.lines().filter { it.startsWith("+") && !it.startsWith("+++") }.map { it.substring(1).trim() }.filter { it.isNotEmpty() }

/** Removed lines of a unified patch (the server's `filter(startsWith("-"))` minus `---` headers). */
fun removedLines(patch: String): List<String> =
    patch.lines().filter { it.startsWith("-") && !it.startsWith("---") }.map { it.substring(1).trim() }.filter { it.isNotEmpty() }
