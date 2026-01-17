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
import com.organizer.chat.ui.screens.users.UsersScreen
import com.organizer.chat.ui.screens.users.UsersViewModel
import com.organizer.chat.ui.screens.notes.NotesScreen
import com.organizer.chat.ui.screens.rooms.RoomsContent
import com.organizer.chat.ui.screens.tamagotchi.TamagotchiScreen
import com.organizer.chat.ui.screens.gallery.GalleryScreen
import com.organizer.chat.ui.screens.gallery.GalleryViewModel
import com.organizer.chat.util.AppPreferences
import com.organizer.chat.util.TokenManager

enum class HomeTab {
    CHATS,
    GALLERY,
    NOTES,
    USERS,
    TAMAGOTCHI
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
    onMapClick: () -> Unit = {},
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var selectedTabIndex by rememberSaveable { mutableIntStateOf(0) }
    val selectedTab = HomeTab.entries[selectedTabIndex]

    // Create ViewModels at HomeScreen level so they persist across tab switches
    val usersViewModel = remember { UsersViewModel(context) }
    val galleryViewModel = remember { GalleryViewModel(context) }

    // Initialize socket manager when it becomes available
    LaunchedEffect(chatService?.socketManager) {
        chatService?.socketManager?.let { manager ->
            usersViewModel.setSocketManager(manager)
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0.dp),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = selectedTab == HomeTab.CHATS,
                    onClick = { selectedTabIndex = HomeTab.CHATS.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Chat,
                            contentDescription = "Chats"
                        )
                    },
                    label = { Text("Chats") }
                )
                NavigationBarItem(
                    selected = selectedTab == HomeTab.GALLERY,
                    onClick = { selectedTabIndex = HomeTab.GALLERY.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.PhotoLibrary,
                            contentDescription = "Gallery"
                        )
                    },
                    label = { Text("Gallery") }
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
                    selected = selectedTab == HomeTab.USERS,
                    onClick = { selectedTabIndex = HomeTab.USERS.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.People,
                            contentDescription = "Users"
                        )
                    },
                    label = { Text("Users") }
                )
                NavigationBarItem(
                    selected = selectedTab == HomeTab.TAMAGOTCHI,
                    onClick = { selectedTabIndex = HomeTab.TAMAGOTCHI.ordinal },
                    icon = {
                        Icon(
                            imageVector = Icons.Default.Pets,
                            contentDescription = "Pet"
                        )
                    },
                    label = { Text("Pet") }
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
                HomeTab.CHATS -> {
                    RoomsContent(
                        roomRepository = roomRepository,
                        tokenManager = tokenManager,
                        authRepository = authRepository,
                        appPreferences = appPreferences,
                        chatService = chatService,
                        onRoomClick = onRoomClick,
                        onSettingsClick = onSettingsClick,
                        onLogout = onLogout
                    )
                }
                HomeTab.GALLERY -> {
                    GalleryScreen(
                        viewModel = galleryViewModel,
                        onSettingsClick = onSettingsClick
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
                HomeTab.USERS -> {
                    UsersScreen(
                        chatService = chatService,
                        viewModel = usersViewModel,
                        onSettingsClick = onSettingsClick,
                        onMapClick = onMapClick
                    )
                }
                HomeTab.TAMAGOTCHI -> {
                    TamagotchiScreen()
                }
            }
        }
    }
}
