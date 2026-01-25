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
| Qualité | Desktop : choix utilisateur (Haute 1080p/5Mbps, Moyenne 720p/2Mbps, Basse 480p/1Mbps). Android : basse (~1 Mbps) fixe |
| Stockage temp | Fichier local (pas en mémoire) pour éviter la perte de données |
| Preview | Oui, avant upload - permet de revoir/supprimer/recommencer |
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
4. Enregistrement avec indicateur rouge visible (sauvegarde en fichier temp)
5. Pause/Resume possible pendant l'enregistrement
6. Bouton Stop → **Preview de la vidéo**
7. Options : Envoyer / Supprimer / Recommencer
8. Si Envoyer → Upload du fichier temp
9. Message envoyé avec placeholder "Génération thumbnail..."
10. Serveur génère thumbnail async → message mis à jour avec thumbnail cliquable

### Android

1. Bouton "Enregistrer" à côté du micro
2. Choix : Écran / Webcam (pas de mode combiné)
3. **Preview de la caméra** avant de commencer (si webcam)
4. Switch caméra front/back possible avant de lancer
5. Lancer l'enregistrement (sauvegarde dans cache app)
6. Pause/Resume possible
7. Stop → **Preview de la vidéo**
8. Options : Envoyer / Supprimer / Recommencer
9. Si Envoyer → Upload du fichier
10. Message envoyé → thumbnail généré async côté serveur

## Stockage temporaire

La vidéo doit être sauvegardée sur disque pendant l'enregistrement (pas en mémoire) pour :
- **Éviter la perte de données** si l'app crash ou si l'utilisateur ferme par erreur
- **Permettre le preview** avant l'upload
- **Supporter les longues vidéos** sans exploser la RAM

### Desktop (Tauri)

Utiliser l'API Tauri pour écrire dans un dossier temporaire :

```typescript
import { tempDir, join } from '@tauri-apps/api/path'
import { writeBinaryFile, removeFile } from '@tauri-apps/api/fs'

const tempPath = await join(await tempDir(), `recording-${Date.now()}.mp4`)

// Pendant l'enregistrement : écrire les chunks
mediaRecorder.ondataavailable = async (e) => {
  // Accumuler et écrire périodiquement sur disque
}

// Après preview : cleanup si supprimé
await removeFile(tempPath)
```

**Alternative plus simple** : Utiliser `URL.createObjectURL(blob)` pour le preview, mais sauvegarder le Blob complet dans IndexedDB comme backup en cas de crash.

### Android

`MediaRecorder` requiert un fichier de sortie :

```kotlin
val tempFile = File(context.cacheDir, "recording-${System.currentTimeMillis()}.mp4")
mediaRecorder.setOutputFile(tempFile.absolutePath)

// Après upload ou suppression
tempFile.delete()
```

Le fichier est automatiquement dans le cache de l'app, nettoyé par le système si besoin.

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

- [x] Endpoint `POST /api/upload/video` (réutilise infra existante)
- [x] Job async génération thumbnail (ffmpeg)
- [x] Événement socket `video:thumbnail-ready`
- [x] Nouveau type de message `video` dans le schéma

### Desktop V1 - MVP

- [x] `useVideoRecorder.ts` - Hook avec states (idle, recording, paused, previewing, uploading)
- [x] Support `getDisplayMedia()` pour capture écran
- [x] Support `getUserMedia()` pour webcam
- [x] `MediaRecorder` avec codec detection (MP4 > WebM), haute qualité (~5 Mbps)
- [x] Sauvegarde fichier temp (Tauri FS ou IndexedDB backup)
- [x] Pause/Resume pendant l'enregistrement
- [x] UI : bouton record (à côté du micro), indicateur rouge, pause, stop
- [x] **Preview après stop** : lecteur vidéo + boutons Envoyer/Supprimer/Recommencer
- [x] Upload vidéo seule (pas de thumbnail côté client)
- [x] Cleanup fichier temp après upload ou suppression
- [x] Écoute `video:thumbnail-ready` pour mise à jour message
- [x] Affichage placeholder puis thumbnail dans la room
- [x] Lecteur vidéo inline au clic

### Desktop V2 - Polish

- [ ] Choix de la source (fenêtre/écran/onglet)
- [ ] Mode Screen + Webcam (PiP composé dans la vidéo)
- [x] Barre de progression upload (XMLHttpRequest + upload.onprogress)
- [x] Indicateur durée pendant l'enregistrement

### Android V1 - MVP

**Affichage vidéo (lecture seule)** :
- [x] Modèle `Message` avec champs video (`thumbnailUrl`, `duration`, `width`, `height`)
- [x] `VideoMessageContent` composable (thumbnail + play overlay + durée)
- [x] Placeholder "Génération..." pendant création thumbnail
- [x] Lecteur vidéo plein écran (ExoPlayer/Media3)
- [x] Groupage messages : vidéos cassent le groupe

**Enregistrement vidéo (non implémenté)** :
- [ ] Permission `FOREGROUND_SERVICE_MEDIA_PROJECTION`
- [ ] `VideoRecorderService.kt` - Foreground service
- [ ] `ScreenRecorder.kt` - MediaProjection + MediaRecorder, basse qualité (~1 Mbps)
- [ ] Sauvegarde dans `cacheDir` (fichier temp)
- [ ] UI : bouton record (à côté du micro), pause, stop
- [ ] **Preview après stop** : lecteur ExoPlayer + boutons Envoyer/Supprimer/Recommencer
- [ ] Upload vidéo seule
- [ ] Cleanup fichier temp après upload ou suppression

### Android V2 - Webcam

- [ ] Mode webcam seule
- [ ] Preview caméra avant de commencer l'enregistrement
- [ ] Switch caméra front/back avant de lancer
- [ ] Pause/Resume
- [ ] Notification pendant l'enregistrement
- [ ] Barre de progression upload
