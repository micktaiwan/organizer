# Enregistrement vidéo - Specs

## Contexte

Permettre aux utilisateurs d'enregistrer leur écran (ou webcam) et d'envoyer la vidéo comme message dans une room, avec un thumbnail cliquable.

Ce n'est **pas du WebRTC** - c'est de la capture locale + encodage + upload de fichier.

## Décisions techniques

| Sujet | Décision |
|-------|----------|
| Priorité | Desktop d'abord, Android ensuite |
| Format vidéo | MP4/H.264 (universel, lisible partout) |
| Audio | Micro seulement (pas d'audio système) |
| Limites | Aucune (durée/taille illimitées) |
| Qualité | Desktop : haute (~5 Mbps), Android : basse (~1 Mbps) - pas de choix utilisateur |
| Thumbnail | Première frame, générée côté **serveur** (async, non bloquant) |
| Upload | Réutilise l'infra existante (pièces jointes) |
| Pause/Resume | Supporté (`MediaRecorder.pause()`/`resume()`) |

## Use cases

1. **Screen recording** - Capturer l'écran pour montrer un bug, un tuto, etc.
2. **Webcam recording** - S'enregistrer face caméra
3. **Screen + webcam** - Écran avec webcam en PiP (mode présentation/loom)

## Workflow utilisateur

### Desktop

1. Bouton "Enregistrer" à côté du micro
2. Choix : Écran / Webcam / Les deux
3. Sélection de la source (fenêtre, écran, onglet)
4. Enregistrement avec indicateur rouge visible
5. Pause/Resume possible pendant l'enregistrement
6. Bouton Stop → Upload immédiat (pas de preview)
7. Message envoyé avec placeholder "Génération thumbnail..."
8. Serveur génère thumbnail async → message mis à jour avec thumbnail cliquable

### Android

1. Bouton "Enregistrer" à côté du micro
2. Choix : Écran / Webcam (pas de mode combiné)
3. **Preview de la caméra** avant de commencer (si webcam)
4. Switch caméra front/back possible avant de lancer
5. Lancer l'enregistrement
6. Pause/Resume possible
7. Stop → Upload immédiat (pas de preview)
8. Message envoyé → thumbnail généré async côté serveur

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Screen      │    │ MediaRecorder│   │ Upload      │         │
│  │ Capture     │───▶│ (encoding)  │───▶│ (video only)│         │
│  │ + Webcam    │    │             │    │             │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                               │                 │
└───────────────────────────────────────────────│─────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ REST API    │    │ Storage     │    │ Job Queue   │         │
│  │ POST /upload│───▶│ Save video  │───▶│ (async)     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                                     │                 │
│         │ (return videoUrl immediately)       ▼                 │
│         │                            ┌─────────────┐            │
│         │                            │ ffmpeg      │            │
│         │                            │ thumbnail   │            │
│         │                            └─────────────┘            │
│         │                                     │                 │
│         ▼                                     ▼                 │
│  ┌─────────────┐                      ┌─────────────┐           │
│  │ Socket emit │◀─────────────────────│ Save thumb  │           │
│  │ video:ready │                      │ + update DB │           │
│  └─────────────┘                      └─────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flow détaillé

1. Client upload la vidéo → serveur répond immédiatement avec `videoUrl`
2. Client envoie le message avec `thumbnailUrl: null` (ou placeholder)
3. Serveur lance un job async : `ffmpeg -i video.mp4 -ss 0.1 -vframes 1 thumb.jpg`
4. Job terminé → serveur émet `video:thumbnail-ready { messageId, thumbnailUrl }`
5. Client met à jour le message avec le thumbnail

## Desktop (Tauri/React)

### APIs utilisées

- **Screen capture** : `navigator.mediaDevices.getDisplayMedia()`
- **Webcam** : `navigator.mediaDevices.getUserMedia()`
- **Encoding** : `MediaRecorder` API
- **Thumbnail** : `<canvas>` + `toBlob()`

### Format vidéo

Le `MediaRecorder` supporte nativement :
- **Chrome/Edge** : `video/webm; codecs=vp9` ou `video/webm; codecs=h264`
- **Firefox** : `video/webm; codecs=vp8`
- **Safari** : `video/mp4; codecs=h264` (depuis Safari 14.1)

**Stratégie** : Tenter `video/mp4` d'abord (Safari), fallback sur `video/webm` (Chrome/Firefox).

> **Note** : Tauri utilise WebView, donc les codecs dépendent de l'OS :
> - macOS : Safari WebView → MP4 natif
> - Windows : Edge WebView → WebM ou MP4
> - Linux : WebKitGTK → WebM

### Composants à créer

| Fichier | Description |
|---------|-------------|
| `src/components/VideoRecorder.tsx` | UI d'enregistrement (bouton record, indicateur, pause/stop) |
| `src/hooks/useVideoRecorder.ts` | Logique capture + MediaRecorder + pause/resume |

## Android (Kotlin)

### APIs utilisées

- **Screen capture** : `MediaProjection` API (demande permission système)
- **Webcam** : `Camera2` API ou `CameraX`
- **Encoding** : `MediaRecorder` (natif) ou `MediaCodec` (plus de contrôle)
- **Thumbnail** : `MediaMetadataRetriever.getFrameAtTime()`

### Permissions requises

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
```

### MediaProjection flow

1. Créer `MediaProjectionManager.createScreenCaptureIntent()`
2. Lancer l'intent → permission système affichée
3. Récupérer `MediaProjection` dans `onActivityResult`
4. Créer `VirtualDisplay` lié à `MediaRecorder`
5. Start/stop recording
6. Cleanup : `MediaProjection.stop()`, `VirtualDisplay.release()`

### Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `VideoRecorderService.kt` | Foreground service pour MediaProjection |
| `ScreenRecorder.kt` | Gestion MediaProjection + MediaRecorder |
| `VideoRecorderViewModel.kt` | State management |
| `VideoRecorderScreen.kt` | UI Compose (preview cam, switch front/back, record/pause/stop) |

## Backend

### Upload endpoint

Réutilise l'infra existante. Le client upload seulement la vidéo :

```
POST /api/upload/video
Content-Type: multipart/form-data

Fields:
- video: File (MP4/WebM)
- roomId: String
```

Response (immédiate, avant génération thumbnail) :
```json
{
  "videoUrl": "https://..../videos/abc123.mp4",
  "duration": 45.2,
  "size": 12345678
}
```

### Génération thumbnail async

Après l'upload, le serveur lance un job async (queue ou simple `setImmediate`) :

```bash
ffmpeg -i video.mp4 -ss 0.1 -vframes 1 -vf "scale=320:-1" thumb.jpg
```

Une fois terminé, le serveur :
1. Sauvegarde le thumbnail
2. Met à jour le message en DB avec `thumbnailUrl`
3. Émet un événement socket : `video:thumbnail-ready { messageId, thumbnailUrl }`

### Socket event

```typescript
// Client écoute
socket.on('video:thumbnail-ready', ({ messageId, thumbnailUrl }) => {
  // Met à jour le message dans le state local
})
```

### Message type

```typescript
interface VideoMessage {
  type: 'video'
  videoUrl: string
  thumbnailUrl: string | null  // null jusqu'à génération
  duration: number // secondes
  size: number // bytes
  width?: number
  height?: number
}
```

## UI - Lecteur vidéo

### Dans la room (message)

- Thumbnail cliquable avec icône play overlay
- Durée affichée en bas à droite
- Clic → expand en lecteur inline ou modal

### Lecteur

- Controls natifs `<video>` sur Desktop
- `ExoPlayer` sur Android (meilleur support codecs)
- Play/pause, seek, fullscreen, volume

---

## TODO - Roadmap

### Server

- [ ] Endpoint `POST /api/upload/video` (réutilise infra existante)
- [ ] Job async génération thumbnail (ffmpeg)
- [ ] Événement socket `video:thumbnail-ready`
- [ ] Nouveau type de message `video` dans le schéma

### Desktop V1 - MVP

- [ ] `useVideoRecorder.ts` - Hook avec states (idle, recording, paused, uploading)
- [ ] Support `getDisplayMedia()` pour capture écran
- [ ] Support `getUserMedia()` pour webcam
- [ ] `MediaRecorder` avec codec detection (MP4 > WebM), haute qualité (~5 Mbps)
- [ ] Pause/Resume pendant l'enregistrement
- [ ] UI : bouton record (à côté du micro), indicateur rouge, pause, stop
- [ ] Upload vidéo seule (pas de thumbnail côté client)
- [ ] Écoute `video:thumbnail-ready` pour mise à jour message
- [ ] Affichage placeholder puis thumbnail dans la room
- [ ] Lecteur vidéo inline au clic

### Desktop V2 - Polish

- [ ] Choix de la source (fenêtre/écran/onglet)
- [ ] Mode Screen + Webcam (PiP composé dans la vidéo)
- [ ] Barre de progression upload
- [ ] Indicateur durée pendant l'enregistrement

### Android V1 - MVP

- [ ] Permission `FOREGROUND_SERVICE_MEDIA_PROJECTION`
- [ ] `VideoRecorderService.kt` - Foreground service
- [ ] `ScreenRecorder.kt` - MediaProjection + MediaRecorder, basse qualité (~1 Mbps)
- [ ] UI : bouton record (à côté du micro), pause, stop
- [ ] Upload vidéo seule
- [ ] Écoute `video:thumbnail-ready`
- [ ] Affichage placeholder puis thumbnail dans chat
- [ ] Lecteur ExoPlayer

### Android V2 - Webcam

- [ ] Mode webcam seule
- [ ] Preview caméra avant de commencer l'enregistrement
- [ ] Switch caméra front/back avant de lancer
- [ ] Pause/Resume
- [ ] Notification pendant l'enregistrement
- [ ] Barre de progression upload
