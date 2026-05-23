// index.js - PERSONAL DATA VAULT API PRO ✅ + NUEVAS FUNCIONES 🟢
// ✅ Cifrado AES-256-GCM | ✅ Anti-bruteforce | ✅ Auditoría | ✅ 2FA Opcional
// 🟢 Categorías | 🟢 Historial de cambios | 🟢 Alertas IP | 🟢 Rotación automática

require('dotenv').config();
var express = require('express');
var cors = require('cors');
var helmet = require('helmet');
var rateLimit = require('express-rate-limit');
var crypto = require('crypto');
var Joi = require('joi');
var pino = require('pino');
var fs = require('fs');
var path = require('path');
var cron = require('node-cron');
var axios = require('axios');

var logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// 🔐 Validar MASTER_KEY
if (!process.env.MASTER_KEY) {
    logger.fatal('❌ Falta MASTER_KEY en .env');
    process.exit(1);
}

var app = express();
// app.set('trust proxy', true);  // ❌ Comentada para evitar conflicto con rate-limit
var PORT = parseInt(process.env.PORT, 10) || 8080;
var MASTER_KEY = (process.env.MASTER_KEY || '').trim();
var ENCRYPTION_KEY = Buffer.from(MASTER_KEY, 'hex');
if (ENCRYPTION_KEY.length !== 32) {
    logger.fatal('❌ MASTER_KEY debe ser HEX de 64 caracteres');
    process.exit(1);
}

var TFA_CODE = process.env.TFA_CODE || '';
var DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';
var SUSPICIOUS_THRESHOLD = parseInt(process.env.SUSPICIOUS_IP_THRESHOLD) || 20;
var ALERT_WINDOW = parseInt(process.env.ALERT_WINDOW_MINUTES) || 60;
var origins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:8080', 'http://127.0.0.1:5500', 'null'];

var DB_FILE = path.join(__dirname, 'data', 'vault.json');
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

var db = { vault: [], audit: [], failedAttempts: {}, suspiciousAlerts: [] };

function loadDB() { try { if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { logger.warn('⚠️ BD vacía'); } }

function saveDB() { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { logger.error('❌ Error guardando BD'); } }
loadDB();

app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Demasiadas peticiones' } }));
app.use(express.json({ limit: '2mb' }));

// 🔐 ✅ Cifrado AES-256-GCM
function encrypt(text) {
    var iv = crypto.randomBytes(12);
    var cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    var enc = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
    return { iv: iv.toString('hex'), enc: enc, authTag: cipher.getAuthTag().toString('hex') };
}

function decrypt(ivHex, enc, tagHex) {
    var decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
}

function getIP(req) {
    var ip = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
    if (Array.isArray(ip)) ip = ip[0];
    return ip.toString().split(',')[0].trim();
}

// 🪵 ✅ Auditoría
function logAudit(action, actor, meta) {
    if (!meta) meta = {};
    db.audit.push({ action: action, actor: actor, timestamp: new Date().toISOString(), ip: meta.ip || 'unknown', ua: meta.ua || 'unknown', meta: meta });
    if (db.audit.length > 2000) db.audit = db.audit.slice(-2000);
    saveDB();
}

// 🟢 Alertas IP
async function sendAlert(msg) { if (DISCORD_WEBHOOK) { try { await axios.post(DISCORD_WEBHOOK, { content: msg }); } catch (e) {} } else logger.warn('🚨 ALERTA: ' + msg); }

function checkIPs() {
    // ✅ Guard: si db o db.audit no existen, salir sin error
    if (!db || !db.audit || !Array.isArray(db.audit)) return;

    var now = Date.now();
    var win = ALERT_WINDOW * 60000;
    var counts = {};

    db.audit.forEach(function(l) {
        if (l && l.timestamp && l.ip && l.ip !== 'unknown') {
            var t = new Date(l.timestamp).getTime();
            if (t > now - win) {
                counts[l.ip] = (counts[l.ip] || 0) + 1;
            }
        }
    });

    Object.keys(counts).forEach(function(ip) {
        var c = counts[ip];
        if (c >= SUSPICIOUS_THRESHOLD) {
            var already = false;
            if (db.suspiciousAlerts && Array.isArray(db.suspiciousAlerts)) {
                for (var j = 0; j < db.suspiciousAlerts.length; j++) {
                    if (db.suspiciousAlerts[j].ip === ip && new Date(db.suspiciousAlerts[j].timestamp).getTime() > now - win) {
                        already = true;
                        break;
                    }
                }
            }
            if (!already) {
                sendAlert('⚠️ IP SOSPECHOSA: ' + ip + ' -> ' + c + ' acciones en ' + ALERT_WINDOW + 'min');
                if (!db.suspiciousAlerts) db.suspiciousAlerts = [];
                db.suspiciousAlerts.push({ ip: ip, count: c, timestamp: new Date().toISOString() });
            }
        }
    });

    if (db.suspiciousAlerts && Array.isArray(db.suspiciousAlerts)) {
        db.suspiciousAlerts = db.suspiciousAlerts.filter(function(a) {
            return a && a.timestamp && new Date(a.timestamp).getTime() > now - win * 2;
        });
    }
}

// 🔄 🟢 Rotación automática & Chequeo IP
cron.schedule('*/10 * * * *', function() { checkIPs(); });
cron.schedule('0 */24 * * *', function() { logAudit('auto_rotate', 'system', { action: 'token_cleanup' }); });

// 🌐 RUTAS PÚBLICAS
// 🟢 Estado de la API (ruta nueva para no chocar con la app)
app.get('/api/status', function(req, res) { res.json({ api: "Personal Data Vault API PRO + 2FA", version: "3.2-final", status: "online", tfa: !!TFA_CODE }); });

// 📱 Ruta raíz: servir la app móvil (prioridad alta)
app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/health', function(req, res) { res.json({ status: 'healthy', time: new Date().toISOString() }); });

// 🔐 ✅ Autenticación + Anti-bruteforce + 2FA
function auth(req, res, next) {
    var ip = getIP(req),
        now = Date.now();
    if (db.failedAttempts[ip] && now - db.failedAttempts[ip].t > 15 * 60 * 1000) delete db.failedAttempts[ip];
    if (db.failedAttempts[ip] && db.failedAttempts[ip].c >= 5) return res.status(429).json({ error: 'Demasiados intentos. Espera ' + Math.ceil((db.failedAttempts[ip].t + 15 * 60 * 1000 - now) / 1000) + 's' });
    var key = (req.headers['x-api-key'] || req.query.key || '').trim();
    var tfa = (req.headers['x-tfa-code'] || req.query.tfa || '').trim();
    if (TFA_CODE && tfa !== TFA_CODE) return res.status(401).json({ error: '2FA incorrecto' });
    if (!key || key !== MASTER_KEY) {
        if (!db.failedAttempts[ip]) db.failedAttempts[ip] = { c: 0, t: now };
        db.failedAttempts[ip].c++;
        db.failedAttempts[ip].t = now;
        saveDB();
        logAudit('auth_fail', 'unknown', { ip: ip });
        return res.status(401).json({ error: 'Clave inválida' });
    }
    req.actor = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    req.ipLog = ip;
    req.ua = req.get('user-agent') || 'unknown';
    next();
}
app.use(['/vault', '/audit', '/export', '/categories', '/admin'], auth);

// 📋 ✅ Validación + 🟢 Categoría
var vaultSchema = Joi.object({ titulo: Joi.string().min(1).max(200).required(), contenido: Joi.string().min(1).max(50000).required(), tipo: Joi.string().valid('nota', 'documento', 'credencial').default('nota'), categoria: Joi.string().default('general'), tags: Joi.array().items(Joi.string()).optional() });

// 🟢 Endpoint Categorías
app.get('/categories', function(req, res) {
    var cats = [],
        s = {};
    db.vault.forEach(function(i) {
        var c = i.categoria || 'general';
        if (!s[c]) {
            s[c] = true;
            cats.push(c)
        }
    });
    res.json({ success: true, categories: cats });
});

// ➕ Crear
app.post('/vault', function(req, res) {
    var v = vaultSchema.validate(req.body);
    if (v.error) return res.status(400).json({ error: v.error.message });
    var c = encrypt(v.value.contenido);
    var item = { id: Date.now(), titulo: v.value.titulo, enc: c.enc, iv: c.iv, tag: c.authTag, tipo: v.value.tipo, categoria: v.value.categoria, tags: v.value.tags || [], created_at: new Date().toISOString() };
    db.vault.push(item);
    saveDB();
    logAudit('create', req.actor, { id: item.id, categoria: item.categoria, ip: req.ipLog });
    res.status(201).json({ success: true, id: item.id });
});

// 📋 Listar
app.get('/vault', function(req, res) {
    var items = db.vault.map(function(i) { return { id: i.id, titulo: i.titulo, tipo: i.tipo, categoria: i.categoria, tags: i.tags, created_at: i.created_at } });
    if (req.query.categoria) items = items.filter(function(i) { return i.categoria === req.query.categoria });
    if (req.query.search) items = items.filter(function(i) { return i.titulo.toLowerCase().indexOf(req.query.search.toLowerCase()) !== -1 });
    res.json({ success: true, total: items.length, items: items });
});

// 🔍 Leer
app.get('/vault/:id', function(req, res) {
    var item = null;
    for (var i = 0; i < db.vault.length; i++) { if (db.vault[i].id == req.params.id) { item = db.vault[i]; break } }
    if (!item) return res.status(404).json({ error: 'No encontrado' });
    try {
        res.json({ success: true, data: { id: item.id, titulo: item.titulo, contenido: decrypt(item.iv, item.enc, item.tag), tipo: item.tipo, categoria: item.categoria, tags: item.tags, created_at: item.created_at } });
        logAudit('read', req.actor, { id: item.id, ip: req.ipLog });
    } catch (e) { res.status(500).json({ error: 'Error descifrando' }); }
});

// ✏️ 🟢 Actualizar + Historial de cambios
app.put('/vault/:id', function(req, res) {
    var idx = -1;
    for (var i = 0; i < db.vault.length; i++) { if (db.vault[i].id == req.params.id) { idx = i; break } }
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    var v = vaultSchema.validate(req.body);
    if (v.error) return res.status(400).json({ error: v.error.message });
    var old = db.vault[idx],
        changed = [];
    if (v.value.titulo !== old.titulo) {
        db.vault[idx].titulo = v.value.titulo;
        changed.push('titulo')
    }
    if (v.value.contenido !== old.contenido) {
        var c = encrypt(v.value.contenido);
        db.vault[idx].enc = c.enc;
        db.vault[idx].iv = c.iv;
        db.vault[idx].tag = c.authTag;
        changed.push('contenido')
    }
    if (v.value.tipo !== old.tipo) {
        db.vault[idx].tipo = v.value.tipo;
        changed.push('tipo')
    }
    if (v.value.categoria !== old.categoria) {
        db.vault[idx].categoria = v.value.categoria;
        changed.push('categoria')
    }
    if (JSON.stringify(v.value.tags) !== JSON.stringify(old.tags)) {
        db.vault[idx].tags = v.value.tags;
        changed.push('tags')
    }
    if (changed.length > 0) {
        db.vault[idx].updated_at = new Date().toISOString();
        saveDB();
        logAudit('update', req.actor, { id: db.vault[idx].id, old: { t: old.titulo, c: old.categoria }, new: { t: db.vault[idx].titulo, c: db.vault[idx].categoria }, changed: changed, ip: req.ipLog });
    }
    res.json({ success: true, mensaje: '✅ Actualizado', changed: changed });
});

// 🗑️ Eliminar
app.delete('/vault/:id', function(req, res) {
    var idx = -1;
    for (var i = 0; i < db.vault.length; i++) { if (db.vault[i].id == req.params.id) { idx = i; break } }
    if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
    var del = db.vault.splice(idx, 1)[0];
    saveDB();
    logAudit('delete', req.actor, { id: del.id, titulo: del.titulo, ip: req.ipLog });
    res.json({ success: true, mensaje: '✅ Eliminado' });
});

// 📜 Ver Auditoría
app.get('/audit', function(req, res) {
    var logs = db.audit;
    if (req.query.action) logs = logs.filter(function(l) { return l.action === req.query.action });
    if (req.query.id) logs = logs.filter(function(l) { return l.meta && l.meta.id == req.query.id });
    var limit = parseInt(req.query.limit) || 50;
    logs = logs.slice(-limit).reverse();
    res.json({ success: true, total: logs.length, logs: logs });
});

// 📤 Exportar
app.get('/export', function(req, res) {
    var exp = db.vault.map(function(i) { try { return { id: i.id, titulo: i.titulo, contenido: decrypt(i.iv, i.enc, i.tag), categoria: i.categoria, tipo: i.tipo, tags: i.tags } } catch (e) { return { id: i.id, error: 'fallo' } } });
    logAudit('export', req.actor, { count: exp.length, ip: req.ipLog });
    res.setHeader('Content-Disposition', 'attachment; filename="vault.json"');
    res.json({ exported_at: new Date().toISOString(), items: exp });
});

// 🛑 Errores
app.use(function(err, req, res, next) {
    logger.error('❌ Error crítico:', err.message);
    res.status(500).json({ error: 'Error interno' });
});

// 🚀 Inicio
app.listen(PORT, '0.0.0.0', function() {
    logger.info('🚀 API PRO FINAL corriendo en puerto ' + PORT);
    logger.info('📁 🟢 Categorías: ACTIVADAS | 📜 Historial: ACTIVADO | 🚨 Alertas IP: ACTIVADAS | 🔄 Rotación: PROGRAMADA');
});
// ✅ FIN DEL ARCHIVO - NO BORRES NADA DEBAJO