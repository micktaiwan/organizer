package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.CreateRoomRequest
import com.organizer.chat.data.model.Room

class RoomRepository {
    private val api = ApiClient.getService()

    suspend fun getRooms(): Result<List<Room>> {
        return try {
            val response = api.getRooms()
            Result.success(response.rooms)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getRoom(roomId: String): Result<Room> {
        return try {
            val response = api.getRoom(roomId)
            Result.success(response.room)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun joinRoom(roomId: String): Result<Room> {
        return try {
            val response = api.joinRoom(roomId)
            Result.success(response.room)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createRoom(name: String): Result<Room> {
        return try {
            val response = api.createRoom(CreateRoomRequest(name, "public"))
            Result.success(response.room)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun leaveRoom(roomId: String): Result<Boolean> {
        return try {
            val response = api.leaveRoom(roomId)
            Result.success(response.success)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun markRoomAsRead(roomId: String): Result<Boolean> {
        return try {
            val response = api.markRoomAsRead(roomId)
            Result.success(response.success)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
