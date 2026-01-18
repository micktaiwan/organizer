# Roadmap : Pet → Assistant Collaboratif

**Vision** : Transformer le pet d'un Tamagotchi amusant en assistant personnel partagé qui participe aux conversations, accède aux notes, cherche sur le web, et développe sa propre personnalité.

**Contexte actuel** :
- ✅ Organizer utilisé quotidiennement par toi et ton frère (remplace Slack/Messenger)
- ✅ Pet fonctionnel avec mémoire Qdrant et boucle agentique (Phase 2.5)
- ❌ Pet isolé dans l'onglet "Pet" (conversations privées uniquement)
- ❌ Pas d'accès aux notes (pourtant une base de connaissances idéale)
- ❌ Pas de tools utiles (recherche web, recherche messages, création notes)
- ❌ Ne peut pas être appelé dans les rooms/Lobby

---

## 🎯 Phase 3 : Pet dans les conversations publiques

**Objectif** : Le pet participe aux discussions dans les rooms et le Lobby quand on le mentionne.

### 3.1 - Mentions dans les rooms

**Backend :**
- [ ] Détecter les mentions `@pet` ou `@Pet` dans les messages
- [ ] Trigger automatique de l'agent quand mentionné
- [ ] Le pet peut poster des messages dans les rooms (comme un user normal)
  - Créer un "user" spécial pour le pet dans MongoDB
  - Username: `pet`, displayName: `🐾 Pet`
  - Envoyer messages via Socket.io comme les autres users

**Frontend (Desktop + Android) :**
- [ ] Afficher les messages du pet avec un badge/icône spéciale
- [ ] Auto-complétion `@pet` dans l'input

**Agent :**
- [ ] Nouveau contexte : derniers messages de la room (pas juste Lobby)
- [ ] Tool `respond()` prend en paramètre `roomId` pour savoir où répondre
- [ ] Limit aux mentions explicites pour éviter spam

### 3.2 - Contexte enrichi

- [ ] Passer l'historique récent de la room au LLM (ex: 20 derniers messages)
- [ ] Combiner avec la mémoire Qdrant existante
- [ ] Comprendre le contexte de la conversation avant de répondre

**Exemple de flow :**
```
User dans Lobby: "@pet tu te souviens de notre discussion sur le projet X?"
  ↓
Backend détecte @pet
  ↓
Agent reçoit:
  - Question: "tu te souviens de notre discussion sur le projet X?"
  - Room context: derniers 20 messages du Lobby
  - Memory search: "projet X"
  ↓
Agent répond: "Oui ! Vous parliez de migrer vers Tauri 2.0 la semaine dernière..."
  ↓
Message posté dans le Lobby comme un user normal
```

---

## 🛠️ Phase 4 : Tools utiles

**Objectif** : Donner au pet des outils pour accéder aux notes, chercher sur le web, et retrouver des infos.

### 4.1 - Accès aux notes

**Tool: `search_notes(query: string)`**
- Recherche dans les notes MongoDB par contenu/titre
- Retourne: titre, contenu (tronqué), labels, assignedTo
- Exemple: `@pet cherche dans mes notes "mot de passe wifi"`

**Tool: `create_note(title: string, content: string, labels?: string[])`**
- Créer une note depuis le chat
- Assignée à l'utilisateur qui a posé la question
- Exemple: `@pet crée une note "Idées projet" avec le contenu de notre discussion`

**Tool: `update_note(noteId: string, content: string)`**
- Ajouter du contenu à une note existante
- Exemple: `@pet ajoute ça à la note "TODO semaine prochaine"`

### 4.2 - Recherche web

**Tool: `search_web(query: string)`**
- Utiliser Brave Search API ou Google Custom Search API
- Retourner snippets + URLs
- Le pet cite ses sources dans les réponses
- Exemple: `@pet cherche "Tauri 2.0 vs Electron benchmarks 2025"`

### 4.3 - Recherche dans l'historique

**Tool: `search_messages(query: string, roomId?: string, limit: number = 10)`**
- Recherche full-text dans MongoDB (Messages)
- Filtrer par room si spécifié
- Retourne: message, sender, date, room
- Exemple: `@pet qui m'a envoyé le lien du restaurant la semaine dernière?`

### 4.4 - Système de rappels

**Tool: `create_reminder(text: string, date: Date, assignedTo?: string)`**
- Créer un rappel avec notification
- Stocké comme note avec flag spécial ou nouveau modèle `Reminder`
- Cron job pour envoyer notifications
- Exemple: `@pet rappelle-moi demain à 14h de faire le déploiement`

---

## 🧠 Phase 5 : Notes comme base de connaissances

**Objectif** : Les notes deviennent la mémoire long-terme partagée du pet.

### 5.1 - Indexation des notes dans Qdrant

- [ ] Ajouter un listener qui indexe automatiquement les notes dans Qdrant
- [ ] Collection `organizer_notes` ou intégrer dans `organizer_memory`
- [ ] Payload: `{ type: 'note', title, content, labels, createdBy, createdAt }`
- [ ] Re-indexer à chaque modification de note

### 5.2 - Suggestions proactives

- [ ] Après une discussion longue, le pet suggère: "Voulez-vous que je crée une note récapitulative?"
- [ ] Détecte les TODO dans les conversations: "J'ai détecté 3 tâches, je les ajoute à une checklist?"
- [ ] Lie les conversations aux notes existantes: "Ça me rappelle votre note 'Roadmap 2025'"

### 5.3 - Résumés automatiques

- [ ] Commande `@pet résume cette conversation`
- [ ] Génère un résumé avec bullet points
- [ ] Option pour sauvegarder le résumé en note automatiquement

---

## 🎭 Phase 6 : Personnalité évolutive

**Objectif** : Le pet développe sa propre identité et ses propres objectifs (collections `organizer_self` et `organizer_goals`).

### 6.1 - Collection `organizer_self` (identité)

**Type de mémoires stockées :**
- Préférences personnelles: "J'aime les discussions philosophiques"
- Observations sur soi: "Je suis curieux de nature"
- Relations avec les users: "Mickael me pose souvent des questions techniques, son frère préfère parler design"

**Activation :**
- [ ] Tool `remember_about_self(fact: string)` que le LLM peut appeler
- [ ] Système prompt enrichi: "Tu peux stocker des faits sur toi-même via remember_about_self()"
- [ ] Lors des réponses, le pet consulte aussi `organizer_self`

### 6.2 - Collection `organizer_goals` (aspirations)

**Type d'objectifs :**
- Capacités désirées: "J'aimerais pouvoir générer des images"
- Questions en suspens: "Je me demande pourquoi les humains aiment autant le café"
- Projets autonomes: "Je veux apprendre à résumer les conversations quotidiennes"

**Activation :**
- [ ] Tool `set_goal(goal: string, priority: 'low'|'medium'|'high')`
- [ ] Cron job quotidien: "Réflexion du pet" (sans trigger user)
- [ ] Le pet partage ses réflexions: "J'ai réfléchi cette nuit, j'aimerais apprendre à..."

### 6.3 - Ton et personnalité

**Actuellement :** Prompt système en français, personnalité définie manuellement

**Évolution :**
- [ ] Laisser le pet développer son propre ton au fil des interactions
- [ ] Stocker des "traits de personnalité" émergents dans `organizer_self`
- [ ] Tabula rasa : pas de personnalité forcée au départ, elle émerge naturellement
- [ ] Vous pouvez guider: "Sois plus concis" → le pet stocke cette préférence

---

## 🚀 Phase 7 : Autonomie (long terme)

**Objectif** : Le pet agit sans être sollicité, de manière utile et pertinente.

### 7.1 - Digest proactif

- Actuellement: digest passif toutes les 4h du Lobby
- Évolution: le pet peut poster un résumé s'il détecte une discussion importante
- Exemple: "J'ai remarqué que vous avez beaucoup discuté du projet X aujourd'hui, voici un résumé..."

### 7.2 - Notifications intelligentes

- Le pet détecte des patterns: "Mickael, tu mentionnes souvent faire le déploiement le vendredi, veux-tu que je te rappelle automatiquement?"
- Suggestions contextuelles: "Vous parlez de ce bug depuis 3 jours, voulez-vous que je crée une note de suivi?"

### 7.3 - Apprentissage continu

- Le pet pose des questions quand il ne comprend pas
- Il demande des feedbacks: "Est-ce que ma réponse était utile?"
- Il s'améliore en fonction des corrections

---

## 📊 Priorisation recommandée

### 🔥 Priorité HAUTE (quick wins, impact immédiat)

1. **Phase 3.1** : Mentions @pet dans les rooms (1-2 jours)
   - C'est LA feature qui transforme le projet
   - Débloque l'utilisation quotidienne

2. **Phase 4.1** : Tool `search_notes()` (1 jour)
   - Les notes existent déjà, juste exposer la recherche
   - Très utile pour retrouver des infos

3. **Phase 4.2** : Tool `search_web()` (1 jour)
   - Brave Search API est gratuit jusqu'à 2000 queries/mois
   - Fait du pet un vrai assistant

### ⚡ Priorité MOYENNE (next steps)

4. **Phase 3.2** : Contexte enrichi avec historique room (1 jour)
   - Améliore la pertinence des réponses

5. **Phase 4.1** : Tool `create_note()` (1 jour)
   - Capturer des idées depuis le chat

6. **Phase 5.1** : Indexer notes dans Qdrant (2 jours)
   - Recherche sémantique dans les notes

7. **Phase 5.2** : Suggestions proactives (2-3 jours)
   - Le pet devient vraiment intelligent

### 🎯 Priorité BASSE (nice to have)

8. **Phase 6** : Personnalité évolutive (1 semaine)
   - Collections `self` et `goals`
   - C'est fascinant mais pas critique pour l'utilité

9. **Phase 7** : Autonomie complète (2+ semaines)
   - Actions non-sollicitées
   - Nécessite beaucoup de tuning

---

## 🎬 Plan d'action immédiat (1ère semaine)

### Jour 1 : Pet dans les rooms
- Créer user "pet" dans MongoDB
- Détecter mentions @pet dans messages
- Agent peut poster dans les rooms

### Jour 2 : Premier tool utile
- Implémenter `search_notes(query)`
- Tester: `@pet cherche "wifi"` dans le Lobby

### Jour 3 : Recherche web
- Setup Brave Search API
- Implémenter `search_web(query)`
- Tester: `@pet cherche "Tauri vs Electron"`

### Jour 4-5 : Contexte enrichi + polissage
- Passer historique room au LLM
- Améliorer les réponses contextuelles
- UX: badge spécial pour messages du pet

**Après 1 semaine :** Vous avez un assistant collaboratif fonctionnel qui :
- Répond dans toutes les rooms quand mentionné
- Cherche dans vos notes
- Cherche sur le web
- Comprend le contexte des discussions

---

## 💡 Idées bonus

### Assistant de réflexion philosophique
- Mode "discussion profonde" où le pet pose des questions socratiques
- Stocke les réflexions philosophiques dans des notes dédiées
- Peut référencer vos anciennes discussions: "Tu disais le mois dernier que..."

### Base de connaissances partagée
- Les notes deviennent votre "second cerveau" collectif
- Le pet indexe tout, vous n'avez plus à chercher
- `@pet qu'est-ce qu'on sait sur [sujet]?`

### Assistant de projet
- Suit vos projets en cours (détection automatique dans conversations)
- Résumés hebdo: "Cette semaine vous avez avancé sur X, Y, bloqués sur Z"
- Suggestions: "Ça fait 2 semaines que vous parlez de faire X, voulez-vous que je le note en TODO?"

### Mode "compagnon de pensée"
- Pas juste un outil, mais un participant à vos réflexions
- Vous challengez: "Avez-vous considéré l'angle Y?"
- Apprend vos patterns de pensée

---

## ✅ Prochaine étape

**Question pour toi :** On commence par la Phase 3 (pet dans les rooms) ?

C'est le changement le plus impactant et ça débloque tout le reste. Après ça, le pet devient vraiment utile au quotidien.

Je peux implémenter ça maintenant si tu veux ! 🚀
