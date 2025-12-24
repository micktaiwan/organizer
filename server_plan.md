# Plan : Migration vers architecture Serveur + MongoDB

## Objectifs
1. **Authentification** : Comptes utilisateurs avec login/password
2. **Discovery** : Trouver les utilisateurs sans échanger manuellement les peer IDs
3. **Messages persistants** : Historique des conversations stocké côté serveur

## Architecture proposée

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Tauri App     │────▶│  Node.js API    │────▶│    MongoDB      │
│   (Frontend)    │     │  (Express)      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │ WebRTC (P2P)          │ WebSocket (temps réel)
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   Autre User    │     │  Notifications  │
│   (P2P direct)  │     │  Présence       │
└─────────────────┘     └─────────────────┘
```

**Approche hybride** : Le serveur gère auth + discovery + historique, mais les messages transitent toujours en P2P (confidentialité).

## Stack technique

- **Backend** : Node.js + Express + TypeScript
- **Base de données** : MongoDB Atlas (cloud, tier gratuit 512MB)
- **Auth** : JWT + bcrypt
- **Temps réel** : Socket.io (présence, notifications)
- **Validation** : Zod

## Structure du serveur

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── config/
│   │   └── db.ts             # MongoDB connection
│   ├── models/
│   │   ├── User.ts           # User schema
│   │   ├── Contact.ts        # Contact relationships
│   │   └── Message.ts        # Message history
│   ├── routes/
│   │   ├── auth.ts           # Login/Register
│   │   ├── users.ts          # User discovery
│   │   ├── contacts.ts       # Contact management
│   │   └── messages.ts       # Message sync
│   ├── middleware/
│   │   └── auth.ts           # JWT verification
│   └── socket/
│       └── index.ts          # Socket.io handlers
```

## Schémas MongoDB

### User
```typescript
{
  _id: ObjectId,
  username: string,          // unique, pour login
  displayName: string,       // nom affiché
  email: string,             // unique
  passwordHash: string,
  peerId: string | null,     // PeerJS ID actuel (null si offline)
  isOnline: boolean,
  lastSeen: Date,
  createdAt: Date
}
```

### Contact
```typescript
{
  _id: ObjectId,
  userId: ObjectId,          // propriétaire du contact
  contactId: ObjectId,       // référence vers User
  nickname: string | null,   // surnom personnalisé
  createdAt: Date
}
```

### Message
```typescript
{
  _id: ObjectId,
  conversationId: string,    // hash des 2 userIds triés
  senderId: ObjectId,
  receiverId: ObjectId,
  type: 'text' | 'image' | 'audio' | 'system',
  content: string,           // texte ou base64
  status: 'sent' | 'delivered' | 'read',
  readAt: Date | null,
  createdAt: Date
}
```

## Étapes d'implémentation

### Phase 1 : Setup serveur (nouveau dossier `server/`)
- [ ] Initialiser projet Node.js + TypeScript
- [ ] Configurer Express + MongoDB (Mongoose)
- [ ] Créer les modèles User, Contact, Message

### Phase 2 : Authentification
- [ ] Routes POST /auth/register et POST /auth/login
- [ ] Hashage passwords avec bcrypt
- [ ] Génération JWT
- [ ] Middleware de vérification JWT

### Phase 3 : Discovery utilisateurs
- [ ] Route GET /users/search?q=... (recherche par username)
- [ ] Route GET /users/:id (profil public)
- [ ] Socket.io pour présence (online/offline + peerId)

### Phase 4 : Gestion contacts
- [ ] Routes CRUD /contacts
- [ ] Synchronisation avec contacts locaux existants

### Phase 5 : Historique messages
- [ ] Route POST /messages (sauvegarder message)
- [ ] Route GET /messages/:conversationId (récupérer historique)
- [ ] Sync bidirectionnelle P2P ↔ serveur

### Phase 6 : Adapter le frontend
- [ ] Créer service API (`src/services/api.ts`)
- [ ] Ajouter écrans Login/Register
- [ ] Modifier usePeer pour envoyer peerId au serveur
- [ ] Modifier useContacts pour sync avec serveur
- [ ] Ajouter persistance messages

## Fichiers frontend à modifier

| Fichier | Modifications |
|---------|--------------|
| `src/App.tsx` | Ajouter AuthContext, routing Login/Register |
| `src/hooks/usePeer.ts` | Envoyer peerId au serveur, sync messages |
| `src/hooks/useContacts.ts` | Sync contacts avec API |
| `src/services/api.ts` | **Nouveau** - Client API |
| `src/contexts/AuthContext.tsx` | **Nouveau** - Gestion auth |
| `src/components/LoginScreen.tsx` | **Nouveau** |
| `src/components/RegisterScreen.tsx` | **Nouveau** |

## Configuration développement

```bash
# Terminal 1 - Serveur
cd server && npm run dev  # nodemon + ts-node

# Terminal 2 - Frontend Tauri
npm run tauri dev
```

Variables d'environnement serveur :
```env
PORT=3001
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/organizer
JWT_SECRET=your-secret-key
```

## Hébergement production

**Serveur Node.js** :
- Railway (gratuit pour commencer, simple)
- Render (gratuit tier disponible)
- VPS OVH (~5€/mois)

**MongoDB** :
- MongoDB Atlas (512MB gratuit)

## Flux de messages hybride

```
User A envoie message
        │
        ▼
   User B online ?
      /       \
    OUI        NON
     │          │
     ▼          ▼
  P2P direct   POST /messages
  + sync DB    (stocké serveur)
     │          │
     ▼          ▼
  Délivré    User B se connecte
  immédiat     GET /messages
               (récupère offline)
```
