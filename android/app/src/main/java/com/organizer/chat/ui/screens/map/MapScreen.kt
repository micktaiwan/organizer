package com.organizer.chat.ui.screens.map

import android.content.Context
import android.graphics.drawable.Drawable
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.organizer.chat.R
import com.organizer.chat.data.model.TrackPoint
import com.organizer.chat.data.model.TrackSummary
import com.organizer.chat.data.model.TrackWithUserInfo
import com.organizer.chat.data.model.UserWithLocation
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.Charcoal
import com.organizer.chat.ui.theme.CharcoalLight
import com.organizer.chat.ui.theme.OnlineGreen
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polyline

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(
    viewModel: MapViewModel,
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    // OSMDroid configuration
    LaunchedEffect(Unit) {
        Configuration.getInstance().userAgentValue = context.packageName
    }

    // Show error in snackbar
    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { error ->
            snackbarHostState.showSnackbar(error)
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Carte") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Retour")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.showHistoryDialog() }) {
                        Icon(
                            imageVector = Icons.Default.History,
                            contentDescription = "Historique",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Charcoal,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        snackbarHost = {
            SnackbarHost(snackbarHostState) { data ->
                Snackbar(
                    snackbarData = data,
                    containerColor = CharcoalLight,
                    contentColor = Color.White
                )
            }
        },
        floatingActionButton = {
            // Hide FAB in history mode
            if (uiState.viewingHistoryTrack == null) {
                FloatingActionButton(
                    onClick = {
                        if (uiState.isMyTrackingActive) {
                            viewModel.stopTracking()
                        } else {
                            viewModel.showTrackingDialog()
                        }
                    },
                    containerColor = if (uiState.isMyTrackingActive) Color(0xFFE57373) else AccentBlue
                ) {
                    Icon(
                        imageVector = if (uiState.isMyTrackingActive) Icons.Default.Stop else Icons.Default.Timeline,
                        contentDescription = if (uiState.isMyTrackingActive) "Arreter le suivi" else "Activer le suivi",
                        tint = Color.White
                    )
                }
            }
        },
        containerColor = Charcoal
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            if (uiState.isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = AccentBlue
                )
            } else {
                // OSMDroid MapView
                OsmMapView(
                    users = uiState.users,
                    tracks = uiState.tracks,
                    trackingUsers = uiState.trackingUsers,
                    historyTrackId = uiState.viewingHistoryTrack?.let { "history_${it.id}" },
                    modifier = Modifier.fillMaxSize()
                )

                // Legend (only in live mode)
                if (uiState.viewingHistoryTrack == null && uiState.trackingUsers.isNotEmpty()) {
                    Card(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp),
                        colors = CardDefaults.cardColors(containerColor = CharcoalLight.copy(alpha = 0.9f))
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            Text(
                                text = "En suivi:",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.7f)
                            )
                            uiState.users
                                .filter { it.id in uiState.trackingUsers }
                                .forEach { user ->
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(vertical = 2.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(getTrackColor(user.id))
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = user.displayName,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = Color.White
                                        )
                                    }
                                }
                        }
                    }
                }

                // History mode banner (above FAB)
                uiState.viewingHistoryTrack?.let { track ->
                    HistoryModeBanner(
                        track = track,
                        onClose = { viewModel.exitHistoryMode() },
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 80.dp) // Above the FAB
                    )
                }
            }
        }
    }

    // Tracking duration dialog
    if (uiState.showTrackingDialog) {
        TrackingDurationDialog(
            onDismiss = { viewModel.dismissTrackingDialog() },
            onConfirm = { minutes -> viewModel.startTracking(minutes) }
        )
    }

    // Track history dialog
    if (uiState.showHistoryDialog) {
        TrackHistoryDialog(
            tracks = uiState.trackHistory,
            isLoading = uiState.isLoadingHistory,
            onDismiss = { viewModel.dismissHistoryDialog() },
            onSelectTrack = { track -> viewModel.selectHistoryTrack(track) }
        )
    }
}

@Composable
private fun OsmMapView(
    users: List<UserWithLocation>,
    tracks: Map<String, List<TrackPoint>>,
    trackingUsers: Set<String>,
    historyTrackId: String?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var hasInitializedCenter by remember { mutableStateOf(false) }
    var lastHistoryTrackId by remember { mutableStateOf<String?>(null) }

    // Keep references to existing overlays to update in-place
    val markersMap = remember { mutableMapOf<String, Marker>() }
    val polylinesMap = remember { mutableMapOf<String, Polyline>() }
    // Cache marker states to avoid recreating Drawables
    val markerStatesCache = remember { mutableMapOf<String, Pair<Boolean, Boolean>>() }

    DisposableEffect(Unit) {
        onDispose {
            mapView?.onDetach()
        }
    }

    AndroidView(
        factory = { ctx ->
            MapView(ctx).apply {
                setTileSource(TileSourceFactory.MAPNIK)
                setMultiTouchControls(true)
                controller.setZoom(14.0)

                // Default to Paris
                controller.setCenter(GeoPoint(48.8566, 2.3522))

                mapView = this
            }
        },
        modifier = modifier,
        update = { map ->
            // === Update polylines ===
            val currentTrackIds = tracks.keys.toSet()
            val existingTrackIds = polylinesMap.keys.toSet()

            // Remove polylines for tracks that no longer exist
            (existingTrackIds - currentTrackIds).forEach { trackId ->
                polylinesMap[trackId]?.let { map.overlays.remove(it) }
                polylinesMap.remove(trackId)
            }

            // Add or update polylines
            tracks.forEach { (trackId, points) ->
                if (points.size >= 2) {
                    val geoPoints = points.map { GeoPoint(it.lat, it.lng) }
                    val existingPolyline = polylinesMap[trackId]

                    if (existingPolyline != null) {
                        // Update existing polyline
                        existingPolyline.setPoints(geoPoints)
                    } else {
                        // Create new polyline
                        val polyline = Polyline().apply {
                            setPoints(geoPoints)
                            outlinePaint.color = getTrackColor(trackId).toArgb()
                            outlinePaint.strokeWidth = 8f
                        }
                        polylinesMap[trackId] = polyline
                        map.overlays.add(0, polyline) // Add at bottom so markers are on top
                    }
                }
            }

            // === Update markers ===
            val currentUserIds = users.mapNotNull { if (it.location != null) it.id else null }.toSet()
            val existingUserIds = markersMap.keys.toSet()

            // Remove markers for users that no longer exist or have no location
            (existingUserIds - currentUserIds).forEach { userId ->
                markersMap[userId]?.let { map.overlays.remove(it) }
                markersMap.remove(userId)
                markerStatesCache.remove(userId)
            }

            // Add or update markers
            users.forEach { user ->
                user.location?.let { location ->
                    val existingMarker = markersMap[user.id]
                    val newPosition = GeoPoint(location.lat, location.lng)
                    val isTracking = user.id in trackingUsers
                    val currentState = isTracking to user.isOnline
                    val cachedState = markerStatesCache[user.id]

                    if (existingMarker != null) {
                        // Update existing marker only if data changed
                        if (existingMarker.position.latitude != location.lat ||
                            existingMarker.position.longitude != location.lng) {
                            existingMarker.position = newPosition
                        }
                        existingMarker.title = user.displayName
                        existingMarker.snippet = listOfNotNull(location.street, location.city).joinToString(", ")
                        // Only recreate icon if state changed
                        if (cachedState != currentState) {
                            existingMarker.icon = getMarkerIcon(context, isTracking, user.isOnline)
                            markerStatesCache[user.id] = currentState
                        }
                    } else {
                        // Create new marker
                        val marker = Marker(map).apply {
                            position = newPosition
                            title = user.displayName
                            snippet = listOfNotNull(location.street, location.city).joinToString(", ")
                            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                            icon = getMarkerIcon(context, isTracking, user.isOnline)
                        }
                        markersMap[user.id] = marker
                        markerStatesCache[user.id] = currentState
                        map.overlays.add(marker)
                    }
                }
            }

            // === Center map ===
            // History mode: center on track when entering
            if (historyTrackId != null && historyTrackId != lastHistoryTrackId) {
                tracks[historyTrackId]?.let { points ->
                    if (points.size >= 2) {
                        val boundingBox = org.osmdroid.util.BoundingBox.fromGeoPoints(
                            points.map { GeoPoint(it.lat, it.lng) }
                        )
                        map.zoomToBoundingBox(boundingBox, true, 100)
                    }
                }
                lastHistoryTrackId = historyTrackId
                hasInitializedCenter = true
            } else if (historyTrackId == null && lastHistoryTrackId != null) {
                // Exiting history mode - reset for next live center
                lastHistoryTrackId = null
                hasInitializedCenter = false
            }

            // Live mode: center on first user with location - only once
            if (historyTrackId == null && !hasInitializedCenter && users.isNotEmpty()) {
                users.firstOrNull { it.location != null }?.location?.let { location ->
                    map.controller.setCenter(GeoPoint(location.lat, location.lng))
                    map.controller.setZoom(14.0)
                    hasInitializedCenter = true
                }
            }

            map.invalidate()
        }
    )
}

@Composable
private fun TrackingDurationDialog(
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit
) {
    val durations = listOf(
        30 to "30 minutes",
        60 to "1 heure",
        120 to "2 heures",
        240 to "4 heures"
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Activer le suivi",
                color = Color.White
            )
        },
        text = {
            Column {
                Text(
                    text = "Choisissez la duree du suivi :",
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))
                durations.forEach { (minutes, label) ->
                    TextButton(
                        onClick = { onConfirm(minutes) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = AccentBlue
                        )
                    ) {
                        Text(
                            text = label,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = AccentBlue.copy(alpha = 0.7f)
                )
            ) {
                Text("Annuler")
            }
        },
        containerColor = CharcoalLight,
        shape = RoundedCornerShape(16.dp)
    )
}

@Composable
private fun TrackHistoryDialog(
    tracks: List<TrackSummary>,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onSelectTrack: (TrackSummary) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Historique des trajets",
                color = Color.White
            )
        },
        text = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(400.dp)
            ) {
                when {
                    isLoading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = AccentBlue
                        )
                    }
                    tracks.isEmpty() -> {
                        Text(
                            text = "Aucun trajet enregistré",
                            color = Color.White.copy(alpha = 0.7f),
                            modifier = Modifier.align(Alignment.Center)
                        )
                    }
                    else -> {
                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(tracks) { track ->
                                TrackHistoryItem(
                                    track = track,
                                    onClick = { onSelectTrack(track) }
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = AccentBlue
                )
            ) {
                Text("Fermer")
            }
        },
        containerColor = CharcoalLight,
        shape = RoundedCornerShape(16.dp)
    )
}

@Composable
private fun TrackHistoryItem(
    track: TrackSummary,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = Charcoal
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Track color indicator
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(getTrackColor(track.userId))
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = track.displayName,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = Color.White
                    )
                    if (track.isActive) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "en cours",
                            style = MaterialTheme.typography.labelSmall,
                            color = OnlineGreen
                        )
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row {
                    // Date
                    Text(
                        text = formatTrackDate(track.startedAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.7f)
                    )

                    // Duration if ended
                    track.endedAt?.let { endedAt ->
                        Text(
                            text = " • ${formatDuration(track.startedAt, endedAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.5f)
                        )
                    }

                    // Points count
                    Text(
                        text = " • ${track.pointsCount} pts",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.5f)
                    )
                }
            }
        }
    }
}

private fun formatTrackDate(isoDate: String): String {
    return try {
        val instant = java.time.Instant.parse(isoDate)
        val localDateTime = java.time.LocalDateTime.ofInstant(instant, java.time.ZoneId.systemDefault())
        val formatter = java.time.format.DateTimeFormatter.ofPattern("dd/MM HH:mm")
        localDateTime.format(formatter)
    } catch (e: Exception) {
        isoDate.take(16)
    }
}

private fun formatDuration(startIso: String, endIso: String): String {
    return try {
        val start = java.time.Instant.parse(startIso)
        val end = java.time.Instant.parse(endIso)
        val durationMinutes = java.time.Duration.between(start, end).toMinutes()

        when {
            durationMinutes < 60 -> "${durationMinutes}min"
            else -> "${durationMinutes / 60}h${durationMinutes % 60}min"
        }
    } catch (e: Exception) {
        ""
    }
}

@Composable
private fun HistoryModeBanner(
    track: TrackWithUserInfo,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        colors = CardDefaults.cardColors(containerColor = AccentBlue),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.History,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Trajet de ${track.displayName}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = Color.White
                )
                Text(
                    text = "${formatTrackDate(track.startedAt)} • ${track.points.size} points",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.8f)
                )
            }

            IconButton(onClick = onClose) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Fermer",
                    tint = Color.White
                )
            }
        }
    }
}

// Color palette for different users' tracks
private val trackColors = listOf(
    Color(0xFF4CAF50), // Green
    Color(0xFF2196F3), // Blue
    Color(0xFFFF9800), // Orange
    Color(0xFFE91E63), // Pink
    Color(0xFF9C27B0), // Purple
    Color(0xFF00BCD4), // Cyan
    Color(0xFFFFEB3B), // Yellow
    Color(0xFF795548)  // Brown
)

private fun getTrackColor(userId: String): Color {
    val index = userId.hashCode().let { if (it < 0) -it else it } % trackColors.size
    return trackColors[index]
}

private fun getMarkerIcon(context: Context, isTracking: Boolean, isOnline: Boolean): Drawable? {
    // Use proper map marker icon (pin shape with point at bottom-center)
    val drawable = ContextCompat.getDrawable(context, R.drawable.ic_map_marker)?.mutate()
    drawable?.setTint(
        when {
            isTracking -> Color(0xFF4CAF50).toArgb()
            isOnline -> AccentBlue.toArgb()
            else -> Color.Gray.toArgb()
        }
    )
    return drawable
}
