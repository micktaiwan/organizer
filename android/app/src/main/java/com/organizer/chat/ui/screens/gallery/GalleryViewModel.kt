package com.organizer.chat.ui.screens.gallery

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.organizer.chat.data.model.GalleryFile
import com.organizer.chat.data.repository.GalleryRepository
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class GalleryFilter {
    ALL, IMAGES, VIDEOS, FILES
}

data class GalleryUiState(
    val files: List<GalleryFile> = emptyList(),
    val filter: GalleryFilter = GalleryFilter.ALL,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val hasMorePages: Boolean = true,
    val isDeleting: Boolean = false,
    val deleteError: String? = null
)

class GalleryViewModel(context: Context) : ViewModel() {
    private val repository = GalleryRepository(context)
    private val tokenManager = TokenManager(context)

    private val _uiState = MutableStateFlow(GalleryUiState())
    val uiState: StateFlow<GalleryUiState> = _uiState.asStateFlow()

    // Session state for delete confirmation dialog (not persisted)
    var hasSeenDeleteWarning = false
        private set

    init {
        loadFiles()
    }

    fun loadFiles() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            // Try cache first
            val typeFilter = getTypeFilter()
            val cachedFiles = repository.getCachedFiles(typeFilter)

            if (cachedFiles.isNotEmpty() && repository.isCacheValid()) {
                _uiState.value = _uiState.value.copy(
                    files = cachedFiles,
                    isLoading = false
                )
            } else {
                // Fetch from server
                refreshFromServer()
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            refreshFromServer()
            _uiState.value = _uiState.value.copy(isRefreshing = false)
        }
    }

    private suspend fun refreshFromServer() {
        val typeFilter = getTypeFilter()
        val result = repository.refreshFiles(type = typeFilter)

        result.fold(
            onSuccess = { files ->
                _uiState.value = _uiState.value.copy(
                    files = files,
                    isLoading = false,
                    errorMessage = null,
                    hasMorePages = files.size >= 100
                )
            },
            onFailure = { error ->
                // If we have cached data, show it with a warning
                val cachedFiles = repository.getCachedFiles(typeFilter)
                if (cachedFiles.isNotEmpty()) {
                    _uiState.value = _uiState.value.copy(
                        files = cachedFiles,
                        isLoading = false,
                        errorMessage = null  // Don't show error if we have cache
                    )
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "Erreur de chargement"
                    )
                }
            }
        )
    }

    fun loadMore() {
        if (!_uiState.value.hasMorePages || _uiState.value.isLoading) return

        val oldestFile = _uiState.value.files.lastOrNull() ?: return

        viewModelScope.launch {
            val typeFilter = getTypeFilter()
            val result = repository.loadMoreFiles(before = oldestFile.createdAt, type = typeFilter)

            result.fold(
                onSuccess = { newFiles ->
                    _uiState.value = _uiState.value.copy(
                        files = _uiState.value.files + newFiles,
                        hasMorePages = newFiles.size >= 100
                    )
                },
                onFailure = { /* Silently fail on load more */ }
            )
        }
    }

    fun setFilter(filter: GalleryFilter) {
        if (_uiState.value.filter == filter) return

        _uiState.value = _uiState.value.copy(filter = filter)
        loadFiles()
    }

    /**
     * Incremental sync when screen becomes visible (only fetch new files)
     */
    fun refreshIfNeeded() {
        viewModelScope.launch {
            val typeFilter = getTypeFilter()
            val result = repository.syncNewFiles(type = typeFilter)
            result.onSuccess { newCount ->
                if (newCount > 0) {
                    // Reload from cache to get updated list
                    val files = repository.getCachedFiles(typeFilter)
                    _uiState.value = _uiState.value.copy(files = files)
                }
            }
            // Don't show errors for background sync
        }
    }

    private fun getTypeFilter(): String? = when (_uiState.value.filter) {
        GalleryFilter.ALL -> null
        GalleryFilter.IMAGES -> "image"
        GalleryFilter.VIDEOS -> "video"
        GalleryFilter.FILES -> "file"
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null, deleteError = null)
    }

    /**
     * Get current user ID to check file ownership
     */
    fun getCurrentUserId(): String? {
        return tokenManager.getUserIdSync()
    }

    /**
     * Check if user can delete a file (is the owner)
     */
    fun canDeleteFile(file: GalleryFile): Boolean {
        val currentUserId = getCurrentUserId()
        return currentUserId != null && file.senderId == currentUserId
    }

    /**
     * Mark that user has seen the delete warning (don't show again this session)
     */
    fun setDeleteWarningSeen() {
        hasSeenDeleteWarning = true
    }

    /**
     * Delete a file
     */
    fun deleteFile(fileId: String, onSuccess: () -> Unit = {}) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isDeleting = true, deleteError = null)

            val result = repository.deleteFile(fileId)

            result.fold(
                onSuccess = {
                    // Update the files list by removing the deleted file
                    val updatedFiles = _uiState.value.files.filter { it.id != fileId }
                    _uiState.value = _uiState.value.copy(
                        files = updatedFiles,
                        isDeleting = false
                    )
                    onSuccess()
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isDeleting = false,
                        deleteError = error.message ?: "Erreur lors de la suppression"
                    )
                }
            )
        }
    }
}
