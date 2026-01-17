# Memory Architecture

## Objectif

Permettre au pet de se souvenir des informations importantes sur les utilisateurs et les conversations, sans tout stocker.

## Principes

### 1. Recherche agentique (le LLM cherche lui-même)

Le LLM dispose de **tools** pour chercher dans sa mémoire :
- `search_memories(query)` : recherche sémantique (10 résultats max)
- `get_recent_memories(limit)` : dernières mémoires stockées

Il peut faire plusieurs recherches par conversation (`maxTurns: 5`).

### 2. Stockage sélectif

Le pet ne stocke que les **faits importants** :
- Infos sur les utilisateurs (préférences, événements de vie)
- Décisions, conclusions
- PAS les bavardages, salutations, etc.

### 3. Déduplication intelligente

Quand le pet veut stocker :
1. Recherche si info similaire existe (score > 0.85)
2. Si oui → UPDATE (delete + insert avec plus de contexte)
3. Si non → INSERT nouveau

Exemple :
```
Stocke: "Mickael s'est cassé l'épaule"
Plus tard: "Mickael s'est cassé l'épaule le 10 janvier 2026"
→ Recherche trouve l'ancien (score 0.92)
→ DELETE ancien + INSERT nouveau (plus précis)
```

## Structure des mémoires

### Option retenue : Hybride (tags + vecteurs)

```typescript
interface Memory {
  id: string;
  content: string;           // Le fait en texte
  subjects: string[];        // Tags plats : ["mickael", "blessure"]
  timestamp: string;
  expiresAt: string | null;  // ISO date ou null si permanent
  source: "conversation" | "chat" | "note";
  vector: number[];          // Pour recherche sémantique
}
```

**Pourquoi pas hiérarchique (`mickael:ski:blessure`) ?**
- Chevauchements difficiles ("blessure au ski" → `mickael:ski:blessure` ou `mickael:blessure:ski` ?)
- Force une taxonomie rigide
- Les tags plats + recherche vectorielle gèrent le flou naturellement

### Recherche

- **Par sémantique** : vecteur (cas général)
- **Par sujet** : filtre sur `subjects` (ex: "tout sur mickael")

## Flow complet (boucle agentique)

```
User (dev): "hello !"
       ↓
[Agent] 🚀 Starting query
[Agent] 👤 From: dev {message: "hello !", time: "sam. 17 janv. 2026, 22:19"}
       ↓
LLM décide: tool_call search_memories("dev")
       ↓
[Memory] 🔍 Searching facts: "dev"
[Memory] Found 5 facts: [{score: 0.38, "dev = Mickael"}, ...]
       ↓
LLM voit les résultats, décide de répondre:
tool_call respond({expression: "happy", message: "Coucou Mickael !"})
       ↓
[Agent] ✅ Query completed {turns: 2}
```

### Exemple avec plusieurs recherches

```
User (dev): "on a parlé de quoi ?"
       ↓
LLM: tool_call get_recent_memories(10)
       ↓
Result: ["dev = Mickael", "vacances Grèce", ...]
       ↓
LLM: tool_call search_memories("Mickael vacances")  ← Il creuse !
       ↓
Result: ["Mickael part en Grèce en février", ...]
       ↓
LLM: tool_call respond("On a parlé de tes vacances en Grèce !")
```

### Stockage d'une nouvelle info

```
User: "je me suis cassé l'épaule"
       ↓
LLM: tool_call respond({
  message: "Ah mince ! C'était quand ?",
  memories: [{content: "Mickael s'est cassé l'épaule", subjects: ["mickael", "blessure"], ttl: null}]
})
       ↓
[Agent] 💾 Storing memory...
[Memory] Recherche similaire → rien de proche → INSERT
```

## Décisions prises

### Seuils de similarité

- **Recherche : pas de seuil** — on retourne les 10 meilleurs résultats triés par score, le LLM décide ce qui est pertinent (~200 tokens max)
- **Déduplication : 0.85** — pour détecter si une info similaire existe déjà (et la mettre à jour)

Le seuil de déduplication est élevé pour éviter d'écraser des faits différents sur la même personne (ex: "habite à Paris" vs "a un fils").

**Pourquoi pas de seuil pour la recherche ?** Un seuil de 0.5 filtrait des infos utiles comme "dev = Mickael" (score 0.38). Avec 10 résultats max triés par score, le coût en tokens est acceptable et le LLM peut juger lui-même.

### Critère de stockage : les connexions, pas les entités

Le LLM connaît déjà les faits généraux (Paris existe, le ski est un sport). Ce qu'il ne connaît pas, c'est **moi**, mes proches, mes relations avec le monde.

**À stocker** : les connexions entre entités connues
- "David est mon frère" ✓
- "David habite à Ordizan" ✓
- "Ordizan est un village des Pyrénées" ✗ (le LLM sait déjà)

**Le test** : est-ce que cette info est spécifique à l'utilisateur ou son entourage ?

### Densité de mémoire

- Peu de mémoires sur un sujet → plus de choses sont importantes
- Beaucoup de mémoires → il faut que ça apporte vraiment quelque chose de nouveau

Mais attention : "David a changé de travail" reste important même avec 50 mémoires sur David. C'est les **variations mineures** de ce qu'on sait déjà qu'on évite.

### Pas de `forget()`

Inutile. Si une info est fausse, la correction arrive naturellement via le mécanisme d'update par similarité :
- Stocké : "David habite à Ordizan"
- User : "Non en fait David a déménagé à Toulouse"
- → Recherche trouve l'ancien (score élevé) → UPDATE

### Expiration : TTL décidé par le LLM

Le LLM décide du TTL à la création :
- Fait durable → `ttl: null`
- État temporaire → `ttl: "7d"` (ou "1d", "30d", etc.)

Un cron fait le ménage : `DELETE WHERE expiresAt < now()`

### Stockage explicite via la réponse JSON

Le LLM retourne ses instructions de mémoire dans sa réponse :

```json
{
  "message": "Ah mince pour ton épaule ! Repose-toi bien.",
  "memories": [
    {
      "content": "Mickael s'est cassé l'épaule le 10 janvier 2026",
      "subjects": ["mickael", "blessure"],
      "ttl": null
    }
  ]
}
```

État temporaire :
```json
{
  "message": "Repose-toi bien !",
  "memories": [
    {
      "content": "Mickael est malade",
      "subjects": ["mickael", "santé"],
      "ttl": "7d"
    }
  ]
}
```

**Pas d'action "update"** : le LLM dit juste "retiens ça", l'agent gère l'update via le mécanisme de similarité automatiquement.

### Format TTL

Durées lisibles : `"1d"`, `"7d"`, `"30d"`, `"1h"`, etc.

L'agent parse et calcule `expiresAt` en ISO date. Simple pour le LLM à générer.

### Pas de limite de mémoires

Pas nécessaire au début. Si Qdrant rame un jour, on ajoutera. Avec un bon TTL sur les états temporaires, ça reste gérable.

## Implémentation

### Déjà fait

- [x] Qdrant (Docker local + prod)
- [x] Embeddings (OpenAI text-embedding-3-small) → `server/src/memory/embedding.service.ts`
- [x] Memory service base → `server/src/memory/qdrant.service.ts`
  - `indexMemory()`, `searchMemory()`, `deleteMemory()`, `listMemories()`
  - `storeFactMemory()`, `searchFacts()`, `deleteExpiredMemories()`
- [x] Live collection (contexte récent) → `server/src/memory/live.service.ts`
- [x] Digest service (extraction de faits) → `server/src/memory/digest.service.ts`
- [x] Config agent → `server/src/config/agent.ts` + `server/agent-config.json`

### À faire

- [ ] Cron cleanup des mémoires expirées (fonction existe, pas encore schedulé)

## Architecture technique

### Worker (`server/src/agent/worker.mjs`)

Le worker est un process Node.js isolé qui :
- Communique avec le service via stdin/stdout (JSON)
- Contient les services mémoire embarqués (fetch Qdrant/OpenAI)
- Gère les sessions par utilisateur (Map userId → sessionId)
- Sérialise les requêtes via une queue (évite les race conditions)

**Tools disponibles** :
- `search_memories(query)` : recherche sémantique, 10 résultats max
- `get_recent_memories(limit)` : dernières mémoires (1-20)
- `respond(expression, message, memories?)` : répondre + stocker

**Sessions** :
- Une session Claude par utilisateur (conserve le contexte de conversation)
- Timeout 15 minutes d'inactivité
- Nettoyage automatique via setInterval

### Service (`server/src/agent/service.ts`)

- Spawn et manage le worker
- Forward les requêtes au worker
- Gère les logs du worker → console.log → LogPanel
- Stocke les mémoires retournées par le LLM

---

## Observation passive (à venir)

Le pet peut observer passivement les conversations (salons, notes) pour enrichir sa mémoire, sans qu'on lui parle directement.

### Problème : latence vs qualité

Un digest journalier filtre bien le bruit mais crée une latence inacceptable :
- David dit "je pars en Grèce demain" à 10h dans le Lobby
- À 11h, David parle au pet → le pet ne sait pas encore

### Solution : deux collections Qdrant

```
Message salon
     │
     ▼
Embedding + insert "live" collection
     │
     ├─────── Quand le pet répond ──────┐
     │                                   ▼
     │                    search("live", query, limit=10)
     │                                   │
     │                                   ▼
     │                         Injecté dans le prompt
     │
     └─────── Toutes les ~6h ───────────┐
                                         ▼
                              Digest LLM sur toute la collection
                                         │
                                         ▼
                              Faits importants → "memories" collection
                                         │
                                         ▼
                              Clear "live" collection
```

### Collection "live" (contexte récent)

Stocke les messages bruts du **Lobby uniquement** (pour commencer).

**1 message = 1 document Qdrant** avec payload pour reconstruire la timeline si besoin :

```typescript
// Qdrant point structure
{
  id: "msg-123",
  vector: number[],           // Embedding du content
  payload: {
    content: string,          // Le message brut
    author: string,           // Username
    room: string,             // "lobby" pour l'instant
    timestamp: string         // ISO date pour tri temporel
  }
}
```

**Quand le pet répond** :
1. Recherche sémantique dans "live" avec la question de l'utilisateur
2. Top 10 par pertinence → **injecté automatiquement** dans le prompt
3. Les "ok", "lol" ont des embeddings génériques → score faible → filtrés naturellement

**Format d'injection dans le prompt** :

```
[Contexte live - extraits pertinents du Lobby, pas une conversation complète]
• david (17/01 10:23) : je pars en Grèce demain
• david (17/01 10:48) : une semaine

[Mémoire - faits que tu connais]
• dev = Mickael
• David est le frère de Mickael
• ...
```

Le prompt doit être explicite : le contexte live n'est **pas** une conversation temporelle, juste les messages les plus pertinents par rapport à la question.

### Collection "memories" (faits durables)

La collection existante. Les faits importants extraits par le digest y sont stockés avec le mécanisme habituel (déduplication par similarité, TTL, etc.).

### Digest périodique

Toutes les ~6h :
1. Récupère tous les messages de la collection "live"
2. Le LLM extrait les **faits durables** (pas les bavardages)
3. Insert dans "memories" (avec déduplication)
4. Clear la collection "live"

### Avantages vs buffer RAM

| Aspect | Buffer RAM | Qdrant "live" |
|--------|-----------|---------------|
| Filtre | Chronologique | Par pertinence sémantique |
| Bruit ("ok", "lol") | Inclus | Score faible → filtré |
| Persistance | Perdu si crash | Persisté |
| Infra | Nouveau système | Réutilise Qdrant existant |

### Décisions observers

| Question | Décision |
|----------|----------|
| Salons à observer | Lobby uniquement (pour commencer) |
| Granularité | 1 message = 1 document Qdrant |
| Metadata | `author`, `room`, `timestamp` dans le payload |
| Injection | Automatique (pas de tool), le prompt distingue contexte live vs mémoire |

### Implémentation

- [x] Collection Qdrant "organizer_live" → `server/src/memory/live.service.ts`
- [x] Observer : écoute les messages du Lobby → embedding → insert "live" → `server/src/utils/socketEmit.ts`
- [x] Injection auto : search "live" + format dans le prompt du pet → `server/src/agent/worker.mjs`
- [x] Cron digest (~6h) : LLM extrait facts → "memories" → clear "live" → `server/src/memory/digest.service.ts`
- [x] Endpoint admin pour forcer un digest manuel → `POST /admin/digest`
- [x] Bouton Digest dans PetDebugScreen

---

## Historique des décisions

| Date | Décision | Raison |
|------|----------|--------|
| 2026-01-17 | Tags plats vs hiérarchie | Plus flexible, gère les chevauchements |
| 2026-01-17 | Update par similarité | Évite les doublons sans gérer des IDs manuellement |
| 2026-01-17 | Stocker les connexions | Le LLM connaît les entités, pas les relations personnelles |
| 2026-01-17 | Pas de forget() | Les corrections passent par l'update naturel |
| 2026-01-17 | Expiration selon type | Faits durables vs états temporaires |
| 2026-01-17 | TTL dans la réponse JSON | Le LLM décide de la durée, l'agent exécute |
| 2026-01-17 | Pas d'action "update" | La similarité gère l'update automatiquement |
| 2026-01-17 | TTL lisible ("7d") | Simple pour le LLM, l'agent calcule expiresAt |
| 2026-01-17 | Pas de limite mémoires | Qdrant gère, on ajustera si besoin |
| 2026-01-17 | Boucle agentique | Le LLM cherche lui-même avec des tools, peut creuser |
| 2026-01-17 | Pas de seuil recherche | Top 10 triés par score, le LLM juge la pertinence |
| 2026-01-17 | Services mémoire dans worker | Évite IPC complexe, juste des fetch |
| 2026-01-17 | Sessions par utilisateur | Chaque user a son contexte de conversation |
| 2026-01-17 | Deux collections Qdrant (live + memories) | Contexte récent sans latence + filtrage par pertinence |
| 2026-01-18 | Vidage du live après digest : on garde | Infos temporaires perdues pas graves, le live est éphémère |
| 2026-01-18 | Doublons live/mémoire acceptés | Temporaires (jusqu'au prochain digest), le LLM gère |

---

## Discussion : Vidage du live après digest (2026-01-18)

### Problème soulevé

Après un digest, la collection live est vidée. Les infos temporaires (ex: "j'ai mal au dos") non extraites comme faits sont perdues.

### Décision

**Garder le comportement actuel** (vider le live après digest).

**Raisons** :
- Le digest tourne toutes les 6h. Perdre un état temporaire après 6h est acceptable.
- Si c'était important, le digest devrait l'extraire avec TTL.
- Le live est éphémère, pas un historique.
- Évite les doublons live/mémoire permanents.

**Amélioration future possible** : affiner le prompt du digest pour mieux extraire les états temporaires (blessure, maladie) avec TTL.

---

## Discussion : Analyse des URLs (2026-01-18)

### État actuel

Les URLs dans les messages sont indexées comme texte brut. Le pet voit "Mickael a envoyé https://..." mais ne connaît pas le contenu du lien.

### Idée écartée : service de fetch/résumé

Un service qui :
1. Détecte les URLs dans les messages
2. Fetch le contenu web
3. Résume avec LLM
4. Extrait des faits → "Mickael a partagé un article sur X"

### Décision

**On garde simple.** Le fetch automatique ajouterait :
- Latence à l'indexation
- Coût LLM pour chaque lien
- Gestion des erreurs (liens morts, paywall, timeout)
- Risque de contenu inapproprié

Le flow actuel suffit : le pet voit l'URL, peut demander "c'était quoi ?", et stocke la réponse de l'utilisateur.
