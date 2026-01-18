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

1. Get list of modified files: `git diff HEAD --name-only` (include untracked files with `git status --short | grep "^??"`)
2. Get current version from `android/app/build.gradle.kts`
3. **Read the diff of ALL modified files** - do not skip any file:
   - Use `git diff HEAD` to get the complete diff
   - Review EVERY file's changes, not just those that seem important
   - Even small changes (1-2 lines) can be user-visible features
4. Before generating release notes, list what changed in EACH modified file

If there are no uncommitted changes, inform the user and stop.

### Step 1.5: Detect Impacted Platforms

Categorize modified files by platform:

| File Pattern | Platform |
|--------------|----------|
| `android/**` | 🤖 Android |
| `src/**`, `src-tauri/**` | 🖥️ Desktop |
| `server/**` | ⚙️ Server |
| `docs/**`, `*.md` (root) | 📄 Docs only |

Display a summary:
```
Plateformes impactées :
• 🤖 Android : 3 fichiers
• ⚙️ Server : 5 fichiers
```

**If NO Android changes detected:**

Ask the user with `AskUserQuestion`:
- Question: "Pas de modifications Android détectées. Une release crée un APK et incrémente la version. Pourquoi veux-tu release ?"
- Options:
  1. "Continuer quand même" → Proceed with full release (APK + version bump)
  2. "Commit sans release" → Just commit changes, no version bump, no APK, no announcement
  3. "Annuler" → Stop and let user decide

If user chooses "Commit sans release", skip Steps 5-9 (version bump, APK, upload, announcement) and only do:
- Code review (Step 2)
- Commit with descriptive message (not "release: vX.X.X")
- Push to remote

### Step 2: Code Review

Review all modified files against these rules:

#### Rule 1: No French in Code (except UI)

French is **only allowed** in:
- User-visible strings (UI labels, messages displayed to users)
- **API error responses** (messages returned to clients that may be displayed in the UI)
- Release notes and announcements

French is **NOT allowed** in:
- Variable names, function names, class names
- Code comments
- Log messages (console.log, Log.d, println, etc.)
- **Internal exception messages** (thrown errors caught by code, not shown to users)
- TODO/FIXME comments

**How to check:**
1. Review the diff (`git diff HEAD`) for each modified file
2. Look for French words in:
   - Comments (`//`, `/* */`, `#`, `<!-- -->`)
   - Log statements
   - Variable/function names
3. Exclude strings that are clearly user-facing (displayed in UI)

**If violations found:**
- List each violation with file, line, and the problematic text
- Ask the user: "Fix these issues before continuing?" with options:
  - "Yes, fix them" → Make the corrections (translate to English)
  - "Skip review" → Continue without fixing (user's choice)

#### Rule 2: Technology-Aware Code Review with Context7

**Step 2.1: Detect Technologies**

Analyze the modified files to identify the technologies/frameworks used:

| File Pattern | Technology |
|--------------|------------|
| `android/**/*.kt` | Kotlin, Jetpack Compose, Android SDK |
| `src/**/*.tsx`, `src/**/*.ts` | React, TypeScript |
| `server/**/*.ts` | Node.js, Express, TypeScript |
| `src-tauri/**/*.rs` | Rust, Tauri |

**Step 2.2: Query Context7 for Best Practices**

For each detected technology with significant changes:

1. Use `mcp__plugin_context7_context7__resolve-library-id` to get the library ID
2. Use `mcp__plugin_context7_context7__query-docs` with queries like:
   - "best practices and common mistakes"
   - "code review checklist"
   - Specific queries based on what the code does (e.g., "Room database best practices" if using Room)

**Step 2.3: Review Code Against Documentation**

Compare the modified code against Context7's documentation:
- Check for deprecated APIs or patterns
- Verify correct usage of framework features
- Identify potential bugs or anti-patterns
- Suggest improvements based on official recommendations

**Report findings:**
- Group issues by severity: 🔴 Critical, 🟡 Warning, 🔵 Suggestion
- For each issue, cite the source (Context7 documentation)
- Ask user before making any fixes

### Step 3: Generate Release Notes

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

### Step 4: Show Summary and Get Confirmation

Display to the user:
- Current version and new version (increment patch: 1.2.0 -> 1.2.1)
- List of modified files (summarized)
- Generated release notes
- The announcement message that will be sent to Lobby

Ask for confirmation before proceeding.

### Step 5: Update Version

> **Skip if user chose "Commit sans release" in Step 1.5**

Edit `android/app/build.gradle.kts` and increment:
- `versionCode` by 1
- `versionName` patch version (e.g., 1.2.0 -> 1.2.1)

### Step 6: Commit and Tag

**For full release:**
```bash
git add -A
git commit -m "release: v<version>

<release-notes>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git tag "v<version>"
```

**For "Commit sans release" (no Android changes):**
```bash
git add -A
git commit -m "<type>(<scope>): <description>

<release-notes>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
# NO tag
```
Use conventional commit format: `feat`, `fix`, `refactor`, `docs`, `chore`, etc.

### Step 7: Build APK

> **Skip if user chose "Commit sans release" in Step 1.5**

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
```

### Step 8: Upload APK

> **Skip if user chose "Commit sans release" in Step 1.5**

Use the upload script:
```bash
cd server && ./upload-apk.sh ../android/app/build/outputs/apk/debug/app-debug.apk <version> <versionCode> "<release-notes>"
```

### Step 9: Send Announcement to Lobby

> **Skip if user chose "Commit sans release" in Step 1.5**

Use the dedicated script that handles JSON encoding properly:

```bash
cd server && ./send-announcement.sh "🚀 Nouvelle version <version> disponible !

<same content as release notes>

Mettez à jour depuis les Paramètres."
```

Ask user if they want to send the announcement before sending.

### Step 10: Push to Remote

```bash
git push origin main --tags
```

## Important Notes

- Always ask for confirmation before any destructive/irreversible actions
- Show the announcement message before sending
- If any step fails, stop and report the error
- The release notes should be in French for the announcement
- If no uncommitted changes exist, stop immediately and inform the user
