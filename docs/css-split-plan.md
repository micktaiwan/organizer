# Plan de découpage App.css

## Situation initiale

`src/App.css` : **4730 lignes** - trop long, difficile à maintenir.

## Problème principal

Les blocs `@media (prefers-color-scheme: dark)` mélangent les styles de plusieurs composants. Exemple : le bloc lignes 1950-2161 contient du dark mode pour Chat ET Auth.

## Structure du fichier original

| Lignes | Contenu | Destination |
|--------|---------|-------------|
| 1-46 | Variables CSS, reset | App.css |
| 47-286 | Buttons, badges | ui/common.css |
| 287-397 | Connection Screen | Auth/AuthScreen.css |
| 398-1482 | Chat Screen (messages, images, calls, contacts) | Chat/Chat.css |
| 1483-1712 | Auth screens, App root, Loading | Auth/AuthScreen.css |
| 1713-1948 | Admin Panel | Admin/AdminPanel.css |
| 1950-2161 | Dark mode mixte (Chat + Auth) | À découper |
| 2163-2425 | Server Config Screen | ServerConfig/ServerConfig.css |
| 2427-2514 | Dark mode Server Config | ServerConfig/ServerConfig.css |
| 2516-3029 | Room Layout, Room Members | Chat/Chat.css |
| 3030-3216 | Dark mode Rooms | Chat/Chat.css |
| 3218-3395 | Message Delete, Reactions | Chat/Chat.css |
| 3263-3271 | Dark mode petit bloc | Chat/Chat.css |
| 3359-3394 | Dark mode Reactions | Chat/Chat.css |
| 3426-3478 | App Tabs + dark mode | App.css |
| 3480-4685 | Notes | Notes/Notes.css |
| 4686-4730 | Dark mode Notes | Notes/Notes.css |

## Découpage du dark mode mixte (1950-2161)

| Lignes | Contenu | Destination |
|--------|---------|-------------|
| 1951-1962 | :root variables dark | App.css (déjà fait) |
| 1964-1977 | connection-box, input | Auth/AuthScreen.css |
| 1979-2064 | chat-header, messages, contacts | Chat/Chat.css |
| 2065-2160 | auth-tabs, form, user-search | Auth/AuthScreen.css |

## État actuel

### Fichiers créés (incomplets/buggés)
- `src/components/ui/common.css` - 240 lignes ✓
- `src/components/Admin/AdminPanel.css` - 236 lignes ✓
- `src/components/ServerConfig/ServerConfig.css` - 352 lignes ✓
- `src/components/Notes/Notes.css` - 1252 lignes ✓
- `src/components/Auth/AuthScreen.css` - problème d'accolades
- `src/components/Chat/Chat.css` - problème d'accolades

### App.css actuel
- ~315 lignes avec @imports
- Contient : variables, dark mode :root, tabs, Local Server Control Panel

## Prochaines étapes

1. Corriger Auth/AuthScreen.css avec les bonnes plages :
   - Light: 287-397, 1483-1712
   - Dark: 1964-1977, 2065-2160

2. Corriger Chat/Chat.css avec les bonnes plages :
   - Light: 398-1482, 2516-3029, 3218-3395
   - Dark: 1979-2064, 3030-3216, 3263-3271, 3359-3394

3. Vérifier le build

4. Tester visuellement l'app

## Commande pour tout annuler

```bash
git checkout HEAD -- src/App.css
rm -f src/components/{ui/common,Auth/AuthScreen,Chat/Chat,Admin/AdminPanel,ServerConfig/ServerConfig,Notes/Notes}.css
```
