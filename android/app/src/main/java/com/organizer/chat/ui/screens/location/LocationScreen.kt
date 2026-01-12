package com.organizer.chat.ui.screens.location

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.organizer.chat.data.model.LocationHistoryEntry
import com.organizer.chat.data.model.UserWithLocation
import com.organizer.chat.service.ChatService
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.worker.LocationUpdateWorker
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Status colors
val StatusAvailable = Color(0xFF4CAF50)  // Green
val StatusAway = Color(0xFFFFC107)       // Yellow
val StatusBusy = Color(0xFFFF5722)       // Orange
val StatusDnd = Color(0xFFF44336)        // Red

fun getStatusColor(status: String): Color = when (status) {
    "available" -> StatusAvailable
    "away" -> StatusAway
    "busy" -> StatusBusy
    "dnd" -> StatusDnd
    else -> StatusAvailable
}

fun getStatusLabel(status: String): String = when (status) {
    "available" -> "Disponible"
    "away" -> "Absent"
    "busy" -> "Occupe"
    "dnd" -> "Ne pas deranger"
    else -> "Disponible"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationScreen(
    chatService: ChatService?,
    viewModel: LocationViewModel,
    onSettingsClick: () -> Unit,
    onMapClick: () -> Unit = {}
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    var showStatusDialog by remember { mutableStateOf(false) }

    // Permission state
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        hasLocationPermission = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true
        if (hasLocationPermission) {
            // Start location updates worker
            LocationUpdateWorker.schedule(context)
            // Update location immediately
            viewModel.updateMyLocation()
        }
    }

    // Request permission on first load, or update location if already granted
    LaunchedEffect(Unit) {
        if (!hasLocationPermission) {
            permissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                )
            )
        } else {
            LocationUpdateWorker.schedule(context)
            // Update location immediately when screen opens
            viewModel.updateMyLocation()
        }
    }

    // Status dialog
    if (showStatusDialog) {
        SetStatusDialog(
            currentStatus = uiState.myStatus,
            currentMessage = uiState.myStatusMessage,
            currentExpiresAt = uiState.myStatusExpiresAt,
            onDismiss = { showStatusDialog = false },
            onSave = { status, message, expiresAt ->
                viewModel.updateStatus(status, message, expiresAt)
                showStatusDialog = false
            },
            onClear = {
                viewModel.clearStatus()
                showStatusDialog = false
            }
        )
    }

    // Location history dialog
    uiState.selectedUserForHistory?.let { user ->
        LocationHistoryDialog(
            user = user,
            history = uiState.locationHistory,
            isLoading = uiState.isLoadingHistory,
            error = uiState.historyError,
            onDismiss = { viewModel.dismissLocationHistory() }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Users") },
                actions = {
                    IconButton(onClick = onMapClick) {
                        Icon(Icons.Default.Map, contentDescription = "Carte")
                    }
                    if (uiState.isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp).padding(4.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        IconButton(onClick = { viewModel.refresh() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Rafraichir")
                        }
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
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showStatusDialog = true },
                containerColor = AccentBlue
            ) {
                Icon(
                    imageVector = Icons.Default.Edit,
                    contentDescription = "Definir mon statut",
                    tint = Color.White
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                !hasLocationPermission -> {
                    PermissionRequest(
                        onRequestPermission = {
                            permissionLauncher.launch(
                                arrayOf(
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                                )
                            )
                        },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                uiState.isLoading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                uiState.errorMessage != null -> {
                    ErrorContent(
                        message = uiState.errorMessage!!,
                        onRetry = { viewModel.loadLocations() },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                uiState.users.isEmpty() -> {
                    EmptyContent(modifier = Modifier.align(Alignment.Center))
                }
                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(uiState.users, key = { it.id }) { user ->
                            UserLocationCard(
                                user = user,
                                onClick = { viewModel.showLocationHistory(user) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PermissionRequest(
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.LocationOff,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Permission de localisation requise",
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Pour partager votre position avec les autres utilisateurs",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(onClick = onRequestPermission) {
            Text("Autoriser")
        }
    }
}

@Composable
private fun ErrorContent(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Reessayer")
        }
    }
}

@Composable
private fun EmptyContent(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.LocationOn,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Aucune localisation",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun UserLocationCard(
    user: UserWithLocation,
    onClick: () -> Unit = {}
) {
    val statusColor = getStatusColor(user.status)
    val isExpired = user.statusExpiresAt?.let { isStatusExpired(it) } ?: false
    val effectiveStatus = if (isExpired) "available" else user.status
    val effectiveStatusMessage = if (isExpired) null else user.statusMessage
    val effectiveStatusColor = getStatusColor(effectiveStatus)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Status color indicator (dot)
            Box(
                modifier = Modifier
                    .padding(top = 6.dp)
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(effectiveStatusColor)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = user.displayName,
                        style = MaterialTheme.typography.titleMedium
                    )

                    // Tracking indicator
                    if (user.isTracking == true) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.Default.Timeline,
                            contentDescription = "En suivi",
                            modifier = Modifier.size(16.dp),
                            tint = StatusAvailable // Green
                        )
                    }

                    // Online/Offline indicator
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (user.isOnline) "en ligne" else "hors ligne",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (user.isOnline) StatusAvailable else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )

                    // Version badge
                    user.appVersion?.let { version ->
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "v${version.versionName}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            modifier = Modifier
                                .background(
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    shape = RoundedCornerShape(4.dp)
                                )
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }

                // Status message
                effectiveStatusMessage?.let { message ->
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    // Expiration time if applicable
                    if (!isExpired) {
                        user.statusExpiresAt?.let { expiresAt ->
                            val timeLeft = formatTimeLeft(expiresAt)
                            if (timeLeft != null) {
                                Text(
                                    text = "expire $timeLeft",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                )
                            }
                        }
                    }
                }

                // Location
                user.location?.let { location ->
                    Spacer(modifier = Modifier.height(4.dp))

                    // Street and city on same line
                    val locationText = buildString {
                        location.street?.let { append(it) }
                        if (location.street != null && location.city != null) append(", ")
                        location.city?.let { append(it) }
                    }

                    if (locationText.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = locationText,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // Last update time
                    location.updatedAt?.let { timestamp ->
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = formatTimestamp(timestamp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    }
                }
            }
        }
    }
}

private fun isStatusExpired(expiresAt: String): Boolean {
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val date = parser.parse(expiresAt) ?: return false
        date.time <= System.currentTimeMillis()
    } catch (e: Exception) {
        false
    }
}

private fun formatTimeLeft(expiresAt: String): String? {
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val date = parser.parse(expiresAt) ?: return null
        val diff = date.time - System.currentTimeMillis()

        if (diff <= 0) return null

        when {
            diff < 60_000 -> "dans < 1 min"
            diff < 3600_000 -> "dans ${diff / 60_000} min"
            diff < 86400_000 -> "dans ${diff / 3600_000}h"
            else -> null
        }
    } catch (e: Exception) {
        null
    }
}

private fun formatTimestamp(isoTimestamp: String): String {
    return try {
        val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
        parser.timeZone = TimeZone.getTimeZone("UTC")
        val date = parser.parse(isoTimestamp) ?: return isoTimestamp

        val now = Date()
        val diff = now.time - date.time

        when {
            diff < 60_000 -> "A l'instant"
            diff < 3600_000 -> "Il y a ${diff / 60_000} min"
            diff < 86400_000 -> "Il y a ${diff / 3600_000}h"
            else -> SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()).format(date)
        }
    } catch (e: Exception) {
        isoTimestamp
    }
}

// Status options
private val statusOptions = listOf(
    "available" to "Disponible",
    "away" to "Absent",
    "busy" to "Occupe",
    "dnd" to "Ne pas deranger"
)

// Expiration options (in minutes, 0 = no expiration)
private val expirationOptions = listOf(
    0 to "Pas d'expiration",
    30 to "30 min",
    60 to "1h",
    240 to "4h",
    -1 to "Aujourd'hui"
)

// Calculate which expiration option to select based on expiration date
private fun calculateExpirationOption(expiresAt: String?): Int {
    if (expiresAt == null) return 0

    try {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        val expirationDate = sdf.parse(expiresAt) ?: return 0

        val now = Date()
        if (expirationDate.before(now)) return 0 // Already expired

        val remainingMinutes = ((expirationDate.time - now.time) / 60000).toInt()

        // Find the closest option
        return when {
            remainingMinutes <= 0 -> 0
            remainingMinutes <= 45 -> 30      // ~30 min
            remainingMinutes <= 120 -> 60     // ~1h
            remainingMinutes <= 360 -> 240    // ~4h
            else -> -1                         // Aujourd'hui or longer
        }
    } catch (e: Exception) {
        return 0
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SetStatusDialog(
    currentStatus: String,
    currentMessage: String?,
    currentExpiresAt: String?,
    onDismiss: () -> Unit,
    onSave: (status: String, message: String?, expiresAt: String?) -> Unit,
    onClear: () -> Unit
) {
    val initialExpiration = remember(currentExpiresAt) { calculateExpirationOption(currentExpiresAt) }
    var selectedStatus by remember(currentStatus) { mutableStateOf(currentStatus) }
    var statusMessage by remember(currentMessage) { mutableStateOf(currentMessage ?: "") }
    var selectedExpiration by remember(currentExpiresAt) { mutableStateOf(initialExpiration) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Definir mon statut") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Status selection
                Text(
                    text = "Disponibilite",
                    style = MaterialTheme.typography.labelLarge
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    statusOptions.forEach { (status, label) ->
                        FilterChip(
                            selected = selectedStatus == status,
                            onClick = { selectedStatus = status },
                            label = { Text(label) },
                            leadingIcon = {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(getStatusColor(status))
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = AccentBlue.copy(alpha = 0.2f),
                                selectedLabelColor = AccentBlue
                            )
                        )
                    }
                }

                // Message input
                Text(
                    text = "Message (optionnel)",
                    style = MaterialTheme.typography.labelLarge
                )
                OutlinedTextField(
                    value = statusMessage,
                    onValueChange = { if (it.length <= 100) statusMessage = it },
                    placeholder = { Text("Que fais-tu ?") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        cursorColor = AccentBlue,
                        focusedBorderColor = AccentBlue,
                        unfocusedBorderColor = AccentBlue.copy(alpha = 0.5f)
                    )
                )
                Text(
                    text = "${statusMessage.length}/100",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.End)
                )

                // Expiration selection
                Text(
                    text = "Expiration",
                    style = MaterialTheme.typography.labelLarge
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    expirationOptions.forEach { (minutes, label) ->
                        FilterChip(
                            selected = selectedExpiration == minutes,
                            onClick = { selectedExpiration = minutes },
                            label = { Text(label) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = AccentBlue.copy(alpha = 0.2f),
                                selectedLabelColor = AccentBlue
                            )
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val expiresAt = calculateExpiresAt(selectedExpiration)
                    onSave(
                        selectedStatus,
                        statusMessage.ifBlank { null },
                        expiresAt
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = AccentBlue)
            ) {
                Text("Enregistrer")
            }
        },
        dismissButton = {
            Row {
                TextButton(
                    onClick = onClear,
                    colors = ButtonDefaults.textButtonColors(contentColor = StatusDnd)
                ) {
                    Text("Clear")
                }
                TextButton(
                    onClick = onDismiss,
                    colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
                ) {
                    Text("Annuler")
                }
            }
        }
    )
}

private fun calculateExpiresAt(minutes: Int): String? {
    if (minutes == 0) return null // No expiration

    val calendar = Calendar.getInstance()

    if (minutes == -1) {
        // "Aujourd'hui" = end of day (23:59:59)
        calendar.set(Calendar.HOUR_OF_DAY, 23)
        calendar.set(Calendar.MINUTE, 59)
        calendar.set(Calendar.SECOND, 59)
    } else {
        calendar.add(Calendar.MINUTE, minutes)
    }

    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
    formatter.timeZone = TimeZone.getTimeZone("UTC")
    return formatter.format(calendar.time)
}

@Composable
fun LocationHistoryDialog(
    user: UserWithLocation,
    history: List<LocationHistoryEntry>,
    isLoading: Boolean,
    error: String?,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Historique de ${user.displayName}") },
        text = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(400.dp)
            ) {
                when {
                    isLoading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                    error != null -> {
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                    history.isEmpty() -> {
                        Text(
                            text = "Aucun historique disponible",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                    else -> {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(history) { entry ->
                                LocationHistoryItem(entry = entry)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
            ) {
                Text("Fermer")
            }
        }
    )
}

@Composable
private fun LocationHistoryItem(entry: LocationHistoryEntry) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.LocationOn,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = AccentBlue
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column(modifier = Modifier.weight(1f)) {
                // Location text
                val locationText = buildString {
                    entry.street?.let { append(it) }
                    if (entry.street != null && entry.city != null) append(", ")
                    entry.city?.let { append(it) }
                }.ifEmpty { "Position inconnue" }

                Text(
                    text = locationText,
                    style = MaterialTheme.typography.bodyMedium
                )

                // TimeAgo timestamp + accuracy
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = formatTimestamp(entry.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                    entry.accuracy?.let { acc ->
                        Text(
                            text = " - ",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Text(
                            text = "±${acc.toInt()}m",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                    }
                }
            }
        }
    }
}
