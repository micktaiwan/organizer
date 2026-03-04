#!/bin/bash
# Start Organizer desktop app (Tauri dev mode)
set -e

cd "$(dirname "$0")"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install Node $(cat .nvmrc) first."
  exit 1
fi

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start Tauri dev (Vite on :1420 + native window)
npm run tauri dev
