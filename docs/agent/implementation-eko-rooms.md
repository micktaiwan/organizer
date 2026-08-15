# Implémentation : Eko dans les conversations (Phase 3)

**Objectif** : Permettre à Eko de répondre dans toutes les rooms quand il détecte son nom dans un message.

**Date** : 2026-01-18

---

## 🎯 Résumé de l'approche

### Détection simple (pas de @mentions)
- Quand un message contient "eko" (case-insensitive), l'agent est triggé
- Pas besoin de système @ complexe pour l'instant (Eko = 3 lettres distinctives)
- Auto-complete @mentions viendra plus tard comme amélioration UX

### Flow d'intégration
```
User envoie: "Eko, qu'est-ce qu'on sait sur le projet X?"
     ↓
POST /messages créé le message dans MongoDB
     ↓
emitNewMessage() détecte "eko" dans le contenu
     ↓
Trigger AgentService avec :
  - question (message content)
  - roomId
  - authorId
  - contexte récent de la room (20 derniers messages)
     ↓
Agent utilise ses tools (search_memories, get_recent_memories)
     ↓
Agent répond via tool respond() (nouveau parameter: roomId)
     ↓
Message posté dans la room au nom de l'user "Eko"
     ↓
Tous les clients reçoivent la réponse via Socket.io
```

---

## 📋 Tâches d'implémentation

### ✅ Étape 1 : Créer l'user système "Eko"

**Fichier** : `server/src/scripts/create-eko-user.ts` (nouveau)

```typescript
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { connectDB } from '../config/db.js';

async function createEkoUser() {
  await connectDB();

  // Check if Eko already exists
  const existing = await User.findOne({ username: 'eko' });
  if (existing) {
    console.log('Eko user already exists:', existing._id);
    return existing;
  }

  // Create Eko user
  const eko = new User({
    username: 'eko',
    displayName: 'Eko',
    email: 'eko@organizer.local', // Email fictif
    password: 'N/A', // Pas de mot de passe (jamais de login manuel)
    isBot: true, // Nouveau flag
    isOnline: true, // Toujours "online"
  });

  await eko.save();
  console.log('Eko user created:', eko._id);
  return eko;
}

createEkoUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

**Modification du modèle User** : Ajouter le flag `isBot: boolean`

**Fichier** : `server/src/models/User.ts`

```typescript
export interface IUser extends Document {
  // ... existing fields
  isBot?: boolean; // Flag pour identifier les bots (Eko, etc.)
}

const UserSchema = new Schema<IUser>({
  // ... existing fields
  isBot: {
    type: Boolean,
    default: false,
  },
});
```

**Commande pour créer Eko** :
```bash
cd server
npx tsx src/scripts/create-eko-user.ts
```

---

### ✅ Étape 2 : Détecter les mentions d'Eko dans emitNewMessage()

**Fichier** : `server/src/utils/socketEmit.ts`

**Modifications** :

```typescript
import { handleEkoMention } from './eko-handler.js'; // Nouveau

export async function emitNewMessage({ io, socket, roomId, userId, message }: MessageEmitData) {
  // ... existing code ...

  // Observer: index Lobby messages for pet's live context (text only, skip media)
  if (room.isLobby && message.type === 'text' && message.content) {
    indexLiveMessage({
      messageId: message._id.toString(),
      content: message.content,
      author: sender?.displayName || sender?.username || 'Unknown',
      authorId: userId,
      room: room.name,
      roomId: roomId,
      timestamp: new Date().toISOString(),
    }).catch((err) => {
      console.error('[Live] Failed to index message:', err.message);
    });
  }

  // NEW: Detect Eko mentions (case-insensitive)
  if (message.type === 'text' && message.content) {
    const containsEko = /\beko\b/i.test(message.content);

    if (containsEko) {
      console.log(`[Eko] Mention detected in room ${roomId}`);

      // Trigger Eko response asynchronously (don't block message emission)
      handleEkoMention({
        io,
        roomId,
        messageContent: message.content,
        authorId: userId,
        authorName: sender?.displayName || sender?.username || 'Unknown',
        roomName: room?.name || 'Unknown',
      }).catch((err) => {
        console.error('[Eko] Failed to handle mention:', err.message);
      });
    }
  }
}
```

---

### ✅ Étape 3 : Handler pour les mentions d'Eko

**Fichier** : `server/src/utils/eko-handler.ts` (nouveau)

```typescript
import { Server } from 'socket.io';
import { agentService } from '../agent/index.js';
import { Message, Room, User } from '../models/index.js';
import { emitNewMessage } from './socketEmit.js';

interface EkoMentionData {
  io: Server;
  roomId: string;
  messageContent: string;
  authorId: string;
  authorName: string;
  roomName: string;
}

/**
 * Handle Eko mention: get context, ask agent, post response
 */
export async function handleEkoMention(data: EkoMentionData) {
  const { io, roomId, messageContent, authorId, authorName, roomName } = data;

  try {
    // Get Eko user
    const ekoUser = await User.findOne({ username: 'eko' });
    if (!ekoUser) {
      console.error('[Eko] Eko user not found in database');
      return;
    }

    // Get recent messages from room for context (last 20 messages)
    const recentMessages = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('senderId', 'username displayName')
      .lean();

    // Format context for agent
    const context = recentMessages
      .reverse() // Oldest first
      .map((m: any) => {
        const sender = m.senderId;
        const senderName = sender?.displayName || sender?.username || 'Unknown';
        return `${senderName}: ${m.content}`;
      })
      .join('\n');

    // Build prompt for agent
    const prompt = `Room: ${roomName}
Context récent:
${context}

Question de ${authorName}: ${messageContent}

Réponds de manière concise et utile.`;

    // Ask agent (using existing AgentService with userId = authorId for session)
    const response = await agentService.ask({
      userId: authorId, // Session par user qui pose la question
      question: prompt,
    });

    // Post Eko's response in the room
    const ekoMessage = new Message({
      roomId,
      senderId: ekoUser._id,
      type: 'text',
      content: response.response,
      status: 'sent',
      readBy: [],
      clientSource: 'api', // Eko répond via API
    });

    await ekoMessage.save();
    await ekoMessage.populate('senderId', 'username displayName status statusMessage');

    // Update room's lastMessageAt
    await Room.findByIdAndUpdate(roomId, { lastMessageAt: new Date() });

    // Emit message to all clients
    await emitNewMessage({
      io,
      roomId,
      userId: ekoUser._id.toString(),
      message: ekoMessage as any,
    });

    console.log(`[Eko] Response posted in room ${roomName}`);
  } catch (error: any) {
    console.error('[Eko] Error handling mention:', error.message);
  }
}
```

---

### ✅ Étape 4 : Modifier le worker pour accepter roomId dans respond()

**Fichier** : `server/src/agent/worker.mjs`

**Actuellement** : Le tool `respond()` ne prend pas de roomId (il répond juste au user)

**Modification** :
- Garder le comportement actuel pour l'onglet Pet (réponse directe)
- Pour les mentions dans rooms, le `prompt` contient déjà toute l'info nécessaire
- Le worker n'a PAS besoin de savoir où poster (c'est géré par eko-handler.ts)

**Action** : Aucune modification nécessaire dans worker.mjs pour l'instant !
Le worker répond juste à la question, et `eko-handler.ts` s'occupe de poster dans la bonne room.

---

### ✅ Étape 5 : UI - Badge spécial pour Eko

**Desktop (React)** : Afficher messages d'Eko avec un badge/icône

**Fichier** : `desktop/src/components/MessageBubble.tsx` (ou équivalent)

```tsx
// Détecter si sender est Eko
const isEko = message.senderId.username === 'eko';

return (
  <div className={`message ${isEko ? 'eko-message' : ''}`}>
    {isEko && <span className="eko-badge">🔮 Eko</span>}
    {/* ... rest of message */}
  </div>
);
```

**Android (Kotlin)** : Badge similaire dans MessageBubble.kt

```kotlin
if (sender.username == "eko") {
  Row {
    Icon(Icons.Default.Star, tint = AccentBlue) // Icône Eko
    Text("Eko", color = AccentBlue)
  }
}
```

---

### ✅ Étape 6 : Renommer "Pet" → "Eko" dans toute l'app

**Android** :
- Onglet "Pet" → "Eko"
- Strings.xml : "Pet" → "Eko"
- Navigation : `pet` → `eko` (ou garder `pet` pour compatibilité)

**Desktop** :
- Onglet "Pet" → "Eko"
- UI labels partout

---

## 🧪 Tests manuels

### Test 1 : Mention dans Lobby
1. User 1 envoie : "Eko, c'est quoi le projet Organizer?"
2. Eko répond avec contexte approprié
3. Tous les clients reçoivent la réponse

### Test 2 : Mention dans une room privée
1. Créer room privée entre User 1 et User 2
2. User 1 : "Eko qu'est-ce qu'on sait sur React?"
3. Eko répond dans la room privée
4. User 2 voit aussi la réponse

### Test 3 : Détection case-insensitive
- "eko cherche X" → ✅ détecté
- "Eko cherche X" → ✅ détecté
- "EKO cherche X" → ✅ détecté
- "Ekologie" → ❌ pas détecté (word boundary \b)

### Test 4 : Contexte de conversation
1. User 1 : "On va refaire le design"
2. User 2 : "Oui bonne idée"
3. User 1 : "Eko tu en penses quoi?"
4. Eko répond en référençant les 2 messages précédents

### Test 5 : Mémoire à long terme
1. User 1 : "Eko qu'est-ce que tu sais sur notre projet?"
2. Eko utilise search_memories() et retrouve infos stockées précédemment

---

## 📊 Checklist d'implémentation

- [ ] Ajouter flag `isBot` au modèle User
- [ ] Créer script `create-eko-user.ts`
- [ ] Exécuter script pour créer user Eko en DB
- [ ] Créer fichier `utils/eko-handler.ts`
- [ ] Modifier `utils/socketEmit.ts` pour détecter mentions
- [ ] Tester en local (Lobby + rooms privées)
- [ ] Ajouter badge UI pour messages d'Eko (Desktop)
- [ ] Ajouter badge UI pour messages d'Eko (Android)
- [ ] Renommer "Pet" → "Eko" dans l'app
- [ ] Tests manuels complets
- [ ] Documentation utilisateur (comment appeler Eko)

---

## 🚀 Déploiement

1. **Migration DB** : Créer user Eko sur le serveur prod
   ```bash
   ssh ubuntu@51.178.29.205
   cd /var/www/organizer/server
   npx tsx src/scripts/create-eko-user.ts
   ```

2. **Deploy code** : Via script deploy.sh habituel

3. **Vérifier** : Tester dans Lobby en prod

---

## 🎯 Améliorations futures (Phase 3.5)

- [ ] Auto-complete `@eko` dans l'input (UX improvement)
- [ ] Typing indicator "Eko est en train d'écrire..." pendant qu'il réfléchit
- [ ] Commandes spéciales : "Eko résume cette conversation", "Eko crée une note"
- [ ] Rate limiting : max 1 réponse Eko toutes les 5 secondes par room (éviter spam)
- [ ] Logs Analytics : combien de fois Eko est appelé, dans quelles rooms, etc.

---

## 💡 Notes d'implémentation

### Pourquoi pas de @mentions obligatoires ?
- "Eko" est court (3 lettres) et distinctif
- Regex `\beko\b` détecte le mot entier (word boundaries)
- Plus naturel : "Eko cherche X" vs "@eko cherche X"
- L'auto-complete @ viendra plus tard comme amélioration UX

### Pourquoi userId = authorId dans agentService.ask() ?
- Le système de sessions actuel est par userId
- Utiliser l'ID de l'auteur de la question permet de garder un contexte par user
- Alternative future : session par room (mais plus complexe)

### Pourquoi emitNewMessage() et pas directement dans POST /messages ?
- `emitNewMessage()` est appelé partout (REST API, Socket handlers, MCP)
- Point central unique pour détecter les mentions
- Évite de dupliquer la logique

### Performance
- `handleEkoMention()` est async et non-bloquant
- L'envoi du message user n'attend pas la réponse d'Eko
- Si Eko met 5 secondes à répondre, l'UX n'est pas bloquée
