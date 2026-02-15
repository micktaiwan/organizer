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
2. **Determine the next version from git tags (NOT from version files)**:
   - Run `git tag -l "v*" | sort -V | tail -1` to get the highest existing tag
   - The next version is this tag's version incremented by patch (e.g., v1.11.0 → 1.11.1)
   - **NEVER rely on `build.gradle.kts`, `package.json`, or other version files** to determine the next version — these may be out of sync with the actual tags
   - Verify the chosen version tag does not already exist: `git tag -l "v<chosen-version>"` must return empty
   - If the user provides a version override (via arguments), still verify it doesn't conflict with existing tags
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

The release will still bump the version and tag, but skip APK build/upload (Steps 7-8).

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

### Step 2.5: Regression Analysis

Read `docs/specs.md` in full. This file contains the functional specifications of the app (expected behaviors, features, UX rules).

For each spec listed in the file, check whether any of the uncommitted changes could **break or contradict** that spec. A regression is:
- Removing or altering behavior that a spec explicitly requires
- Changing a component/function in a way that violates a documented rule
- Deleting code that implements a documented feature without replacing it

**How to check:**
1. Read `docs/specs.md` entirely
2. For each spec entry, cross-reference with the diff from Step 1
3. Flag any change that could violate an existing spec

**If a potential regression is found:**
- List each regression with:
  - The spec it violates (quote the relevant line from specs.md)
  - The file/change that causes it
  - Why it's a regression
- **STOP the release** and ask the user how to proceed:
  - "Fix the regression" → Make corrections
  - "Update the spec" → The spec is outdated, update `docs/specs.md` to match the new behavior
  - "Ignore" → Proceed anyway (user takes responsibility)

**If no regressions found:** proceed to Step 3.

### Step 2.7: Update Specs

If the changes introduce **new user-visible features or behaviors**, add them to `docs/specs.md`:

1. Identify new features from the diff (UI changes, new interactions, new rules)
2. For each new feature, add a one-line spec in the appropriate section
3. Follow the existing format: `- [Platform prefix if applicable]: <concise behavior description>`
4. Do NOT add specs for internal/technical changes (refactoring, dependencies, build config)
5. Do NOT duplicate specs already present in the file

Show the user the lines to be added and get confirmation before writing.

### Step 3: Generate Release Notes

Based on your analysis of the actual code changes (not just file names), write release notes in French.

**CRITICAL: Write from the USER's perspective, not the developer's.**

- Describe what changes **for the user** (what they see, what works better, what's new)
- NEVER describe technical implementation details (endpoints, sockets, ObjectIds, refs, handlers...)
- If multiple technical changes (server + client) produce ONE user-visible improvement, write ONE bullet point describing the result
- Use simple, non-technical language that any user can understand

**Examples:**

| ❌ Technical (wrong) | ✅ User-friendly (correct) |
|---|---|
| Le endpoint mark-room-as-read broadcast maintenant l'événement message:read | Les checkmarks de lecture se mettent à jour en temps réel |
| Fix type mismatch ObjectId dans readBy | Fix des badges de messages non-lus qui restaient affichés |
| Fix race condition au changement de room | Fix d'un bug rare quand on changeait rapidement de conversation |
| Retry automatique du markAsRead en cas d'erreur réseau | Les messages se marquent comme lus même après une coupure réseau |

**Categorize by platform** (only include sections that have changes):

```
🌐 Général
• Improvement visible on all platforms

🤖 Android
• Android-specific improvement

🖥️ Desktop
• Desktop-specific improvement
```

Note: Use emojis instead of markdown bold (**) because the chat clients render plain text only.

Do NOT include a "⚙️ Serveur" section — server changes should be described through their user-visible impact in the relevant platform section (or 🌐 Général if they affect all platforms).

### Step 4: Show Summary and Get Confirmation

Display to the user:
- Current version and new version (increment patch: 1.2.0 -> 1.2.1)
- List of modified files (summarized)
- Generated release notes
- The announcement message that will be sent to Lobby

Ask for confirmation before proceeding.

### Step 5: Update Version

Only update version files for **impacted platforms** (detected in Step 1.5). Desktop and Android versions can differ.

1. **Android** (only if Android changes detected) — `android/app/build.gradle.kts`:
   - `versionCode` +1
   - `versionName` to new version

2. **Desktop** (only if Desktop changes detected) — Update these 3 files with the new version string:
   - `src-tauri/tauri.conf.json` → `"version": "<version>"`
   - `src-tauri/Cargo.toml` → `version = "<version>"`
   - `package.json` → `"version": "<version>"`

### Step 6: Commit and Tag

```bash
git add -A
git commit -m "release: v<version>

<release-notes>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git tag "v<version>"
```

### Step 7: Build APK

> **Skip if no Android changes detected in Step 1.5**

Build the release APK (with R8 minification enabled):
```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleRelease
```

Then sign it with the debug keystore:
```bash
~/Library/Android/sdk/build-tools/34.0.0/apksigner sign \
  --ks ~/.android/debug.keystore \
  --ks-pass pass:android \
  --out app/build/outputs/apk/release/app-release-signed.apk \
  app/build/outputs/apk/release/app-release-unsigned.apk
```

### Step 8: Upload APK

> **Skip if no Android changes detected in Step 1.5**

Use the upload script:
```bash
cd server && ./upload-apk.sh ../android/app/build/outputs/apk/release/app-release-signed.apk <version> <versionCode> "<release-notes>"
```

### Step 9: Send Announcement to Lobby

Use the dedicated script that handles JSON encoding properly.

End the announcement with platform-specific update instructions (only include impacted platforms):

```
🤖 Android : mettez à jour depuis les Paramètres.
🖥️ Desktop : git pull && npm run tauri dev
```

Example:
```bash
cd server && ./send-announcement.sh "🚀 Nouvelle version <version> disponible !

<same content as release notes>

🖥️ Desktop : git pull && npm run tauri dev"
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
