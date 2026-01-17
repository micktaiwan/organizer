# Architecture Android - Organizer Chat

## Vue d'ensemble

Application Android native construite avec Kotlin et Jetpack Compose, utilisant une architecture MVVM (Model-View-ViewModel) avec un Foreground Service pour maintenir la connexion Socket.io en arrière-plan.

## Structure du projet

```
android/app/src/main/java/com/organizer/chat/
├── MainActivity.kt              # Activity principale, bind au ChatService
├── OrganizerApp.kt              # Application class, initialise les canaux de notification
├── data/
│   ├── api/
│   │   ├── ApiClient.kt         # Configuration Retrofit (OkHttp + Moshi)
│   │   ├── ApiService.kt        # Interface des endpoints REST
│   │   └── AuthInterceptor.kt   # Intercepteur pour ajouter le token JWT
│   ├── model/
│   │   ├── Message.kt           # Data class Message
│   │   ├── Room.kt              # Data class Room
│   │   └── User.kt              # Data class User
│   ├── repository/
│   │   ├── AuthRepository.kt    # Login/Register/Logout
│   │   ├── MessageRepository.kt # CRUD messages
│   │   └── RoomRepository.kt    # Liste des rooms
│   └── socket/
│       └── SocketManager.kt     # Gestion Socket.io + SharedFlows
├── service/
│   └── ChatService.kt           # Foreground Service pour Socket.io
├── ui/
│   ├── components/
│   │   ├── ChatInput.kt         # Composant input message
│   │   ├── MessageBubble.kt     # Composant bulle de message
│   │   └── RoomItem.kt          # Composant item de room
│   ├── navigation/
│   │   └── NavGraph.kt          # Navigation Compose
│   ├── screens/
│   │   ├── chat/
│   │   │   ├── ChatScreen.kt    # Écran de chat
│   │   │   └── ChatViewModel.kt # ViewModel du chat
│   │   ├── login/
│   │   │   ├── LoginScreen.kt
│   │   │   └── LoginViewModel.kt
│   │   ├── register/
│   │   │   ├── RegisterScreen.kt
│   │   │   └── RegisterViewModel.kt
│   │   └── rooms/
│   │       ├── RoomsScreen.kt   # Liste des rooms
│   │       └── RoomsViewModel.kt
│   └── theme/
│       └── Theme.kt             # Material 3 theme
└── util/
    └── TokenManager.kt          # Stockage token JWT (DataStore)
```

## Architecture MVVM

```
┌─────────────────────────────────────────────────────────────────┐
│                           UI Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ LoginScreen │  │ RoomsScreen │  │       ChatScreen        │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
│         │                │                      │               │
│         ▼                ▼                      ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │LoginViewModel│ │RoomsViewModel│ │     ChatViewModel       │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │AuthRepository│  │RoomRepository│  │  MessageRepository   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│         └─────────────────┼──────────────────────┘              │
│                           ▼                                      │
│                    ┌─────────────┐                              │
│                    │  ApiService │ ◄─── Retrofit + OkHttp       │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

## Foreground Service & Socket.io

Le `ChatService` est un **Foreground Service** qui maintient la connexion Socket.io active même quand l'app est en arrière-plan.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MainActivity                               │
│  - Bind au ChatService                                          │
│  - Passe le service au NavGraph                                 │
│  - Gère le lifecycle (foreground/background)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ binds
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ChatService                                │
│  - Foreground Service (notification persistante)                │
│  - Possède le SocketManager                                     │
│  - Relaie les messages via SharedFlow                           │
│  - Affiche les notifications si app en background               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ owns
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SocketManager                               │
│  - Connexion Socket.io avec auth JWT                            │
│  - SharedFlows pour chaque type d'événement                     │
│  - Events: message:new, message:deleted, typing, user:online    │
└─────────────────────────────────────────────────────────────────┘
```

## Flow des données temps réel

### Réception d'un nouveau message

```
1. Server émet "message:new" via Socket.io
                    │
                    ▼
2. SocketManager.on("message:new") parse le JSON
                    │
                    ▼
3. _newMessage.tryEmit(event) → SharedFlow
                    │
                    ▼
4. ChatService.observeSocketMessages() collecte
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
5a. _messages.emit()     5b. showMessageNotification()
    (relay to UI)            (si app en background)
          │
          ▼
6. ChatViewModel.observeServiceMessages() collecte
                    │
                    ▼
7. loadMessages() → API call → UI update
```

### Suppression d'un message (temps réel)

```
1. Server émet "message:deleted" via Socket.io
                    │
                    ▼
2. SocketManager.on("message:deleted") parse le JSON
                    │
                    ▼
3. _messageDeleted.tryEmit(event) → SharedFlow
                    │
                    ▼
4. ChatViewModel.observeServiceMessages() collecte
                    │
                    ▼
5. Filter local messages list → UI update instantané
```

## Canaux de notification

Définis dans `OrganizerApp.onCreate()`:

| Channel ID | Nom | Importance | Usage |
|------------|-----|------------|-------|
| `service` | Service Chat | LOW | Notification persistante du Foreground Service |
| `messages` | Messages | HIGH | Notifications de nouveaux messages |

## Gestion du token JWT

`TokenManager` utilise **DataStore** pour persister le token de manière sécurisée:

```kotlin
// Stockage
suspend fun saveToken(token: String)
suspend fun saveUserId(userId: String)

// Lecture
val token: Flow<String?>      // Async
val userId: Flow<String?>     // Async
fun getTokenSync(): String?   // Sync (pour Socket.io)

// Suppression
suspend fun clearToken()
```

## Navigation

Navigation gérée par **Jetpack Navigation Compose**:

```
NavGraph
├── login          → LoginScreen
├── register       → RegisterScreen
├── rooms          → RoomsScreen
└── chat/{roomId}/{roomName} → ChatScreen
```

Le `ChatService` est passé en paramètre au NavGraph pour être accessible dans les ViewModels.

## Dépendances principales

| Librairie | Usage |
|-----------|-------|
| Jetpack Compose | UI déclarative |
| Navigation Compose | Navigation entre écrans |
| Retrofit | Client HTTP REST |
| OkHttp | HTTP client + interceptors |
| Moshi | JSON serialization |
| Socket.io-client | WebSocket temps réel |
| DataStore | Persistance token |
| Coroutines + Flow | Asynchrone + réactivité |

## Permissions Android

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Configuration serveur

L'URL du serveur est hardcodée dans `SocketManager.kt` et `ApiClient.kt`:

```kotlin
private const val SERVER_URL = "http://51.210.150.25:3001"
```

Pour le développement local, modifier cette valeur et s'assurer que `network_security_config.xml` autorise le trafic HTTP en clair.

## Documentation

Additional documentation is available in the `docs/` folder:

| Document | Description |
|----------|-------------|
| [docs/long_press_debug.md](docs/long_press_debug.md) | Investigation of Compose gesture handling (tap + long press) |
