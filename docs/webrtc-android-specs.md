# Implémentation WebRTC Android

## Contexte

L'app Organizer a maintenant les appels WebRTC fonctionnels sur Desktop (Tauri/React). Le serveur est prêt :
- Signaling WebRTC : `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `webrtc:close`
- Signaling appel : `call:request`, `call:accept`, `call:reject`, `call:end`, `call:toggle-camera`
- Autorisation : vérification que les users partagent une room ou sont contacts mutuels

## Objectif

Implémenter les appels audio/vidéo WebRTC sur Android (Kotlin) en utilisant la même infrastructure serveur.

## Décisions techniques

| Sujet | Décision |
|-------|----------|
| Permissions | CallActivity demande CAMERA + RECORD_AUDIO au lancement |
| Appel entrant (background) | Full-screen intent (écran éteint) + heads-up notification (écran allumé) |
| State management | Application ViewModel avec StateFlow (vit tant que l'app tourne) |
| Reconnexion réseau | ICE restart automatique + UI "Reconnexion..." (à implémenter aussi sur Desktop) |
| Audio routing | Écouteur (appel audio) / Haut-parleur (appel vidéo) |
| Bluetooth | V2 (routing auto vers appareil connecté) |
| TURN server | Pas pour la v1 (STUN uniquement, ~80% des cas couverts) |
| UI | Jetpack Compose (SurfaceViewRenderer via AndroidView) |
| ICE candidates | Trickle ICE (envoi au fur et à mesure, comme Desktop) |
| Timeout sonnerie | 30 secondes avant abandon automatique |
| Appel pendant appel | V1: ignoré silencieusement / V2: notification discrète |
| Switch caméra | Front/back en V2 (nice to have) |
| Mode Ne Pas Déranger | Respecté (pas de sonnerie intrusive) |
| Sonnerie | Sonnerie système par défaut + vibration |

## Dépendance

```kotlin
// build.gradle.kts (app)
implementation("io.getstream:stream-webrtc-android:1.3.8")
```

> **Note** : On utilise [Stream WebRTC Android](https://github.com/GetStream/webrtc-android) car la lib officielle Google (`org.webrtc:google-webrtc`) est abandonnée depuis 2018 et indisponible (JCenter fermé).
>
> Stream compile les derniers commits WebRTC officiels avec support Kotlin et Compose. Min SDK : API 21.

## Fichiers à créer/modifier

| Fichier | Description |
|---------|-------------|
| `app/src/main/java/com/organizer/webrtc/WebRTCClient.kt` | **Nouveau** - Gestion RTCPeerConnection |
| `app/src/main/java/com/organizer/webrtc/SignalingClient.kt` | **Nouveau** - Interface avec SocketManager (bridge événements socket ↔ WebRTCClient) |
| `app/src/main/java/com/organizer/ui/call/CallActivity.kt` | **Nouveau** - Activity container pour Compose |
| `app/src/main/java/com/organizer/ui/call/CallScreen.kt` | **Nouveau** - UI Compose appel en cours |
| `app/src/main/java/com/organizer/ui/call/IncomingCallActivity.kt` | **Nouveau** - Activity appel entrant |
| `app/src/main/java/com/organizer/ui/call/IncomingCallScreen.kt` | **Nouveau** - UI Compose appel entrant |
| `app/src/main/java/com/organizer/ui/call/CallViewModel.kt` | **Nouveau** - Application ViewModel (StateFlow) |
| `app/src/main/java/com/organizer/service/CallService.kt` | **Nouveau** - Foreground service pour appels |
| `app/src/main/java/com/organizer/audio/CallAudioManager.kt` | **Nouveau** - Routing audio (écouteur/HP, Bluetooth en V2) |
| `app/src/main/java/com/organizer/network/SocketManager.kt` | Ajouter handlers WebRTC |
| `AndroidManifest.xml` | Permissions + déclaration service |

## Permissions requises

```xml
<!-- V1 -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />

<!-- V2 (Bluetooth) -->
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  CallActivity   │────▶│  WebRTCClient    │────▶│ RTCPeerConnection│
│  (UI + Controls)│     │  (Manage PC)     │     │  (WebRTC native) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌──────────────────┐
         │              │ SignalingClient  │
         │              │ (Socket events)  │
         │              └──────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  CallService    │     │  SocketManager   │
│  (Foreground)   │     │  (Socket.IO)     │
└─────────────────┘     └──────────────────┘
```

## WebRTCClient.kt - Interface

```kotlin
class WebRTCClient(context: Context, signalingClient: SignalingClient) {
    val eglBase: EglBase  // Partagé pour les renderers

    fun initPeerConnectionFactory()
    fun createPeerConnection(observer: PeerConnection.Observer)
    fun startLocalVideo(renderer: SurfaceViewRenderer)
    fun startLocalAudio()
    fun attachRemoteVideo(videoTrack: VideoTrack, renderer: SurfaceViewRenderer)
    fun createOffer(observer: SdpObserver)
    fun createAnswer(observer: SdpObserver)
    fun setLocalDescription(sdp: SessionDescription, observer: SdpObserver)
    fun setRemoteDescription(sdp: SessionDescription, observer: SdpObserver)
    fun addIceCandidate(candidate: IceCandidate)
    fun toggleMute(muted: Boolean)
    fun toggleCamera(enabled: Boolean)
    fun close()

    // V2
    // fun switchCamera()
}
```

Classes Stream WebRTC utilisées : `EglBase`, `PeerConnection`, `SurfaceViewRenderer`, `VideoTrack`, `SessionDescription`, `IceCandidate`, `Camera2Enumerator`.

## CallViewModel - États

```kotlin
enum class CallState {
    IDLE,           // Pas d'appel
    CALLING,        // Appel sortant, en attente de réponse
    RECEIVING,      // Appel entrant, sonnerie
    CONNECTING,     // Accepté, connexion WebRTC en cours
    CONNECTED,      // Appel établi
    RECONNECTING,   // ICE restart en cours
    ENDED           // Appel terminé
}

class CallViewModel : ViewModel() {
    val state: StateFlow<CallState>
    val remoteUser: StateFlow<User?>
    val callDuration: StateFlow<Int>  // secondes
    val isMuted: StateFlow<Boolean>
    val isCameraEnabled: StateFlow<Boolean>
    val isRemoteCameraEnabled: StateFlow<Boolean>
    val audioRoute: StateFlow<AudioRoute>  // EARPIECE, SPEAKER (BLUETOOTH en V2)

    // V2
    // val isFrontCamera: StateFlow<Boolean>
}
```

## SocketManager - Events à ajouter

```kotlin
// Émission
fun sendWebRTCOffer(to: String, sdp: String)
fun sendWebRTCAnswer(to: String, sdp: String)
fun sendIceCandidate(to: String, candidate: String)
fun closeWebRTC(to: String)
fun requestCall(to: String, withCamera: Boolean)
fun acceptCall(to: String, withCamera: Boolean)
fun rejectCall(to: String)
fun endCall(to: String)

// Réception (dans setupSocketListeners)
socket.on("webrtc:offer") { /* ... */ }
socket.on("webrtc:answer") { /* ... */ }
socket.on("webrtc:ice-candidate") { /* ... */ }
socket.on("webrtc:close") { /* ... */ }
socket.on("call:request") { /* ... */ }
socket.on("call:accept") { /* ... */ }
socket.on("call:reject") { /* ... */ }
socket.on("call:end") { /* ... */ }
socket.on("call:error") { /* ... */ }
```

## CallScreen - UI (Compose)

- Affichage vidéo distante (SurfaceViewRenderer plein écran via AndroidView)
- Affichage vidéo locale (petit encart coin fixe)
- Boutons : mute mic, toggle camera, end call
- Bouton audio routing (écouteur ↔ haut-parleur)
- Affichage nom + avatar de l'interlocuteur
- Timer durée appel
- Indicateur "Reconnexion..." si state = `RECONNECTING`
- État "Appel en cours..." si state = `CALLING` (attente réponse)

> **V2** : switch camera, vidéo locale draggable, sélecteur Bluetooth

## CallService (Foreground)

- Notification persistante pendant l'appel
- Gère le wakelock pour éviter que l'écran s'éteigne
- Gère le proximity sensor pour éteindre l'écran près de l'oreille
- Permet de garder l'appel actif même si l'app est en arrière-plan

## Flow appel sortant

1. User clique "Appeler" dans RoomHeader ou profil
2. Lancer CallActivity avec intent (targetUserId, withVideo)
3. CallActivity demande permissions CAMERA + RECORD_AUDIO si manquantes
4. Démarrer CallService (foreground)
5. CallViewModel.state → `CALLING`
6. **requestCall via socket** (on demande d'abord, on setup WebRTC après acceptation)
7. Attendre call:accept (timeout 30s → abandon + state `ENDED`)
8. call:accept reçu → CallViewModel.state → `CONNECTING`
9. Créer WebRTCClient + PeerConnection
10. Configurer audio routing (écouteur si audio, HP si vidéo)
11. getUserMedia → addTrack
12. createOffer → setLocalDescription → sendOffer
13. Recevoir webrtc:answer → setRemoteDescription
14. Échanger ICE candidates (trickle)
15. ICE connected → CallViewModel.state → `CONNECTED`

## Flow appel entrant

1. Recevoir call:request via socket (dans SocketManager)
2. Vérifier mode Ne Pas Déranger → si actif, notification silencieuse uniquement
3. Si déjà en appel → ignorer (V2: notification discrète)
4. CallService crée notification avec full-screen intent
5. Si écran éteint → IncomingCallActivity s'affiche automatiquement
6. Si écran allumé → heads-up notification avec boutons Accepter/Refuser
7. Jouer sonnerie système + vibration (timeout 30s)
8. CallViewModel.state → `RECEIVING`
9. Si accepté :
   - Arrêter sonnerie
   - Lancer CallActivity
   - CallViewModel.state → `CONNECTING`
   - Demander permissions si manquantes
   - Créer WebRTCClient + PeerConnection
   - acceptCall via socket
   - Recevoir webrtc:offer → setRemoteDescription
   - createAnswer → setLocalDescription → sendAnswer
   - Échanger ICE candidates
   - ICE connected → CallViewModel.state → `CONNECTED`
10. Si refusé ou timeout : rejectCall via socket, state → `ENDED`

## Flow reconnexion (ICE restart)

1. PeerConnection.Observer détecte `iceConnectionState = disconnected`
2. CallViewModel.state → `RECONNECTING`
3. UI affiche "Reconnexion..."
4. Appeler `peerConnection.restartIce()`
5. Recréer offer avec `iceRestart: true`
6. Si reconnecté → CallViewModel.state → `CONNECTED`
7. Si timeout (~10s) → terminer l'appel

## Gestion des erreurs

| Erreur | Comportement |
|--------|--------------|
| Permissions refusées | Toast explicatif + retour écran précédent |
| call:reject reçu | Toast "Appel refusé" + state → `ENDED` |
| call:error reçu | Toast avec message d'erreur + state → `ENDED` |
| Timeout 30s (sortant) | Toast "Pas de réponse" + state → `ENDED` |
| Timeout 30s (entrant) | Arrêt sonnerie + rejectCall auto |
| Caméra indisponible | Continuer en audio seul + Toast informatif |
| ICE failed | Tentative ICE restart, puis fin d'appel si échec |
| Socket déconnecté | state → `RECONNECTING`, puis fin si pas de reconnexion |

## Tests

**Appels basiques**
1. Appel audio seul entre 2 devices Android
2. Appel vidéo entre 2 devices Android
3. Appel Android ↔ Desktop
4. Rejet d'appel
5. Fin d'appel par chaque partie

**Permissions**
6. Lancer appel sans permissions → demande affichée
7. Refuser permissions → retour écran précédent avec message

**Background / Notifications**
8. Appel entrant écran éteint → full-screen intent
9. Appel entrant écran allumé → heads-up notification
10. Accepter depuis notification
11. Refuser depuis notification

**Audio**
12. Appel audio → son dans écouteur
13. Appel vidéo → son dans haut-parleur
14. Basculer écouteur ↔ haut-parleur

**Reconnexion**
15. Couper WiFi 3s pendant appel → reconnexion auto
16. Passer WiFi → 4G → appel maintenu

**Controls**
17. Toggle micro (mute/unmute)
18. Toggle caméra (on/off)

**V2 - Tests supplémentaires**
19. Connecter casque Bluetooth → routing auto
20. Switch caméra front ↔ back

## Cleanup (important)

À la fin de l'appel ou en cas d'erreur, libérer les ressources dans cet ordre :
1. `localVideoTrack.dispose()`
2. `localAudioTrack.dispose()`
3. `peerConnection.close()`
4. `peerConnection.dispose()`
5. `videoCapturer.stopCapture()`
6. `videoCapturer.dispose()`
7. `surfaceViewRenderer.release()`
8. `eglBase.release()` (en dernier, partagé par les renderers)

> Ne pas oublier de release les ressources même si l'appel échoue avant d'être établi.

## Références Desktop (pour cohérence)

- `src/hooks/useWebRTCCall.ts` - Logique WebRTC React
- `src/services/socket.ts` - Méthodes socket (sendOffer, etc.)
- `server/src/socket/index.ts` - Handlers serveur

## TODO Desktop (parité)

- [ ] Implémenter ICE restart dans `useWebRTCCall.ts` (actuellement non géré)

---

## TODO Android - Roadmap

### V0 - Strict minimum pour tester

L'objectif : passer un appel entre Desktop et Android, voir et entendre l'autre. Rien de plus.

- [x] Ajouter dépendance Stream WebRTC dans `build.gradle.kts`
- [x] Ajouter permissions dans `AndroidManifest.xml` (CAMERA, RECORD_AUDIO, INTERNET) - déjà présentes
- [x] `WebRTCClient.kt` - Version minimale :
  - [x] initPeerConnectionFactory()
  - [x] createPeerConnection()
  - [x] startLocalVideo() / startLocalAudio()
  - [x] createOffer() / createAnswer()
  - [x] setLocalDescription() / setRemoteDescription()
  - [x] addIceCandidate()
  - [x] close()
- [x] `SocketManager.kt` - Événements WebRTC :
  - [x] Émission : webrtc:offer, webrtc:answer, webrtc:ice-candidate
  - [x] Réception : webrtc:offer, webrtc:answer, webrtc:ice-candidate, webrtc:close
  - [x] Émission : call:request, call:accept, call:reject, call:end
  - [x] Réception : call:request, call:accept, call:reject, call:end
- [x] `CallManager.kt` - Coordinateur WebRTC/Socket avec buffering signaling
- [x] `CallState.kt` - Sealed class (Idle, Calling, Incoming, Connected)
- [x] `CallScreen.kt` - UI ultra-simple :
  - [x] Vidéo distante plein écran (pas de vidéo locale)
  - [x] Bouton raccrocher uniquement
  - [x] State via CallManager (pas de ViewModel dédié)
- [x] `IncomingCallDialog.kt` - AlertDialog simple (Accepter/Refuser)
- [x] Bouton "Appeler" dans header ChatScreen (rooms privées 1-to-1)
- [x] Demande de permissions au runtime (RECORD_AUDIO + CAMERA si vidéo)

**Pas dans V0** : vidéo locale, mute, toggle camera, ViewModel dédié, IncomingCallActivity, sonnerie.

**Bugs corrigés pendant l'implémentation** :
- Race condition signaling : buffer offer/ICE candidates jusqu'à acceptation
- Format SDP : objet `{ type, sdp }` pas string brute
- Format ICE candidate : objet nested `{ candidate, sdpMid, sdpMLineIndex }`
- Crash recursion cleanup : flag `isCleaningUp`
- UI layering : CallScreen rendu après NavGraph
- Thread safety : `synchronized(candidatesLock)` pour pendingIceCandidates
- ICE timing : flag `isRemoteDescriptionSet` pour ne pas ajouter ICE avant remote description
- ICE outgoing : `handleWebRTCAnswer` doit set `isRemoteDescriptionSet = true` et process pending
- sdpMid null : type `String?` + `JSONObject.NULL` pour null
- SurfaceViewRenderer : track attachedTrack séparément pour cleanup correct
- Crash hangup : vérifier que `call:end`/`webrtc:close` vient du bon user avant cleanup
- Crash raccrochage distant : délai 150ms avant `close()` pour laisser Compose nettoyer le renderer + try-catch partout dans `close()` et `DisposableEffect`

**Améliorations UI** :
- CallScreen avec gradient, avatar pulsant, animation "Appel en cours...", timer durée

---

### V0.5 - Confort de test

Améliore V0 pour des tests plus confortables.

- [x] `CallViewModel.kt` - State centralisé (state, remoteUser, isMuted, isCameraEnabled)
- [ ] Afficher vidéo locale (petit encart) - **implémenté mais ne s'affiche pas**
- [x] Bouton mute micro
- [x] Bouton toggle caméra on/off
- [x] `IncomingCallScreen.kt` - UI plein écran appel entrant (remplace IncomingCallDialog)

**Bugs connus V0.5** :
1. **Vidéo locale non affichée** : L'encart PiP est implémenté mais ne s'affiche pas (à investiguer)
2. **Mute caméra Android cassé** : Toggle camera off sur Android ne coupe pas la vidéo
3. **Mute caméra Desktop → freeze Android** : Quand Desktop coupe sa caméra, Android voit la dernière frame figée au lieu d'un écran noir
4. **Reprise vidéo cassée** : Après avoir coupé puis réactivé la caméra, la vidéo ne reprend pas

---

### V1 - Version production

Tout ce qu'il faut pour une vraie release.

**Notifications & Background**
- [ ] `CallService.kt` - Foreground service
- [ ] Notification persistante pendant l'appel
- [ ] Full-screen intent (appel entrant écran éteint)
- [ ] Heads-up notification (appel entrant écran allumé)
- [ ] Boutons Accepter/Refuser dans la notification

**Audio**
- [ ] `CallAudioManager.kt` - Routing audio
- [ ] Écouteur par défaut (appel audio)
- [ ] Haut-parleur par défaut (appel vidéo)
- [ ] Bouton pour basculer écouteur ↔ haut-parleur
- [ ] Sonnerie système + vibration (appel entrant)
- [ ] Proximity sensor (éteindre écran près de l'oreille)

**Robustesse**
- [ ] Timeout 30s sonnerie
- [ ] Timeout 30s appel sortant sans réponse
- [ ] ICE restart automatique (reconnexion réseau)
- [ ] UI "Reconnexion..." pendant ICE restart
- [ ] Gestion call:error
- [ ] Cleanup complet des ressources WebRTC
- [ ] Respecter mode Ne Pas Déranger

**UI polish**
- [ ] Timer durée d'appel
- [ ] Avatar + nom de l'interlocuteur
- [ ] État "Appel en cours..." pendant sonnerie sortante
- [ ] État "Connexion..." pendant setup WebRTC
- [ ] Toasts d'erreur explicites

**Permissions**
- [ ] Gestion refus de permissions (message + retour)

---

### V2 - Nice to have

Améliorations futures, pas bloquantes pour la release.

**Caméra**
- [ ] Switch caméra front ↔ back
- [ ] Miroir vidéo locale (front camera)

**Audio avancé**
- [ ] Permission BLUETOOTH_CONNECT (Android 12+)
- [ ] Support Bluetooth (routing auto)
- [ ] Sélecteur audio (écouteur / HP / Bluetooth)

**UI avancée**
- [ ] Vidéo locale draggable (déplacer le petit encart)
- [ ] Double-tap pour swap vidéos (locale ↔ distante)
- [ ] Animation de sonnerie
- [ ] Picture-in-Picture (continuer l'appel en arrière-plan)

**Appels multiples**
- [ ] Notification discrète si appel entrant pendant appel actif
- [ ] Historique des appels manqués

**Debug**
- [ ] Afficher stats (bitrate, résolution, codec) en mode debug
- [ ] Logs WebRTC exportables

**Desktop (parité)**
- [x] Ringback tone sur Desktop (son pendant appel sortant en attente)
- [ ] ICE restart sur Desktop
- [ ] Switch caméra sur Desktop (si plusieurs webcams)
