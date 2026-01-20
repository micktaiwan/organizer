# Bug Analysis - SPEC-MSG-005: Messages en double

**Date:** 2026-01-20
**Spec:** "les messages ne doivent pas être envoyés OU affichés en double dans les rooms"

---

## BUG-001: Race condition Desktop - Optimistic UI vs Socket Event

**Spec:** SPEC-MSG-005
**Fichier:** `src/hooks/useRooms.ts:208`
**Sévérité:** Medium
**Status:** Fixed

### Description

Condition de course potentielle entre la mise à jour optimiste et l'événement socket.

### Comportement attendu

Un message envoyé par l'utilisateur ne doit apparaître qu'une seule fois.

### Comportement actuel

Si l'événement socket `message:new` arrive AVANT que la réponse API ne mette à jour le `serverMessageId` du message optimiste, le check de déduplication échoue.

### Analyse

```typescript
// Ligne 486: Message optimiste créé avec id temporaire
const optimisticMessage: Message = {
  id: messageId,  // crypto.randomUUID() - ex: "abc-123"
  serverMessageId: undefined,  // PAS ENCORE DÉFINI
  // ...
};

// Ligne 208: Check de déduplication
if (current.some(m => m.serverMessageId === data.messageId || m.id === data.messageId)) {
  return current;  // Skip duplicate
}
```

**Timeline de course:**
1. Client envoie POST /messages
2. Serveur sauvegarde et broadcast socket (messageId: "mongo-id-xyz")
3. Socket event arrive au client AVANT la réponse HTTP
4. Check: `"undefined" === "mongo-id-xyz"` → false
5. Check: `"abc-123" === "mongo-id-xyz"` → false
6. **Résultat: Message dupliqué ajouté!**
7. Réponse HTTP arrive, met à jour serverMessageId du premier message

### Solution proposée

Ajouter un mécanisme de corrélation temporelle ou de requête en vol:

```typescript
// Option 1: Tracking des requêtes en cours
const pendingMessagesRef = useRef<Set<string>>(new Set());

// Dans sendMessage, avant l'appel API:
pendingMessagesRef.current.add(messageId);

// Dans le handler socket:
if (pendingMessagesRef.current.size > 0 && data.from === userId) {
  // Message potentiellement en attente de confirmation - skip
  return current;
}
```

### Fichiers à modifier

- `src/hooks/useRooms.ts:194-224` - Ajouter vérification des messages en attente

### Fix appliqué

- Ajout de `pendingSendsRef` pour tracker les messages en cours d'envoi
- Skip des événements socket pour nos propres messages pendant l'envoi
- Appliqué à `sendMessage()` et `sendFile()`

---

## BUG-002: ChatService Android - SharedFlow replay=1

**Spec:** SPEC-MSG-005
**Fichier:** `android/.../service/ChatService.kt:60`
**Sévérité:** Low
**Status:** Fixed

### Description

Le SharedFlow `_messages` a `replay = 1`, ce qui rejoue le dernier message aux nouveaux abonnés.

### Comportement attendu

Un nouveau subscriber ne devrait pas recevoir d'anciens messages via le flow.

### Comportement actuel

```kotlin
// ChatService.kt:60
private val _messages = MutableSharedFlow<NewMessageEvent>(replay = 1, extraBufferCapacity = 50)
```

Si le ChatViewModel est recréé (navigation, rotation), il se réabonne et reçoit le dernier message.

### Analyse

Ce bug est **mitigé** par `addMessageIfNotExists()` dans ChatViewModel:153-162 qui vérifie par ID avant d'ajouter.

Cependant, cela génère des appels API inutiles (ligne 293: `messageRepository.getMessage(event.messageId)`).

### Solution proposée

Supprimer le replay:

```kotlin
private val _messages = MutableSharedFlow<NewMessageEvent>(replay = 0, extraBufferCapacity = 50)
```

### Fichiers à modifier

- `android/.../service/ChatService.kt:60` - Changer `replay = 1` en `replay = 0`

### Fix appliqué

- Changé `replay = 1` en `replay = 0` dans le SharedFlow `_messages`

---

## BUG-003: SocketManager Android - Pas de garde contre reconnexion multiple

**Spec:** SPEC-MSG-005
**Fichier:** `android/.../socket/SocketManager.kt:98-131`
**Sévérité:** Low
**Status:** Fixed

### Description

La méthode `connect()` ne vérifie pas si un socket est déjà connecté avant d'en créer un nouveau.

### Comportement attendu

Un seul socket actif à la fois.

### Comportement actuel

```kotlin
fun connect(versionName: String? = null, versionCode: Int? = null) {
    val token = tokenManager.getTokenSync()
    // ... PAS DE VÉRIFICATION si socket déjà connecté ...
    socket = IO.socket(SERVER_URL, options)  // Crée un NOUVEAU socket
    setupListeners()  // Enregistre de NOUVEAUX listeners
    socket?.connect()
}
```

Si `connect()` est appelé plusieurs fois sans `disconnect()`:
- Anciens listeners peuvent encore être actifs sur l'ancien socket
- Multiples connexions simultanées possibles

### Solution proposée

Ajouter une garde comme sur Desktop:

```kotlin
fun connect(versionName: String? = null, versionCode: Int? = null) {
    if (socket?.connected() == true) {
        Log.d(TAG, "Socket already connected, skipping")
        return
    }
    // Déconnexion propre si socket existe mais pas connecté
    socket?.let {
        it.off()
        it.disconnect()
    }
    // ... reste du code ...
}
```

### Fichiers à modifier

- `android/.../socket/SocketManager.kt:98-131` - Ajouter garde de connexion

### Fix appliqué

- Ajout d'une garde `if (socket?.connected() == true)` au début de `connect()`
- Nettoyage de l'ancien socket s'il existe mais n'est pas connecté

---

## Éléments SANS bug (déduplication correcte)

### Desktop - Déduplication présente

**Fichier:** `src/hooks/useRooms.ts:208`

```typescript
if (current.some(m => m.serverMessageId === data.messageId || m.id === data.messageId)) {
  return current;  // Skip duplicate - CORRECT
}
```

### Desktop - Socket guard présent

**Fichier:** `src/services/socket.ts:11-14`

```typescript
if (this.socket?.connected) {
  console.log('Socket already connected, skipping');
  return;  // CORRECT
}
```

### Android - Déduplication présente

**Fichier:** `android/.../ui/screens/chat/ChatViewModel.kt:153-162`

```kotlin
private fun addMessageIfNotExists(message: Message): Boolean {
    val alreadyExists = _uiState.value.messages.any { it.id == message.id }
    if (!alreadyExists) {
        // Add message - CORRECT
    }
    return !alreadyExists
}
```

---

## Résumé

| Bug | Sévérité | Plateforme | Impact réel | Status |
|-----|----------|------------|-------------|--------|
| BUG-001 | Medium | Desktop | Rare (timing-dependent) | **Fixed** |
| BUG-002 | Low | Android | Mitigé par dedup | **Fixed** |
| BUG-003 | Low | Android | Rare (edge case) | **Fixed** |

---

## Session de correction: 2026-01-20

**Bugs trouvés:** 3
**Bugs corrigés:** 3
**Status:** Complete

### Fichiers modifiés

- `src/hooks/useRooms.ts` - Ajout tracking des messages en cours d'envoi (BUG-001)
- `android/.../service/ChatService.kt` - Suppression replay SharedFlow (BUG-002)
- `android/.../socket/SocketManager.kt` - Ajout garde connexion (BUG-003)

### Points d'attention

- Tester l'envoi rapide de messages sur Desktop pour vérifier BUG-001
- Tester la navigation entre rooms sur Android pour vérifier BUG-002
- Tester la reconnexion réseau sur Android pour vérifier BUG-003
