package com.organizer.chat

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import androidx.compose.runtime.*
import androidx.core.content.ContextCompat
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.data.repository.UpdateRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.navigation.NavGraph
import com.organizer.chat.ui.navigation.Routes
import com.organizer.chat.ui.components.UpdateDialog
import com.organizer.chat.ui.theme.OrganizerChatTheme
import com.organizer.chat.util.UpdateManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.File

class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var tokenManager: com.organizer.chat.util.TokenManager
    private lateinit var authRepository: AuthRepository
    private lateinit var roomRepository: RoomRepository
    private lateinit var messageRepository: MessageRepository
    private lateinit var updateRepository: UpdateRepository
    private lateinit var updateManager: UpdateManager

    // Use mutableStateOf so Compose recomposes when service binds
    private var chatServiceState = mutableStateOf<ChatService?>(null)
    private var serviceBound = false

    // Store pending room to navigate to (from notification)
    private var pendingRoomId = mutableStateOf<String?>(null)
    private var pendingRoomName = mutableStateOf<String?>(null)
    private var navControllerRef: NavHostController? = null

    // Update state
    private var pendingUpdateInfo = mutableStateOf<AppUpdateInfo?>(null)

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as ChatService.ChatBinder
            chatServiceState.value = binder.getService()
            serviceBound = true
            chatServiceState.value?.setAppInForeground(true)
            chatServiceState.value?.reconnectIfNeeded()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            chatServiceState.value = null
            serviceBound = false
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        // Permission result handled, continue with app
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Get TokenManager from Application
        val app = application as OrganizerApp
        tokenManager = app.tokenManager

        // Initialize repositories
        authRepository = AuthRepository(tokenManager)
        roomRepository = RoomRepository()
        messageRepository = MessageRepository()
        updateRepository = UpdateRepository(applicationContext)
        updateManager = UpdateManager(applicationContext)

        // Request notification permission on Android 13+
        requestNotificationPermission()

        // Determine start destination
        val isLoggedIn = runBlocking { authRepository.isLoggedIn() }
        val startDestination = if (isLoggedIn) Routes.ROOMS else Routes.LOGIN

        // Check if launched from notification with roomId
        handleNotificationIntent(intent)

        // Start and bind to ChatService if logged in
        if (isLoggedIn) {
            startChatService()
            checkForUpdateOnLaunch()
        }

        setContent {
            OrganizerChatTheme {
                val navController = rememberNavController()
                // Read from state so we recompose when service binds
                val chatService by chatServiceState
                val pendingRoom by pendingRoomId
                val pendingName by pendingRoomName

                // Store reference for onNewIntent
                LaunchedEffect(navController) {
                    navControllerRef = navController
                }

                // Navigate to pending room if set (only after NavGraph is ready)
                LaunchedEffect(pendingRoom, chatService) {
                    val service = chatService
                    pendingRoom?.let { roomId ->
                        if (service != null && roomId.isNotBlank()) {
                            try {
                                val roomName = pendingName ?: service.getRoomName(roomId)
                                Log.d(TAG, "Navigating to room from notification: $roomId ($roomName)")
                                navController.navigate(Routes.chat(roomId, roomName)) {
                                    launchSingleTop = true
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Failed to navigate to room: ${e.message}")
                            }
                            // Clear pending
                            pendingRoomId.value = null
                            pendingRoomName.value = null
                        }
                    }
                }

                NavGraph(
                    navController = navController,
                    startDestination = startDestination,
                    tokenManager = tokenManager,
                    chatService = chatService,
                    authRepository = authRepository,
                    roomRepository = roomRepository,
                    messageRepository = messageRepository,
                    onLoginSuccess = {
                        startChatService()
                        checkForUpdateOnLaunch()
                    },
                    onLogout = {
                        stopChatService()
                    }
                )

                // Update dialog
                val updateInfo by pendingUpdateInfo
                updateInfo?.let { info ->
                    var downloadState by remember { mutableStateOf<UpdateManager.DownloadState>(UpdateManager.DownloadState.Idle) }
                    var downloadedFile by remember { mutableStateOf<File?>(null) }

                    UpdateDialog(
                        updateInfo = info,
                        downloadState = downloadState,
                        onDownload = {
                            lifecycleScope.launch {
                                updateManager.downloadApk(info).collect { state ->
                                    downloadState = state
                                    if (state is UpdateManager.DownloadState.Completed) {
                                        downloadedFile = state.file
                                    }
                                }
                            }
                        },
                        onInstall = {
                            downloadedFile?.let { file ->
                                updateManager.installApk(file)
                            }
                        },
                        onDismiss = {
                            pendingUpdateInfo.value = null
                        }
                    )
                }
            }
        }
    }

    private fun checkForUpdateOnLaunch() {
        lifecycleScope.launch {
            delay(2000) // Wait 2 seconds after app launch
            updateRepository.checkForUpdate().fold(
                onSuccess = { result ->
                    if (result.updateAvailable && result.updateInfo != null) {
                        pendingUpdateInfo.value = result.updateInfo
                    }
                },
                onFailure = { /* Silent fail on launch */ }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.d(TAG, "onNewIntent called")
        handleNotificationIntent(intent)

        // If we have a nav controller and pending room, navigate immediately
        pendingRoomId.value?.let { roomId ->
            if (roomId.isNotBlank()) {
                navControllerRef?.let { navController ->
                    try {
                        val roomName = pendingRoomName.value
                            ?: chatServiceState.value?.getRoomName(roomId)
                            ?: "Chat"
                        Log.d(TAG, "Navigating to room from onNewIntent: $roomId ($roomName)")
                        navController.navigate(Routes.chat(roomId, roomName)) {
                            launchSingleTop = true
                        }
                        pendingRoomId.value = null
                        pendingRoomName.value = null
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to navigate from onNewIntent: ${e.message}")
                    }
                }
            }
        }
    }

    private fun handleNotificationIntent(intent: Intent?) {
        intent?.getStringExtra("roomId")?.let { roomId ->
            Log.d(TAG, "Received roomId from notification: $roomId")
            pendingRoomId.value = roomId
            pendingRoomName.value = intent.getStringExtra("roomName") ?: "Chat"
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun startChatService() {
        Intent(this, ChatService::class.java).also { intent ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
        }
    }

    private fun stopChatService() {
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
        }
        chatServiceState.value = null
        stopService(Intent(this, ChatService::class.java))
    }

    override fun onResume() {
        super.onResume()
        chatServiceState.value?.setAppInForeground(true)
        chatServiceState.value?.reconnectIfNeeded()
    }

    override fun onPause() {
        super.onPause()
        chatServiceState.value?.setAppInForeground(false)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
        }
        // Note: Service continues running in background
    }
}
