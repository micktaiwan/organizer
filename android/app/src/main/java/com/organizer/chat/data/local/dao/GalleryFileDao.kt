package com.organizer.chat.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.organizer.chat.data.local.entity.GalleryFileEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface GalleryFileDao {

    @Query("SELECT * FROM gallery_files ORDER BY createdAt DESC")
    fun getAllFilesFlow(): Flow<List<GalleryFileEntity>>

    @Query("SELECT * FROM gallery_files WHERE type = :type ORDER BY createdAt DESC")
    fun getFilesByTypeFlow(type: String): Flow<List<GalleryFileEntity>>

    @Query("SELECT * FROM gallery_files ORDER BY createdAt DESC")
    suspend fun getAllFiles(): List<GalleryFileEntity>

    @Query("SELECT * FROM gallery_files WHERE type = :type ORDER BY createdAt DESC")
    suspend fun getFilesByType(type: String): List<GalleryFileEntity>

    @Query("SELECT * FROM gallery_files WHERE id = :id")
    suspend fun getFileById(id: String): GalleryFileEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(files: List<GalleryFileEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(file: GalleryFileEntity)

    @Query("DELETE FROM gallery_files")
    suspend fun deleteAll()

    @Query("DELETE FROM gallery_files WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("DELETE FROM gallery_files WHERE cachedAt < :timestamp")
    suspend fun deleteOlderThan(timestamp: Long)

    @Query("SELECT MIN(createdAt) FROM gallery_files")
    suspend fun getOldestFileDate(): String?

    @Query("SELECT MAX(createdAt) FROM gallery_files")
    suspend fun getNewestFileDate(): String?

    @Query("SELECT COUNT(*) FROM gallery_files")
    suspend fun getCount(): Int

    @Query("SELECT MAX(cachedAt) FROM gallery_files")
    suspend fun getNewestCacheTime(): Long?
}
