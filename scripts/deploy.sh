#!/bin/bash
# ============================================
# C.A.R.L - Auto-Deployment Script
# ============================================
# Ce script est appelé par le webhook lors d'un push sur GitHub
# Il met à jour le code, rebuild l'image Docker et notifie via Telegram

set -e

# Configuration
DEPLOY_DIR="/mnt/storage/dev/carl"
LOG_FILE="/mnt/storage/dev/carl/logs/deploy.log"
LOCK_FILE="/tmp/carl-deploy.lock"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Fonction de logging
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Fonction pour envoyer une notification Telegram
send_telegram() {
    local message="$1"
    local token="${TELEGRAM_BOT_TOKEN}"
    local chat_id="${TELEGRAM_ADMIN_ID}"
    
    if [ -z "$token" ] || [ -z "$chat_id" ]; then
        # Charger depuis .env si pas défini
        if [ -f "$DEPLOY_DIR/.env" ]; then
            token=$(grep "^TELEGRAM_BOT_TOKEN=" "$DEPLOY_DIR/.env" | cut -d'=' -f2)
            chat_id=$(grep "^TELEGRAM_ADMIN_ID=" "$DEPLOY_DIR/.env" | cut -d'=' -f2)
        fi
    fi
    
    if [ -n "$token" ] && [ -n "$chat_id" ]; then
        curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
            -d chat_id="${chat_id}" \
            -d text="${message}" \
            -d parse_mode="HTML" > /dev/null 2>&1
    fi
}

# Vérifier si un déploiement est déjà en cours
if [ -f "$LOCK_FILE" ]; then
    log "${YELLOW}⚠️ Déploiement déjà en cours, abandon${NC}"
    exit 0
fi

# Créer le fichier de verrouillage
trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

log "${GREEN}🚀 Démarrage du déploiement C.A.R.L...${NC}"

# Aller dans le répertoire du projet
cd "$DEPLOY_DIR"

# Récupérer les infos du commit actuel pour le message
OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Mettre à jour le code depuis GitHub
log "📥 Récupération des dernières modifications..."
git fetch origin main
git reset --hard origin/main

# Récupérer les nouvelles infos
NEW_COMMIT=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --pretty=%B | head -n1)
COMMIT_AUTHOR=$(git log -1 --pretty=%an)

log "📝 Nouveau commit: ${NEW_COMMIT} - ${COMMIT_MSG}"

# Envoyer notification de début de déploiement
send_telegram "🔄 <b>C.A.R.L - Déploiement en cours...</b>

📦 Commit: <code>${NEW_COMMIT}</code>
📝 ${COMMIT_MSG}
👤 Par: ${COMMIT_AUTHOR}

⏳ Reconstruction de l'image Docker..."

# Arrêter le conteneur actuel
log "🛑 Arrêt du conteneur actuel..."
docker compose down 2>/dev/null || true

# Nettoyer les anciennes images pour économiser l'espace
log "🧹 Nettoyage des anciennes images..."
docker image prune -f 2>/dev/null || true

# Reconstruire l'image sans cache
log "🔨 Reconstruction de l'image Docker (sans cache)..."
BUILD_START=$(date +%s)

if docker compose build --no-cache 2>&1 | tee -a "$LOG_FILE"; then
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    log "${GREEN}✅ Build réussi en ${BUILD_TIME}s${NC}"
else
    log "${RED}❌ Échec du build${NC}"
    send_telegram "❌ <b>C.A.R.L - Échec du déploiement!</b>

📦 Commit: <code>${NEW_COMMIT}</code>
🔧 Erreur lors du build Docker

Vérifiez les logs: <code>$LOG_FILE</code>"
    exit 1
fi

# Démarrer le nouveau conteneur
log "🚀 Démarrage du nouveau conteneur..."
if docker compose up -d 2>&1 | tee -a "$LOG_FILE"; then
    log "${GREEN}✅ Conteneur démarré${NC}"
else
    log "${RED}❌ Échec du démarrage${NC}"
    send_telegram "❌ <b>C.A.R.L - Échec du démarrage!</b>

📦 Commit: <code>${NEW_COMMIT}</code>
🔧 Le conteneur n'a pas pu démarrer

Vérifiez les logs: <code>docker compose logs</code>"
    exit 1
fi

# Attendre quelques secondes pour vérifier que le conteneur est stable
sleep 5

# Vérifier que le conteneur tourne
if docker compose ps | grep -q "Up"; then
    log "${GREEN}✅ C.A.R.L est en ligne!${NC}"
    
    # Envoyer notification de succès
    send_telegram "✅ <b>C.A.R.L - Nouvelle version déployée!</b>

📦 Commit: <code>${NEW_COMMIT}</code>
📝 ${COMMIT_MSG}
👤 Par: ${COMMIT_AUTHOR}
⏱️ Build: ${BUILD_TIME}s

🤖 Le bot est prêt! Tu peux te reconnecter maintenant."
else
    log "${RED}❌ Le conteneur ne semble pas stable${NC}"
    send_telegram "⚠️ <b>C.A.R.L - Déploiement incertain</b>

📦 Commit: <code>${NEW_COMMIT}</code>
🔧 Le conteneur a démarré mais n'est peut-être pas stable

Vérifiez: <code>docker compose logs -f</code>"
fi

log "${GREEN}🎉 Déploiement terminé!${NC}"
