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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import com.organizer.chat.ui.theme.AccentBlue
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import com.organizer.chat.data.model.AppUpdateInfo
import com.organizer.chat.data.model.DownloadStatus
import com.organizer.chat.data.model.SharedContent
import com.organizer.chat.data.model.Room
import com.organizer.chat.data.repository.AuthRepository
import com.organizer.chat.data.repository.MessageRepository
import com.organizer.chat.data.repository.NoteRepository
import com.organizer.chat.data.repository.RoomRepository
import com.organizer.chat.data.repository.UpdateRepository
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.components.UpdateProgressDialog
import com.organizer.chat.ui.components.ShareHandlerDialog
import com.organizer.chat.ui.components.IncomingCallDialog
import com.organizer.chat.ui.navigation.NavGraph
import com.organizer.chat.ui.screens.call.CallScreen
import com.organizer.chat.webrtc.CallManager
import com.organizer.chat.webrtc.CallState
import com.organizer.chat.ui.navigation.Routes
import com.organizer.chat.ui.theme.OrganizerChatTheme
import com.organizer.chat.util.AppPreferences
import com.organizer.chat.util.UpdateManager
import com.organizer.chat.util.SharedContentManager
import com.organizer.chat.worker.LocationUpdateWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var tokenManager: com.organizer.chat.util.TokenManager
    private lateinit var authRepository: AuthRepository
    private lateinit var roomRepository: RoomRepository
    private lateinit var messageRepository: MessageRepository
    private lateinit var noteRepository: NoteRepository
    private lateinit var updateRepository: UpdateRepository
    private lateinit var updateManager: UpdateManager
    private lateinit var appPreferences: AppPreferences

    // Use mutableStateOf so Compose recomposes when service binds
    private var chatServiceState = mutableStateOf<ChatService?>(null)
    private var serviceBound = false

    // Store pending room to navigate to (from notification)
    private var pendingRoomId = mutableStateOf<String?>(null)
    private var pendingRoomName = mutableStateOf<String?>(null)
    private var navControllerRef: NavHostController? = null

    // Store update info to show in dialog
    private var updateInfo = mutableStateOf<AppUpdateInfo?>(null)

    // Store shared content from other apps
    private var sharedContent = mutableStateOf<SharedContent?>(null)
    private var availableRooms = mutableStateOf<List<Room>>(emptyList())

    // Call manager for WebRTC
    private var callManagerState = mutableStateOf<CallManager?>(null)
    private val callEventJobs = mutableListOf<kotlinx.coroutines.Job>()

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as ChatService.ChatBinder
            chatServiceState.value = binder.getService()
            serviceBound = true
            chatServiceState.value?.setAppInForeground(true)
            chatServiceState.value?.reconnectIfNeeded()

            // Initialize CallManager
            chatServiceState.value?.socketManager?.let { socketManager ->
                callManagerState.value = CallManager(this@MainActivity, socketManager)
                setupCallEventListeners()
            }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            // Cancel all call event listeners to prevent duplicate handling
            callEventJobs.forEach { it.cancel() }
            callEventJobs.clear()

            chatServiceState.value = null
            callManagerState.value = null
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
        noteRepository = NoteRepository()
        updateRepository = UpdateRepository(applicationContext)
        updateManager = UpdateManager(applicationContext)
        appPreferences = AppPreferences(applicationContext)

        // Request notification permission on Android 13+
        requestNotificationPermission()

        // Determine start destination
        val isLoggedIn = runBlocking { authRepository.isLoggedIn() }
        val startDestination = if (isLoggedIn) Routes.HOME else Routes.LOGIN

        // Check if launched from notification with roomId
        handleNotificationIntent(intent)

        // Check if launched from share intent
        handleShareIntent(intent)

        // Start and bind to ChatService if logged in
        if (isLoggedIn) {
            startChatService()
            checkForUpdateOnLaunch()

            // Check for pending download (interrupted download recovery)
            updateManager.checkPendingDownload()
        }

        setContent {
            OrganizerChatTheme {
                val navController = rememberNavController()
                // Read from state so we recompose when service binds
                val chatService by chatServiceState
                val pendingRoom by pendingRoomId
                val pendingName by pendingRoomName
                val currentUpdateInfo by updateInfo
                val currentSharedContent by sharedContent
                val rooms by availableRooms
                val callManager by callManagerState

                // Observer for download state (auto-update progress)
                val downloadState by updateManager.downloadState.collectAsState()

                // Session expired message
                var sessionExpiredMessage by remember { mutableStateOf<String?>(null) }

                // Listen for session expired events
                LaunchedEffect(Unit) {
                    tokenManager.sessionExpired.collect { reason ->
                        Log.d(TAG, "Session expired: $reason")
                        sessionExpiredMessage = reason
                        // Clear auth and navigate to login
                        authRepository.logout()
                        stopChatService()
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                }

                // Show session expired dialog
                sessionExpiredMessage?.let { message ->
                    AlertDialog(
                        onDismissRequest = { sessionExpiredMessage = null },
                        title = { Text("Session expirée") },
                        text = { Text(message) },
                        confirmButton = {
                            TextButton(
                                onClick = { sessionExpiredMessage = null },
                                colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
                            ) {
                                Text("OK")
                            }
                        }
                    )
                }

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

                // Show update dialog based on download state
                when (val status = downloadState.status) {
                    is DownloadStatus.Idle -> {
                        // No download in progress - show update available dialog if needed
                        currentUpdateInfo?.let { info ->
                            UpdateAvailableDialog(
                                updateInfo = info,
                                appPreferences = appPreferences,
                                onDownload = {
                                    updateManager.downloadAndInstall(info)
                                    updateInfo.value = null
                                },
                                onDismiss = {
                                    updateInfo.value = null
                                }
                            )
                        }
                    }
                    else -> {
                        // Download in progress/verifying/ready/error - show progress dialog
                        UpdateProgressDialog(
                            state = downloadState,
                            onCancel = updateManager::cancelDownload,
                            onRetry = updateManager::retryDownload,
                            onInstall = updateManager::installApk,
                            onDismiss = { /* Keep dialog visible */ }
                        )
                    }
                }

                // Show share dialog if shared content is received
                currentSharedContent?.let { content ->
                    ShareHandlerDialog(
                        sharedContent = content,
                        rooms = rooms,
                        onRoomSelected = { room ->
                            Log.d(TAG, "Room selected for sharing: ${room.name}")
                            // Store the shared content to be picked up by ChatScreen
                            SharedContentManager.setPendingContent(content, room.id)
                            // Navigate to the room
                            navController.navigate(Routes.chat(room.id, room.name)) {
                                launchSingleTop = true
                            }
                            sharedContent.value = null
                            availableRooms.value = emptyList()
                        },
                        onDismiss = {
                            sharedContent.value = null
                            availableRooms.value = emptyList()
                        }
                    )
                }

                NavGraph(
                    navController = navController,
                    startDestination = startDestination,
                    tokenManager = tokenManager,
                    chatService = chatService,
                    authRepository = authRepository,
                    roomRepository = roomRepository,
                    messageRepository = messageRepository,
                    noteRepository = noteRepository,
                    appPreferences = appPreferences,
                    onLoginSuccess = {
                        startChatService()
                        checkForUpdateOnLaunch()
                        updateManager.checkPendingDownload()
                    },
                    onLogout = {
                        stopChatService()
                    },
                    onCallClick = { userId, username ->
                        callManager?.startCall(userId, username, withCamera = false)
                    }
                )

                // Call UI - rendered AFTER NavGraph so it appears on top
                callManager?.let { manager ->
                    val currentCallState by manager.callState.collectAsState()
                    val remoteVideoTrack by manager.remoteVideoTrack.collectAsState()

                    when (val state = currentCallState) {
                        is CallState.Incoming -> {
                            IncomingCallDialog(
                                callerName = state.fromUsername,
                                withCamera = state.withCamera,
                                onAccept = { manager.acceptCall(state.withCamera) },
                                onReject = { manager.rejectCall() }
                            )
                        }
                        is CallState.Calling, is CallState.Connected -> {
                            CallScreen(
                                callState = state,
                                remoteVideoTrack = remoteVideoTrack,
                                callManager = manager,
                                onEndCall = { manager.endCall() }
                            )
                        }
                        CallState.Idle -> {
                            // No call UI
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        Log.d(TAG, "onNewIntent called")
        handleNotificationIntent(intent)
        handleShareIntent(intent)

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

    @Suppress("DEPRECATION")
    private fun handleShareIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE) {
            Log.d(TAG, "Received share intent: ${intent.action}, type: ${intent.type}")

            when {
                intent.type?.startsWith("text/") == true -> {
                    intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
                        Log.d(TAG, "Shared text: $text")
                        sharedContent.value = SharedContent.Text(text)
                        loadRoomsForSharing()
                    }
                }
                intent.type?.startsWith("image/") == true -> {
                    if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
                        val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
                        } else {
                            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                        }
                        uris?.let {
                            Log.d(TAG, "Shared ${it.size} images")
                            sharedContent.value = SharedContent.MultipleImages(it)
                            loadRoomsForSharing()
                        }
                    } else {
                        val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
                        } else {
                            intent.getParcelableExtra(Intent.EXTRA_STREAM)
                        }
                        uri?.let {
                            Log.d(TAG, "Shared single image: $it")
                            sharedContent.value = SharedContent.SingleImage(it)
                            loadRoomsForSharing()
                        }
                    }
                }
            }
            // Clear intent action to prevent re-processing on activity recreation
            intent.action = null
        }
    }

    private fun loadRoomsForSharing() {
        lifecycleScope.launch {
            roomRepository.getRooms().fold(
                onSuccess = { rooms ->
                    Log.d(TAG, "Loaded ${rooms.size} rooms for sharing")
                    availableRooms.value = rooms
                },
                onFailure = { error ->
                    Log.e(TAG, "Failed to load rooms for sharing: ${error.message}")
                    availableRooms.value = emptyList()
                }
            )
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

        // Start location update worker if permission granted
        if (hasLocationPermission()) {
            LocationUpdateWorker.schedule(this)
        }
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun stopChatService() {
        if (serviceBound) {
            unbindService(serviceConnection)
            serviceBound = false
        }
        chatServiceState.value = null
        stopService(Intent(this, ChatService::class.java))

        // Cancel location update worker
        LocationUpdateWorker.cancel(this)
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

    private fun checkForUpdateOnLaunch() {
        lifecycleScope.launch {
            delay(2000) // Wait 2 seconds after app launch
            updateRepository.checkForUpdate().fold(
                onSuccess = { result ->
                    if (result.updateAvailable && result.updateInfo != null) {
                        Log.d(TAG, "Update available: ${result.updateInfo.version}")
                        // Show update dialog with release notes
                        updateInfo.value = result.updateInfo
                    }
                },
                onFailure = { e ->
                    Log.e(TAG, "Failed to check for updates: ${e.message}")
                }
            )
        }
    }

    private fun setupCallEventListeners() {
        val socketManager = chatServiceState.value?.socketManager ?: return
        val callManager = callManagerState.value ?: return

        // Cancel any existing jobs to prevent duplicate handling
        callEventJobs.forEach { it.cancel() }
        callEventJobs.clear()

        callEventJobs += lifecycleScope.launch {
            socketManager.callRequest.collect { event ->
                callManager.handleCallRequest(event.from, event.fromUsername, event.withCamera)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.callAccept.collect { event ->
                callManager.handleCallAccept(event.from, event.withCamera)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.callReject.collect { event ->
                callManager.handleCallReject(event.from)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.callEnd.collect { event ->
                callManager.handleCallEnd(event.from)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.webrtcOffer.collect { event ->
                callManager.handleWebRTCOffer(event.from, event.offer)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.webrtcAnswer.collect { event ->
                callManager.handleWebRTCAnswer(event.from, event.answer)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.webrtcIceCandidate.collect { event ->
                callManager.handleIceCandidate(event.from, event.candidate, event.sdpMid, event.sdpMLineIndex)
            }
        }

        callEventJobs += lifecycleScope.launch {
            socketManager.webrtcClose.collect { event ->
                callManager.handleWebRTCClose(event.from)
            }
        }
    }
}

@Composable
private fun UpdateAvailableDialog(
    updateInfo: AppUpdateInfo,
    appPreferences: AppPreferences,
    onDownload: () -> Unit,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()

    // Save release notes when dialog is shown
    LaunchedEffect(updateInfo) {
        appPreferences.saveReleaseNotes(updateInfo.version, updateInfo.releaseNotes)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Mise à jour disponible")
        },
        text = {
            Column {
                Text(
                    text = "Version ${updateInfo.version}",
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = updateInfo.releaseNotes,
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Taille: ${updateInfo.fileSize / (1024 * 1024)} MB",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDownload,
                colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
            ) {
                Text("Télécharger")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
            ) {
                Text("Plus tard")
            }
        }
    )
}
