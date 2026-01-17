# Memory Architecture

## Objectif

Permettre au pet de se souvenir des informations importantes sur les utilisateurs et les conversations, sans tout stocker.

## Principes

### 1. Recherche systématique (pas cher)

À chaque message utilisateur :
1. Embedding du message (~0.0001$)
2. Recherche Qdrant (gratuit, local, rapide)
3. Injection dans le contexte SI pertinent ET nouveau

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

## Flow complet

```
User: "je suis mickael"
       ↓
   Embedding → Recherche Qdrant
       ↓
   Trouve: [{content: "mickael aime le ski", subjects: ["mickael", "ski"]}]
       ↓
   Score > 0.5 ? Injecte dans contexte
       ↓
Pet: "Salut Mickael ! Tu vas retourner skier bientôt ?"

User: "non je me suis cassé l'épaule"
       ↓
Pet décide de stocker (fait important)
       ↓
   Recherche similaire → rien de proche
       ↓
   INSERT {content: "Mickael s'est cassé l'épaule", subjects: ["mickael", "blessure"]}
       ↓
Pet: "Ah mince ! C'était quand ?"

User: "la semaine dernière, le 10 janvier"
       ↓
Pet veut stocker avec la date
       ↓
   Recherche → trouve "Mickael s'est cassé l'épaule" (score 0.92)
       ↓
   DELETE ancien + INSERT {content: "Mickael s'est cassé l'épaule le 10 janvier 2026", ...}
```

## Décisions prises

### Seuils de similarité

- **Recherche : 0.5** — pour injecter les mémoires pertinentes dans le contexte
- **Déduplication : 0.85** — pour détecter si une info similaire existe déjà (et la mettre à jour)

Le seuil de déduplication est élevé pour éviter d'écraser des faits différents sur la même personne (ex: "habite à Paris" vs "a un fils").

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

### À faire

- [x] Ajouter type `fact` dans `MemoryPayload` avec `subjects: string[]` et `expiresAt: string | null`
- [x] Fonction `storeFactMemory()` avec logique de déduplication (recherche similarité > 0.5 → delete + insert)
- [x] Parser TTL ("7d" → date ISO)
- [x] Intégration agent : injecter mémoires pertinentes dans le contexte
- [x] Intégration agent : parser `memories[]` dans la réponse JSON et stocker
- [ ] Cron cleanup des mémoires expirées (plus tard)

## Limitations connues

### Recherche sémantique limitée par le contexte

**Problème découvert** : La recherche RAG est basée sur la similarité sémantique entre la question et les mémoires. Les questions génériques ("on a parlé de quoi ?") ont une faible similarité avec les mémoires spécifiques ("Mickael part en Grèce").

```
Mémoires stockées :
- "dev s'appelle en réalité Mickael"
- "Mickael part en vacances en Grèce"
- "Le PSG a gagné 3-0"

User (dev) : "on a parlé de quoi avant ?"
RAG embedding sur : { "from": "dev", "message": "on a parlé de quoi avant ?" }
RAG trouve : les 2 mémoires avec "dev" (similarité OK)
RAG ne trouve pas : "Mickael part en Grèce" (faible similarité sémantique)
```

**Impact** : Les questions ouvertes ne retrouvent pas toutes les mémoires pertinentes.

**Pistes d'amélioration** :
1. Résoudre les alias avant recherche (dev → Mickael → chercher les deux)
2. Utiliser les `subjects` comme filtre additionnel
3. Augmenter le nombre de résultats (actuellement 5)
4. Faire une recherche en deux passes : d'abord les alias, puis élargir

**Workaround actuel** : Le pet apprend les alias et les stocke. Les questions spécifiques ("où est-ce que je pars en vacances ?") fonctionnent mieux que les questions génériques.

---

## Évolution prévue : Boucle agentique avec tools

### Problème actuel

Le serveur fait **une seule** recherche mémoire avant d'envoyer au LLM (`maxTurns: 1`). Le LLM ne peut pas creuser davantage s'il a besoin de plus d'infos.

### Solution retenue

Donner des **tools** au LLM pour qu'il cherche lui-même, avec plusieurs tours possibles :

```
User: "on a parlé de quoi ?"
     ↓
LLM: tool_call search_memories("conversations dev")
     ↓
Tool result: ["dev = Mickael", ...]
     ↓
LLM: tool_call search_memories("Mickael")  ← Il creuse !
     ↓
Tool result: ["vacances Grèce", "PSG 3-0", ...]
     ↓
LLM: respond("On a parlé de tes vacances en Grèce !")
```

### Implémentation

**Approche choisie** : Tools directement dans le worker (pas d'IPC complexe)

- Les services mémoire sont légers (juste des `fetch` vers Qdrant/OpenAI)
- Le SDK Agent est conçu pour des tools async
- Passer `QDRANT_URL` et `OPENAI_API_KEY` via env

**Changements à faire** :
- [ ] Importer les services mémoire dans `worker.mjs`
- [ ] Augmenter `maxTurns` (1 → 5)
- [ ] Ajouter tool `search_memories(query)` - recherche sémantique
- [ ] Ajouter tool `get_recent_memories(limit)` - dernières mémoires
- [ ] Retirer la recherche préalable dans `service.ts`

---

## Historique des décisions

| Date | Décision | Raison |
|------|----------|--------|
| 2026-01-17 | Tags plats vs hiérarchie | Plus flexible, gère les chevauchements |
| 2026-01-17 | Recherche systématique | Qdrant est gratuit, autant chercher toujours |
| 2026-01-17 | Update par similarité | Évite les doublons sans gérer des IDs manuellement |
| 2026-01-17 | Seuil 0.5 | Bas = moins de doublons, on ajustera |
| 2026-01-17 | Stocker les connexions | Le LLM connaît les entités, pas les relations personnelles |
| 2026-01-17 | Pas de forget() | Les corrections passent par l'update naturel |
| 2026-01-17 | Expiration selon type | Faits durables vs états temporaires |
| 2026-01-17 | TTL dans la réponse JSON | Le LLM décide de la durée, l'agent exécute |
| 2026-01-17 | Pas d'action "update" | La similarité gère l'update automatiquement |
| 2026-01-17 | TTL lisible ("7d") | Simple pour le LLM, l'agent calcule expiresAt |
| 2026-01-17 | Pas de limite mémoires | Qdrant gère, on ajustera si besoin |
| 2026-01-17 | Réutiliser memory service existant | Ajouter type `fact` au lieu de refaire |
