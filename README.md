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
# IA (choisir un provider)
AI_PROVIDER=gemini          # gemini, openai, ou groq
GEMINI_API_KEY=xxx          # Gratuit !
# OPENAI_API_KEY=xxx
# GROQ_API_KEY=xxx

# Telegram
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx

# Google Calendar (optionnel)
GOOGLE_CALENDAR_ID=xxx
GOOGLE_SERVICE_ACCOUNT_KEY=xxx

# Fonctionnalités
ENABLE_AUTO_RESPONSE=false  # Mode économique
ENABLE_DAILY_BRIEFING=true
DAILY_BRIEFING_TIME=0 8 * * *  # 8h00
```

## 📖 Documentation

- [Technical Design Document](docs/Technical%20design%20document.md)

## 📝 License

MIT
