#!/bin/bash

# Get script directory (works even when called from another folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Configuration
SERVER="ubuntu@51.210.150.25"
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
ssh $SERVER << 'EOF'
  cd /var/www/organizer/server

  # Créer .env si n'existe pas
  if [ ! -f .env ]; then
    echo "JWT_SECRET=$(openssl rand -base64 32)" > .env
    echo "CORS_ORIGIN=*" >> .env
    echo "📝 Fichier .env créé"
  fi

  # Build et restart (sudo pour docker)
  sudo docker compose -f docker-compose.prod.yml up -d --build

  # Status
  sudo docker compose -f docker-compose.prod.yml ps

  # Cleanup: remove old images and build cache
  echo "🧹 Nettoyage Docker..."
  sudo docker image prune -f
  sudo docker builder prune -f
EOF

echo "✅ Déploiement terminé!"
echo "🔗 API: http://51.210.150.25:3001/health"
