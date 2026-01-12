package com.organizer.chat.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.screens.chat.ChatScreen
import com.organizer.chat.ui.screens.home.HomeScreen
import com.organizer.chat.ui.screens.login.LoginScreen
import com.organizer.chat.ui.screens.map.MapScreen
import com.organizer.chat.ui.screens.map.MapViewModel
import com.organizer.chat.ui.screens.notes.NoteDetailScreen
import com.organizer.chat.ui.screens.register.RegisterScreen
import com.organizer.chat.ui.screens.rooms.RoomsScreen
import com.organizer.chat.ui.screens.settings.SettingsScreen
import com.organizer.chat.util.AppPreferences
import com.organizer.chat.util.TokenManager

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val HOME = "home"
    const val ROOMS = "rooms"  // Keep for backwards compatibility
    const val SETTINGS = "settings"
    const val MAP = "map"
    const val CHAT = "chat/{roomId}/{roomName}"
    const val NOTE_DETAIL = "note/{noteId}"
    const val NOTE_CREATE = "note/create"

    fun chat(roomId: String, roomName: String) = "chat/$roomId/$roomName"
    fun noteDetail(noteId: String) = "note/$noteId"
}

@Composable
fun NavGraph(
    navController: NavHostController,
    startDestination: String,
    tokenManager: TokenManager,
    chatService: ChatService?,
    authRepository: AuthRepository,
    roomRepository: RoomRepository,
    messageRepository: MessageRepository,
    noteRepository: NoteRepository,
    appPreferences: AppPreferences,
    onLoginSuccess: () -> Unit,
    onLogout: () -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                authRepository = authRepository,
                onLoginSuccess = {
                    onLoginSuccess()
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
                onRegisterClick = {
                    navController.navigate(Routes.REGISTER)
                }
            )
        }

        composable(Routes.REGISTER) {
            RegisterScreen(
                authRepository = authRepository,
                onRegisterSuccess = {
                    onLoginSuccess()
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                roomRepository = roomRepository,
                noteRepository = noteRepository,
                tokenManager = tokenManager,
                authRepository = authRepository,
                appPreferences = appPreferences,
                chatService = chatService,
                onRoomClick = { room ->
                    navController.navigate(Routes.chat(room.id, room.name))
                },
                onSettingsClick = {
                    navController.navigate(Routes.SETTINGS)
                },
                onNoteClick = { noteId ->
                    navController.navigate(Routes.noteDetail(noteId))
                },
                onCreateNote = {
                    navController.navigate(Routes.NOTE_CREATE)
                },
                onMapClick = {
                    navController.navigate(Routes.MAP)
                },
                onLogout = {
                    onLogout()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                }
            )
        }

        // Keep ROOMS route for backwards compatibility
        composable(Routes.ROOMS) {
            RoomsScreen(
                roomRepository = roomRepository,
                tokenManager = tokenManager,
                authRepository = authRepository,
                appPreferences = appPreferences,
                chatService = chatService,
                onRoomClick = { room ->
                    navController.navigate(Routes.chat(room.id, room.name))
                },
                onSettingsClick = {
                    navController.navigate(Routes.SETTINGS)
                },
                onLogout = {
                    onLogout()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBackClick = { navController.popBackStack() },
                onLogout = {
                    onLogout()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.MAP) {
            val context = LocalContext.current
            val viewModel = remember {
                MapViewModel(context, chatService?.socketManager)
            }
            MapScreen(
                viewModel = viewModel,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Routes.CHAT,
            arguments = listOf(
                navArgument("roomId") { type = NavType.StringType },
                navArgument("roomName") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val roomId = backStackEntry.arguments?.getString("roomId") ?: return@composable
            val roomName = backStackEntry.arguments?.getString("roomName") ?: ""

            ChatScreen(
                roomId = roomId,
                roomName = roomName,
                messageRepository = messageRepository,
                roomRepository = roomRepository,
                chatService = chatService,
                tokenManager = tokenManager,
                onBackClick = { navController.popBackStack() }
            )
        }

        // Note detail screen
        composable(
            route = Routes.NOTE_DETAIL,
            arguments = listOf(
                navArgument("noteId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val noteId = backStackEntry.arguments?.getString("noteId") ?: return@composable

            NoteDetailScreen(
                noteId = noteId,
                noteRepository = noteRepository,
                chatService = chatService,
                tokenManager = tokenManager,
                onBackClick = { navController.popBackStack() },
                onNoteDeleted = { navController.popBackStack() }
            )
        }

        // Create new note screen
        composable(Routes.NOTE_CREATE) {
            NoteDetailScreen(
                noteId = null,
                noteRepository = noteRepository,
                chatService = chatService,
                tokenManager = tokenManager,
                onBackClick = { navController.popBackStack() },
                onNoteDeleted = { navController.popBackStack() }
            )
        }
    }
}
