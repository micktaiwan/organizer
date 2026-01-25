# Bug : Vidéo fullscreen ne remplit pas l'écran sur Android

## RESOLU

**Fix** : Utiliser `RESIZE_MODE_ZOOM` au lieu de `RESIZE_MODE_FIT`.

```kotlin
resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
```

---

## Problème observé

Quand on clique sur une vidéo pour la lire en fullscreen :
- Le Dialog s'ouvre correctement (fond noir, bouton X visible)
- Mais la vidéo reste minuscule au centre au lieu de s'agrandir

**Desktop** : La vidéo prend tout l'espace disponible (comportement attendu)
**Android** : La vidéo reste à sa taille originale (bug)

## Environnement

- minSdk / targetSdk : 34 (Android 14)
- Appareil de test : SDK 36 (Android 16)
- Compose BOM : 2024.12.01
- AGP : 8.7.3
- compileSdk : 35
- Media3 ExoPlayer : 1.5.1

## Cause racine

`RESIZE_MODE_FIT` ne fonctionne pas correctement avec PlayerView dans AndroidView (Compose) sur Android 16. Le scaling interne de l'AspectRatioFrameLayout ne s'applique pas, même si toutes les dimensions sont correctes.

`RESIZE_MODE_ZOOM` force le remplissage et contourne le bug.

## Code final

```kotlin
@Composable
private fun FullscreenVideoDialog(videoUrl: String, onDismiss: () -> Unit) {
    val context = LocalContext.current

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(videoUrl))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(Unit) { onDispose { exoPlayer.release() } }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        layoutParams = FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        player = exoPlayer
                        useController = true
                        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                        setEnableComposeSurfaceSyncWorkaround(true)
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM  // <-- FIX
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
            IconButton(onClick = onDismiss, Modifier.align(Alignment.TopEnd).padding(16.dp)) {
                Icon(Icons.Default.Close, "Close", tint = Color.White)
            }
        }
    }
}
```

---

## Cheminement complet des corrections

### 1. BoxWithConstraints - ECHEC

Obtenir les dimensions réelles du conteneur et les appliquer explicitement au PlayerView.

```kotlin
BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
    val width = maxWidth
    val height = maxHeight
    AndroidView(
        factory = { ... },
        modifier = Modifier.size(width, height)
    )
}
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 2. Dimensions écran explicites - ECHEC

Utiliser `LocalConfiguration` pour obtenir la taille de l'écran.

```kotlin
val configuration = LocalConfiguration.current
val screenWidth = configuration.screenWidthDp.dp
val screenHeight = configuration.screenHeightDp.dp

modifier = Modifier.size(screenWidth, screenHeight)
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 3. Activity séparée (programmatique) - ECHEC

Remplacer le Dialog par une Activity fullscreen dédiée (`VideoPlayerActivity`).

```kotlin
class VideoPlayerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        playerView = PlayerView(this)
        setContentView(playerView)
        exoPlayer = ExoPlayer.Builder(this).build()
        playerView?.player = exoPlayer
    }
}
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 4. Activity + LayoutParams explicites - ECHEC

Ajouter des LayoutParams MATCH_PARENT explicites et resizeMode.

```kotlin
playerView = PlayerView(this).apply {
    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
    layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
    )
}
setContentView(playerView)
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 5. Media3 Compose Surface Sync Workaround - ECHEC

Mise à jour Media3 1.2.1 → 1.5.1 et activation du workaround officiel.

```kotlin
// Requires: AGP 8.7.3, compileSdk 35, Media3 1.5.1
PlayerView(ctx).apply {
    setEnableComposeSurfaceSyncWorkaround(true)
    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
}
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 6. TextureView via XML layout - ECHEC

Créer un layout XML avec `surface_type="texture_view"` et l'inflater.

```xml
<!-- res/layout/fullscreen_player.xml -->
<androidx.media3.ui.PlayerView
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    app:surface_type="texture_view"
    app:resize_mode="fit" />
```

```kotlin
val playerView = LayoutInflater.from(ctx).inflate(
    R.layout.fullscreen_player, null
) as PlayerView
playerView.player = exoPlayer
```

**Résultat** : Ne fonctionne pas. La vidéo reste petite.

### 7. FrameLayout container avec inflate(layout, parent, true) - ECHEC

Corriger l'inflate sans parent (qui ignore les LayoutParams XML).

```kotlin
val container = FrameLayout(ctx).apply {
    layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
}
val playerView = inflater.inflate(R.layout.fullscreen_player, container, true)
```

**Logs** :
```
Container size=1079x2210
PlayerView size=1079x2210
```

**Résultat** : Ne fonctionne pas. Les dimensions sont correctes mais la vidéo reste petite.

### 8. Debug logging approfondi

Ajout de logs pour toutes les views internes.

```kotlin
post {
    Log.d("VideoFS", "PlayerView size=${width}x${height}")
    Log.d("VideoFS", "exo_content_frame size=...")
    Log.d("VideoFS", "Surface size=...")
    Log.d("VideoFS", "exo_shutter size=...")
}
```

**Logs** :
```
PlayerView size=1079x2210
exo_content_frame size=1079x2210
Surface (SurfaceView) size=1079x2210
exo_shutter size=1079x2210
VideoSize=1280x720 ratio=1.0
FirstFrame rendered
```

**Observation clé** : Toutes les dimensions sont correctes. Le problème n'est pas dans le layout mais dans le scaling interne du PlayerView.

### 9. RESIZE_MODE_ZOOM - SUCCES

Changer le mode de redimensionnement de FIT à ZOOM.

```kotlin
resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
```

**Résultat** : La vidéo remplit l'écran correctement.

---

## Fichiers modifiés

- `MessageBubble.kt` : `FullscreenVideoDialog`
- `GalleryScreen.kt` : `FullscreenVideoDialog`
- `build.gradle.kts` : Media3 1.2.1 → 1.5.1, AGP 8.5.0 → 8.7.3, compileSdk 34 → 35
- `libs.versions.toml` : AGP 8.5.0 → 8.7.3

## Références

- [AndroidView ignoring size modifiers - Issue #242463987](https://issuetracker.google.com/issues/242463987)
- [Scaling Bug in media3 with Android 14 - Issue #1184](https://github.com/androidx/media/issues/1184)
- [ExoPlayer does not render fully with AndroidView - Issue #1354](https://github.com/androidx/media/issues/1354)
- [SurfaceView inside Compose AndroidView - Issue #1237](https://github.com/androidx/media/issues/1237)
- [Media3 Compose surface type documentation](https://developer.android.com/media/media3/ui/compose#surface-type)
