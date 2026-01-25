package com.organizer.chat.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.organizer.chat.data.local.dao.GalleryFileDao
import com.organizer.chat.data.local.dao.LocalTrackDao
import com.organizer.chat.data.local.entity.GalleryFileEntity
import com.organizer.chat.data.local.entity.LocalTrackEntity
import com.organizer.chat.data.local.entity.LocalTrackPointEntity

@Database(
    entities = [LocalTrackEntity::class, LocalTrackPointEntity::class, GalleryFileEntity::class],
    version = 3,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun localTrackDao(): LocalTrackDao
    abstract fun galleryFileDao(): GalleryFileDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS gallery_files (
                        id TEXT NOT NULL PRIMARY KEY,
                        type TEXT NOT NULL,
                        url TEXT NOT NULL,
                        fileName TEXT,
                        fileSize INTEGER,
                        mimeType TEXT,
                        caption TEXT,
                        roomId TEXT NOT NULL,
                        roomName TEXT NOT NULL,
                        senderId TEXT NOT NULL,
                        senderName TEXT NOT NULL,
                        createdAt TEXT NOT NULL,
                        cachedAt INTEGER NOT NULL
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Add video-specific columns to gallery_files
                db.execSQL("ALTER TABLE gallery_files ADD COLUMN thumbnailUrl TEXT")
                db.execSQL("ALTER TABLE gallery_files ADD COLUMN duration REAL")
                db.execSQL("ALTER TABLE gallery_files ADD COLUMN width INTEGER")
                db.execSQL("ALTER TABLE gallery_files ADD COLUMN height INTEGER")
            }
        }

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "organizer_database"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
