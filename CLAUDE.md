# CLAUDE.md

Cross-platform chat app: Tauri 2.0 (desktop), Android Kotlin, Node.js/Express/MongoDB backend.

## Claude Code Rules

### Absolute paths required
Working directory may be a subfolder. Use absolute paths for scripts:
```bash
/Users/mickaelfm/projects/perso/organizer/server/upload-apk.sh ...
```

### Android versioning
**DO NOT** increment `versionCode`/`versionName` unless explicitly requested for a release.

## Specific Commands

```bash
# SSH server
ssh ubuntu@51.210.150.25 "docker logs organizer-api --tail 50"

# Build Android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug

# ADB
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
~/Library/Android/sdk/platform-tools/adb logcat -s "ChatService" "SocketManager" "ChatViewModel"

# Scripts (absolute paths)
/Users/mickaelfm/projects/perso/organizer/server/deploy.sh
/Users/mickaelfm/projects/perso/organizer/server/upload-apk.sh <apk> <version> <versionCode> "notes"
/Users/mickaelfm/projects/perso/organizer/server/send-announcement.sh "message"
```

## Android UI - CRITICAL

Dark "Charcoal" theme → default Material3 colors are invisible.

**OutlinedTextField** - always add:
```kotlin
colors = OutlinedTextFieldDefaults.colors(
    cursorColor = AccentBlue,
    focusedBorderColor = AccentBlue,
    unfocusedBorderColor = AccentBlue.copy(alpha = 0.5f)
)
```

**TextButton in dialogs** - always add:
```kotlin
colors = ButtonDefaults.textButtonColors(contentColor = AccentBlue)
```

Colors: `AccentBlue` (#6B9FFF), `Charcoal` (#2D2D2D), `CharcoalLight` (#3D3D3D), `OnlineGreen` (#4CAF50)

## Android Gestures - CRITICAL

Touch events bubble bottom-up. For tap + long press with interactive children, handle both **at child level** with `detectTapGestures`.

See: `android/docs/long_press_debug.md`
