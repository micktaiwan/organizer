package com.organizer.chat.ui.screens.eko

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.AskAgentRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EkoUiState(
    val isLoading: Boolean = false,
    val currentThought: String? = null,
    val currentExpression: String = "neutral",
    val thoughtTrigger: Int = 0,
    val error: String? = null
)

class EkoViewModel : ViewModel() {

    companion object {
        private const val TAG = "EkoViewModel"
    }

    private val _uiState = MutableStateFlow(EkoUiState())
    val uiState: StateFlow<EkoUiState> = _uiState.asStateFlow()

    fun askQuestion(question: String) {
        if (question.isBlank()) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            try {
                Log.d(TAG, "Asking agent: $question")
                val response = ApiClient.getService().askAgent(AskAgentRequest(question))
                Log.d(TAG, "Agent response: ${response.response}")

                Log.d(TAG, "Agent expression: ${response.expression}")
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        currentThought = response.response,
                        currentExpression = response.expression,
                        thoughtTrigger = it.thoughtTrigger + 1
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error asking agent", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Erreur inconnue"
                    )
                }
            }
        }
    }

    fun clearThought() {
        _uiState.update { it.copy(currentThought = null) }
    }

    fun clearExpression() {
        _uiState.update { it.copy(currentExpression = "neutral") }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
