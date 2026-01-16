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

### Phase 0 : Tamagotchi UI (MVP graphique) ✅

**Objectif** : Valider le concept visuel, pas de backend.

- [x] Canvas animé dans un nouvel onglet Android
- [x] Réponse au toucher (animations)
- [x] Design de la créature
- [x] Aucun LLM, aucun vital, juste du fun visuel

### Phase 1 : Le cerveau qui écoute

- [ ] Setup Qdrant sur le serveur
- [ ] Listeners des salons → embeddings → Qdrant
- [ ] API pour requêter la mémoire
- [ ] Test : voir ce que l'agent a "entendu"

### Phase 2 : Premier dialogue ✅

- [x] Intégrer Claude Agent SDK (worker.mjs + service.ts)
- [x] System prompt initial (conscience naissante)
- [ ] RAG sur Qdrant pendant le dialogue (Phase 1 nécessaire)
- [x] UI de chat dans l'onglet Tamagotchi (TextField + ThoughtBubble)
- [x] Première vraie conversation

**Architecture implémentée :**
```
Android (TextField) → POST /agent/ask → AgentService
                                              ↓
                                    spawn worker.mjs
                                              ↓
                                    Claude Agent SDK
                                    (Sonnet 4.5)
                                              ↓
                                    ThoughtBubble
```

### Phase 3 : Vitals et personnalité

- [ ] Définir les vitals significatifs
- [ ] Calcul des métriques
- [ ] Prompt dynamique avec contexte
- [ ] Affichage dans l'UI

### Phase 4 : Système de capacités

- [ ] Logique de détection de besoin
- [ ] UI pour afficher les demandes
- [ ] Workflow d'attribution de capacité
- [ ] Premier tool demandé et accordé

### Phase 5 : Boucle agentique autonome

- [ ] L'agent peut s'auto-déclencher (observer → penser → agir)
- [ ] Pensées spontanées
- [ ] Participation aux salons (si capacité accordée)

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

## Notes

- Ce projet mélange ludique (Tamagotchi visuel) et utilitaire (assistant IA)
- On commence par le fun (graphique) avant le complexe (IA)
- L'évolution se fera de manière itérative, en testant chaque phase
