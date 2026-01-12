package com.organizer.chat.util

import com.organizer.chat.data.model.Message
import java.text.SimpleDateFormat
import java.util.*

data class MessageGroupingFlags(
    val isGroupedWithPrevious: Boolean,
    val isLastInGroup: Boolean
)

object MessageGroupingUtils {
    private const val ONE_MINUTE_MS = 60 * 1000L

    /**
     * Calcule les flags de groupement pour un message donné.
     * Utilisé pour afficher les messages consécutifs du même utilisateur
     * en "bulles collées" (sans répéter avatar/nom, timestamp sur le dernier).
     */
    fun getGroupingFlags(messages: List<Message>, index: Int): MessageGroupingFlags {
        val msg = messages[index]
        val prev = messages.getOrNull(index - 1)
        val next = messages.getOrNull(index + 1)

        // System messages jamais groupés
        if (msg.type == "system") {
            return MessageGroupingFlags(
                isGroupedWithPrevious = false,
                isLastInGroup = true
            )
        }

        val msgTime = parseIsoDate(msg.createdAt)
        val prevTime = prev?.let { parseIsoDate(it.createdAt) }
        val nextTime = next?.let { parseIsoDate(it.createdAt) }

        // Vérifie si groupé avec le message précédent
        val isGroupedWithPrevious = prev != null
            && prev.type != "system"
            && prev.senderId.id == msg.senderId.id
            && prevTime != null && msgTime != null
            && (msgTime - prevTime) < ONE_MINUTE_MS

        // Vérifie si dernier du groupe
        val isLastInGroup = next == null
            || next.type == "system"
            || next.senderId.id != msg.senderId.id
            || nextTime == null || msgTime == null
            || (nextTime - msgTime) >= ONE_MINUTE_MS

        return MessageGroupingFlags(isGroupedWithPrevious, isLastInGroup)
    }

    private fun parseIsoDate(isoDate: String): Long? {
        return try {
            // Try with milliseconds first
            val formatWithMs = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            formatWithMs.timeZone = TimeZone.getTimeZone("UTC")
            formatWithMs.parse(isoDate)?.time
        } catch (e: Exception) {
            try {
                // Fallback without milliseconds
                val formatWithoutMs = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault())
                formatWithoutMs.timeZone = TimeZone.getTimeZone("UTC")
                formatWithoutMs.parse(isoDate)?.time
            } catch (e: Exception) {
                null
            }
        }
    }
}
