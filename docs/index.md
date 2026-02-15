# Documentation Index

## Agent (Eko)

| Document | Description | Statut |
|----------|-------------|--------|
| [index.md](agent/index.md) | Vision, architecture, roadmap, capacites evolutives | Actif |
| [memory-architecture.md](agent/memory-architecture.md) | Strategie memoire : collections Qdrant, dedup, TTL, conscience emergente | Actif |
| [reactive-eko.md](agent/reactive-eko.md) | Systeme proactif : reflection, goals, rate limiting, cron 3h | Actif |
| [implementation-eko-rooms.md](agent/implementation-eko-rooms.md) | Eko dans les rooms : mention @eko, handler, reponses contextuelles | Actif |
| [roadmap-assistant-collaboratif.md](agent/roadmap-assistant-collaboratif.md) | Vision 7 phases : Tamagotchi vers assistant collaboratif | Actif |

## Server

| Document | Description | Statut |
|----------|-------------|--------|
| [architecture.md](server/architecture.md) | Architecture complete : routes, socket.io, models, MCP, memoire, deploiement | Actif |
| [auth-tokens.md](server/auth-tokens.md) | Auth JWT + refresh token (server, desktop, TODO Android) | Actif |
| [backup.md](server/backup.md) | Backup MongoDB cron quotidien, retention 7 jours, procedure de restore | Actif |
| [bugs.md](server/bugs.md) | Analyse securite/perf (23 bugs identifies) | Stale |
| [https.md](server/https.md) | Plan migration HTTPS (non implemente) | Stale |

## Desktop (Tauri)

| Document | Description | Statut |
|----------|-------------|--------|
| [notifications.md](desktop/notifications.md) | Notifications macOS, workaround localStorage, dev vs prod | Actif |

## Android

| Document | Description | Statut |
|----------|-------------|--------|
| [architecture.md](android/architecture.md) | Architecture MVVM, Foreground Service, Socket.io | Actif |
| [sensors.md](android/sensors.md) | Capteurs pour Pet (accelerometre, gyroscope, rotation vector) | Actif |
| [long_press_debug.md](android/long_press_debug.md) | Investigation gestures long press (resolu) | Archive |
| [video_fullscreen_bug.md](android/video_fullscreen_bug.md) | Bug fullscreen video RESIZE_MODE_ZOOM (resolu) | Archive |
| [debug-video-fullscreen.md](android/debug-video-fullscreen.md) | Checklist debug video fullscreen | Actif |

## Specs

| Document | Description | Statut |
|----------|-------------|--------|
| [specs.md](specs.md) | Specs fonctionnelles completes (messages, auth, WebRTC, video, fichiers) | Actif |
| [prompt_specs.md](prompt_specs.md) | Guide de test de regression et verification de specs | Actif |
| [webrtc-android-specs.md](webrtc-android-specs.md) | Specs WebRTC Android (V0 a V2, decision matrix, tests) | Actif |
| [video-recording-specs.md](video-recording-specs.md) | Specs enregistrement video (screen/webcam, Desktop V1 done, Android TODO) | Actif |
| [css-split-plan.md](css-split-plan.md) | Plan split App.css en fichiers composants (incomplet) | Stale |
| [bugs.md](bugs.md) | 3 bugs duplication messages (investigation + resolution) | Actif |

## Archive

| Document | Description |
|----------|-------------|
| [archive/server_plan.md](archive/server_plan.md) | Plan initial du serveur (supersede par l'implementation) |
