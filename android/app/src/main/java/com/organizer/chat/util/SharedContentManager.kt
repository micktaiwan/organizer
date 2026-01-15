package com.organizer.chat.util

import android.net.Uri
import com.organizer.chat.data.model.SharedContent

/**
 * Singleton to temporarily store shared content from other apps
 * until it can be picked up by the ChatScreen
 */
object SharedContentManager {
    private var pendingContent: SharedContent? = null
    private var targetRoomId: String? = null

    fun setPendingContent(content: SharedContent, roomId: String) {
        pendingContent = content
        targetRoomId = roomId
    }

    fun getPendingContent(roomId: String): SharedContent? {
        return if (targetRoomId == roomId) {
            val content = pendingContent
            clear()
            content
        } else {
            null
        }
    }

    fun clear() {
        pendingContent = null
        targetRoomId = null
    }
}
