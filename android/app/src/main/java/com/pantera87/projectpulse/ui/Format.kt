package com.pantera87.projectpulse.ui

/**
 * Display form of a category/subcategory tag: hyphens that separate words
 * become spaces and the first letter of every word is capitalized
 * ("cnc-controller-firmware" -> "Cnc Controller Firmware").
 */
fun String.asCategoryLabel(): String =
    split(Regex("[\\s-]+")).filter { it.isNotBlank() }.joinToString(" ") {
        it.replaceFirstChar { c -> c.uppercase() }
    }