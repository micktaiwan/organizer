# Debug: Long Press + Tap sur Messages Android

## Objectif

Permettre sur les messages du chat :
1. **Tap sur image** → afficher en fullscreen
2. **Tap sur audio** → jouer/stopper
3. **Long press sur ses propres messages** → afficher dialog de suppression

## Contexte technique

- **Framework** : Jetpack Compose
- **Container** : Messages affichés dans une `LazyColumn`
- **Structure** : `MessageBubble` contient `Surface` > `Column` > contenu (Image, Audio, Text, File)

## Problème initial

L'ajout du long press pour la suppression a cassé le tap sur les images et l'audio.

---

## Approches testées

### 1. Overlay avec `detectTapGestures` (approche originale)

```kotlin
Box {
    Surface { /* contenu */ }

    // Overlay pour long press
    if (isMyMessage && onDelete != null) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .pointerInput(Unit) {
                    detectTapGestures(onLongPress = { showDeleteDialog = true })
                }
        )
    }
}
```

**Résultat** : Long press marche, mais TOUS les taps sont bloqués (image, audio ne répondent plus).

**Cause** : L'overlay intercepte tous les pointer events avant qu'ils n'atteignent les enfants.

---

### 2. `combinedClickable` sur le parent Surface

```kotlin
Surface(
    modifier = Modifier
        .widthIn(max = 280.dp)
        .combinedClickable(
            onClick = { /* no-op */ },
            onLongClick = { showDeleteDialog = true }
        )
) {
    // Image avec .clickable, Audio avec .clickable
}
```

**Résultat** : Long press ne marche PAS.

**Cause** : Dans Compose, les events remontent du child au parent (bottom-up). Les `.clickable` des enfants consomment les events avant que le parent ne puisse détecter le long press.

---

### 3. `combinedClickable` sur chaque enfant

```kotlin
Image(
    modifier = Modifier.combinedClickable(
        onClick = { showFullscreen = true },
        onLongClick = { showDeleteDialog = true }
    )
)

Row(  // Audio
    modifier = Modifier.combinedClickable(
        onClick = { togglePlay() },
        onLongClick = { showDeleteDialog = true }
    )
)
```

**Résultat** : Le tap marche, mais le long press ne se déclenche JAMAIS (logs montrent que `onLongClick` n'est jamais appelé).

**Cause** : Inconnue à ce stade. Peut-être un conflit avec un autre gesture detector.

---

### 4. Custom `clickableNoConsume` + parent `combinedClickable`

Idée de l'autre LLM : créer un modifier custom qui ne consomme pas les events.

```kotlin
private fun Modifier.clickableNoConsume(onClick: () -> Unit) = this.pointerInput(onClick) {
    awaitEachGesture {
        val down = awaitFirstDown()
        val up = waitForUpOrCancellation()
        if (up != null) {
            onClick()
        }
        // Note: on ne call PAS down.consume()
    }
}
```

Utilisé sur les enfants (Image, Audio), avec `combinedClickable` sur le parent.

**Résultat** :
- Les taps des enfants marchent
- Le `Parent onClick` est appelé (propagation fonctionne)
- Mais `Parent onLongClick` n'est JAMAIS appelé

**Cause** : `waitForUpOrCancellation()` bloque jusqu'au release du doigt. Pendant ce temps, le parent ne peut pas détecter le long press.

---

### 5. `PointerEventPass.Initial` sur le parent

Idée : utiliser le pass Initial pour que le parent intercepte AVANT les enfants.

```kotlin
Modifier.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(pass = PointerEventPass.Initial)
        val longPress = awaitLongPressOrCancellation(down.id)
        if (longPress != null) {
            showDeleteDialog = true
        }
    }
}
```

**Résultat** : Le long press est annulé après 2-7ms systématiquement.

**Logs** :
```
Parent: got down id=PointerId(value=1), consumed=false, pressed=true
Parent: cancelled after 2ms (not long press)
```

**Cause suspectée** : LazyColumn intercepte le gesture pour détecter un scroll, ce qui annule notre `awaitLongPressOrCancellation`.

---

### 6. Consommer immédiatement le down event

```kotlin
Modifier.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        down.consume() // Consommer immédiatement

        while (true) {
            val event = awaitPointerEvent()
            val elapsed = System.currentTimeMillis() - startTime

            if (elapsed >= longPressTimeout) {
                showDeleteDialog = true
                break
            }
            if (event.changes.all { !it.pressed }) {
                break // tap
            }
            event.changes.forEach { it.consume() }
        }
    }
}
```

**Résultat** : Long press marche ! Mais le scroll est complètement cassé (impossible de scroller en partant d'un message).

**Cause** : En consommant tous les events, on empêche LazyColumn de détecter le scroll.

---

### 7. Détection intelligente scroll vs long press (version actuelle)

```kotlin
Modifier.pointerInput(Unit) {
    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val downPosition = down.position
        val touchSlop = viewConfiguration.touchSlop
        val longPressTimeout = viewConfiguration.longPressTimeoutMillis
        val startTime = System.currentTimeMillis()

        while (true) {
            val event = awaitPointerEvent(pass = PointerEventPass.Initial)
            val elapsed = System.currentTimeMillis() - startTime

            // Si le doigt bouge trop → c'est un scroll
            val change = event.changes.firstOrNull()
            if (change != null) {
                val distance = (change.position - downPosition).getDistance()
                if (distance > touchSlop) {
                    break // Laisser LazyColumn gérer
                }
            }

            // Si le doigt est relevé → c'est un tap
            if (event.changes.all { !it.pressed }) {
                break // Laisser les enfants gérer
            }

            // Si assez de temps est passé → long press
            if (elapsed >= longPressTimeout) {
                event.changes.forEach { it.consume() }
                showDeleteDialog = true
                // Attendre que le doigt soit relevé
                do {
                    val upEvent = awaitPointerEvent()
                    upEvent.changes.forEach { it.consume() }
                } while (upEvent.changes.any { it.pressed })
                break
            }
        }
    }
}
```

**Résultat** :
- Scroll : MARCHE
- Long press : marche une fois sur deux (instable)
- Tap sur image/audio : à tester

---

### 8. Test isolation : `combinedClickable` seul dans un Dialog

Pour déterminer si le problème vient de LazyColumn ou de Compose en général, on a testé `combinedClickable` sur un simple Box dans un Dialog (hors LazyColumn).

```kotlin
@OptIn(ExperimentalFoundationApi::class)
Box(
    modifier = Modifier
        .background(Color(0xFF4CAF50), RoundedCornerShape(8.dp))
        .combinedClickable(
            onClick = { Log.d("GestureDebug", "SIMPLE: Click!") },
            onLongClick = { Log.d("GestureDebug", "SIMPLE: Long press!") }
        )
        .padding(24.dp)
) {
    Text("LONG PRESS MOI", color = Color.White)
}
```

**Résultat** : ✅ **MARCHE PARFAITEMENT** - tap et long press fonctionnent tous les deux.

**Conclusion** : Le problème n'est PAS `combinedClickable` lui-même, ni LazyColumn. C'est l'interaction entre `combinedClickable` et d'autres éléments dans MessageBubble.

---

### 9. `combinedClickable` sur chaque composant de contenu (v2)

Basé sur le test réussi, on a refactoré pour que chaque composant gère son propre tap ET long press :

1. **Supprimé** la détection complexe au niveau parent (pointerInput manuel)
2. **Supprimé** le modifier custom `clickableNoConsume`
3. **Ajouté** paramètre `onLongPress: (() -> Unit)?` à chaque composant
4. **Remplacé** `.clickable` / `.clickableNoConsume` par `.combinedClickable` sur chaque composant

```kotlin
// Dans MessageBubble
val onLongPress: (() -> Unit)? = if (isMyMessage && onDelete != null) {
    { showDeleteDialog = true }
} else null

// Passé à chaque composant
when (message.type) {
    "audio" -> AudioMessageContent(
        base64Content = message.content,
        messageId = message.id,
        onLongPress = onLongPress
    )
    "image" -> ImageMessageContent(
        imageUrl = message.content,
        caption = message.caption,
        onLongPress = onLongPress
    )
    // etc.
}
```

```kotlin
// Dans AudioMessageContent
Row(
    modifier = Modifier
        .padding(vertical = 4.dp)
        .combinedClickable(
            onClick = { /* toggle play/stop */ },
            onLongClick = { onLongPress?.invoke() }
        )
) { ... }
```

```kotlin
// Dans ImageMessageContent
AsyncImage(
    modifier = Modifier
        .combinedClickable(
            onClick = { showFullscreen = true },
            onLongClick = { onLongPress?.invoke() }
        )
)
```

```kotlin
// Dans TextMessageContent - wrappé dans un Box
Box(
    modifier = Modifier.combinedClickable(
        onClick = { /* Let ClickableText handle URL taps */ },
        onLongClick = { onLongPress?.invoke() }
    )
) {
    ClickableText(...)
}
```

**Résultat** : ⚠️ Marche pour Audio, Image, File - mais PAS pour Text

**Cause identifiée** : `ClickableText` à l'intérieur du Box consomme tous les events avant que `combinedClickable` ne puisse détecter le long press.

---

### 10. Solution finale pour TextMessageContent ✅

Remplacer `ClickableText` par `Text` avec `pointerInput` + `detectTapGestures` qui gère à la fois :
- `onTap` : détection des URLs via `TextLayoutResult.getOffsetForPosition()`
- `onLongPress` : callback pour supprimer

```kotlin
@Composable
private fun TextMessageContent(
    content: String,
    onLongPress: (() -> Unit)? = null
) {
    val context = LocalContext.current
    val layoutResult = remember { mutableStateOf<TextLayoutResult?>(null) }

    val annotatedString = buildAnnotatedString { /* ... URLs avec annotations ... */ }

    Text(
        text = annotatedString,
        style = MaterialTheme.typography.bodyMedium,
        onTextLayout = { layoutResult.value = it },
        modifier = Modifier.pointerInput(onLongPress) {
            detectTapGestures(
                onTap = { offset ->
                    // Trouver le caractère tappé et ouvrir l'URL si c'en est une
                    layoutResult.value?.let { layout ->
                        val position = layout.getOffsetForPosition(offset)
                        annotatedString.getStringAnnotations(tag = "URL", start = position, end = position)
                            .firstOrNull()?.let { annotation ->
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(annotation.item))
                                context.startActivity(intent)
                            }
                    }
                },
                onLongPress = {
                    onLongPress?.invoke()
                }
            )
        }
    )
}
```

**Résultat** : ✅ **MARCHE** - tap sur URLs fonctionne, long press pour supprimer fonctionne

---

## Solution finale

| Type de message | Méthode | onClick | onLongClick |
|-----------------|---------|---------|-------------|
| **Text** | `Text` + `pointerInput` + `detectTapGestures` | Ouvre URL | Supprime |
| **Audio** | `Row` + `combinedClickable` | Play/Stop | Supprime |
| **Image** | `Image/AsyncImage` + `combinedClickable` | Fullscreen | Supprime |
| **File** | `Surface` + `combinedClickable` | Download | Supprime |

**Clé** : Chaque composant gère ses propres gestures. Pas de détection au niveau parent.

---

## Questions ouvertes (résolues)

1. **Est-ce vraiment LazyColumn le problème ?**
   - Les logs montrent que le gesture est annulé après 2-7ms
   - Mais on n'a pas prouvé que c'est LazyColumn spécifiquement

2. **Pourquoi `combinedClickable` sur les enfants ne déclenche pas `onLongClick` ?**
   - Le tap marche, donc le gesture est reçu
   - Mais le long press n'est jamais détecté

3. **Y a-t-il une lib tierce qui résout ce problème ?**

4. **Comment font WhatsApp/Telegram/Signal ?**
   - Ils ont exactement ce comportement (long press pour supprimer dans une liste scrollable)
   - Probablement View system natif, pas Compose

---

## État actuel des enfants (FINAL ✅)

- `TextMessageContent` : `Text` + `pointerInput` + `detectTapGestures` (onTap = URLs, onLongPress = delete)
- `AudioMessageContent` : `Row` + `combinedClickable` (onClick = play/stop, onLongClick = delete)
- `ImageMessageContent` : `Image/AsyncImage` + `combinedClickable` (onClick = fullscreen, onLongClick = delete)
- `FileMessageContent` : `Surface` + `combinedClickable` (onClick = download, onLongClick = delete)

---

## Fichiers modifiés

- `android/app/src/main/java/com/organizer/chat/ui/components/MessageBubble.kt`

## Imports ajoutés

```kotlin
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitLongPressOrCancellation
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.ui.input.pointer.PointerEventPass
```
