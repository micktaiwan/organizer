# Track - Organizer

| Statut | Sujet | Prochaine action |
|--------|-------|------------------|
| 🔄 En cours | Skill `/eko` — parler à Eko depuis Claude Code | Créer le skill `~/.claude/skills/eko/`, récupérer/créer un token MCP, tester le flow |
| 🔄 En cours | Token MCP auto au signup | Décider si on relaxe le check admin dans `mcpAuthMiddleware` (auth.ts:86) pour que les tokens non-admin fonctionnent |

## Détails

### Skill `/eko` — parler à Eko depuis Claude Code
- **Objectif** : converser avec Eko directement depuis Claude Code, mode interactif (multi-tour)
- **Endpoint** : `POST /agent/ask` sur prod (`51.210.150.25:3001`), body `{ "question": "..." }`
- **Changements faits** (non commités) :
  - `server/src/routes/agent.ts` — retiré la limite de 500 chars sur le champ `question` (zod schema)
  - `server/src/middleware/auth.ts` — ajouté fallback token MCP dans `authMiddleware` : si le token commence par `mcp_`, lookup dans `McpToken` au lieu de vérifier un JWT. Pas de check `isAdmin` (contrairement à `mcpAuthMiddleware`).
- **Reste à faire** :
  1. Récupérer ou créer un token MCP pour Mickael
  2. Créer le skill `~/.claude/skills/eko/skill.md` (mode interactif, proxy transparent vers `/agent/ask`)
  3. Déployer les changements serveur
  4. Tester le flow end-to-end

### Token MCP auto au signup
- **Fichiers modifiés** (non commités) :
  - `server/src/routes/auth.ts` — import `generateMcpToken` + `McpToken`, génère token après `user.save()`, retourne `apiKey` dans la réponse register
  - `server/src/mcp/handlers/create-user.ts` — même logique après `newUser.save()`
- **Build** : TypeScript compile OK
- **Caveat** : `mcpAuthMiddleware` (server/src/mcp/auth.ts:86) vérifie `!user.isAdmin` et rejette les tokens non-admin. Les tokens sont créés en base mais ne passeront pas l'auth MCP pour les users non-admin. À décider : relaxer ce check ou garder le comportement actuel.
