# Backup MongoDB (organizer)

## Stratégie

- **Fréquence** : quotidien à 2h00 UTC
- **Rétention** : 7 jours glissants
- **Données** : base `organizer` (chats, users, rooms, notes, etc.)
- **Non inclus** : Qdrant (embeddings, reconstituables), fichiers uploadés

## Fichiers sur le serveur (51.210.150.25)

| Fichier | Rôle |
|---------|------|
| `/usr/local/bin/backup-organizer.sh` | Script de backup |
| `/etc/cron.d/backup-organizer` | Cron journalier |
| `/opt/backups/mongodump_organizer_YYYY-MM-DD.gz` | Fichiers de backup |
| `/var/log/backup-organizer.log` | Log d'exécution |

## Script

```bash
#!/bin/bash
# Backup organizer MongoDB - daily with 7-day rotation
set -euo pipefail

BACKUP_DIR="/opt/backups"
CONTAINER="organizer-mongodb"
DB="organizer"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d)
FILENAME="mongodump_organizer_${DATE}.gz"

mkdir -p "$BACKUP_DIR"

# Dump
docker exec "$CONTAINER" mongodump --db "$DB" --archive --gzip 2>/dev/null > "${BACKUP_DIR}/${FILENAME}"

# Purge old backups
find "$BACKUP_DIR" -name "mongodump_organizer_*.gz" -mtime +${RETENTION_DAYS} -delete

echo "Backup done: ${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"
```

## Cron

```
0 2 * * * root /usr/local/bin/backup-organizer.sh >> /var/log/backup-organizer.log 2>&1
```

## Restauration

```bash
# Copier le backup en local
scp ubuntu@51.210.150.25:/opt/backups/mongodump_organizer_YYYY-MM-DD.gz .

# Restaurer dans le container
cat mongodump_organizer_YYYY-MM-DD.gz | docker exec -i organizer-mongodb mongorestore --gzip --archive --drop
```

## Vérification

```bash
# Dernier backup
ssh ubuntu@51.210.150.25 "ls -lh /opt/backups/"

# Log
ssh ubuntu@51.210.150.25 "tail -5 /var/log/backup-organizer.log"
```
