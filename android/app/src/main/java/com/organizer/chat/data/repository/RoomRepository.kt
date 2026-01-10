package com.organizer.chat.data.repository

import com.organizer.chat.data.api.ApiClient
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
}
