package com.organizer.chat.ui.screens.gallery

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Surface
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.organizer.chat.data.api.ApiClient
import com.organizer.chat.data.model.GalleryFile
import com.organizer.chat.ui.components.FullscreenImagePagerDialog
import com.organizer.chat.ui.theme.AccentBlue
import com.organizer.chat.ui.theme.Charcoal
import com.organizer.chat.ui.theme.CharcoalLight
import com.organizer.chat.util.FileOpener
import com.organizer.chat.util.ImageDownloader

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GalleryScreen(
    viewModel: GalleryViewModel,
    onSettingsClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Refresh when screen becomes visible
    LaunchedEffect(Unit) {
        viewModel.refreshIfNeeded()
    }

    // Filter only images for the pager
    val imageFiles = remember(uiState.files) {
        uiState.files.filter { it.type == "image" }
    }
    val imageUrls = remember(imageFiles) {
        imageFiles.map { file ->
            if (file.url.startsWith("/")) {
                ApiClient.getBaseUrl().trimEnd('/') + file.url
            } else {
                file.url
            }
        }
    }

    var selectedImageIndex by rememberSaveable { mutableStateOf<Int?>(null) }
    var selectedVideoFile by remember { mutableStateOf<GalleryFile?>(null) }

    // Grid state for scroll control
    val gridState = rememberLazyGridState()

    // Scroll to top when filter changes
    LaunchedEffect(uiState.filter) {
        gridState.scrollToItem(0)
    }

    // State for delete confirmation dialog
    var pendingDeleteIndex by remember { mutableStateOf<Int?>(null) }
    var dontShowDeleteWarningAgain by remember { mutableStateOf(false) }

    // Function to handle delete request
    fun handleDeleteRequest(index: Int) {
        if (viewModel.hasSeenDeleteWarning) {
            // Skip confirmation dialog
            val file = imageFiles.getOrNull(index) ?: return
            viewModel.deleteFile(file.id) {
                // After delete: navigate to next image or close if last
                val newImageCount = imageFiles.size - 1
                if (newImageCount == 0) {
                    selectedImageIndex = null
                } else if (index >= newImageCount) {
                    // Was last image, go to previous
                    selectedImageIndex = newImageCount - 1
                }
                // Otherwise stay at same index (next image will slide in)
            }
        } else {
            // Show confirmation dialog
            pendingDeleteIndex = index
        }
    }

    // Delete confirmation dialog
    pendingDeleteIndex?.let { index ->
        AlertDialog(
            onDismissRequest = { pendingDeleteIndex = null },
            title = { Text("Supprimer l'image") },
            text = {
                Column {
                    Text("Voulez-vous vraiment supprimer cette image ? Le message dans le chat sera conservé mais affichera \"Fichier supprimé\".")
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { dontShowDeleteWarningAgain = !dontShowDeleteWarningAgain }
                    ) {
                        Checkbox(
                            checked = dontShowDeleteWarningAgain,
                            onCheckedChange = { dontShowDeleteWarningAgain = it },
                            colors = CheckboxDefaults.colors(
                                checkedColor = AccentBlue,
                                uncheckedColor = AccentBlue.copy(alpha = 0.6f)
                            )
                        )
                        Text(
                            text = "Ne plus afficher",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (dontShowDeleteWarningAgain) {
                            viewModel.setDeleteWarningSeen()
                        }
                        val file = imageFiles.getOrNull(index)
                        pendingDeleteIndex = null
                        if (file != null) {
                            viewModel.deleteFile(file.id) {
                                // After delete: navigate to next image or close if last
                                val newImageCount = imageFiles.size - 1
                                if (newImageCount == 0) {
                                    selectedImageIndex = null
                                } else if (index >= newImageCount) {
                                    // Was last image, go to previous
                                    selectedImageIndex = newImageCount - 1
                                }
                            }
                        }
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Supprimer")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingDeleteIndex = null },
                    colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
                ) {
                    Text("Annuler")
                }
            }
        )
    }

    // Show delete error
    LaunchedEffect(uiState.deleteError) {
        uiState.deleteError?.let { error ->
            Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
            viewModel.clearError()
        }
    }

    // Handle image fullscreen dialog with pager
    selectedImageIndex?.let { index ->
        FullscreenImagePagerDialog(
            imageUrls = imageUrls,
            initialIndex = index,
            onDismiss = { selectedImageIndex = null },
            onDownload = { currentIndex ->
                val imageUrl = imageUrls[currentIndex]
                when (val result = ImageDownloader.downloadImage(context, imageUrl)) {
                    is ImageDownloader.DownloadResult.Success -> {
                        Toast.makeText(context, "Image enregistree: ${result.fileName}", Toast.LENGTH_SHORT).show()
                    }
                    is ImageDownloader.DownloadResult.Error -> {
                        Toast.makeText(context, "Erreur: ${result.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onDelete = { currentIndex ->
                handleDeleteRequest(currentIndex)
            },
            canDelete = { currentIndex ->
                imageFiles.getOrNull(currentIndex)?.let { viewModel.canDeleteFile(it) } ?: false
            }
        )
    }

    // Handle video fullscreen dialog
    selectedVideoFile?.let { file ->
        val videoUrl = if (file.url.startsWith("/")) {
            ApiClient.getBaseUrl().trimEnd('/') + file.url
        } else {
            file.url
        }
        FullscreenVideoDialog(
            videoUrl = videoUrl,
            onDismiss = { selectedVideoFile = null }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Gallery") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Charcoal
                ),
                actions = {
                    IconButton(onClick = onSettingsClick) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Settings"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Filter chips
            FilterChipsRow(
                currentFilter = uiState.filter,
                onFilterChange = { viewModel.setFilter(it) }
            )

            // Content
            PullToRefreshBox(
                isRefreshing = uiState.isRefreshing,
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.fillMaxSize()
            ) {
                when {
                    uiState.isLoading && uiState.files.isEmpty() -> {
                        LoadingState()
                    }
                    uiState.errorMessage != null && uiState.files.isEmpty() -> {
                        ErrorState(
                            message = uiState.errorMessage!!,
                            onRetry = { viewModel.loadFiles() }
                        )
                    }
                    uiState.files.isEmpty() -> {
                        EmptyState(filter = uiState.filter)
                    }
                    else -> {
                        GalleryGrid(
                            files = uiState.files,
                            gridState = gridState,
                            hasMorePages = uiState.hasMorePages,
                            onLoadMore = { viewModel.loadMore() },
                            onImageClick = { file ->
                                // Find index in imageFiles list
                                val index = imageFiles.indexOfFirst { it.id == file.id }
                                if (index >= 0) {
                                    selectedImageIndex = index
                                }
                            },
                            onVideoClick = { file ->
                                selectedVideoFile = file
                            },
                            onFileClick = { file ->
                                FileOpener.downloadAndOpenFile(
                                    context = context,
                                    fileUrl = file.url,
                                    fileName = file.fileName ?: "file_${file.id}",
                                    mimeType = file.mimeType
                                )
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChipsRow(
    currentFilter: GalleryFilter,
    onFilterChange: (GalleryFilter) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        GalleryFilter.entries.forEach { filter ->
            FilterChip(
                selected = currentFilter == filter,
                onClick = { onFilterChange(filter) },
                label = {
                    Text(
                        when (filter) {
                            GalleryFilter.ALL -> "Tous"
                            GalleryFilter.IMAGES -> "Images"
                            GalleryFilter.VIDEOS -> "Vidéos"
                            GalleryFilter.FILES -> "Fichiers"
                        }
                    )
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = AccentBlue,
                    selectedLabelColor = Color.White
                )
            )
        }
    }
}

@Composable
private fun GalleryGrid(
    files: List<GalleryFile>,
    gridState: LazyGridState,
    hasMorePages: Boolean,
    onLoadMore: () -> Unit,
    onImageClick: (GalleryFile) -> Unit,
    onVideoClick: (GalleryFile) -> Unit,
    onFileClick: (GalleryFile) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        state = gridState,
        contentPadding = PaddingValues(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(files, key = { it.id }) { file ->
            GalleryItem(
                file = file,
                onClick = {
                    when (file.type) {
                        "image" -> onImageClick(file)
                        "video" -> onVideoClick(file)
                        else -> onFileClick(file)
                    }
                }
            )
        }

        // "Load more" button
        if (hasMorePages) {
            item(span = { GridItemSpan(3) }) {
                TextButton(
                    onClick = onLoadMore,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
                ) {
                    Text("Charger plus")
                }
            }
        }
    }
}

@Composable
private fun GalleryItem(
    file: GalleryFile,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(4.dp))
            .background(CharcoalLight)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        when (file.type) {
            "image" -> {
                val imageUrl = if (file.url.startsWith("/")) {
                    ApiClient.getBaseUrl().trimEnd('/') + file.url
                } else {
                    file.url
                }

                AsyncImage(
                    model = imageUrl,
                    contentDescription = file.caption ?: "Image",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            }
            "video" -> {
                // Video thumbnail or placeholder
                val thumbnailUrl = file.thumbnailUrl?.let {
                    if (it.startsWith("/")) {
                        ApiClient.getBaseUrl().trimEnd('/') + it
                    } else {
                        it
                    }
                }

                if (thumbnailUrl != null) {
                    AsyncImage(
                        model = thumbnailUrl,
                        contentDescription = file.caption ?: "Video",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    // Placeholder when no thumbnail
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                            tint = Color.Gray
                        )
                    }
                }

                // Play button overlay
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(
                        shape = CircleShape,
                        color = Color.Black.copy(alpha = 0.6f),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Play video",
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }

                // Duration badge
                if (file.duration != null && file.duration > 0) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp),
                        shape = RoundedCornerShape(4.dp),
                        color = Color.Black.copy(alpha = 0.7f)
                    ) {
                        Text(
                            text = formatVideoDuration(file.duration),
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                            fontSize = 10.sp
                        )
                    }
                }
            }
            else -> {
                // File item
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = getFileIcon(file.mimeType),
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = AccentBlue
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = file.fileName ?: "Fichier",
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center,
                        fontSize = 10.sp
                    )
                }
            }
        }
    }
}

private fun formatVideoDuration(seconds: Double): String {
    val totalSeconds = seconds.toInt()
    val minutes = totalSeconds / 60
    val secs = totalSeconds % 60
    return "%d:%02d".format(minutes, secs)
}

@Composable
private fun LoadingState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(color = AccentBlue)
    }
}

@Composable
private fun ErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.error
            )
            IconButton(onClick = onRetry) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Reessayer",
                    tint = AccentBlue
                )
            }
        }
    }
}

@Composable
private fun EmptyState(filter: GalleryFilter) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),  // Enable pull-to-refresh
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = when (filter) {
                GalleryFilter.ALL -> "Aucun fichier"
                GalleryFilter.IMAGES -> "Aucune image"
                GalleryFilter.VIDEOS -> "Aucune vidéo"
                GalleryFilter.FILES -> "Aucun fichier"
            },
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
        )
    }
}

private fun getFileIcon(mimeType: String?): ImageVector {
    return when {
        mimeType == null -> Icons.Default.InsertDriveFile
        mimeType.contains("pdf") -> Icons.Default.PictureAsPdf
        else -> Icons.Default.InsertDriveFile
    }
}

@Composable
private fun FullscreenVideoDialog(
    videoUrl: String,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    // Create ExoPlayer instance
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            val mediaItem = MediaItem.fromUri(videoUrl)
            setMediaItem(mediaItem)
            prepare()
            playWhenReady = true
        }
    }

    // Release player when dialog closes
    DisposableEffect(Unit) {
        onDispose {
            exoPlayer.release()
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        layoutParams = android.widget.FrameLayout.LayoutParams(
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                            android.view.ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        player = exoPlayer
                        useController = true
                        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                        setEnableComposeSurfaceSyncWorkaround(true)
                        // RESIZE_MODE_ZOOM fixes video not scaling in Compose AndroidView
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // Close button
            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
                    .background(
                        color = Color.Black.copy(alpha = 0.5f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Close",
                    tint = Color.White
                )
            }
        }
    }
}
