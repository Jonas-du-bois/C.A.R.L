#!/bin/bash
# ============================================
# C.A.R.L - Webhook Setup Script
# ============================================
# Ce script configure le webhook server sur ton serveur Ubuntu
# 
# Usage: sudo bash setup-webhook.sh

set -e

echo "🚀 Configuration du webhook C.A.R.L..."

DEPLOY_DIR="/mnt/storage/dev/carl"
SCRIPTS_DIR="$DEPLOY_DIR/scripts"

# Vérifier qu'on est root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Ce script doit être exécuté en tant que root (sudo)"
    exit 1
fi

# Vérifier que Node.js est installé
if ! command -v node &> /dev/null; then
    echo "📦 Installation de Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "✅ Node.js version: $(node -v)"

# Créer le dossier logs
mkdir -p "$DEPLOY_DIR/logs"
chmod 755 "$DEPLOY_DIR/logs"

# Rendre les scripts exécutables
chmod +x "$SCRIPTS_DIR/deploy.sh"
chmod +x "$SCRIPTS_DIR/webhook-server.js"

# Générer un secret aléatoire si pas déjà défini
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo ""
echo "🔐 Secret webhook généré:"
echo "   $WEBHOOK_SECRET"
echo ""
echo "⚠️  IMPORTANT: Copiez ce secret pour le configurer sur GitHub!"
echo ""

# Ajouter le secret au .env si pas présent
if ! grep -q "WEBHOOK_SECRET" "$DEPLOY_DIR/.env" 2>/dev/null; then
    echo "" >> "$DEPLOY_DIR/.env"
    echo "# --- Webhook Configuration ---" >> "$DEPLOY_DIR/.env"
    echo "WEBHOOK_SECRET=$WEBHOOK_SECRET" >> "$DEPLOY_DIR/.env"
    echo "WEBHOOK_PORT=9000" >> "$DEPLOY_DIR/.env"
    echo "✅ Secret ajouté au fichier .env"
fi

# Copier le service systemd
cp "$SCRIPTS_DIR/webhook.service" /etc/systemd/system/carl-webhook.service

# Recharger systemd
systemctl daemon-reload

# Activer et démarrer le service
systemctl enable carl-webhook
systemctl start carl-webhook

# Vérifier le statut
sleep 2
if systemctl is-active --quiet carl-webhook; then
    echo "✅ Service webhook démarré avec succès!"
else
    echo "❌ Erreur au démarrage du service"
    systemctl status carl-webhook
    exit 1
fi

# Obtenir l'IP publique
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "VOTRE_IP")

echo ""
echo "============================================"
echo "🎉 Configuration terminée!"
echo "============================================"
echo ""
echo "📍 URL du webhook: http://$PUBLIC_IP:9000/webhook"
echo ""
echo "📋 Prochaines étapes:"
echo ""
echo "1. Aller sur GitHub → Repo → Settings → Webhooks → Add webhook"
echo ""
echo "2. Configurer le webhook:"
echo "   • Payload URL: http://$PUBLIC_IP:9000/webhook"
echo "   • Content type: application/json"
echo "   • Secret: $WEBHOOK_SECRET"
echo "   • Events: Just the push event"
echo ""
echo "3. Si tu as un pare-feu, ouvrir le port 9000:"
echo "   sudo ufw allow 9000/tcp"
echo ""
echo "4. Tester en faisant un push sur main!"
echo ""
echo "📊 Commandes utiles:"
echo "   • Logs:    journalctl -u carl-webhook -f"
echo "   • Status:  systemctl status carl-webhook"
echo "   • Restart: systemctl restart carl-webhook"
echo ""
