# Checklist : Debug vidéo fullscreen Android

Quand une vidéo ne remplit pas l'écran comme attendu, suivre ces étapes **dans l'ordre**.

## Étape 1 : Classifier le symptôme

**La vidéo est "petite" = 2 causes possibles :**

| Cause | Symptôme | Test rapide |
|-------|----------|-------------|
| A) Layout | La View/Surface est petite | Log `PlayerView.width x height` |
| B) Resize mode | La View est grande mais l'image est letterboxed | Comparer ratio écran vs ratio vidéo |

## Étape 2 : Vérifier les ratios

```kotlin
// Log à ajouter temporairement
Log.d("VideoDebug", "Screen: ${screenWidth}x${screenHeight} ratio=${screenWidth.toFloat()/screenHeight}")
Log.d("VideoDebug", "Video: ${videoSize.width}x${videoSize.height} ratio=${videoSize.width.toFloat()/videoSize.height}")
Log.d("VideoDebug", "ResizeMode: ${playerView.resizeMode}") // 0=FIT, 1=FIXED_WIDTH, 2=FIXED_HEIGHT, 3=FILL, 4=ZOOM
```

**Interprétation :**
- Ratio écran ≠ ratio vidéo + `RESIZE_MODE_FIT` → letterbox normal (pas un bug)
- Ratio écran ≠ ratio vidéo + tu veux remplir → utiliser `RESIZE_MODE_ZOOM`

## Étape 3 : Comprendre les resize modes

| Mode | Comportement | Équivalent CSS |
|------|--------------|----------------|
| `RESIZE_MODE_FIT` | Contenu visible entièrement, barres noires | `object-fit: contain` |
| `RESIZE_MODE_ZOOM` | Remplit le conteneur, crop si nécessaire | `object-fit: cover` |
| `RESIZE_MODE_FILL` | Étire pour remplir (déforme) | `object-fit: fill` |

## Étape 4 : Seulement si layout incorrect

Si `PlayerView.width x height` ne correspond pas à l'écran, alors vérifier :
1. `Modifier.fillMaxSize()` sur AndroidView
2. `DialogProperties(usePlatformDefaultWidth = false)`
3. LayoutParams MATCH_PARENT
4. `setEnableComposeSurfaceSyncWorkaround(true)` pour Compose

## Règle d'or

> **Si toutes les dimensions sont correctes mais la vidéo semble petite, c'est probablement le resize mode, pas un bug.**

Le passage de `FIT` à `ZOOM` est une décision produit (accepter le crop), pas un correctif technique.
