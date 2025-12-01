/**
 * C.A.R.L - GitHub Webhook Server
 * ================================
 * Serveur léger qui écoute les webhooks GitHub et déclenche le déploiement
 * 
 * Installation sur le serveur:
 * 1. npm install (dans le dossier scripts)
 * 2. Configurer WEBHOOK_SECRET dans .env
 * 3. pm2 start webhook-server.js --name carl-webhook
 */

const http = require('http');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.WEBHOOK_PORT || 9000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your-webhook-secret-here';
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');
const DEPLOY_DIR = process.env.DEPLOY_DIR || '/mnt/storage/dev/carl';
const LOG_FILE = path.join(DEPLOY_DIR, 'logs', 'webhook.log');

// Charger .env si présent
const envPath = path.join(DEPLOY_DIR, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && !key.startsWith('#')) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    });
}

// Logger
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage.trim());
    
    // Créer le dossier logs si nécessaire
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, logMessage);
}

// Vérifier la signature GitHub
function verifySignature(payload, signature) {
    if (!signature) return false;
    
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    try {
        return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
    } catch {
        return false;
    }
}

// Exécuter le script de déploiement
function runDeploy() {
    log('🚀 Lancement du script de déploiement...');
    
    // Rendre le script exécutable
    exec(`chmod +x "${DEPLOY_SCRIPT}"`, (err) => {
        if (err) {
            log(`⚠️ Impossible de rendre le script exécutable: ${err.message}`);
        }
        
        // Exécuter le script en arrière-plan
        const deploy = spawn('bash', [DEPLOY_SCRIPT], {
            cwd: DEPLOY_DIR,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PATH: process.env.PATH }
        });
        
        deploy.stdout.on('data', (data) => {
            log(`[deploy] ${data.toString().trim()}`);
        });
        
        deploy.stderr.on('data', (data) => {
            log(`[deploy:err] ${data.toString().trim()}`);
        });
        
        deploy.on('close', (code) => {
            log(`✅ Script de déploiement terminé avec le code: ${code}`);
        });
        
        deploy.unref();
    });
}

// Créer le serveur HTTP
const server = http.createServer((req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'carl-webhook' }));
        return;
    }
    
    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            const signature = req.headers['x-hub-signature-256'];
            const event = req.headers['x-github-event'];
            
            log(`📨 Webhook reçu: ${event}`);
            
            // Vérifier la signature (sauf si secret non configuré)
            if (WEBHOOK_SECRET !== 'your-webhook-secret-here') {
                if (!verifySignature(body, signature)) {
                    log('❌ Signature invalide!');
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid signature' }));
                    return;
                }
            }
            
            // Traiter uniquement les push sur main
            if (event === 'push') {
                try {
                    const payload = JSON.parse(body);
                    const branch = payload.ref?.replace('refs/heads/', '');
                    
                    if (branch === 'main') {
                        log(`✅ Push sur main détecté - Commit: ${payload.head_commit?.id?.substring(0, 7)}`);
                        log(`📝 Message: ${payload.head_commit?.message}`);
                        
                        // Lancer le déploiement
                        runDeploy();
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ 
                            status: 'deploying',
                            commit: payload.head_commit?.id,
                            message: payload.head_commit?.message
                        }));
                    } else {
                        log(`ℹ️ Push sur ${branch} ignoré (seul main déclenche le déploiement)`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'ignored', reason: 'not main branch' }));
                    }
                } catch (e) {
                    log(`❌ Erreur parsing payload: ${e.message}`);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid payload' }));
                }
            } else if (event === 'ping') {
                log('🏓 Ping reçu de GitHub');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'pong' }));
            } else {
                log(`ℹ️ Event ${event} ignoré`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ignored', event }));
            }
        });
        
        return;
    }
    
    // 404 pour les autres routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// Démarrer le serveur
server.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Webhook server démarré sur le port ${PORT}`);
    log(`📍 Endpoint: http://0.0.0.0:${PORT}/webhook`);
    log(`❤️ Health check: http://0.0.0.0:${PORT}/health`);
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
    log('👋 Arrêt du serveur webhook...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('👋 Arrêt du serveur webhook (CTRL+C)...');
    server.close(() => {
        process.exit(0);
    });
});
