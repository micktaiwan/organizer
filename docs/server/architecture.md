# Architecture Server

## Vue d'ensemble

```
                    Clients (Desktop Tauri / Android / Claude Code)
                                        |
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
             ┌──────▼──────┐    ┌───────▼──────┐    ┌──────▼──────┐
             │  REST API   │    │  Socket.io   │    │ MCP Server  │
             │  (Express)  │    │  (realtime)  │    │ (JSON-RPC)  │
             └──────┬──────┘    └───────┬──────┘    └──────┬──────┘
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        │
                           ┌────────────▼────────────┐
                           │    Services Layer       │
                           │  (Business Logic)       │
                           └─────┬──────────────┬────┘
                                 │              │
                    ┌────────────▼──┐    ┌──────▼────────────┐
                    │   MongoDB     │    │   Qdrant          │
                    │  (documents)  │    │  (vecteurs/memory) │
                    └───────────────┘    └───────────────────┘
                                                │
                           ┌────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Worker Eko  │
                    │ (process)   │
                    │ Claude SDK  │
                    └─────────────┘
```

**Stack** : Node.js/Express, Socket.io, MongoDB (Mongoose), Qdrant, Claude Agent SDK

**Deploiement** : Docker Compose (3 containers : api, mongodb, qdrant)

---

## REST API

### Auth (`/auth`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/auth/register` | Inscription (premier user = admin) |
| POST | `/auth/login` | Login username/email + password |
| POST | `/auth/refresh` | Refresh access token (rotation du refresh token) |
| POST | `/auth/logout` | Revoque le refresh token |
| GET | `/auth/me` | Profil de l'utilisateur connecte |

### Users (`/users`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/users/search?q=` | Recherche users par username/displayName |
| GET | `/users/:id` | Profil user par ID |
| GET | `/users/locations` | Tous les users avec localisation |
| GET | `/users/:userId/location-history` | Historique localisation d'un user |
| GET | `/users/tracks` | Tous les tracks GPS (filtre optionnel userId) |
| GET | `/users/tracks/:trackId` | Track specifique par ID |
| GET | `/users/:userId/track` | Track actif d'un user |
| PUT | `/users/status` | Maj status (status, statusMessage, isMuted, expiresAt) |
| PUT | `/users/location` | Maj localisation (sauvegarde historique + track actif) |
| PUT | `/users/tracking` | Activer/desactiver le mode tracking |
| POST | `/users/tracks/sync` | Sync track offline complet depuis le client |
| PUT | `/users/tracks/:trackId` | Maj track avec points finaux |
| DELETE | `/users/tracks/:trackId` | Supprimer un track (owner ou admin) |
| PATCH | `/users/me` | Modifier son profil (displayName) |

### Rooms (`/rooms`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/rooms` | Liste rooms accessibles avec compteurs non-lus |
| GET | `/rooms/:roomId` | Detail d'une room |
| POST | `/rooms` | Creer une room (public ou private) |
| POST | `/rooms/:roomId/join` | Rejoindre une room publique |
| POST | `/rooms/:roomId/leave` | Quitter une room (sauf lobby) |
| DELETE | `/rooms/:roomId` | Supprimer room (createur, supprime messages + fichiers) |
| GET | `/rooms/:roomId/messages` | Historique messages (pagination limit/before) |
| GET | `/rooms/:roomId/messages/unread` | Messages avec separateur non-lus |
| GET | `/rooms/:roomId/messages/around` | Messages autour d'un timestamp |
| GET | `/rooms/:roomId/search` | Recherche messages (texte + regex) |
| POST | `/rooms/:roomId/read` | Marquer tous les messages comme lus |

### Messages (`/messages`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/messages` | Envoyer un message (text, audio, system) |
| GET | `/messages/:id` | Message unique |
| PATCH | `/messages/:id/read` | Marquer comme lu |
| POST | `/messages/:id/react` | Toggle reaction |
| POST | `/messages/read-bulk` | Marquer plusieurs messages comme lus |
| DELETE | `/messages/:id` | Supprimer message (+ fichiers associes) |

### Notes (`/notes`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/notes` | Liste notes (filtre labelId, archived) |
| GET | `/notes/:id` | Note unique |
| POST | `/notes` | Creer note ou checklist |
| PUT | `/notes/:id` | Maj complete |
| PATCH | `/notes/:id` | Maj partielle |
| DELETE | `/notes/:id` | Supprimer |
| POST | `/notes/reorder` | Reordonner |
| POST | `/notes/:id/items` | Ajouter item checklist |
| PATCH | `/notes/:id/items/:itemId` | Modifier item checklist |
| DELETE | `/notes/:id/items/:itemId` | Supprimer item checklist |
| POST | `/notes/:id/items/reorder` | Reordonner items checklist |

### Labels (`/labels`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/labels` | Liste labels |
| POST | `/labels` | Creer label |
| PUT | `/labels/:id` | Modifier label |
| DELETE | `/labels/:id` | Supprimer label (retire de toutes les notes) |

### Upload (`/upload`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/upload/image` | Upload image (resize Sharp, max 2MB output) |
| POST | `/upload/file` | Upload fichier (max 25MB) |
| POST | `/upload/video` | Upload video (max 100MB, thumbnail async ffmpeg) |

### Files (`/files`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/files` | Liste fichiers (pagination, filtres type/search, tri date/size) |
| DELETE | `/files/:fileId` | Soft delete fichier |

### Contacts (`/contacts`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/contacts` | Liste contacts |
| POST | `/contacts` | Ajouter contact |
| PATCH | `/contacts/:id` | Modifier nickname |
| DELETE | `/contacts/:id` | Supprimer contact |

### APK (`/apk`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/apk/upload` | Upload APK (admin, calcul SHA-256) |
| GET | `/apk/latest` | Derniere version APK (public) |
| GET | `/apk/download/:filename` | Download APK (public, incremente compteur) |
| GET | `/apk/versions` | Liste versions APK |
| DELETE | `/apk/:version` | Supprimer version APK (admin) |

### Admin (`/admin`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/admin/stats` | Statistiques generales |
| GET | `/admin/users` | Liste users (pagine) |
| GET | `/admin/users/:id` | Detail user + stats |
| PATCH | `/admin/users/:id` | Modifier user (displayName, isAdmin) |
| DELETE | `/admin/users/:id` | Supprimer user + donnees associees |
| GET | `/admin/messages/stats` | Stats messages |
| POST | `/admin/digest` | Forcer un digest |

### Agent / Eko (`/agent`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/agent/health` | Health check worker |
| POST | `/agent/ask` | Poser une question a Eko (retourne response + expression) |
| POST | `/agent/reset` | Reset session Eko |
| GET | `/agent/memory/info` | Info collection Qdrant |
| DELETE | `/agent/memory/:id` | Supprimer une memoire |

### Brain Dashboard (`/agent/brain`)

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/agent/brain/counts` | Compteurs (self, goals, facts, live) |
| GET | `/agent/brain/self` | Tous les items self (max 100) |
| GET | `/agent/brain/goals` | Tous les goals (max 100) |
| GET | `/agent/brain/facts` | Tous les facts (max 100) |
| GET | `/agent/brain/live` | Info live buffer + preview (10 derniers) |
| DELETE | `/agent/brain/live` | Vider tout le live buffer |
| DELETE | `/agent/brain/live/:id` | Supprimer un message live |
| DELETE | `/agent/brain/self/:id` | Supprimer un item self |
| DELETE | `/agent/brain/goals/:id` | Supprimer un goal |
| DELETE | `/agent/brain/facts/:id` | Supprimer un fact |

### MCP Admin (`/mcp-admin`)

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/mcp-admin/tokens` | Creer token MCP (admin) |
| GET | `/mcp-admin/tokens` | Lister tokens |
| POST | `/mcp-admin/tokens/:id/revoke` | Revoquer token |
| DELETE | `/mcp-admin/tokens/:id` | Supprimer token |
| GET | `/mcp-admin/audit` | Logs d'audit (filtre tokenId) |

### Reflection / Cron

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/reflection/status` | Status reflection + prochaine execution |
| POST | `/reflection/toggle` | Activer/desactiver le cron (admin) |
| POST | `/reflection/trigger` | Declenchement manuel |
| POST | `/reflection/trigger/dry-run` | Dry-run (pas de message envoye) |
| POST | `/reflection/reset-cooldown` | Reset cooldown |

### Health

| Methode | Route | Description |
|---------|-------|-------------|
| GET | `/health` | Health check simple |
| GET | `/health/detailed` | Health detaille (Qdrant + MongoDB) |
| GET | `/disk-space` | Espace disque serveur |

---

## Socket.io

### Server vers Client

**Users :**
- `users:init` - Liste initiale des users connectes
- `user:online` - User connecte (status, appVersion, lastClient)
- `user:offline` - User deconnecte
- `user:status-changed` - Changement de status
- `user:location-updated` - Localisation mise a jour
- `user:tracking-changed` - Mode tracking change
- `user:track-point` - Nouveau point de tracking
- `user:joined-room` - User a rejoint une room
- `user:left-room` - User a quitte une room

**Messages :**
- `message:new` - Nouveau message dans une room
- `message:read` - Messages marques comme lus
- `message:deleted` - Message supprime
- `message:reacted` - Reaction ajoutee/retiree
- `unread:updated` - Compteur non-lus change

**Rooms :**
- `room:created` - Nouvelle room (publiques seulement)
- `room:updated` - Room modifiee
- `room:deleted` - Room supprimee

**Typing :**
- `typing:start` - User commence a taper (auto-stop 3s)
- `typing:stop` - User arrete de taper

**WebRTC :**
- `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` / `webrtc:close` / `webrtc:error`

**Appels :**
- `call:request` / `call:accept` / `call:reject` / `call:end`
- `call:answered-elsewhere` / `call:toggle-camera` / `call:screen-share` / `call:error`

**Notes :**
- `note:created` / `note:updated` / `note:deleted`
- `label:created` / `label:updated` / `label:deleted`

**Fichiers :**
- `file:deleted` - Fichier soft-delete

**Eko :**
- `eko:status` - Status Eko (idle / observing / thinking)
- `reflection:progress` - Progression reflection (gathering / context / thinking / done)
- `reflection:update` - Reflection terminee (stats + derniere entree)
- `cron:status` - Cron active/desactive

### Client vers Server

- `room:join` / `room:leave` - Rejoindre/quitter une room
- `typing:start` / `typing:stop` - Indicateur de frappe
- `message:read` / `message:delete` / `message:react`
- `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` / `webrtc:close`
- `call:request` / `call:accept` / `call:reject` / `call:end` / `call:toggle-camera` / `call:screen-share`
- `note:subscribe` / `note:unsubscribe`
- `location:subscribe` / `location:unsubscribe`

---

## MongoDB Models

### User
username, displayName, email, passwordHash, isOnline, isAdmin, isBot, status (available/busy/away/dnd), statusMessage, isMuted, location {lat, lng, street, city, country}, appVersion {versionName, versionCode}, lastClient (desktop/android), isTracking, currentTrackId, lastSeen

### Message
roomId, senderId, type (text/image/audio/system/file/video), content, caption, fileName, fileSize, mimeType, fileDeleted, thumbnailUrl, duration, width, height, status (sent/delivered/read), readBy[], reactions[] {userId, emoji}, clientSource (desktop/android/api/mcp/mcp-bot)

### Room
name, type (lobby/public/private), isLobby, members[] {userId, joinedAt, lastReadAt}, createdBy, lastMessageAt

### Note
type (note/checklist), title, content, items[] {text, checked, order}, color, labels[], assignedTo, createdBy, order, isPinned, isArchived

### Label
name, color, createdBy

### Contact
userId, contactId, nickname

### LocationHistory
userId, lat, lng, accuracy, street, city, country

### Track
userId, points[] {lat, lng, accuracy, timestamp, street, city, country}, startedAt, endedAt, isActive

### ApkVersion
version, versionCode, filename, fileSize, checksum, releaseNotes, isLatest, downloadCount, uploadedBy

### McpToken
token (hash), tokenPrefix, name, userId, scopes[] (read/write), allowedTools[], rateLimit, isRevoked, expiresAt, lastUsedAt

### McpAuditLog
tokenId, userId, action, method, params, result, errorMessage, ip, userAgent, durationMs

### Reflection
timestamp, activitySummary, goalsCount, factsCount, action (pass/message), message, reason, tone, goalId, roomId, roomName, rateLimited, dryRun, llmModel, inputTokens, outputTokens, durationMs

### ReflectionStats (singleton)
totalReflections, passCount, messageCount, rateLimitedCount, totalInputTokens, totalOutputTokens, lastMessageAt

### SystemConfig (key-value)
Stockage cle-valeur pour config systeme (ex: `reflection.enabled`)

### RefreshToken
tokenHash, userId, expiresAt, revoked

---

## MCP Server

Endpoint JSON-RPC 2.0 : `POST /mcp`

Auth : Bearer token (`McpToken` model, hash SHA-256)

### Outils disponibles

**Lecture :**

| Outil | Description |
|-------|-------------|
| `list_rooms` | Liste des rooms accessibles |
| `list_messages` | Messages d'une room |
| `search_users` | Recherche users |
| `get_unread` | Compteurs non-lus |
| `list_notes` | Liste des notes |
| `search_notes` | Recherche notes par texte |
| `get_note` | Detail d'une note |
| `search_memories` | Recherche semantique dans les facts |
| `get_recent_memories` | Facts recents par timestamp |
| `search_self` | Recherche self-knowledge (filtre par categorie) |
| `search_goals` | Recherche goals/curiosites |

**Ecriture :**

| Outil | Description |
|-------|-------------|
| `send_message` | Envoyer un message dans une room |
| `send_bot_message` | Envoyer un message en tant que bot |
| `create_note` | Creer une note/checklist |
| `update_note` | Modifier une note |
| `store_memory` | Stocker un fait (avec dedup) |
| `delete_memory` | Supprimer un fait |
| `store_self` | Stocker self-knowledge |
| `delete_self` | Supprimer self item |
| `store_goal` | Stocker un goal/curiosite |
| `delete_goal` | Supprimer un goal |

**Audit** : Chaque appel est logue dans `McpAuditLog` (tokenId, action, params, result, durationMs)

---

## Memoire vectorielle (Qdrant)

4 collections, embeddings OpenAI `text-embedding-3-small` (1536 dim).

| Collection | Contenu | TTL | Dedup |
|------------|---------|-----|-------|
| `organizer_memory` | Faits sur les users/monde | 7j/30j/90j/permanent | Oui (seuil 0.85) |
| `organizer_self` | Identite d'Eko (context, capability, limitation, preference, relation) | Non | Oui (seuil 0.85) |
| `organizer_goals` | Curiosites d'Eko (curiosity, project, learning, feature) | Non | Non |
| `organizer_live` | Buffer messages Lobby recents | Vide au digest | Non |

### Services

| Fichier | Fonctions principales |
|---------|----------------------|
| `qdrant.service.ts` | storeFactMemory, searchFacts, listFacts, deleteFact, deleteExpiredMemories |
| `self.service.ts` | storeSelf, searchSelf, storeGoal, searchGoals, listSelfWithIds, listGoalsWithIds |
| `live.service.ts` | storeLiveMessage, getAllLiveMessagesWithIds, clearLiveCollection |
| `digest.service.ts` | Cron 4h : extraction LLM des facts depuis le live buffer, stockage, clear |
| `embedding.service.ts` | generateEmbedding, generateEmbeddings (batch) |

---

## Agent Eko

### Architecture

```
AgentService (service.ts)
    │
    ├── spawn ──► Worker (worker.mjs) ── process separe
    │                 │
    │                 ├── Queue serialisee (1 requete a la fois)
    │                 ├── runQuery() ── agent.mjs
    │                 │       │
    │                 │       ├── Live context injection (Qdrant live)
    │                 │       ├── Claude Agent SDK query() ── 10 turns max
    │                 │       ├── MCP local : respond tool
    │                 │       └── MCP HTTP : 14 outils Organizer
    │                 │
    │                 └── Session management (15min timeout par user)
    │
    └── Reflection Service (reflection.service.ts)
            │
            ├── Cron 3h : pose 1 question/goal dans le Lobby
            ├── Rate limit : 30min cooldown, max 5/jour
            ├── Appel Anthropic SDK direct (pas Agent SDK)
            └── Toggle admin via socket.io
```

### Modele LLM

- **Agent (chat)** : `claude-sonnet-4-5` (configurable via `AGENT_MODEL`)
- **Reflection** : configurable via `getDigestModel()`
- **Embeddings** : OpenAI `text-embedding-3-small`

### Respond tool

Outil MCP local (pas HTTP) qui capture la reponse finale de l'agent. Retourne une `expression` (neutral, happy, laughing, surprised, sad, sleepy, curious) + le `message` texte.

---

## Middleware

### Auth (`middleware/auth.ts`)

- **authMiddleware** : valide JWT Bearer token, peuple `req.user` / `req.userId`
- **adminMiddleware** : verifie `req.user.isAdmin`, retourne 403 sinon
- **Dev mode** : `DEV_SKIP_AUTH=true` pour bypass en local

### Tokens

- **Access token** : JWT, 1h d'expiration
- **Refresh token** : 64 bytes random, hash SHA-256, 30 jours, rotation a chaque refresh
- **MCP token** : statique, scopes read/write, allowedTools[]

### MCP Auth (`mcp/auth.ts`)

- Valide hash du token Bearer contre `McpToken`
- Verifie : non revoque, non expire, rate limit
- Peuple `req.mcpToken` / `req.mcpUser`

---

## Deploiement Docker

Fichier : `server/docker-compose.prod.yml`

| Service | Image | Port | Volumes |
|---------|-------|------|---------|
| **api** (organizer-api) | Node.js | 3001 | uploads, apk, logs, agent-config.json |
| **mongodb** (organizer-mongodb) | Mongo 5 | interne | mongodb_data |
| **qdrant** (organizer-qdrant) | v1.16.3 | 6333 (HTTP), 6334 (gRPC) | qdrant_data |

**Reseau** : `organizer-network` (bridge)

**Health check** : `wget /health` toutes les 30s

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Cle API Claude (requis) |
| `OPENAI_API_KEY` | Cle API OpenAI pour embeddings (requis) |
| `JWT_SECRET` | Secret pour signer les JWT (requis) |
| `EKO_MCP_TOKEN` | Bearer token pour le MCP HTTP interne (requis) |
| `AGENT_MODEL` | Modele Claude (defaut: `claude-sonnet-4-5`) |
| `QDRANT_URL` | URL Qdrant (defaut: `http://qdrant:6333`) |
| `MCP_URL` | URL MCP interne (defaut: `http://localhost:3001/mcp`) |
| `CORS_ORIGIN` | Origines CORS autorisees (defaut: `*`) |
| `LOG_DIR` | Repertoire logs (defaut: `/app/logs`) |

---

## Utilitaires

| Fichier | Role |
|---------|------|
| `utils/socketEmit.ts` | `emitNewMessage()` : broadcast message:new + stocke dans live buffer |
| `utils/eko-handler.ts` | Gere les messages mentionnant @eko dans les rooms |
| `utils/logger.ts` | Winston logger avec rotation fichiers |
| `utils/logStreamer.ts` | Streaming logs temps reel via Socket.io (admin) |
| `jobs/generateThumbnail.ts` | Queue async generation thumbnail video (ffmpeg) |

---

## Conventions

### Nommage
- Services : `<entity>.service.ts`
- Routes : `<entity>.ts` dans `routes/`
- MCP handlers : `<action>-<entity>.ts` dans `mcp/handlers/`
- Fonctions : `verbNoun` (ex: `listNotes`, `getNoteById`)

### Imports Worker
```javascript
// CORRECT - depuis dist (fichiers compiles)
import { searchNotes } from '../../dist/services/notes.service.js';

// INCORRECT - src contient du TypeScript
import { searchNotes } from '../services/notes.service.js';
```

### Services
- Retournent des donnees brutes (pas de formatage MCP/API)
- Le formatage est fait par l'appelant (handler MCP ou route API)
- Utiliser `.lean()` pour les queries Mongoose quand possible
