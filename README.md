# Organizer

A cross-platform chat application built by two brothers — one on macOS, one on Windows.

## Overview

This project is a "vibe coding" experiment: building a real-time chat application with voice features, developed collaboratively across different operating systems.

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | **Tauri 2.0** | Lightweight (~5MB), fast, secure. Uses native OS webview instead of bundling Chromium. |
| Frontend | React + TypeScript | Modern, widely supported by AI coding tools |
| Backend | Rust (Tauri core) | Memory-safe, high performance |
| Real-time | Firebase / Supabase | Zero backend to maintain, built-in real-time sync |

### Why Tauri over Electron?

- **10-40x smaller** binary size
- **3x less RAM** consumption
- **Native performance** via Rust backend
- **Better security** model by default

## Cross-Platform Strategy

Each developer compiles on their own platform:

| Developer | OS | Compiles |
|-----------|-----|----------|
| Brother 1 | macOS | `.dmg` / `.app` |
| Brother 2 | Windows | `.exe` / `.msi` |

No cross-compilation. No CI/CD. Each platform is tested natively by its developer.

### Platform Considerations

- macOS uses **WebKit** (Safari engine)
- Windows uses **WebView2** (Chromium-based)
- Minor rendering differences may occur — test on both platforms before merging

## Roadmap

### Phase 1: Foundation
- [x] Initialize Tauri project structure
- [ ] Setup shared UI components
- [ ] Basic window with chat layout

### Phase 2: Text Chat
- [ ] Chat bubbles UI (sent/received styles)
- [ ] Message input component
- [ ] Firebase/Supabase integration
- [ ] Real-time message sync between platforms

### Phase 3: Voice Messages
- [ ] Audio recording via Web API
- [ ] Playback component
- [ ] Audio file upload/download

### Phase 4: Real-time Voice (Advanced)
- [ ] WebRTC integration
- [ ] Push-to-talk functionality
- [ ] Voice activity detection

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/)
- Platform-specific requirements:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: WebView2, Visual Studio C++ Build Tools

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/organizer.git
cd organizer

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
organizer/
├── src/                  # Frontend (React)
│   ├── components/       # UI components
│   ├── hooks/            # Custom React hooks
│   └── App.tsx           # Main app component
├── src-tauri/            # Backend (Rust)
│   ├── src/
│   │   └── main.rs       # Tauri entry point
│   └── Cargo.toml        # Rust dependencies
├── package.json
└── README.md
```

## Contributing

This is a two-person project. Each brother works on features and tests on their respective OS before pushing.

### Workflow

1. Pull latest changes
2. Work on feature branch
3. Test on your platform
4. Push and notify the other to test on their platform
5. Merge after both platforms validated

## License

MIT
