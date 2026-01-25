package com.organizer.chat.data.repository

import android.content.Context
import android.util.Log
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.local.AppDatabase
import com.organizer.chat.data.local.dao.GalleryFileDao
import com.organizer.chat.data.local.entity.GalleryFileEntity
import com.organizer.chat.data.model.GalleryFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

class GalleryRepository(context: Context) {
    private val api = ApiClient.getService()
    private val dao: GalleryFileDao = AppDatabase.getInstance(context).galleryFileDao()

    companion object {
        private const val TAG = "GalleryRepository"
        private const val CACHE_VALIDITY_MS = 5 * 60 * 1000L // 5 minutes
    }

    /**
     * Get files as a Flow for reactive UI updates
     */
    fun getFilesFlow(type: String? = null): Flow<List<GalleryFile>> {
        return if (type != null) {
            dao.getFilesByTypeFlow(type)
        } else {
            dao.getAllFilesFlow()
        }.map { entities -> entities.map { it.toGalleryFile() } }
    }

    /**
     * Get cached files (offline-first)
     */
    suspend fun getCachedFiles(type: String? = null): List<GalleryFile> {
        return withContext(Dispatchers.IO) {
            val entities = if (type != null) {
                dao.getFilesByType(type)
            } else {
                dao.getAllFiles()
            }
            entities.map { it.toGalleryFile() }
        }
    }

    /**
     * Refresh files from server and update cache.
     * Calls API with the specified type filter and merges into cache (no deleteAll).
     * Purges files older than 30 days from the cache.
     */
    suspend fun refreshFiles(type: String? = null, limit: Int = 100): Result<List<GalleryFile>> {
        return withContext(Dispatchers.IO) {
            try {
                // Fetch files with the specified type filter
                val response = api.getFiles(limit = limit, type = type)
                val files = response.files

                // Merge into cache (INSERT OR REPLACE)
                val entities = files.map { GalleryFileEntity.fromGalleryFile(it) }
                dao.insertAll(entities)

                // Purge old files (> 30 days)
                purgeOldFiles()

                Log.d(TAG, "Refreshed ${files.size} files of type $type from server")
                Result.success(files)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to refresh files", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Purge files older than 30 days from the cache
     */
    private suspend fun purgeOldFiles() {
        val thirtyDaysAgo = System.currentTimeMillis() - 30 * 24 * 60 * 60 * 1000L
        dao.deleteOlderThan(thirtyDaysAgo)
    }

    /**
     * Sync new files only (incremental update)
     * Returns the number of new files added
     * Fetches all types to keep cache complete for tab switching.
     */
    suspend fun syncNewFiles(type: String? = null): Result<Int> {
        return withContext(Dispatchers.IO) {
            try {
                val newestDate = dao.getNewestFileDate()

                if (newestDate == null) {
                    // No files in cache, do full refresh
                    val result = refreshFiles(type = type)
                    return@withContext result.map { it.size }
                }

                // Fetch only files newer than our latest (all types for cache coherence)
                val response = api.getFiles(after = newestDate, type = null)
                val newFiles = response.files

                if (newFiles.isNotEmpty()) {
                    val entities = newFiles.map { GalleryFileEntity.fromGalleryFile(it) }
                    dao.insertAll(entities)
                    Log.d(TAG, "Synced ${newFiles.size} new files")
                } else {
                    Log.d(TAG, "No new files to sync")
                }

                // Return count of files matching the requested type filter
                val matchingCount = if (type != null) {
                    newFiles.count { it.type == type }
                } else {
                    newFiles.size
                }
                Result.success(matchingCount)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to sync new files", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Load more files (pagination)
     */
    suspend fun loadMoreFiles(before: String, type: String? = null, limit: Int = 100): Result<List<GalleryFile>> {
        return withContext(Dispatchers.IO) {
            try {
                val response = api.getFiles(limit = limit, before = before, type = type)
                val files = response.files

                // Add to cache (don't clear existing)
                val entities = files.map { GalleryFileEntity.fromGalleryFile(it) }
                dao.insertAll(entities)

                Log.d(TAG, "Loaded ${files.size} more files")
                Result.success(files)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load more files", e)
                Result.failure(e)
            }
        }
    }

    /**
     * Check if cache is valid
     */
    suspend fun isCacheValid(): Boolean {
        return withContext(Dispatchers.IO) {
            val newestCacheTime = dao.getNewestCacheTime() ?: return@withContext false
            val age = System.currentTimeMillis() - newestCacheTime
            age < CACHE_VALIDITY_MS
        }
    }

    /**
     * Clear cache
     */
    suspend fun clearCache() {
        withContext(Dispatchers.IO) {
            dao.deleteAll()
        }
    }

    /**
     * Delete a file from the server (soft delete)
     * Also removes from local cache
     */
    suspend fun deleteFile(fileId: String): Result<Unit> {
        return withContext(Dispatchers.IO) {
            try {
                api.deleteFile(fileId)
                // Remove from local cache
                dao.deleteById(fileId)
                Log.d(TAG, "Deleted file: $fileId")
                Result.success(Unit)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to delete file", e)
                Result.failure(e)
            }
        }
    }
}
