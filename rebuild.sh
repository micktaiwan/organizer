#!/bin/bash
# Rebuild Organizer.app and install to /Applications
set -e

cd "$(dirname "$0")"

echo "⬇️  Pulling latest changes..."
git pull

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building Organizer.app..."
npm run tauri build 2>&1 | tail -5 || true

APP_SRC="$HOME/.cargo/target/release/bundle/macos/Organizer.app"
if [ ! -d "$APP_SRC" ]; then
  echo "❌ Build failed: $APP_SRC not found"
  exit 1
fi

echo "📲 Installing to /Applications..."
rm -rf /Applications/Organizer.app
cp -r "$APP_SRC" /Applications/Organizer.app

echo "✅ Organizer.app installed ($(du -sh /Applications/Organizer.app | cut -f1))"
