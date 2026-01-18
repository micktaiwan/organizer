package com.organizer.chat.ui.screens.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.ChecklistItem
import com.organizer.chat.data.model.Label
import com.organizer.chat.data.model.Note
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.data.socket.ConnectionState
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.ConnectionStatusIcon
import com.organizer.chat.ui.components.OfflineBanner
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotesScreen(
    noteRepository: NoteRepository,
    chatService: ChatService?,
    onNoteClick: (String) -> Unit,
    onCreateNote: () -> Unit,
    onSettingsClick: () -> Unit
) {
    val viewModel = remember {
        NotesViewModel(noteRepository, chatService?.socketManager)
    }
    val uiState by viewModel.uiState.collectAsState()

    // Connection state - use current state as initial to avoid flicker
    val initialConnectionState = remember {
        if (chatService?.socketManager?.isConnected() == true) ConnectionState.Connected
        else ConnectionState.Disconnected
    }
    val connectionState by chatService?.socketManager?.connectionState
        ?.collectAsState(initial = initialConnectionState)
        ?: remember { mutableStateOf(initialConnectionState) }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Notes") },
                    actions = {
                        ConnectionStatusIcon(
                            connectionState = connectionState,
                            modifier = Modifier.padding(end = 4.dp)
                        )
                        IconButton(onClick = { viewModel.loadNotes() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Rafraichir")
                        }
                        IconButton(onClick = onSettingsClick) {
                            Icon(Icons.Default.Settings, contentDescription = "Parametres")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
                OfflineBanner(
                    connectionState = connectionState,
                    onRetry = { chatService?.reconnectIfNeeded() }
                )
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onCreateNote,
                containerColor = MaterialTheme.colorScheme.primary
            ) {
                Icon(Icons.Default.Add, contentDescription = "Nouvelle note")
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Label filter chips
            if (uiState.labels.isNotEmpty()) {
                LabelFilterRow(
                    labels = uiState.labels,
                    selectedLabelId = uiState.selectedLabelId,
                    onLabelClick = { labelId ->
                        viewModel.filterByLabel(
                            if (labelId == uiState.selectedLabelId) null else labelId
                        )
                    }
                )
            }

            // Content
            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    uiState.isLoading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }

                    uiState.errorMessage != null -> {
                        Column(
                            modifier = Modifier.align(Alignment.Center),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = uiState.errorMessage!!,
                                color = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(onClick = { viewModel.loadNotes() }) {
                                Text("Reessayer")
                            }
                        }
                    }

                    uiState.notes.isEmpty() -> {
                        Column(
                            modifier = Modifier.align(Alignment.Center),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                imageVector = Icons.Default.Note,
                                contentDescription = null,
                                modifier = Modifier.size(64.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = "Aucune note",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Appuyez sur + pour creer une note",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                            )
                        }
                    }

                    else -> {
                        // Separate pinned and unpinned notes
                        val pinnedNotes = uiState.notes.filter { it.isPinned }
                        val unpinnedNotes = uiState.notes.filter { !it.isPinned }

                        LazyVerticalStaggeredGrid(
                            columns = StaggeredGridCells.Fixed(2),
                            contentPadding = PaddingValues(8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalItemSpacing = 8.dp,
                            modifier = Modifier.fillMaxSize()
                        ) {
                            // Pinned section header
                            if (pinnedNotes.isNotEmpty()) {
                                item {
                                    Text(
                                        text = "Epinglees",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                                item { Spacer(modifier = Modifier.height(0.dp)) }
                            }

                            items(pinnedNotes, key = { it.id }) { note ->
                                NoteCard(
                                    note = note,
                                    onClick = { onNoteClick(note.id) },
                                    onTogglePin = { viewModel.togglePin(note) },
                                    onToggleChecklistItem = { itemId, checked ->
                                        viewModel.toggleChecklistItem(note, itemId, checked)
                                    },
                                    onDelete = { viewModel.deleteNote(note.id) }
                                )
                            }

                            // Unpinned section header
                            if (pinnedNotes.isNotEmpty() && unpinnedNotes.isNotEmpty()) {
                                item {
                                    Text(
                                        text = "Autres",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                                item { Spacer(modifier = Modifier.height(0.dp)) }
                            }

                            items(unpinnedNotes, key = { it.id }) { note ->
                                NoteCard(
                                    note = note,
                                    onClick = { onNoteClick(note.id) },
                                    onTogglePin = { viewModel.togglePin(note) },
                                    onToggleChecklistItem = { itemId, checked ->
                                        viewModel.toggleChecklistItem(note, itemId, checked)
                                    },
                                    onDelete = { viewModel.deleteNote(note.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LabelFilterRow(
    labels: List<Label>,
    selectedLabelId: String?,
    onLabelClick: (String) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        labels.forEach { label ->
            FilterChip(
                selected = label.id == selectedLabelId,
                onClick = { onLabelClick(label.id) },
                label = { Text(label.name) },
                leadingIcon = if (label.id == selectedLabelId) {
                    {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = null,
                            modifier = Modifier.size(FilterChipDefaults.IconSize)
                        )
                    }
                } else null
            )
        }
    }
}

@Composable
fun NoteCard(
    note: Note,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleChecklistItem: (String, Boolean) -> Unit,
    onDelete: () -> Unit
) {
    val backgroundColor = try {
        Color(android.graphics.Color.parseColor(note.color))
    } catch (e: Exception) {
        MaterialTheme.colorScheme.surface
    }

    var showMenu by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            // Header with title and menu
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                if (note.title.isNotEmpty()) {
                    Text(
                        text = note.title,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    Spacer(modifier = Modifier.weight(1f))
                }

                Box {
                    IconButton(
                        onClick = { showMenu = true },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.MoreVert,
                            contentDescription = "Menu",
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    DropdownMenu(
                        expanded = showMenu,
                        onDismissRequest = { showMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text(if (note.isPinned) "Desepingler" else "Epingler") },
                            onClick = {
                                showMenu = false
                                onTogglePin()
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = if (note.isPinned) Icons.Default.PushPin else Icons.Default.PushPin,
                                    contentDescription = null
                                )
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Supprimer") },
                            onClick = {
                                showMenu = false
                                onDelete()
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = null
                                )
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Content based on note type
            when (note.type) {
                "note" -> {
                    if (note.content.isNotEmpty()) {
                        Text(
                            text = note.content,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 8,
                            overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                        )
                    }
                }
                "checklist" -> {
                    // Show first few checklist items
                    note.items.sortedBy { it.order }.take(5).forEach { item ->
                        ChecklistItemRow(
                            item = item,
                            onToggle = { checked ->
                                onToggleChecklistItem(item.id, checked)
                            }
                        )
                    }
                    if (note.items.size > 5) {
                        Text(
                            text = "+${note.items.size - 5} de plus",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }

            // Labels
            if (note.labels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    note.labels.take(3).forEach { label ->
                        LabelChip(label = label)
                    }
                    if (note.labels.size > 3) {
                        Text(
                            text = "+${note.labels.size - 3}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Assigned user
            if (note.assignedTo != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = note.assignedTo.displayName ?: note.assignedTo.username,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Pin indicator and date
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (note.isPinned) {
                    Icon(
                        imageVector = Icons.Default.PushPin,
                        contentDescription = "Epinglee",
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                } else {
                    Spacer(modifier = Modifier.width(1.dp))
                }

                // Modification date
                Text(
                    text = formatNoteDate(note.updatedAt ?: note.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }
    }
}

private fun formatNoteDate(isoDate: String): String {
    return try {
        val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        inputFormat.timeZone = TimeZone.getTimeZone("UTC")
        val date = inputFormat.parse(isoDate) ?: return ""

        val now = Calendar.getInstance()
        val noteDate = Calendar.getInstance().apply { time = date }

        when {
            // Today: show "Auj. HH:mm"
            now.get(Calendar.YEAR) == noteDate.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) == noteDate.get(Calendar.DAY_OF_YEAR) -> {
                "Auj. " + SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
            }
            // Yesterday
            now.get(Calendar.YEAR) == noteDate.get(Calendar.YEAR) &&
            now.get(Calendar.DAY_OF_YEAR) - noteDate.get(Calendar.DAY_OF_YEAR) == 1 -> {
                "Hier"
            }
            // Same year: show day and month
            now.get(Calendar.YEAR) == noteDate.get(Calendar.YEAR) -> {
                SimpleDateFormat("d MMM", Locale.FRENCH).format(date)
            }
            // Different year: show full date
            else -> {
                SimpleDateFormat("d MMM yy", Locale.FRENCH).format(date)
            }
        }
    } catch (e: Exception) {
        ""
    }
}

@Composable
private fun ChecklistItemRow(
    item: ChecklistItem,
    onToggle: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = item.checked,
            onCheckedChange = onToggle,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = item.text,
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = if (item.checked) {
                MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.onSurface
            }
        )
    }
}

@Composable
private fun LabelChip(label: Label) {
    val chipColor = try {
        Color(android.graphics.Color.parseColor(label.color))
    } catch (e: Exception) {
        MaterialTheme.colorScheme.primaryContainer
    }

    Surface(
        shape = CircleShape,
        color = chipColor.copy(alpha = 0.3f)
    ) {
        Text(
            text = label.name,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
