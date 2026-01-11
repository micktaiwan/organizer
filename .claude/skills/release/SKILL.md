---
name: release
description: Prepare and publish a new release - analyze changes, generate release notes, build APK, upload, announce in Lobby, and push to git
---

# Release Skill

## Overview

This skill handles the complete release process for the Organizer app.

**Important**: This analyzes UNCOMMITTED changes (staged + unstaged), not commits since a tag. The user's workflow is to make changes, then run /release to analyze, commit, and publish.

## Optional Arguments

The user can pass arguments after `/release` to customize the release:

```
/release <comments or instructions>
```

### Supported customizations

| Example | Effect |
|---------|--------|
| `/release bump to 1.3.0` | Use version 1.3.0 instead of auto-incrementing patch |
| `/release minor bump` | Increment minor version (1.2.1 → 1.3.0) |
| `/release major bump` | Increment major version (1.2.1 → 2.0.0) |
| `/release grosse release avec plein de features` | Use this context to enrich release notes |

When arguments are provided:
- **Version override**: If a specific version is mentioned (e.g., "1.3.0", "bump to 2.0"), use that version instead of auto-increment
- **Context**: Use any descriptive text to better understand and describe the changes in release notes
- **Bump type**: "minor" or "major" keywords trigger appropriate version increment

## Instructions

### Step 1: Analyze Uncommitted Changes

1. Get staged and unstaged changes: `git diff HEAD` (shows all uncommitted changes)
2. Get list of modified files: `git diff HEAD --name-only`
3. Read the actual code changes for significant files to understand what changed
4. Get current version from `android/app/build.gradle.kts`

If there are no uncommitted changes, inform the user and stop.

### Step 2: Generate Release Notes

Based on your analysis of the actual code changes (not just file names), write release notes in French that describe:
- New features added (user-visible functionality)
- Bugs fixed
- Improvements made (UX improvements, performance, etc.)

**Categorize changes by platform** based on modified file paths:
- `android/` → **Android**
- `src/`, `src-tauri/` → **Desktop**
- `server/` → **Serveur**
- Changes affecting multiple platforms or shared logic → **Général**

Format the release notes with sections using emojis (only include sections that have changes):

```
🌐 Général
• Feature affecting all platforms

🤖 Android
• Android-specific feature

🖥️ Desktop
• Desktop-specific feature

⚙️ Serveur
• Backend/API changes
```

Note: Use emojis instead of markdown bold (**) because the chat clients render plain text only.

Be specific about what changed. Include all significant changes - the announcement message will use the same content as the release notes.

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

Use the dedicated script that handles JSON encoding properly:

```bash
cd server && ./send-announcement.sh "🚀 Nouvelle version <version> disponible !

<same content as release notes>

Mettez à jour depuis les Paramètres."
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
