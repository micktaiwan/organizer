# Notifications Desktop (macOS)

## Comportement

Quand un message arrive et que la fenêtre n'est pas au premier plan :
1. Une notification système s'affiche
2. Le `roomId` est stocké dans `localStorage`
3. Quand l'utilisateur clique sur la notification, macOS ramène l'app au premier plan
4. L'app détecte le focus, récupère le `roomId` stocké et navigue vers la room

## Limitation : Mode Dev vs Prod

**En mode dev** (`npm run tauri dev`), cliquer sur la notification ne ramène PAS l'app au premier plan. C'est une limitation macOS pour les apps non signées.

**En mode prod** (build signé), le clic sur la notification fonctionne correctement.

**Workaround en dev** : cliquer sur l'icône de l'app dans le dock ou le tray.

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/utils/notifications.ts` | `showMessageNotification()` stocke le roomId, `consumePendingNotificationRoomId()` le récupère |
| `src/App.tsx` | Écoute `onFocusChanged` et navigue vers la room |
| `src/hooks/useRooms.ts` | Appelle `showMessageNotification()` avec le roomId |

## Pourquoi pas `onAction` ?

Le plugin Tauri `@tauri-apps/plugin-notification` expose une fonction `onAction` pour écouter les clics sur les notifications, mais elle est **Mobile Only** (iOS/Android). Sur macOS desktop, cette API n'est pas implémentée.

La solution via `localStorage` + `onFocusChanged` est un workaround qui fonctionne parce que cliquer sur une notification macOS ramène toujours l'app au premier plan (en prod).
