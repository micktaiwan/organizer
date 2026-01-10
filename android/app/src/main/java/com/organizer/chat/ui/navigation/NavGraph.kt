package com.organizer.chat.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.screens.chat.ChatScreen
import com.organizer.chat.ui.screens.login.LoginScreen
import com.organizer.chat.ui.screens.register.RegisterScreen
import com.organizer.chat.ui.screens.rooms.RoomsScreen
import com.organizer.chat.ui.screens.settings.SettingsScreen
import com.organizer.chat.util.TokenManager

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val ROOMS = "rooms"
    const val SETTINGS = "settings"
    const val CHAT = "chat/{roomId}/{roomName}"

    fun chat(roomId: String, roomName: String) = "chat/$roomId/$roomName"
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
                    navController.navigate(Routes.ROOMS) {
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
                    navController.navigate(Routes.ROOMS) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                },
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }

        composable(Routes.ROOMS) {
            RoomsScreen(
                roomRepository = roomRepository,
                tokenManager = tokenManager,
                authRepository = authRepository,
                onRoomClick = { room ->
                    navController.navigate(Routes.chat(room.id, room.name))
                },
                onSettingsClick = {
                    navController.navigate(Routes.SETTINGS)
                },
                onLogout = {
                    onLogout()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.ROOMS) { inclusive = true }
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
                        popUpTo(Routes.ROOMS) { inclusive = true }
                    }
                }
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
                chatService = chatService,
                tokenManager = tokenManager,
                onBackClick = { navController.popBackStack() }
            )
        }
    }
}
