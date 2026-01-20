package com.organizer.chat.webrtc

sealed class CallState {
    object Idle : CallState()

    data class Calling(
        val targetUserId: String,
        val targetUsername: String,
        val withCamera: Boolean
    ) : CallState()

    data class Incoming(
        val fromUserId: String,
        val fromUsername: String,
        val withCamera: Boolean
    ) : CallState()

    data class Connected(
        val remoteUserId: String,
        val remoteUsername: String,
        val withCamera: Boolean
    ) : CallState()
}
