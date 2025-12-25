# CLAUDE.md

## Project Overview

Cross-platform chat application built with Tauri 2.0 and Node.js backend. Clients connect to a centralized server using Socket.io for real-time messaging, with support for user authentication, room-based chat, and media sharing (text, images, audio).

## Project Structure

```
organizer/
├── src/                 # React frontend application
├── src-tauri/          # Tauri configuration and Rust code
└── server/             # Express.js backend API
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
