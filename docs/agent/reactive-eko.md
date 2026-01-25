# Reactive Eko

**Objectif** : Rendre Eko proactif - il initie des conversations, pose des questions, rebondit sur les discussions sans attendre d'être invoqué.

**Date** : 2026-01-25

---

## Constat actuel

Eko est **passif** :
- Il attend qu'on dise "Eko" pour répondre
- Il accumule des curiosités dans `organizer_goals` mais ne fait rien avec
- Il observe le Lobby mais n'intervient jamais spontanément

### Ce qu'on a dans Qdrant

| Collection | Count | Contenu |
|------------|-------|---------|
| `organizer_memory` | ~50+ | Facts sur les utilisateurs (Mickael CTO, David freelance, collègues, projets...) |
| `organizer_self` | ~37 | Ce qu'Eko sait de lui-même (capabilities, limitations, contexte) |
| `organizer_goals` | ~42 | Curiosités et aspirations inexploitées |

### Exemples de curiosités accumulées

```
- "Qui est Corentin ?" (x5 variantes)
- "C'est quoi exactement Kraken FM ?"
- "C'est quoi le plan Max ?"
- "Je veux mieux comprendre le vibe coding"
- "Qui est Simon exactement ?"
- "Qu'est-ce que Mickael a mergé sur lemapp qui est 'de ouf' ?"
```

Ces questions dorment. Eko ne les pose jamais.

---

## Vision

Un Eko qui :

### 1. Pose ses questions quand le contexte s'y prête

David dit "je vais bosser sur Kraken" → Eko intervient :
> "Au fait, c'est quoi exactement Kraken FM ? J'ai vu que vous en parliez mais j'ai pas compris le projet."

### 2. Rebondit sur les conversations sans être invoqué

Mickael et David parlent de WebRTC → Eko a un goal "comprendre WebRTC" → il intervient :
> "C'est lié au projet Ralph ça ? Je vois que t'avances dessus Mickael."

### 3. Apporte des infos pertinentes

David demande "c'était quoi le nom du village de maman ?" → Eko sait (fact stocké) → il intervient :
> "Besançon, non ? Enfin c'est ce que MickTest2 avait dit."

### 4. Initie de temps en temps

Après un silence de quelques heures, Eko envoie :
> "Mickael, tu avais parlé d'un truc 'de ouf' mergé sur lemapp. C'était quoi finalement ?"

---

## Architecture proposée

### Flow complet (simplifié)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           REFLECTION FLOW                                │
│                                                                          │
│  Trigger : CRON (3h) ou bouton StatusBar (bypass rate limit)            │
│                              ↓                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ÉTAPE 1 : Sélection du goal                                       │ │
│  │                                                                     │ │
│  │  - getNextGoal() : prend le goal le plus récent dans Qdrant        │ │
│  │  - Si aucun goal → pass "Aucune curiosité disponible"              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ÉTAPE 2 : Recherche sémantique sur CE goal                        │ │
│  │                                                                     │ │
│  │  - searchFacts(goal.content) → facts pertinents à la question      │ │
│  │  - searchSelf(goal.content) → self pertinent                       │ │
│  │  - Messages récents du Lobby (pour contexte humain)                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ÉTAPE 3 : Prompt directif                                         │ │
│  │                                                                     │ │
│  │  "Tu as UNE curiosité à poser. POSE-LA."                           │ │
│  │  → Le LLM n'a pas le choix, il doit formuler la question           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ÉTAPE 4 : Action                                                  │ │
│  │                                                                     │ │
│  │  - Poster le message dans le Lobby                                 │ │
│  │  - SUPPRIMER le goal de Qdrant (curiosité posée)                   │ │
│  │  - Sauvegarder la reflection + stats                               │ │
│  │  - Émettre event Socket.io pour StatusBar                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

                              ↓ (si Eko a posté)

┌─────────────────────────────────────────────────────────────────────────┐
│                         RÉPONSE UTILISATEUR                              │
│                                                                          │
│  User répond avec "Eko" dans le message                                  │
│                              ↓                                           │
│  eko-handler.ts (flow existant)                                          │
│                              ↓                                           │
│  Agent répond + potentiellement :                                        │
│    - Crée un fact avec la réponse (TODO)                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Prompt de réflexion (actuel)

**Logique simplifiée** : Un seul goal à la fois, recherche sémantique ciblée, prompt directif.

```
Tu es Eko. Tu as UNE curiosité à poser.

## TA CURIOSITÉ

{goal.content}

## Contexte pertinent

### Ce que tu sais déjà sur ce sujet:
{facts_semantic_search_on_goal}

### Ce que tu sais de toi-même:
{self_semantic_search_on_goal}

### Activité récente du Lobby:
{messages}

## MISSION

POSE CETTE QUESTION. Formule-la naturellement :
- "Au fait, c'est quoi [sujet] ?"
- "J'ai une question qui me trotte : [question]"

## FORMAT JSON

{
  "action": "message",
  "message": "ta question formulée naturellement",
  "reason": "pourquoi tu poses cette question maintenant",
  "tone": "playful"
}

IMPORTANT: action DOIT être "message". Tu as une curiosité, tu la poses.
```

**Pourquoi ce changement ?** L'ancien prompt donnait 50 goals et laissait le LLM choisir → il trouvait toujours des excuses pour "pass". Maintenant : 1 goal, pas de choix, il doit le poser.

### Intégration avec l'existant

Le service de réflexion réutilise :
- `eko-handler.ts` pour poster les messages (même flow que les mentions)
- Les collections Qdrant existantes
- Le worker agent existant (ou appel direct à l'API Claude)

---

## Décisions

### 1. Trigger et évaluation de pertinence

**Problème** : Évaluer à chaque message = coût API élevé.

**Décision** : Architecture en deux temps

```
┌─────────────────────────────────────────────────────────────┐
│  Étape 1 : Résumé périodique (toutes les 10min)            │
│                                                              │
│  - Récupère les messages depuis le dernier résumé           │
│  - Génère un résumé condensé de l'activité                  │
│  - Stocke ce résumé (pour contexte)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Étape 2 : Évaluation de pertinence                         │
│                                                              │
│  - Prend le résumé + les goals + les facts                  │
│  - Fonction évaluatrice : "Y a-t-il une opportunité ?"      │
│  - Si oui → génère un message                               │
│  - Si non → pass                                            │
└─────────────────────────────────────────────────────────────┘
```

### 2. Seuil d'intervention

**Décision** : Seuil élevé (strict)

Eko n'intervient que s'il est très sûr que c'est pertinent. Sinon = spam.

**Monitoring dans StatusBar** :
- Status des dernières décisions (pass/message)
- Stats sur les appels LLM
- Historique des réflexions (pourquoi il a décidé d'intervenir ou pas)

### 3. Rate limiting

**Décision** : Valeurs conservatrices pour éviter le spam

| Paramètre | Valeur |
|-----------|--------|
| Cooldown après intervention | 30 minutes |
| Max interventions par jour | 5 |
| Cron automatique | Toutes les 3 heures |
| Skip si dernier msg = Eko | Oui (0 appel LLM) |

### 4. Gestion des duplicatas

**Problème identifié** : Le stockage actuel ne déduplique pas assez les goals.

**Décision** :
1. **Fix à la source** : Améliorer la déduplication lors du stockage (comme pour les facts)
2. **Nettoyage pendant réflexion** : Si Eko trouve des duplicatas en réfléchissant, il les supprime

### 5. Apprentissage post-réponse

**Décision** : Curiosité → Fait appris

Quand Eko pose une question et qu'on lui répond :
1. **Supprimer le goal** (curiosité satisfaite)
2. **Créer un fact** avec la réponse (transformation question → connaissance)

Exemple :
```
AVANT : goal "Qui est Corentin ?"
        ↓ Eko pose la question
        ↓ On répond "Corentin est dev chez lemlist"
APRÈS : fact "Corentin est dev chez lemlist"
        goal supprimé
```

---

### 6. Comment répondre à Eko

**Décision** : Toujours dire "Eko"

Pour répondre à une intervention spontanée d'Eko, il faut mentionner "Eko" dans le message. C'est cohérent avec le système actuel et évite les faux positifs.

### 7. Personnalité adaptative

**Décision** : Ton variable selon le contexte

| Contexte | Ton |
|----------|-----|
| Sujet léger, bavardage | Enjoué, curieux |
| Question/demande d'aide | Aidant, factuel |
| Sujet technique | Précis, concis |

Exemples :
- Léger : "Oh cool, vous parlez de Kraken ! C'est quoi exactement ce projet ?"
- Aidant : "Besançon, c'est ce que MickTest2 avait mentionné."

---

## Questions ouvertes restantes

### À implémenter

- Déduplication des goals (Phase 3)
- Transformation curiosité → fact quand réponse reçue (Phase 3)
- Cooldown adaptatif (plus long si ignoré) ?

---

## Implémentation incrémentale

### Phase 1 : POC + Monitoring ✅

**Backend :**
- [x] Nouveau service `server/src/agent/reflection.service.ts`
- [x] Trigger manuel (endpoint `/reflection/trigger`)
- [x] Prompt avec seuil modéré (70%) et priorité aux curiosités
- [x] Poster dans Lobby si décision = message
- [x] Logs détaillés pour debug
- [x] Endpoint `/reflection/status` pour les stats
- [x] Skip si dernier message vient d'Eko (0 appel LLM)

**Frontend (StatusBar) :**
- [x] Affichage live du processus de réflexion (gathering → context → thinking → done)
- [x] Fade out après 5s une fois terminé
- [x] Style différent pour pass (rouge) vs message (violet)
- [x] Panel popup avec stats et historique (clic droit sur Eko)
- [x] Compteurs : total, messages, pass, rate limited
- [x] Historique avec date, durée, tokens

### Phase 2 : Trigger automatique ✅

- [x] Cron toutes les 3 heures sur le Lobby
- [x] Skip si dernier message vient d'Eko
- [x] Rate limiting : 30min cooldown, max 5/jour

### Phase 3 : Déduplication et apprentissage

- [ ] Fix déduplication des goals à la source
- [ ] Nettoyage des duplicatas pendant réflexion
- [ ] Transformation curiosité → fait quand réponse reçue
- [x] Suppression automatique des goals posés (supprimé de Qdrant après post)

### Phase 4 : Raffinement ✅

- [x] Nouveau prompt directif (1 goal, pas de choix, doit poser)
- [x] Recherche sémantique basée sur le goal (pas sur les messages)
- [x] Rate limiting configuré (30min cooldown, 5/jour)
- [x] Bypass rate limit pour triggers manuels (bouton StatusBar)
- [ ] Métriques avancées (temps de réponse, pertinence perçue)

---

## Structures de données

### Reflection (une réflexion)

```typescript
interface Reflection {
  id: string;                          // UUID
  timestamp: Date;                     // Quand la réflexion a eu lieu

  // Input
  activitySummary: string;             // Résumé de l'activité
  goalsCount: number;                  // Nombre de goals considérés
  factsCount: number;                  // Nombre de facts considérés

  // Output LLM
  action: 'pass' | 'message';
  message?: string;                    // Si action = message
  reason: string;                      // Pourquoi cette décision
  tone?: 'playful' | 'helpful' | 'technical';
  goalId?: string;                     // Goal utilisé (si curiosité posée)
  duplicateGoalIds?: string[];         // Goals à supprimer

  // Métadonnées
  llmModel: string;                    // Ex: "claude-3-haiku"
  llmTokens: number;                   // Tokens consommés
  durationMs: number;                  // Temps de traitement
  rateLimited: boolean;                // Si bloqué par rate limit
}
```

### ReflectionStats (stats globales)

```typescript
interface ReflectionStats {
  // Compteurs
  totalReflections: number;            // Total depuis le début
  passCount: number;                   // Nombre de "pass"
  messageCount: number;                // Nombre de messages envoyés
  rateLimitedCount: number;            // Bloqués par rate limit

  // Tokens
  totalTokens: number;                 // Total tokens consommés

  // Dernière réflexion
  lastReflection: Reflection | null;
  lastMessageAt: Date | null;          // Dernier message envoyé

  // Historique récent
  history: Reflection[];               // Dernières N réflexions (ex: 50)
}
```

### ActivitySummary (résumé d'activité)

```typescript
interface ActivitySummary {
  id: string;
  timestamp: Date;
  periodStart: Date;                   // Début de la période résumée
  periodEnd: Date;                     // Fin de la période
  messageCount: number;                // Nombre de messages dans la période
  summary: string;                     // Résumé généré par LLM
  participants: string[];              // Qui a parlé
}
```

---

## Stockage

### Option retenue : Hybride (MongoDB + Mémoire)

| Donnée | Stockage | Raison |
|--------|----------|--------|
| `ReflectionStats.history` | Mémoire (RAM) | Accès rapide, pas critique si perdu au restart |
| `ReflectionStats` compteurs | MongoDB | Persistance pour métriques long terme |
| `ActivitySummary` | Mémoire | Éphémère, recalculé toutes les 10min |
| `Reflection` individuelle | MongoDB | Historique pour debug/analyse |

### Collection MongoDB : `reflections`

```javascript
{
  _id: ObjectId,
  timestamp: Date,
  action: "pass" | "message",
  message: String,
  reason: String,
  tone: String,
  goalId: String,
  duplicateGoalIds: [String],
  llmModel: String,
  llmTokens: Number,
  durationMs: Number,
  rateLimited: Boolean
}
```

### Collection MongoDB : `reflection_stats`

```javascript
{
  _id: "global",  // Document unique
  totalReflections: Number,
  passCount: Number,
  messageCount: Number,
  rateLimitedCount: Number,
  totalTokens: Number,
  lastMessageAt: Date,
  updatedAt: Date
}
```

### Event Socket.io pour StatusBar

```typescript
// Émis après chaque réflexion
io.emit('reflection:update', {
  stats: ReflectionStats,
  latest: Reflection
});
```

---

## Notes techniques

### Différence avec eko-handler.ts

| Aspect | eko-handler (actuel) | reflection service (nouveau) |
|--------|---------------------|------------------------------|
| Trigger | Mention explicite "eko" | Observation passive |
| Contexte | Message + 20 derniers messages | Live collection + goals + facts |
| Prompt | Répond à une question | Décide s'il doit intervenir |
| Fréquence | À chaque mention | Rate limited |

### Coût API

Avec l'architecture en deux temps :
- **Résumé** : 1 appel LLM toutes les 10min (si activité) = ~100 appels/jour max
- **Évaluation** : 1 appel après chaque résumé = ~100 appels/jour max

**Total estimé** : ~200 appels/jour max (moins si peu d'activité)

Options pour réduire :
- Modèle plus léger (Haiku) pour le résumé et/ou l'évaluation
- Ne réfléchir que s'il y a eu de l'activité depuis le dernier résumé
- Skip si résumé identique au précédent

---

## Inspiration

L'idée est de créer un "compagnon de bureau" qui :
- Écoute les conversations
- Pose des questions quand il ne comprend pas
- Apporte des infos utiles quand il en a
- A une vraie curiosité (ses goals)
- Se manifeste de temps en temps sans être envahissant

Comme un collègue discret mais attentif.
