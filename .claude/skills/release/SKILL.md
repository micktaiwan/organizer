---
name: release
description: Prepare and publish a new release - analyze changes, generate release notes, build APK, upload, announce in Lobby, and push to git
---

# Release Skill

## Overview

This skill handles the complete release process for the Organizer app.

**Important**: This analyzes UNCOMMITTED changes (staged + unstaged), not commits since a tag. The user's workflow is to make changes, then run /release to analyze, commit, and publish.

## Instructions

### Step 1: Analyze Uncommitted Changes

1. Get staged and unstaged changes: `git diff HEAD` (shows all uncommitted changes)
2. Get list of modified files: `git diff HEAD --name-only`
3. Read the actual code changes for significant files to understand what changed
4. Get current version from `android/app/build.gradle.kts`

If there are no uncommitted changes, inform the user and stop.

### Step 2: Generate Release Notes

Based on your analysis of the actual code changes (not just file names), write concise release notes in French that describe:
- New features added
- Bugs fixed
- Improvements made

Keep it short (2-3 bullet points max). Be specific about what changed.

### Step 3: Show Summary and Get Confirmation

Display to the user:
- Current version and new version (increment patch: 1.2.0 -> 1.2.1)
- List of modified files (summarized)
- Generated release notes
- The announcement message that will be sent to Lobby

Ask for confirmation before proceeding.

### Step 4: Update Version

Edit `android/app/build.gradle.kts` and increment:
- `versionCode` by 1
- `versionName` patch version (e.g., 1.2.0 -> 1.2.1)

### Step 5: Commit and Tag

```bash
git add -A
git commit -m "release: v<version>

<release-notes>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git tag "v<version>"
```

### Step 6: Build APK

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
```

### Step 7: Upload APK

Use the upload script:
```bash
cd server && ./upload-apk.sh ../android/app/build/outputs/apk/debug/app-debug.apk <version> <versionCode> "<release-notes>"
```

### Step 8: Send Announcement to Lobby

1. Get auth credentials from `server/.credentials` (source it)
2. Login to get JWT token
3. Get Lobby room ID
4. Send system message with announcement

```bash
# Source credentials
source server/.credentials

# Get token
TOKEN=$(curl -s -X POST "http://51.210.150.25:3001/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\": \"$ADMIN_USERNAME\", \"password\": \"$ADMIN_PASSWORD\"}" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('token', ''))")

# Get Lobby ID
LOBBY_ID=$(curl -s -X GET "http://51.210.150.25:3001/rooms" \
    -H "Authorization: Bearer $TOKEN" | \
    python3 -c "import sys,json; rooms=json.load(sys.stdin); print(next((r['_id'] for r in rooms if r.get('isLobby')), ''))")

# Send message
curl -s -X POST "http://51.210.150.25:3001/messages" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"roomId\": \"$LOBBY_ID\", \"type\": \"system\", \"content\": \"<announcement>\"}"
```

Ask user if they want to send the announcement before sending.

### Step 9: Push to Remote

```bash
git push origin main --tags
```

## Important Notes

- Always ask for confirmation before any destructive/irreversible actions
- Show the announcement message before sending
- If any step fails, stop and report the error
- The release notes should be in French for the announcement
- If no uncommitted changes exist, stop immediately and inform the user
