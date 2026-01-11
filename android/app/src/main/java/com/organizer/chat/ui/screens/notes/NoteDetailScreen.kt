package com.organizer.chat.ui.screens.notes

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.*
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.util.TokenManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.platform.LocalContext
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.OnlineGreen
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

// Note colors palette (dark theme - 6 colors)
val noteColors = listOf(
    "#1a1a1a", // Very dark gray (default)
    "#3d1a1a", // Dark Red
    "#1a3d1a", // Dark Green
    "#1a1a3d", // Dark Blue
    "#3d1a3d", // Dark Purple
    "#3d2a1a"  // Dark Brown
)

// Save status for auto-save indicator
enum class SaveStatus {
    Idle,      // No changes or already saved
    Saving,    // Save in progress
    Saved      // Just saved (show checkmark)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteDetailScreen(
    noteId: String?,
    noteRepository: NoteRepository,
    chatService: ChatService?,
    tokenManager: TokenManager,
    onBackClick: () -> Unit,
    onNoteDeleted: () -> Unit
) {
    val currentUserId = remember { tokenManager.getUserIdSync() ?: "" }
    val scope = rememberCoroutineScope()
    val isNewNote = noteId == null

    // State
    var note by remember { mutableStateOf<Note?>(null) }
    var isLoading by remember { mutableStateOf(!isNewNote) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Edit state
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var noteType by remember { mutableStateOf("note") }
    var selectedColor by remember { mutableStateOf("#1a1a1a") }
    var checklistItems by remember { mutableStateOf<List<EditableChecklistItem>>(emptyList()) }
    var newItemText by remember { mutableStateOf("") }
    var saveStatus by remember { mutableStateOf(SaveStatus.Idle) }
    var pendingVersion by remember { mutableStateOf(0) }
    var focusItemIndex by remember { mutableStateOf(-1) }

    // UI state
    var showColorPicker by remember { mutableStateOf(false) }
    var showTypeSelector by remember { mutableStateOf(false) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val context = LocalContext.current
    var showCopySuccess by remember { mutableStateOf(false) }

    // Show error in snackbar
    LaunchedEffect(errorMessage) {
        errorMessage?.let { error ->
            snackbarHostState.showSnackbar(
                message = error,
                duration = SnackbarDuration.Long
            )
            errorMessage = null
        }
    }

    // Show copy success message
    LaunchedEffect(showCopySuccess) {
        if (showCopySuccess) {
            snackbarHostState.showSnackbar(
                message = "Note copiee",
                duration = SnackbarDuration.Short
            )
            showCopySuccess = false
        }
    }

    // Load existing note
    LaunchedEffect(noteId) {
        if (noteId != null) {
            isLoading = true
            val result = noteRepository.getNote(noteId)
            result.fold(
                onSuccess = { loadedNote ->
                    note = loadedNote
                    title = loadedNote.title
                    content = loadedNote.content
                    noteType = loadedNote.type
                    selectedColor = loadedNote.color
                    checklistItems = loadedNote.items.map { item ->
                        EditableChecklistItem(
                            id = item.id,
                            text = item.text,
                            checked = item.checked,
                            order = item.order
                        )
                    }
                    isLoading = false
                },
                onFailure = { error ->
                    errorMessage = error.message
                    isLoading = false
                }
            )
        }
    }

    // Listen to real-time updates for this note
    LaunchedEffect(noteId, chatService) {
        if (noteId == null || chatService == null) return@LaunchedEffect

        chatService.socketManager?.noteUpdated
            ?.filter { it.noteId == noteId && it.triggeredBy != currentUserId }
            ?.collect { event ->
                // Another user updated this note
                if (saveStatus == SaveStatus.Idle) {
                    // No local changes, reload the note
                    val result = noteRepository.getNote(noteId)
                    result.onSuccess { loadedNote ->
                        note = loadedNote
                        title = loadedNote.title
                        content = loadedNote.content
                        noteType = loadedNote.type
                        selectedColor = loadedNote.color
                        checklistItems = loadedNote.items.map { item ->
                            EditableChecklistItem(
                                id = item.id,
                                text = item.text,
                                checked = item.checked,
                                order = item.order
                            )
                        }
                    }
                } else {
                    // Has local changes, show warning
                    val action = snackbarHostState.showSnackbar(
                        message = "Note modifiée par un autre utilisateur",
                        actionLabel = "Recharger",
                        duration = SnackbarDuration.Long
                    )
                    if (action == SnackbarResult.ActionPerformed) {
                        // User chose to reload
                        val result = noteRepository.getNote(noteId)
                        result.onSuccess { loadedNote ->
                            note = loadedNote
                            title = loadedNote.title
                            content = loadedNote.content
                            noteType = loadedNote.type
                            selectedColor = loadedNote.color
                            checklistItems = loadedNote.items.map { item ->
                                EditableChecklistItem(
                                    id = item.id,
                                    text = item.text,
                                    checked = item.checked,
                                    order = item.order
                                )
                            }
                            saveStatus = SaveStatus.Idle
                        }
                    }
                }
            }
    }

    // Listen to note deletion
    LaunchedEffect(noteId, chatService) {
        if (noteId == null || chatService == null) return@LaunchedEffect

        chatService.socketManager?.noteDeleted
            ?.filter { it.noteId == noteId && it.deletedBy != currentUserId }
            ?.collect {
                // Note was deleted by another user
                snackbarHostState.showSnackbar(
                    message = "Cette note a été supprimée",
                    duration = SnackbarDuration.Short
                )
                onNoteDeleted()
            }
    }

    // Check if note has meaningful content
    fun hasContent(): Boolean {
        return title.isNotBlank() || content.isNotBlank() || checklistItems.any { it.text.isNotBlank() }
    }

    // Format note content for clipboard
    fun formatNoteForCopy(): String {
        return when (noteType) {
            "note" -> content
            "checklist" -> checklistItems
                .filter { !it.checked }
                .map { it.text }
                .filter { it.isNotBlank() }
                .joinToString("\n")
            else -> ""
        }
    }

    // Copy note to clipboard
    fun copyNoteToClipboard() {
        val textToCopy = formatNoteForCopy()
        if (textToCopy.isNotBlank()) {
            val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Note", textToCopy)
            clipboardManager.setPrimaryClip(clip)
            showCopySuccess = true
        }
    }

    // Save function (returns true if save was successful or not needed)
    suspend fun saveNoteAsync(): Boolean {
        // Don't save empty notes
        if (!hasContent()) {
            return true
        }

        if (isNewNote) {
            // Create new note
            val items = if (noteType == "checklist") {
                checklistItems.filter { it.text.isNotBlank() }.map { it.text }
            } else emptyList()

            val result = noteRepository.createNote(
                type = noteType,
                title = title,
                content = if (noteType == "note") content else "",
                items = items,
                color = selectedColor
            )
            return result.fold(
                onSuccess = {
                    saveStatus = SaveStatus.Idle
                    true
                },
                onFailure = { error ->
                    errorMessage = error.message
                    false
                }
            )
        } else {
            // Update existing note
            val request = UpdateNoteRequest(
                type = noteType,
                title = title,
                content = if (noteType == "note") content else null,
                color = selectedColor,
                items = if (noteType == "checklist") {
                    checklistItems
                        .filter { it.text.isNotBlank() }
                        .mapIndexed { index, item ->
                            UpdateChecklistItemRequest(
                                id = item.id.takeIf { it.isNotEmpty() },
                                text = item.text,
                                checked = item.checked,
                                order = index
                            )
                        }
                } else null
            )
            val result = noteRepository.updateNote(noteId!!, request)
            return result.fold(
                onSuccess = {
                    saveStatus = SaveStatus.Idle
                    true
                },
                onFailure = { error ->
                    errorMessage = error.message
                    false
                }
            )
        }
    }

    // Save and navigate back
    fun saveAndGoBack() {
        scope.launch {
            val success = saveNoteAsync()
            if (success) {
                onBackClick()
            }
        }
    }

    // Handle back navigation (auto-save)
    BackHandler {
        saveAndGoBack()
    }

    // Auto-save with debounce for existing notes
    LaunchedEffect(pendingVersion) {
        if (pendingVersion > 0 && !isNewNote && saveStatus != SaveStatus.Saving) {
            delay(1500) // 1.5s debounce
            scope.launch {
                saveStatus = SaveStatus.Saving
                val success = saveNoteAsync()
                saveStatus = if (success) SaveStatus.Saved else SaveStatus.Idle
            }
        }
    }

    // Reset saved indicator after 2s
    LaunchedEffect(saveStatus) {
        if (saveStatus == SaveStatus.Saved) {
            delay(2000)
            saveStatus = SaveStatus.Idle
        }
    }

    // Delete function
    fun deleteNote() {
        if (noteId != null) {
            scope.launch {
                val result = noteRepository.deleteNote(noteId)
                result.fold(
                    onSuccess = { onNoteDeleted() },
                    onFailure = { error -> errorMessage = error.message }
                )
            }
        }
    }

    val backgroundColor = try {
        Color(android.graphics.Color.parseColor(selectedColor))
    } catch (e: Exception) {
        MaterialTheme.colorScheme.surface
    }

    Scaffold(
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (isNewNote) "Nouvelle note" else "Modifier")
                        when (saveStatus) {
                            SaveStatus.Saving -> Text(
                                text = "Sauvegarde...",
                                style = MaterialTheme.typography.bodySmall,
                                color = AccentBlue
                            )
                            SaveStatus.Saved -> Text(
                                text = "Sauvegardé ✓",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnlineGreen
                            )
                            else -> {} // Nothing for Idle and Pending
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { saveAndGoBack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
                actions = {
                    // Copy button
                    IconButton(
                        onClick = { copyNoteToClipboard() },
                        colors = IconButtonDefaults.iconButtonColors(
                            contentColor = AccentBlue
                        )
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "Copier")
                    }

                    // Color picker button
                    IconButton(onClick = { showColorPicker = true }) {
                        Icon(Icons.Default.Palette, contentDescription = "Couleur")
                    }

                    // Type toggle button
                    IconButton(onClick = { showTypeSelector = true }) {
                        Icon(
                            imageVector = if (noteType == "checklist") Icons.Default.CheckBox else Icons.Default.Note,
                            contentDescription = "Type"
                        )
                    }

                    // Delete button (only for existing notes)
                    if (!isNewNote) {
                        IconButton(onClick = { showDeleteConfirmation = true }) {
                            Icon(Icons.Default.Delete, contentDescription = "Supprimer")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = backgroundColor
                ),
                windowInsets = WindowInsets.statusBars
            )
        },
        containerColor = backgroundColor
    ) { paddingValues ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            val lazyListState = rememberLazyListState()
            val reorderableLazyListState = rememberReorderableLazyListState(lazyListState) { from, to ->
                // Adjust indices to account for title item at index 0
                val fromIndex = from.index - 1
                val toIndex = to.index - 1
                if (fromIndex >= 0 && toIndex >= 0 && fromIndex < checklistItems.size && toIndex < checklistItems.size) {
                    checklistItems = checklistItems.toMutableList().apply {
                        add(toIndex, removeAt(fromIndex))
                    }
                    pendingVersion++
                }
            }

            LazyColumn(
                state = lazyListState,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .imePadding()
                    .padding(16.dp)
            ) {
                // Title input
                item {
                    BasicTextField(
                        value = title,
                        onValueChange = {
                            title = it
                            pendingVersion++
                        },
                        textStyle = TextStyle(
                            fontSize = MaterialTheme.typography.headlineSmall.fontSize,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        cursorBrush = SolidColor(Color.White),
                        modifier = Modifier.fillMaxWidth(),
                        decorationBox = { innerTextField ->
                            Box {
                                if (title.isEmpty()) {
                                    Text(
                                        text = "Titre",
                                        style = MaterialTheme.typography.headlineSmall,
                                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                    )
                                }
                                innerTextField()
                            }
                        }
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Content based on type
                when (noteType) {
                    "note" -> {
                        item {
                            BasicTextField(
                                value = content,
                                onValueChange = {
                                    content = it
                                    pendingVersion++
                                },
                                textStyle = TextStyle(
                                    fontSize = MaterialTheme.typography.bodyLarge.fontSize,
                                    color = MaterialTheme.colorScheme.onSurface
                                ),
                                cursorBrush = SolidColor(Color.White),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 200.dp),
                                decorationBox = { innerTextField ->
                                    Box {
                                        if (content.isEmpty()) {
                                            Text(
                                                text = "Note...",
                                                style = MaterialTheme.typography.bodyLarge,
                                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                            )
                                        }
                                        innerTextField()
                                    }
                                }
                            )
                        }
                    }
                    "checklist" -> {
                        itemsIndexed(checklistItems, key = { index, item -> item.id.ifEmpty { "new_$index" } }) { index, item ->
                            ReorderableItem(reorderableLazyListState, key = item.id.ifEmpty { "new_$index" }) {
                                ChecklistItemEditor(
                                    item = item,
                                    isDragging = it,
                                    dragModifier = Modifier.draggableHandle(),
                                    onTextChange = { newText ->
                                        checklistItems = checklistItems.toMutableList().apply {
                                            this[index] = item.copy(text = newText)
                                        }
                                        pendingVersion++
                                    },
                                    onCheckedChange = { checked ->
                                        checklistItems = checklistItems.toMutableList().apply {
                                            this[index] = item.copy(checked = checked)
                                        }.sortedBy { it.checked }
                                        pendingVersion++
                                    },
                                    onDelete = {
                                        checklistItems = checklistItems.toMutableList().apply {
                                            removeAt(index)
                                        }
                                        pendingVersion++
                                    },
                                    onInsertAfter = { textAfter ->
                                        checklistItems = checklistItems.toMutableList().apply {
                                            add(index + 1, EditableChecklistItem(
                                                id = "",
                                                text = textAfter,
                                                checked = false,
                                                order = index + 1
                                            ))
                                        }
                                        focusItemIndex = index + 1
                                        pendingVersion++
                                    },
                                    shouldFocus = focusItemIndex == index,
                                    onFocused = { focusItemIndex = -1 }
                                )
                            }
                        }

                        // Add new item row
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Show checkbox when typing, + when empty
                                if (newItemText.isNotEmpty()) {
                                    Checkbox(
                                        checked = false,
                                        onCheckedChange = null,
                                        modifier = Modifier.size(24.dp),
                                        enabled = false
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Add,
                                        contentDescription = null,
                                        modifier = Modifier.size(24.dp),
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                // Function to add new item
                                fun addItem() {
                                    if (newItemText.isNotBlank()) {
                                        checklistItems = checklistItems + EditableChecklistItem(
                                            id = "",
                                            text = newItemText.trim(),
                                            checked = false,
                                            order = checklistItems.size
                                        )
                                        newItemText = ""
                                        pendingVersion++
                                    }
                                }

                                BasicTextField(
                                    value = newItemText,
                                    onValueChange = { newValue ->
                                        // Detect Enter key (newline) and add item
                                        if (newValue.contains("\n")) {
                                            newItemText = newValue.replace("\n", "")
                                            addItem()
                                        } else {
                                            newItemText = newValue
                                        }
                                    },
                                    textStyle = TextStyle(
                                        fontSize = MaterialTheme.typography.bodyMedium.fontSize,
                                        color = MaterialTheme.colorScheme.onSurface
                                    ),
                                    cursorBrush = SolidColor(Color.White),
                                    modifier = Modifier.weight(1f),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { addItem() }),
                                    decorationBox = { innerTextField ->
                                        Box {
                                            if (newItemText.isEmpty()) {
                                                Text(
                                                    text = "Ajouter un element...",
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                                                )
                                            }
                                            innerTextField()
                                        }
                                    },
                                    singleLine = true
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Color picker dialog
    if (showColorPicker) {
        AlertDialog(
            onDismissRequest = { showColorPicker = false },
            title = { Text("Choisir une couleur") },
            text = {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(noteColors) { colorHex ->
                        val color = try {
                            Color(android.graphics.Color.parseColor(colorHex))
                        } catch (e: Exception) {
                            Color.White
                        }
                        Surface(
                            modifier = Modifier
                                .size(40.dp)
                                .clickable {
                                    selectedColor = colorHex
                                    pendingVersion++
                                    showColorPicker = false
                                },
                            shape = CircleShape,
                            color = color,
                            border = if (colorHex == selectedColor) {
                                androidx.compose.foundation.BorderStroke(
                                    2.dp,
                                    MaterialTheme.colorScheme.primary
                                )
                            } else null
                        ) {
                            if (colorHex == selectedColor) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showColorPicker = false }) {
                    Text("Fermer")
                }
            }
        )
    }

    // Type selector dialog
    if (showTypeSelector) {
        AlertDialog(
            onDismissRequest = { showTypeSelector = false },
            title = { Text("Type de note") },
            text = {
                Column {
                    ListItem(
                        headlineContent = { Text("Note") },
                        leadingContent = { Icon(Icons.Default.Note, contentDescription = null) },
                        modifier = Modifier.clickable {
                            if (noteType != "note") {
                                // Convert checklist items to content lines
                                if (checklistItems.isNotEmpty()) {
                                    content = checklistItems
                                        .filter { it.text.isNotBlank() }
                                        .joinToString("\n") { it.text }
                                }
                                noteType = "note"
                                pendingVersion++
                            }
                            showTypeSelector = false
                        }
                    )
                    ListItem(
                        headlineContent = { Text("Liste") },
                        leadingContent = { Icon(Icons.Default.CheckBox, contentDescription = null) },
                        modifier = Modifier.clickable {
                            if (noteType != "checklist") {
                                noteType = "checklist"
                                // Convert content to checklist items if switching
                                if (content.isNotEmpty()) {
                                    checklistItems = content.lines().filter { it.isNotBlank() }.mapIndexed { index, line ->
                                        EditableChecklistItem(
                                            id = "",
                                            text = line,
                                            checked = false,
                                            order = index
                                        )
                                    }
                                    content = ""
                                }
                                pendingVersion++
                            }
                            showTypeSelector = false
                        }
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showTypeSelector = false }) {
                    Text("Fermer")
                }
            }
        )
    }

    // Delete confirmation dialog
    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = { Text("Supprimer la note ?") },
            text = { Text("Cette action est irreversible.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteConfirmation = false
                        deleteNote()
                    }
                ) {
                    Text("Supprimer", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) {
                    Text("Annuler")
                }
            }
        )
    }

}

data class EditableChecklistItem(
    val id: String,
    val text: String,
    val checked: Boolean,
    val order: Int
)

@Composable
private fun ChecklistItemEditor(
    item: EditableChecklistItem,
    isDragging: Boolean = false,
    dragModifier: Modifier = Modifier,
    onTextChange: (String) -> Unit,
    onCheckedChange: (Boolean) -> Unit,
    onDelete: () -> Unit,
    onInsertAfter: (String) -> Unit,
    shouldFocus: Boolean = false,
    onFocused: () -> Unit = {}
) {
    val focusRequester = remember { FocusRequester() }

    // Request focus when shouldFocus becomes true
    LaunchedEffect(shouldFocus) {
        if (shouldFocus) {
            focusRequester.requestFocus()
            onFocused()
        }
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .background(
                if (isDragging) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                else Color.Transparent
            ),
        verticalAlignment = Alignment.Top // Align checkbox to top for multiline text
    ) {
        // Drag handle
        Icon(
            imageVector = Icons.Default.DragHandle,
            contentDescription = "Réordonner",
            modifier = dragModifier
                .size(24.dp)
                .padding(top = 2.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.width(4.dp))
        Checkbox(
            checked = item.checked,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        BasicTextField(
            value = item.text,
            onValueChange = { newValue ->
                // Detect Enter key and split text
                val newlineIndex = newValue.indexOf('\n')
                if (newlineIndex != -1) {
                    val beforeNewline = newValue.substring(0, newlineIndex)
                    val afterNewline = newValue.substring(newlineIndex + 1)
                    onTextChange(beforeNewline)
                    onInsertAfter(afterNewline)
                } else {
                    onTextChange(newValue)
                }
            },
            textStyle = TextStyle(
                fontSize = MaterialTheme.typography.bodyMedium.fontSize,
                color = if (item.checked) {
                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                } else {
                    MaterialTheme.colorScheme.onSurface
                }
            ),
            cursorBrush = SolidColor(Color.White),
            modifier = Modifier
                .weight(1f)
                .focusRequester(focusRequester)
        )
        IconButton(
            onClick = onDelete,
            modifier = Modifier.size(24.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Supprimer",
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
