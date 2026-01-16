package com.organizer.chat.data.model

data class AskAgentRequest(
    val question: String
)

data class AskAgentResponse(
    val response: String,
    val expression: String = "neutral"
)
