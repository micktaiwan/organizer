# Agent Organizer

Un assistant IA évolutif intégré à l'app Organizer, qui observe, apprend et développe ses capacités au fil du temps.

## Vision

Créer un agent qui :
1. **Observe passivement** les interactions dans Organizer (salons, notes, tâches)
2. **Apprend et consolide** sa compréhension du monde de Mickael et David
3. **Demande ses propres évolutions** - il identifie ses limites et propose des capacités à développer
4. **Devient un vrai assistant** avec une boucle agentique autonome (Claude Agent SDK)

Le projet a deux facettes :
- **"Tamagotchi"** : la partie ludique/graphique - une créature interactive qui représente visuellement l'agent
- **"Agent"** : le cerveau - observation, mémoire, raisonnement, outils

---

## Architecture conceptuelle

```
┌─────────────────────────────────────────────────────────────┐
│                      ANDROID APP                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Tamagotchi UI (ludique)                            │   │
│  │  • Canvas animé interactif                          │   │
│  │  • Vitals visuels (plus tard)                       │   │
│  │  • Zone de dialogue (plus tard)                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    AGENT ENGINE (Backend)                   │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ Passive Observers │  │ Memory System                │    │
│  │ • salon_observer  │  │ • Qdrant (self-hosted)       │    │
│  │ • note_observer   │  │ • Context window             │    │
│  │ • task_observer   │  │ • Consolidated insights      │    │
│  │ • gps_observer    │  │ • Compression algo (TBD)     │    │
│  └──────────────────┘  └──────────────────────────────┘    │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Claude Agent SDK - Boucle agentique                  │  │
│  │ • System prompt dynamique (contexte + personnalité)  │  │
│  │ • Tools évolutifs (demandés par l'agent)             │  │
│  │ • Observe → Pense → Agit (autonome)                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Système de personnalité

**Prompt dynamique contextuel** : avant chaque réponse, on injecte le contexte actuel.

Exemple :
```
Contexte actuel :
- Curiosity: 73% (beaucoup de concepts non compris)
- Interaction Need: 89% (pas sollicité depuis 2 jours)
- Tu as faim d'interactions

[Le reste du prompt...]
```

→ Dans sa réponse, l'agent glissera naturellement "et au fait, ça fait longtemps qu'on n'a pas parlé..."

Les traits de personnalité émergent des observations et influencent le ton/style via ce prompt dynamique.

---

## Système de capacités évolutives

L'agent **demande** ses évolutions plutôt que de les recevoir :

```
Cycle :
1. Observation & Limitation → il identifie un manque
2. Formulation du besoin → "j'aimerais pouvoir chercher sur le web"
3. Décision humaine → M&D acceptent ou refusent
4. Développement → on code le tool
5. Attribution → on lui "donne" la capacité
6. Exploration → il teste et découvre de nouvelles limites
→ Retour à 1
```

**Catalogue de capacités possibles** (par phases) :
- Phase 1 : `listen_salon`, `read_notes`, `read_tasks` (naissance)
- Phase 2 : `search_web`, `read_documentation` (ouverture au monde)
- Phase 3 : `post_message`, `send_notification` (expression)
- Phase 4 : `create_task`, `modify_note` (action)
- Phase 5 : `introspect_logs`, `analyze_memory` (méta-conscience)

---

## Questions ouvertes

### Technique

| Question | Réflexion actuelle |
|----------|-------------------|
| **Coût Vector DB** | Qdrant self-hosted sur le serveur → coût minimal |
| **Compression mémoire** | À définir plus tard - algo pour résumer les résumés quand le system prompt devient trop long |
| **Appels LLM fréquence** | À voir selon l'usage - budget à définir |
| **Cohérence system prompt** | Le prompt grandit avec les insights consolidés - besoin d'un mécanisme de review/compression |

### Conceptuel

| Question | Réflexion actuelle |
|----------|-------------------|
| **Vitals significatifs** | À définir plus tard - commencer simple, itérer |
| **"Théâtre de conscience"** | Un LLM qui "demande" une capacité ne veut rien vraiment - à garder en tête |
| **Nom définitif** | À trouver plus tard |

### Design

| Question | Réflexion actuelle |
|----------|-------------------|
| **Peut-il "mourir" ?** | À décider |
| **Une ou plusieurs instances ?** | Probablement une seule conscience partagée |
| **Fallback offline** | À définir |

---

## Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Tamagotchi UI (MVP graphique) | ✅ |
| 1 | Le cerveau qui écoute (Qdrant, listeners) | ✅ |
| 2 | Premier dialogue (Claude Agent SDK, RAG) | ✅ |
| 1.5 | Mémoire persistante → [memory-architecture.md](memory-architecture.md) | ✅ |
| 2.5 | Boucle agentique avec tools → [memory-architecture.md](memory-architecture.md) | 🔜 |
| 3 | Vitals et personnalité | ⏳ |
| 4 | Système de capacités | ⏳ |
| 5 | Boucle agentique autonome | ⏳ |

## Documentation

- [memory-architecture.md](memory-architecture.md) - Architecture mémoire, RAG, stockage de faits, boucle agentique

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Android UI | Kotlin + Jetpack Compose (Canvas) |
| Backend | Node.js (cohérent avec Organizer) |
| LLM | Claude via Agent SDK |
| Vector DB | Qdrant (self-hosted sur serveur) |
| DB classique | MongoDB (vitals, state, history) |

---

## Backlog (non urgent)

- [ ] **Réponses au tap dynamiques** : Actuellement, quand on clique sur le Tamagotchi, il affiche un texte aléatoire parmi une liste statique. L'idée serait de stocker ces phrases dans MongoDB et que l'agent les alimente lui-même quand il découvre quelque chose d'intéressant dans les conversations (ex: "Ah tiens, vous avez parlé de vacances en Grèce !", "J'ai vu que le build Android marchait enfin !").

- [ ] **Face mimic via caméra** : Activer la caméra frontale pour observer le visage de l'utilisateur et faire réagir/mimiquer le pet en temps réel.
  - **Techno** : ML Kit Face Detection (Google) + CameraX
  - **Données exploitables** :
    - `smilingProbability` (0.0-1.0) → Pet content quand user sourit
    - `leftEyeOpenProbability` / `rightEyeOpenProbability` → Pet cligne/dort si yeux fermés
    - `headEulerAngleY/Z` → Pet penche la tête comme le user
  - **Mapping possible** :
    | Expression User | Réaction Pet |
    |-----------------|--------------|
    | Sourire (>0.7) | Pet heureux, saute |
    | Yeux fermés | Pet s'endort aussi |
    | Clin d'œil | Pet fait un clin d'œil |
    | Tête penchée | Pet penche la tête |
    | Pas de visage | Pet triste/lonely |
  - **Dépendances** : `com.google.mlkit:face-detection:16.1.6`, `androidx.camera:camera-*:1.3.1`
  - **Considérations** : On-device (privacy OK), ~30 FPS, throttle UI updates à 100ms

---

## Notes

- Ce projet mélange ludique (Tamagotchi visuel) et utilitaire (assistant IA)
- On commence par le fun (graphique) avant le complexe (IA)
- L'évolution se fera de manière itérative, en testant chaque phase
