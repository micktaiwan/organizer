package com.organizer.chat.ui.screens.register

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class RegisterUiState(
    val username: String = "",
    val displayName: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isRegisterSuccess: Boolean = false
)

class RegisterViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun updateUsername(value: String) {
        _uiState.value = _uiState.value.copy(username = value, errorMessage = null)
    }

    fun updateDisplayName(value: String) {
        _uiState.value = _uiState.value.copy(displayName = value, errorMessage = null)
    }

    fun updateEmail(value: String) {
        _uiState.value = _uiState.value.copy(email = value, errorMessage = null)
    }

    fun updatePassword(value: String) {
        _uiState.value = _uiState.value.copy(password = value, errorMessage = null)
    }

    fun updateConfirmPassword(value: String) {
        _uiState.value = _uiState.value.copy(confirmPassword = value, errorMessage = null)
    }

    fun register() {
        val state = _uiState.value

        // Validation
        when {
            state.username.isBlank() -> {
                _uiState.value = state.copy(errorMessage = "Nom d'utilisateur requis")
                return
            }
            state.username.length < 3 -> {
                _uiState.value = state.copy(errorMessage = "Nom d'utilisateur trop court (min 3)")
                return
            }
            !state.username.matches(Regex("^[a-zA-Z0-9_]+$")) -> {
                _uiState.value = state.copy(errorMessage = "Caracteres autorises: lettres, chiffres, _")
                return
            }
            state.displayName.isBlank() -> {
                _uiState.value = state.copy(errorMessage = "Nom d'affichage requis")
                return
            }
            state.email.isBlank() -> {
                _uiState.value = state.copy(errorMessage = "Email requis")
                return
            }
            !android.util.Patterns.EMAIL_ADDRESS.matcher(state.email).matches() -> {
                _uiState.value = state.copy(errorMessage = "Email invalide")
                return
            }
            state.password.length < 6 -> {
                _uiState.value = state.copy(errorMessage = "Mot de passe trop court (min 6)")
                return
            }
            state.password != state.confirmPassword -> {
                _uiState.value = state.copy(errorMessage = "Les mots de passe ne correspondent pas")
                return
            }
        }

        viewModelScope.launch {
            _uiState.value = state.copy(isLoading = true, errorMessage = null)

            val result = authRepository.register(
                username = state.username.trim(),
                displayName = state.displayName.trim(),
                email = state.email.trim(),
                password = state.password
            )

            result.fold(
                onSuccess = {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isRegisterSuccess = true
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Erreur lors de l'inscription"
                    )
                }
            )
        }
    }
}
