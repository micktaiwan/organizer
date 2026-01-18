# Organizer Server

Backend API pour l'application Organizer - Chat P2P avec authentification et synchronisation.

## Stack technique

- **Runtime** : Node.js + TypeScript
- **Framework** : Express
- **Base de données** : MongoDB
- **Temps réel** : Socket.io
- **Auth** : JWT + bcrypt
- **Validation** : Zod

## Installation

### Prérequis

- Node.js 20+
- MongoDB (local ou Docker)

### 1. Installer les dépendances

```bash
cd server
npm install
```

### 2. Configurer l'environnement

Copier le fichier d'exemple et ajuster les valeurs :

```bash
cp .env.example .env
```

Variables disponibles :

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `3001` |
| `MONGODB_URI` | URI de connexion MongoDB | `mongodb://localhost:27017/organizer` |
| `JWT_SECRET` | Clé secrète pour les tokens JWT | - |
| `CORS_ORIGIN` | Origine autorisée pour CORS | `*` |

### 3. Démarrer MongoDB

**Option A : Docker (recommandé)**

```bash
# Première fois
docker run -d --name mongodb -p 27017:27017 -v mongodb_data:/data/db mongo:7

# Démarrages suivants
docker start mongodb
```

**Option B : Installation locale (macOS)**

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

### 4. Lancer le serveur

```bash
# Développement (hot reload)
npm run dev

# Production
npm run build
npm start
```

## Structure du projet

```
server/
├── src/
│   ├── index.ts              # Point d'entrée
│   ├── config/
│   │   └── db.ts             # Connexion MongoDB
│   ├── models/
│   │   ├── User.ts           # Modèle utilisateur
│   │   ├── Contact.ts        # Modèle contact
│   │   ├── Message.ts        # Modèle message
│   │   └── index.ts
│   ├── routes/
│   │   ├── auth.ts           # Authentification
│   │   ├── users.ts          # Gestion utilisateurs
│   │   ├── contacts.ts       # Gestion contacts
│   │   ├── messages.ts       # Gestion messages
│   │   └── index.ts
│   ├── middleware/
│   │   └── auth.ts           # Middleware JWT
│   └── socket/
│       └── index.ts          # Handlers Socket.io
├── package.json
├── tsconfig.json
├── .env
└── .env.example
```

## API Reference

### Authentification

#### `POST /auth/register`

Créer un nouveau compte.

```json
// Request
{
  "username": "john",
  "displayName": "John Doe",
  "email": "john@example.com",
  "password": "secret123"
}

// Response 201
{
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "username": "john",
    "displayName": "John Doe",
    "email": "john@example.com"
  }
}
```

#### `POST /auth/login`

Se connecter.

```json
// Request
{
  "username": "john",
  "password": "secret123"
}

// Response 200
{
  "token": "eyJhbGc...",
  "user": { ... }
}
```

#### `GET /auth/me`

Récupérer le profil de l'utilisateur connecté.

**Headers** : `Authorization: Bearer <token>`

```json
// Response 200
{
  "user": {
    "id": "...",
    "username": "john",
    "displayName": "John Doe",
    "email": "john@example.com",
    "isOnline": true,
    "lastSeen": "2024-01-15T10:30:00Z"
  }
}
```

### Utilisateurs

> Toutes les routes `/users` nécessitent un token JWT.

#### `GET /users/search?q=<query>`

Rechercher des utilisateurs par nom.

```json
// Response 200
{
  "users": [
    {
      "_id": "...",
      "username": "jane",
      "displayName": "Jane Doe",
      "isOnline": false,
      "lastSeen": "2024-01-15T09:00:00Z"
    }
  ]
}
```

#### `GET /users/:id`

Récupérer le profil public d'un utilisateur.

```json
// Response 200
{
  "user": {
    "_id": "...",
    "username": "jane",
    "displayName": "Jane Doe",
    "isOnline": true,
    "lastSeen": "...",
    "peerId": "abc123"
  }
}
```

#### `PATCH /users/me`

Mettre à jour son profil.

```json
// Request
{
  "displayName": "John D."
}

// Response 200
{
  "user": { ... }
}
```

### Contacts

> Toutes les routes `/contacts` nécessitent un token JWT.

#### `GET /contacts`

Liste des contacts.

```json
// Response 200
{
  "contacts": [
    {
      "id": "...",
      "nickname": "Ma soeur",
      "user": {
        "_id": "...",
        "username": "jane",
        "displayName": "Jane Doe",
        "isOnline": true,
        "peerId": "abc123"
      },
      "createdAt": "..."
    }
  ]
}
```

#### `POST /contacts`

Ajouter un contact.

```json
// Request
{
  "contactId": "userId...",
  "nickname": "Mon pote"  // optionnel
}

// Response 201
{
  "contact": { ... }
}
```

#### `PATCH /contacts/:id`

Modifier le surnom d'un contact.

```json
// Request
{
  "nickname": "Nouveau surnom"
}
```

#### `DELETE /contacts/:id`

Supprimer un contact.

### Messages

> Toutes les routes `/messages` nécessitent un token JWT.

#### `POST /messages`

Sauvegarder un message.

```json
// Request
{
  "receiverId": "userId...",
  "type": "text",  // text | image | audio | system
  "content": "Hello!"
}

// Response 201
{
  "message": {
    "_id": "...",
    "conversationId": "userId1_userId2",
    "senderId": "...",
    "receiverId": "...",
    "type": "text",
    "content": "Hello!",
    "status": "sent",
    "createdAt": "..."
  }
}
```

#### `GET /messages/:conversationId`

Récupérer l'historique d'une conversation.

Query params :
- `limit` : nombre de messages (défaut: 50)
- `before` : pagination par date

```json
// Response 200
{
  "messages": [ ... ]
}
```

#### `GET /messages`

Récupérer les messages non lus.

#### `PATCH /messages/:id/read`

Marquer un message comme lu.

#### `POST /messages/read-bulk`

Marquer plusieurs messages comme lus.

```json
// Request
{
  "messageIds": ["id1", "id2", "id3"]
}
```

### Health Check

#### `GET /health`

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### MCP (Model Context Protocol)

Un serveur MCP est disponible sur `POST /mcp` pour permettre aux assistants IA (Claude Code, etc.) d'interagir avec Organizer. Voir `src/mcp/` pour l'implémentation.

## Socket.io Events

### Connexion

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: 'jwt-token-here' }
});
```

### Events émis par le client

| Event | Payload | Description |
|-------|---------|-------------|
| `peer:update` | `{ peerId: string \| null }` | Mettre à jour son PeerJS ID |
| `typing:start` | `{ to: string }` | Notifier qu'on tape |
| `typing:stop` | `{ to: string }` | Arrêter la notification |
| `message:notify` | `{ to: string, messageId: string }` | Notifier un nouveau message |
| `message:read` | `{ to: string, messageIds: string[] }` | Notifier messages lus |

### Events reçus par le client

| Event | Payload | Description |
|-------|---------|-------------|
| `user:online` | `{ userId: string }` | Un utilisateur se connecte |
| `user:offline` | `{ userId: string }` | Un utilisateur se déconnecte |
| `peer:updated` | `{ userId: string, peerId: string }` | PeerID mis à jour |
| `typing:start` | `{ from: string }` | Quelqu'un tape |
| `typing:stop` | `{ from: string }` | Quelqu'un arrête de taper |
| `message:new` | `{ from: string, messageId: string }` | Nouveau message reçu |
| `message:read` | `{ from: string, messageIds: string[] }` | Messages lus |

## Déploiement

### Préparation

1. Générer un `JWT_SECRET` sécurisé :
```bash
openssl rand -base64 32
```

2. Builder le projet :
```bash
npm run build
```

### Déploiement sur VPS

1. Cloner le repo sur le serveur :
```bash
git clone https://github.com/user/organizer.git /var/www/organizer
cd /var/www/organizer/server
npm install --production
npm run build
```

2. Configurer les variables d'environnement :
```bash
cp .env.example .env
nano .env  # Éditer avec les vraies valeurs
```

3. Lancer avec PM2 :
```bash
pm2 start dist/index.js --name organizer-api
pm2 save
pm2 startup
```

### Mise à jour

```bash
cd /var/www/organizer
git pull
cd server
npm install
npm run build
pm2 restart organizer-api
```

### Configuration Nginx (reverse proxy)

```nginx
server {
    listen 80;
    server_name api.organizer.example.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Commandes utiles

```bash
# Développement
npm run dev          # Hot reload avec tsx

# Production
npm run build        # Compile TypeScript
npm start            # Lance dist/index.js

# Docker MongoDB
docker start mongodb # Démarrer
docker stop mongodb  # Arrêter
docker logs mongodb  # Voir les logs
```
