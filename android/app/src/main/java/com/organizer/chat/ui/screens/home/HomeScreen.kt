package com.organizer.chat.ui.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.screens.location.LocationScreen
import com.organizer.chat.ui.screens.location.LocationViewModel
import com.organizer.chat.ui.screens.notes.NotesScreen
import com.organizer.chat.ui.screens.rooms.RoomsContent
import com.organizer.chat.util.AppPreferences
import com.organizer.chat.util.TokenManager

enum class HomeTab {
    CONVERSATIONS,
    NOTES,
    LOCATION
}

@Composable
fun HomeScreen(
    roomRepository: RoomRepository,
    noteRepository: NoteRepository,
    tokenManager: TokenManager,
    authRepository: AuthRepository,
    appPreferences: AppPreferences,
    chatService: ChatService?,
    onRoomClick: (Room) -> Unit,
    onSettingsClick: () -> Unit,
    onNoteClick: (String) -> Unit,
    onCreateNote: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }
    val selectedTab = HomeTab.entries[selectedTabIndex]

    // Create ViewModel at HomeScreen level so it persists across tab switches
    val locationViewModel = remember {
        LocationViewModel(context, chatService?.socketManager)
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0.dp),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == HomeTab.CONVERSATIONS,
                    onClick = { selectedTabIndex = HomeTab.CONVERSATIONS.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Chat,
                            contentDescription = "Conversations"
                        )
                    },
                    label = { Text("Conversations") }
                )
                NavigationBarItem(
                    selected = selectedTab == HomeTab.NOTES,
                    onClick = { selectedTabIndex = HomeTab.NOTES.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Note,
                            contentDescription = "Notes"
                        )
                    },
                    label = { Text("Notes") }
                )
                NavigationBarItem(
                    selected = selectedTab == HomeTab.LOCATION,
                    onClick = { selectedTabIndex = HomeTab.LOCATION.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = "Localisations"
                        )
                    },
                    label = { Text("Positions") }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (selectedTab) {
                HomeTab.CONVERSATIONS -> {
                    RoomsContent(
                        roomRepository = roomRepository,
                        tokenManager = tokenManager,
                        authRepository = authRepository,
                        appPreferences = appPreferences,
                        onRoomClick = onRoomClick,
                        onSettingsClick = onSettingsClick,
                        onLogout = onLogout
                    )
                }
                HomeTab.NOTES -> {
                    NotesScreen(
                        noteRepository = noteRepository,
                        chatService = chatService,
                        onNoteClick = onNoteClick,
                        onCreateNote = onCreateNote,
                        onSettingsClick = onSettingsClick
                    )
                }
                HomeTab.LOCATION -> {
                    LocationScreen(
                        chatService = chatService,
                        viewModel = locationViewModel
                    )
                }
            }
        }
    }
}
