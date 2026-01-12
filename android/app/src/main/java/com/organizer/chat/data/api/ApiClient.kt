package com.organizer.chat.data.api

import com.google.gson.GsonBuilder
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.organizer.chat.data.model.Reaction
import com.organizer.chat.util.TokenManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.lang.reflect.Type
import java.util.concurrent.TimeUnit

object ApiClient {

    private const val BASE_URL = "http://51.210.150.25:3001/"

    private var retrofit: Retrofit? = null
    private var apiService: ApiService? = null

    private val reactionDeserializer = object : JsonDeserializer<Reaction> {
        override fun deserialize(
            json: JsonElement,
            typeOfT: Type,
            context: JsonDeserializationContext
        ): Reaction {
            val obj = json.asJsonObject

            // userId peut être une String ou un objet avec _id/id
            val userId = when {
                obj.get("userId").isJsonPrimitive -> obj.get("userId").asString
                obj.get("userId").isJsonObject -> {
                    val userObj = obj.get("userId").asJsonObject
                    userObj.get("_id")?.asString ?: userObj.get("id")?.asString ?: ""
                }
                else -> ""
            }

            return Reaction(
                userId = userId,
                emoji = obj.get("emoji")?.asString ?: "",
                createdAt = obj.get("createdAt")?.asString ?: ""
            )
        }
    }

    fun initialize(tokenManager: TokenManager) {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(tokenManager))
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val gson = GsonBuilder()
            .registerTypeAdapter(Reaction::class.java, reactionDeserializer)
            .serializeNulls()
            .create()

        retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        apiService = retrofit!!.create(ApiService::class.java)
    }

    fun getService(): ApiService {
        return apiService ?: throw IllegalStateException("ApiClient not initialized. Call initialize() first.")
    }

    fun getBaseUrl(): String = BASE_URL
}
