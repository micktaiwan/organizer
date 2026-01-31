package com.organizer.chat.util

import com.organizer.chat.data.model.Message
import java.text.SimpleDateFormat
import java.util.*

data class MessageGroupingFlags(
    val isGroupedWithPrevious: Boolean,
    val isLastInGroup: Boolean
)

data class MessageGroup(
    val messages: List<Message>,
    val senderId: String,
    val senderName: String,
    val isMyMessage: Boolean
)

object MessageGroupingUtils {
    private const val ONE_MINUTE_MS = 60 * 1000L

    /**
     * Calculate grouping flags for a given message.
     * Used to display consecutive messages from the same user
     * as "attached bubbles" (without repeating avatar/name, timestamp on last).
     */
    fun getGroupingFlags(messages: List<Message>, index: Int): MessageGroupingFlags {
        val msg = messages[index]
        val prev = messages.getOrNull(index - 1)
        val next = messages.getOrNull(index + 1)

        // System messages are never grouped
        if (msg.type == "system") {
            return MessageGroupingFlags(
                isGroupedWithPrevious = false,
                isLastInGroup = true
            )
        }

        val msgTime = parseIsoDate(msg.createdAt)
        val prevTime = prev?.let { parseIsoDate(it.createdAt) }
        val nextTime = next?.let { parseIsoDate(it.createdAt) }

        // Check if grouped with previous message
        // A message with reactions CAN group with previous (it just must be the last in group)
        // But we can't group after a message that has reactions (it must stay last)
        val isGroupedWithPrevious = prev != null
            && prev.type != "system"
            && prev.senderId.id == msg.senderId.id
            && prevTime != null && msgTime != null
            && (msgTime - prevTime) < ONE_MINUTE_MS
            && !hasMedia(msg)
            && !hasMedia(prev)
            && !hasReactions(prev)

        // Check if last message in group
        val isLastInGroup = next == null
            || next.type == "system"
            || next.senderId.id != msg.senderId.id
            || nextTime == null || msgTime == null
            || (nextTime - msgTime) >= ONE_MINUTE_MS
            || hasMedia(msg)
            || hasMedia(next)
            || hasReactions(msg)

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

    /**
     * Check if a message contains media (image, audio, file, video).
     * Messages with media break the group.
     */
    private fun hasMedia(msg: Message): Boolean {
        return msg.type == "image" || msg.type == "audio" || msg.type == "file" || msg.type == "video"
    }

    /**
     * Check if a message has emoji reactions.
     * A message with reactions must be the last in its group so reactions stay visible.
     */
    private fun hasReactions(msg: Message): Boolean {
        return msg.reactions.isNotEmpty()
    }

    /**
     * Group consecutive messages from the same sender (< 1 min) into a single bubble.
     * System messages and messages with media break the group.
     */
    fun groupConsecutiveMessages(messages: List<Message>, currentUserId: String?): List<MessageGroup> {
        val groups = mutableListOf<MessageGroup>()
        var currentGroup: MutableList<Message>? = null
        var currentSenderId: String? = null

        for (msg in messages) {
            // System messages are never grouped
            if (msg.type == "system") {
                // Flush current group
                currentGroup?.let { grp ->
                    if (grp.isNotEmpty()) {
                        val first = grp.first()
                        groups.add(MessageGroup(
                            messages = grp.toList(),
                            senderId = first.senderId.id,
                            senderName = first.senderId.displayName,
                            isMyMessage = first.senderId.id == currentUserId
                        ))
                    }
                }
                currentGroup = null
                currentSenderId = null
                // Add system message as its own group
                groups.add(MessageGroup(
                    messages = listOf(msg),
                    senderId = msg.senderId.id,
                    senderName = msg.senderId.displayName,
                    isMyMessage = false
                ))
                continue
            }

            val lastMsgInGroup = currentGroup?.lastOrNull()
            val lastMsgTime = lastMsgInGroup?.let { parseIsoDate(it.createdAt) }
            val msgTime = parseIsoDate(msg.createdAt)

            // Conditions to group:
            // - Same sender
            // - < 1 minute since last message in group
            // - Neither message has media
            // - Last message in group has no reactions (it must stay last to show its reactions)
            // Note: current msg CAN have reactions and still join the group (it becomes the new last)
            val shouldGroup = currentGroup != null &&
                lastMsgInGroup != null &&
                currentSenderId == msg.senderId.id &&
                lastMsgTime != null && msgTime != null &&
                (msgTime - lastMsgTime) < ONE_MINUTE_MS &&
                !hasMedia(msg) &&
                !hasMedia(lastMsgInGroup) &&
                !hasReactions(lastMsgInGroup)

            if (shouldGroup) {
                currentGroup?.add(msg)
            } else {
                // Flush current group
                currentGroup?.let { grp ->
                    if (grp.isNotEmpty()) {
                        val first = grp.first()
                        groups.add(MessageGroup(
                            messages = grp.toList(),
                            senderId = first.senderId.id,
                            senderName = first.senderId.displayName,
                            isMyMessage = first.senderId.id == currentUserId
                        ))
                    }
                }
                // Start new group
                currentGroup = mutableListOf(msg)
                currentSenderId = msg.senderId.id
            }
        }

        // Flush final group
        currentGroup?.let { grp ->
            if (grp.isNotEmpty()) {
                val first = grp.first()
                groups.add(MessageGroup(
                    messages = grp.toList(),
                    senderId = first.senderId.id,
                    senderName = first.senderId.displayName,
                    isMyMessage = first.senderId.id == currentUserId
                ))
            }
        }

        return groups
    }
}
