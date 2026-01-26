# Analyse Serveur - 26 janvier 2026

## Serveur Linux (ubuntu@51.210.150.25)

| Ressource | Valeur |
|-----------|--------|
| Disk | 20 GB total, 14 GB used, 6 GB free |
| RAM | 1.89 GB total, ~0.7 GB available |
| OS | Ubuntu (Docker host) |

### Espace disque par répertoire

| Répertoire | Taille |
|------------|--------|
| /var/lib/docker | 8.75 GB |
| /var/log | 0.98 GB |
| /tmp | 0.12 GB |

---

## Containers Docker

| Container | Image | RAM | CPU | Réseau |
|-----------|-------|-----|-----|--------|
| organizer-api | - | ~97 MiB | 0.19% | server_organizer-network |
| organizer-mongodb | mongo:5 | ~150 MiB | 0.49% | server_organizer-network |
| organizer-qdrant | - | ~34 MiB | 0.04% | server_organizer-network |
| organizer-coturn | - | ~6 MiB | 0.02% | - |
| cron-server | Meteor 3.3.2 | ~180 MiB | 0.00% | bridge |
| mongodb | mongo:4.0.10 | ~185 MiB | 0.80% | bridge |
| mup-nginx-proxy | - | ~59 MiB | 0.15% | - |
| mup-nginx-proxy-letsencrypt | - | ~33 MiB | 0.13% | - |

---

## Architecture MongoDB

### Deux instances MongoDB distinctes

```
┌─────────────────────────────────────────────────────────────────┐
│                    server_organizer-network                      │
│                                                                  │
│  ┌──────────────┐         ┌────────────────────┐                │
│  │ organizer-api │ ──────▶ │ organizer-mongodb  │                │
│  └──────────────┘         │ (Mongo 5)          │                │
│         │                 │ alias: "mongodb"   │                │
│         │                 └────────────────────┘                │
│         │                          │                            │
│         │                          ▼                            │
│         │                 Base: organizer (25 MB)               │
│         │                 Collections: users, messages,         │
│         │                 rooms, notes, reflections...          │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ MONGO_URL=mongodb://mongodb:27017/organizer
          │ (résout vers organizer-mongodb via alias sur ce réseau)
          │
══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                         bridge (default)                         │
│                                                                  │
│  ┌─────────────┐          ┌────────────────────┐                │
│  │ cron-server │ ────────▶│     mongodb        │                │
│  │ (Meteor)    │          │ (Mongo 4.0.10)     │                │
│  └─────────────┘          └────────────────────┘                │
│         │                          │                            │
│         │                          ▼                            │
│         │                 Base: cron-server (6 MB)              │
│         │                 Collections: cs_cron_task,            │
│         │                 orbiter_logs, dfm_*...                │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ MONGO_URL=mongodb://mongodb:27017/cron-server?replicaSet=meteor
          │ (résout vers le container "mongodb" sur bridge)
```

### Pourquoi deux "mongodb" ?

L'alias Docker permet à deux containers de porter le même nom logique sur des réseaux différents :

- Sur `server_organizer-network` : `mongodb` → `organizer-mongodb` (Mongo 5)
- Sur `bridge` : `mongodb` → container `mongodb` (Mongo 4.0.10)

Chaque app résout `mongodb` vers le bon container selon son réseau.

---

## État de cron-server

| Info | Valeur |
|------|--------|
| App | Meteor 3.3.2, Node 22.18.0 |
| Process | `node main.js` (tourne) |
| Dernière activité | **22 janvier 2021** (5 ans) |
| Tâches cron | 8 actives, 3 stoppées |
| RAM consommée | ~365 MiB (cron-server + mongodb 4.0.10) |

### Contenu de la base cron-server

- 24 collections, 4098 documents, ~6 MB
- Collections `orbiter_*` : ancienne app Orbiter
- Collections `dfm_*` : ancienne app DFM
- `cs_cron_task` : 11 tâches (8 "start", 3 "stop")
- Dernier log : "Starting app" le 2021-01-22

### Conclusion

**cron-server et le vieux mongodb (Mongo 4.0.10) sont obsolètes depuis 5 ans.**

L'app Meteor tourne mais ne fait rien. Les crons sont configurés mais inactifs.

Ces deux containers consomment ~365 MiB de RAM pour rien.

**Action possible :** `docker stop cron-server mongodb` pour libérer la RAM (les données restent dans les volumes Docker).

---

## Commandes utiles

```bash
# Status serveur complet
ssh ubuntu@51.210.150.25 "/home/ubuntu/server-status.sh"

# Voir les bases MongoDB
docker exec organizer-mongodb mongosh --quiet --eval 'db.adminCommand({listDatabases:1})'
docker exec mongodb mongo --quiet --eval 'db.adminCommand({listDatabases:1})'

# Stopper cron-server (sans perdre les données)
docker stop cron-server mongodb

# Redémarrer si besoin
docker start cron-server mongodb
```
