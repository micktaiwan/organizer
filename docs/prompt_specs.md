# Prompt: Détection de régressions specs

Ce prompt guide une analyse systématique pour détecter les régressions par rapport aux spécifications.

---

## Iteration 1: Lecture des specs

**Objectif:** Comprendre les comportements attendus.

1. Lire `docs/specs.md` en entier
2. Lister chaque spec avec un identifiant (SPEC-001, SPEC-002, etc.)
3. Pour chaque spec, identifier:
   - La plateforme concernée (Android/Desktop/Server/All)
   - Le composant UI ou module concerné
   - Le comportement attendu précis

---

## Iteration 2: Analyse du code

**Objectif:** Trouver les implémentations et détecter les bugs.

Pour chaque spec identifiée:

### 2.1 Recherche de l'implémentation
- Chercher les fichiers qui implémentent cette spec
- Identifier les fonctions/composants clés
- Noter les chemins et numéros de ligne

### 2.2 Détection des bugs
Pour chaque implémentation trouvée, vérifier:
- Le code fait-il exactement ce que la spec demande?
- Y a-t-il des cas edge non gérés?
- Y a-t-il des erreurs de logique?

### 2.3 Documentation dans docs/bugs.md
Créer ou mettre à jour `docs/bugs.md` avec le format:

```markdown
## BUG-XXX: [Titre court]
**Spec:** SPEC-XXX
**Fichier:** `path/to/file.kt:123`
**Sévérité:** Critical | High | Medium | Low
**Status:** Open | Investigating | Fixed

### Description
[Ce qui ne marche pas]

### Comportement attendu
[Ce que la spec demande]

### Comportement actuel
[Ce qui se passe réellement]

### Analyse
[Pourquoi ça ne marche pas - explication technique]
```

---

## Iteration 3: Approfondissement

**Objectif:** Comprendre la root cause et trouver le fix minimal.

Pour chaque bug documenté:

### 3.1 Analyse approfondie
- Tracer le flux de données/events
- Identifier le point exact de défaillance
- Vérifier si c'est une régression (le code marchait avant?)

### 3.2 Solution minimale
Privilégier dans cet ordre:
1. **Fix d'une ligne** - typo, mauvais opérateur, valeur incorrecte
2. **Fix de quelques lignes** - condition manquante, appel oublié
3. **Refactoring léger** - réorganisation sans changement d'architecture

Éviter:
- Les refactorings majeurs
- L'ajout de nouvelles dépendances (sauf si absolument nécessaire)
- Les changements d'architecture

### 3.3 Mise à jour docs/bugs.md
Ajouter à chaque bug:

```markdown
### Solution proposée
[Description du fix]

### Fichiers à modifier
- `path/to/file.kt:123` - [description du changement]
```

---

## Iteration 4: Correction

**Objectif:** Appliquer les fixes et vérifier.

### 4.1 Appliquer les corrections
- Un bug à la fois
- Commits atomiques si possible
- Garder les changements minimaux
- commenter le code en anglais pour les explications de fixes et éviter ainsi les régressions futures

### 4.2 Vérification immédiate
Après chaque fix:
- Relire le code modifié
- Vérifier que le fix correspond à la spec
- S'assurer qu'il n'y a pas d'effets de bord évidents

### 4.3 Mise à jour docs/bugs.md
Mettre le status à `Fixed` et ajouter:

```markdown
### Fix appliqué
- Commit: [hash si disponible]
- Fichiers modifiés: [liste]
- Changements: [résumé]
```

---

## Iteration 5: Revue post-fix (OBLIGATOIRE)

**Objectif:** S'assurer que les fixes n'introduisent pas de nouvelles régressions.

⚠️ **Cette itération est OBLIGATOIRE avant de marquer la tâche comme complète.**

### 5.1 Revue des changements
Pour chaque fichier modifié:
- Le code est-il lisible et maintenable?
- Y a-t-il des cas edge non gérés par le fix?
- Le fix peut-il casser d'autres fonctionnalités?

### 5.2 Vérification croisée (REQUIS)
**Créer une section dans docs/bugs.md avec ce format EXACT :**

```markdown
## Vérification croisée des specs

| Spec | Fichiers touchés par le fix | Impact | Vérifié |
|------|----------------------------|--------|---------|
| SPEC-XXX | file.ts:123 | Aucun / Potentiel / Cassé | ✅ / ⚠️ / ❌ |
```

Pour chaque spec dans docs/specs.md :
1. Identifier si les fichiers modifiés touchent cette spec
2. Si oui, vérifier que le comportement est préservé
3. Documenter le résultat dans le tableau

**Ne pas compléter la loop si cette section n'existe pas dans bugs.md.**

### 5.3 Rapport final
Mettre à jour `docs/bugs.md` avec un résumé:

```markdown
---

## Résumé de session

**Date:** [date]
**Bugs trouvés:** X
**Bugs corrigés:** Y
**Status:** Complete | Partial | Blocked

### Changements effectués
[Liste des fichiers modifiés et pourquoi]

### Points d'attention
[Choses à surveiller ou tester manuellement]
```

---

## Notes importantes

- **Ne pas inventer de specs** - se baser uniquement sur docs/specs.md
- **Documenter même les non-bugs** - si une spec est correctement implémentée, le noter
- **Privilégier la simplicité** - le fix le plus simple est souvent le meilleur
- **Ne pas over-engineer** - corriger le bug, pas refactorer tout le module
