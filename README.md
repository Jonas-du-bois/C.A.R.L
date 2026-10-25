# C.A.R.L. - Communication Assistant for Routing & Logistics

> **FR:** C.A.R.L. est un assistant personnel intelligent pour WhatsApp. Il utilise l'IA pour analyser les messages, gérer ton agenda Google et t'envoyer des rapports quotidiens sur Telegram.
>
> **EN:** C.A.R.L. is an intelligent personal assistant for WhatsApp. It uses AI to analyze messages, manage your Google Calendar, and send you daily reports on Telegram.

## ✨ Features

- 🤖 **AI-Powered Analysis** - Classifie automatiquement les messages (professionnel, personnel, sport, spam)
- 📅 **Google Calendar Integration** - Détecte les rendez-vous et vérifie les disponibilités
- 📊 **Daily Reports** - Rapports intelligents avec tâches et événements à planifier
- 📱 **Telegram Control** - Commandes pour gérer le bot à distance
- 🔄 **Auto-Deploy** - Webhook pour déploiement automatique sur push GitHub

## 🏗️ Architecture

```
src/
├── core/                    # Cœur de l'application
│   ├── Application.js       # Orchestrateur principal
│   └── Config.js            # Configuration centralisée
│
├── domain/                  # Modèles de domaine
│   └── Message.js           # Entité Message
│
├── handlers/                # Gestionnaires d'événements
│   ├── GatekeeperHandler.js # Filtrage des messages
│   ├── MessageHandler.js    # Traitement des messages
│   └── TelegramCommandHandler.js # Commandes Telegram
│
├── prompts/                 # Prompts IA centralisés
│   └── index.js             # Tous les prompts système
│
├── repositories/            # Accès aux données
│   ├── Database.js          # SQLite database
│   └── MessageRepository.js # CRUD messages/contacts
│
├── services/                # Services métier
│   ├── AIService.js         # Service IA multi-provider
│   ├── CalendarService.js   # Google Calendar
│   ├── CronService.js       # Rapports planifiés
│   ├── QueueService.js      # File d'attente
│   ├── TelegramService.js   # Bot Telegram
│   └── WhatsAppService.js   # Client WhatsApp
│   └── ai/                  # Sous-modules IA
│       ├── AIProviderFactory.js    # Factory pour providers
│       ├── ConversationFormatter.js # Formatage conversations
│       └── ReportFormatter.js      # Formatage rapports
│
└── utils/                   # Utilitaires
    ├── Errors.js            # Gestion des erreurs
    ├── Logger.js            # Logging
    └── Sanitizer.js         # Nettoyage des données
```

## 🚀 Getting Started

### Prérequis

- Node.js 18+
- Docker & Docker Compose
- Compte Telegram (pour le bot)
- API Key IA (Gemini gratuit, OpenAI ou Groq)

### Installation

1. **Cloner le repo**
```bash
git clone https://github.com/Jonas-du-bois/C.A.R.L.git
cd C.A.R.L
```

2. **Configurer les variables d'environnement**
```bash
cp .env.example .env
# Éditer .env avec vos clés API
```

3. **Lancer avec Docker**
```bash
docker compose up -d
```

4. **Scanner le QR code**
   - Envoyez `/connect` au bot Telegram
   - Scannez le QR avec WhatsApp

## 📱 Commandes Telegram

| Commande | Description |
|----------|-------------|
| `/rapport` | Génère un rapport complet avec IA |
| `/stats` | Statistiques rapides du jour |
| `/status` | État du système |
| `/connect` | Obtenir le QR code WhatsApp |
| `/reset` | Réinitialiser la session |
| `/tasks` | Tâches et événements à planifier |
| `/debug` | Diagnostic des messages |
| `/help` | Afficher l'aide |

## 🔧 Configuration

### Variables d'environnement

```env
# Base et fuseau
DATABASE_PATH=/app/data/carl.db
APP_TIMEZONE=Europe/Paris
WHATSAPP_SESSION_PATH=/app/data/.wwebjs_auth

# IA : une clé est nécessaire pour ENABLE_AUTO_RESPONSE=true
GEMINI_API_KEY=xxx
# GROQ_API_KEY=xxx
# OPENAI_API_KEY=xxx
AI_MAX_TOKENS=500
AI_TEMPERATURE=0.3

# Telegram : requis pour les rapports ou alertes
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_ADMIN_ID=xxx
# TELEGRAM_ALLOWED_USER_ID=xxx  # défaut : TELEGRAM_ADMIN_ID

# Google Calendar (optionnel)
GOOGLE_CALENDAR_ID=primary
GOOGLE_SERVICE_ACCOUNT_JSON=xxx

# Fonctionnalités
ENABLE_AUTO_RESPONSE=false
ENABLE_DAILY_BRIEFING=false
DAILY_BRIEFING_TIME=0 8 * * *
```

`OPENAI_MAX_TOKENS`, `OPENAI_TEMPERATURE` et `GOOGLE_SERVICE_ACCOUNT_KEY`
restent acceptées comme alias dépréciés et déclenchent un avertissement sans
afficher leur valeur. Lorsque les deux fonctionnalités automatiques sont
désactivées, C.A.R.L. peut démarrer en mode économique sans clé IA ni Telegram.

### Healthcheck

`GET /health` renvoie un rapport JSON détaillé. `healthy` et `degraded`
répondent avec HTTP 200 ; `unhealthy` répond avec HTTP 503 lorsqu'une erreur de
base de données est détectée. WhatsApp, l'IA, Telegram et Calendar indisponibles
sont non critiques et produisent donc `degraded`.

## 📖 Documentation

- [Technical Design Document](docs/Technical%20design%20document.md)

## 📝 License

MIT
