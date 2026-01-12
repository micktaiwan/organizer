package com.organizer.chat.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.organizer.chat.data.local.dao.LocalTrackDao
import com.organizer.chat.data.local.entity.LocalTrackEntity
import com.organizer.chat.data.local.entity.LocalTrackPointEntity

@Database(
    entities = [LocalTrackEntity::class, LocalTrackPointEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun localTrackDao(): LocalTrackDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "organizer_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
