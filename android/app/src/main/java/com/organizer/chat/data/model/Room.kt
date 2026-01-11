package com.organizer.chat.data.model

import com.google.gson.annotations.SerializedName

data class Room(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val name: String,
    val type: String,  // "lobby", "public", "private"
    val members: List<RoomMember> = emptyList(),
    val isLobby: Boolean = false,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val lastMessageAt: String? = null
)

data class RoomMember(
    val userId: UserRef,
    val joinedAt: String? = null,
    val lastReadAt: String? = null
)

data class UserRef(
    @SerializedName("_id", alternate = ["id"])
    val id: String,
    val username: String,
    val displayName: String,
    val isOnline: Boolean = false
)

data class RoomsResponse(
    val rooms: List<Room>
)

data class RoomResponse(
    val room: Room
)

data class CreateRoomRequest(
    val name: String,
    val type: String = "public"
)
