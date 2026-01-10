# CLAUDE.md

## Project Overview

Cross-platform chat application built with Tauri 2.0 and Node.js backend. Clients connect to a centralized server using Socket.io for real-time messaging, with support for user authentication, room-based chat, and media sharing (text, images, audio).

## Project Structure

```
organizer/
├── src/                 # React frontend application
├── src-tauri/          # Tauri configuration and Rust code
├── server/             # Express.js backend API
└── android/            # Android native app (Kotlin/Jetpack Compose)
```

## Commands

### Frontend Development
```bash
npm run dev              # Start Vite dev server (Tauri development)
npm run build            # Build React app with TypeScript
npm run tauri dev        # Run Tauri app in development mode
npm run tauri build      # Build production Tauri application
```

### Backend Development
```bash
cd server
npm run dev              # Start backend with hot reload (tsx watch)
npm run build            # Compile TypeScript to JavaScript
npm start                # Run compiled backend
```

### Server Deployment
```bash
cd server
./deploy.sh              # Deploy to production server (51.210.150.25)
```
The deploy script syncs files via rsync and rebuilds Docker containers on the remote server.

**SSH Access**: Use `ubuntu@51.210.150.25` (not `root@`). Example:
```bash
ssh ubuntu@51.210.150.25 "docker logs organizer-server --tail 50"
```

### Android Development

See [android/ARCHITECTURE.md](android/ARCHITECTURE.md) for detailed architecture documentation.

```bash
cd android

# Build debug APK
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug

# Install on connected device
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk

# View logs
~/Library/Android/sdk/platform-tools/adb logcat -s "ChatService" "SocketManager" "ChatViewModel"

# Uninstall app
~/Library/Android/sdk/platform-tools/adb uninstall com.organizer.chat
```

**IMPORTANT - Version Management:**
- **DO NOT** increment `versionCode` and `versionName` in `build.gradle.kts` for every build
- Only update versions when preparing a release to be published via the auto-update system
- Many intermediate builds are for testing and won't be published
- Update version numbers only when explicitly requested by the user

## Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Desktop Shell**: Tauri 2.0
- **Real-time Communication**: Socket.io client
- **UI Components**: Lucide React (icons)
- **Storage**: Tauri plugin-store for local persistence
- **Notifications**: Tauri plugin-notification

### Backend
- **Framework**: Express.js
- **Runtime**: Node.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-time Communication**: Socket.io
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **CORS**: Enabled for cross-origin requests

## Architecture

### Frontend (`src/`)
- `components/` - React UI components
  - `Auth/` - Authentication screens
  - `Chat/` - Chat interface (rooms, messages, members)
  - `Call/` - Voice/video call components
  - `Connection/` - Server connection setup
  - `Contact/` - Contact management
  - `Admin/` - Admin panel
  - `ServerConfig/` - Server configuration
  - `ui/` - Reusable UI components
- `contexts/` - React Context providers
  - `AuthContext.tsx` - Authentication state
  - `ServerConfigContext.tsx` - Server configuration state
- `hooks/` - Custom React hooks
  - `useVoiceRecorder` - Voice recording functionality
  - `useWebRTCCall` - WebRTC call management
  - `useRooms` - Room data fetching
  - `useContacts` - Contact management
- `services/` - API and communication
  - `api.ts` - HTTP API calls
  - `socket.ts` - Socket.io event handlers
- `utils/` - Utility functions
  - `audio.ts` - Audio processing
  - `emojis.ts` - Emoji utilities
  - `icons.ts` - Icon utilities
  - `messageGrouping.ts` - Message grouping logic
- `types.ts` - TypeScript type definitions

### Backend (`server/src/`)
- `index.ts` - Server entry point
- `config/` - Configuration management
- `middleware/` - Express middleware (auth, error handling, etc.)
- `models/` - MongoDB models (User, Room, Message, etc.)
- `routes/` - API endpoints
- `socket/` - Socket.io event handlers
- `scripts/` - Utility scripts

### Tauri (`src-tauri/`)
- `src/main.rs` - Application entry point
- `src/lib.rs` - Tauri app initialization
- `tauri.conf.json` - Tauri configuration
- `Cargo.toml` - Rust dependencies

## Key Features

- **User Authentication**: Register/login with JWT tokens
- **Room-based Chat**: Create and join chat rooms
- **Real-time Messaging**: Socket.io for live message delivery
- **Media Support**: Text, images, and audio messages
- **Contact Management**: Add and manage contacts
- **Voice Features**: Voice recording and playback
- **WebRTC Integration**: Voice/video call capabilities (in development)
- **Persistent Storage**: Local storage of messages and settings
- **Android Auto-Update**: Self-update mechanism for APK distribution outside Play Store

## Android APK Auto-Update

The Android app can check for updates and download new versions from the server.

### How it works
1. App checks `/apk/latest` endpoint at launch (after 2s delay) and via Settings screen
2. If `versionCode` on server > installed version, update dialog appears
3. User downloads APK via Android DownloadManager
4. User confirms installation (Android security requirement)

### Upload a new APK version

```bash
cd server

# 1. Get admin token (first time or if expired)
export APK_ADMIN_TOKEN=$(./get-token.sh username password)

# 2. Upload APK (increment versionCode in build.gradle.kts first!)
./upload-apk.sh ../android/app/build/outputs/apk/debug/app-debug.apk <version> <versionCode> "Release notes"

# Example:
./upload-apk.sh ../android/app/build/outputs/apk/debug/app-debug.apk 1.0.1 2 "Bug fixes"
```

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /apk/latest` | Public | Get latest version info |
| `GET /apk/download/:filename` | Public | Download APK file |
| `POST /apk/upload` | Admin | Upload new APK (multipart form: apk, version, versionCode, releaseNotes) |
| `GET /apk/versions` | Admin | List all versions |
| `DELETE /apk/:version` | Admin | Delete a version |

### Important notes
- Token expires after 7 days, regenerate with `get-token.sh`
- Always increment `versionCode` in `android/app/build.gradle.kts` before building
- APK files are stored in `server/public/apk/` (gitignored)
- `get-token.sh` is gitignored - if missing, get token manually:
  ```bash
  curl -s -X POST http://51.210.150.25:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "xxx", "password": "xxx"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
  ```
