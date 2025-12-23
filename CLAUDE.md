# CLAUDE.md

## Project Overview

Cross-platform P2P chat application built with Tauri 2.0.

## Commands

```bash
npm run tauri dev    # Development mode
npm run tauri build  # Production build
```

## Tech Stack

- **Frontend**: React + TypeScript (`src/`)
- **Backend**: Rust/Tauri (`src-tauri/`)
- **P2P**: PeerJS for real-time communication

## Architecture

- `src/components/` - React UI components
- `src/hooks/` - Custom React hooks
- `src-tauri/src/main.rs` - Tauri entry point
