#!/bin/bash

# Get script directory (works even when called from another folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Configuration
SERVER="ubuntu@51.178.29.205"
REMOTE_PATH="/var/www/organizer"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Déploiement sur $SERVER"

# 0. Vérification de l'espace disque sur le serveur
echo "💾 Vérification de l'espace disque..."
AVAILABLE_GB=$(ssh $SERVER "df -BG / | tail -1 | awk '{print \$4}' | sed 's/G//'")
echo "   Espace disponible: ${AVAILABLE_GB}GB"

if [ "$AVAILABLE_GB" -lt 2 ]; then
  echo "⚠️  Espace disque faible (<2GB). Nettoyage Docker en cours..."
  ssh $SERVER "sudo docker system prune -af --volumes"
  AVAILABLE_GB=$(ssh $SERVER "df -BG / | tail -1 | awk '{print \$4}' | sed 's/G//'")
  echo "   Espace après nettoyage: ${AVAILABLE_GB}GB"

  if [ "$AVAILABLE_GB" -lt 2 ]; then
    echo "❌ Toujours moins de 2GB disponibles. Déploiement annulé."
    exit 1
  fi
fi

# 1. Sync des fichiers vers le serveur
echo "📦 Synchronisation des fichiers..."
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.env' \
  "$SCRIPT_DIR/" $SERVER:$REMOTE_PATH/server/

# 2. Commandes sur le serveur
echo "🐳 Build et restart des containers..."
# set -e : tout échec côté serveur (dont le build/up de l'api) fait sortir le
# heredoc en erreur, et ssh renvoie ce code non-nul — on ne veut plus d'un
# "Déploiement terminé" affiché alors que rien n'a été déployé.
ssh $SERVER << 'EOF'
  set -e
  cd /var/www/organizer/server

  # Créer .env si n'existe pas
  if [ ! -f .env ]; then
    echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
    echo "CORS_ORIGIN=*" >> .env
    echo "📝 Fichier .env créé"
  fi

  # Build et (re)start uniquement l'api. mongo/qdrant sont gérés par le projet
  # infra (/opt/infra) ; --no-deps empêche compose de tenter de recréer leurs
  # conteneurs, ce qui échouait sur un conflit de nom.
  sudo docker compose -f docker-compose.prod.yml up -d --build --no-deps api

  # Vérifier que l'api est bien "up" (le build peut réussir mais le conteneur
  # crasher au démarrage — on veut le savoir ici, pas dans l'app).
  sleep 5
  if ! sudo docker compose -f docker-compose.prod.yml ps api | grep -q "Up"; then
    echo "❌ Le conteneur api n'est pas Up après le déploiement :"
    sudo docker compose -f docker-compose.prod.yml logs --tail 30 api
    exit 1
  fi

  # Status
  sudo docker compose -f docker-compose.prod.yml ps

  # Cleanup: remove old images and build cache
  echo "🧹 Nettoyage Docker..."
  sudo docker image prune -f
  sudo docker builder prune -f
EOF
SSH_RC=$?

# Propager l'échec distant : ne pas annoncer un succès si le heredoc a échoué.
if [ "$SSH_RC" -ne 0 ]; then
  echo "❌ Déploiement échoué (code $SSH_RC, voir les logs ci-dessus)."
  exit 1
fi

# Sanity check depuis la machine locale : l'API répond-elle vraiment ?
echo "🔎 Vérification de /health..."
if curl -fsS --max-time 15 https://organizer.mickaelfm.me/health > /dev/null; then
  echo "✅ Déploiement terminé!"
  echo "🔗 API: https://organizer.mickaelfm.me/health"
else
  echo "❌ /health ne répond pas après le déploiement."
  exit 1
fi
