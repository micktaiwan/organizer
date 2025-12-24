#!/bin/bash

# Configuration
SERVER="ubuntu@51.210.150.25"
REMOTE_PATH="/var/www/organizer"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Déploiement sur $SERVER"

# 1. Sync des fichiers vers le serveur
echo "📦 Synchronisation des fichiers..."
rsync -avz --exclude 'node_modules' --exclude 'dist' --exclude '.env' \
  ./ $SERVER:$REMOTE_PATH/server/

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
EOF

echo "✅ Déploiement terminé!"
echo "🔗 API: http://51.210.150.25:3001/health"
