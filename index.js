// index.js - PERSONAL DATA VAULT API PRO (apiromwiner) - VERSIÓN COMERCIAL ✅
// ✅ Cifrado AES-256-GCM | ✅ Auditoría empresarial | ✅ Búsqueda avanzada | ✅ Anti-fuerza bruta

require('dotenv').config();
var k = process.env.MASTER_KEY;
if (!k) k = "NO_CARGADA";
console.log("LONGITUD: " + k.length);
console.log("CARGADA: " + (k !== "NO_CARGADA"));
console.log("INICIO: " + k.substring(0, 5));
console.log("FINAL: " + k.substring(k.length - 5));
console.log("TIENE ESPACIOS: " + (k.indexOf(" ") > -1));
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const Joi = require('joi');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// 🔐 Validar variables de entorno
const requiredEnv = ['MASTER_KEY'];
requiredEnv.forEach(function(varName) {
    if (!process.env[varName]) {
        logger.fatal('❌ Falta variable: ' + varName);
        process.exit(1);
    }
});

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    next();
});
const PORT = parseInt(process.env.PORT, 10) || 3000;
const MASTER_KEY = (process.env.MASTER_KEY || '').trim();
const ENCRYPTION_KEY = Buffer.from(process.env.MASTER_KEY, 'hex');

// CORS
let origins = ['http://localhost:3000'];
if (process.env.ALLOWED_ORIGINS && process.env.ALLOWED_ORIGINS.length > 0) {
    origins = process.env.ALLOWED_ORIGINS.split(',');
}
const ALLOWED_ORIGINS = origins;
const DB_FILE = path.join(__dirname, 'data', 'vault.json');

// 📁 Crear carpeta data
const dataFolder = path.join(__dirname, 'data');
if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

// 🗄️ Base de datos
let db = { vault: [], consents: [], audit: [], failedAttempts: {} };

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const content = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(content);
        }
    } catch (e) {
        logger.warn('⚠️ No se pudo cargar la BD, iniciando vacía');
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        logger.error('❌ Error al guardar BD: ' + e.message);
        return;
    }
}

loadDB();

// 🛡️ Middlewares
app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Demasiadas peticiones' } }));
app.use(express.json({ limit: '1mb' }));

// 🔐 Cifrado
function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), encrypted: encrypted, authTag: cipher.getAuthTag().toString('hex') };
}

function decrypt(ivHex, encrypted, authTagHex) {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// 🔑 Autenticación CON LÍMITE DE INTENTOS (Función 1/3 ✅)
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_TIME_MS = 15 * 60 * 1000; // 15 minutos

function authenticate(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    // Limpiar intentos antiguos
    if (db.failedAttempts[ip] && db.failedAttempts[ip].timestamp < now - BLOCK_TIME_MS) {
        delete db.failedAttempts[ip];
        saveDB();
    }

    // Verificar bloqueo por intentos fallidos
    if (db.failedAttempts[ip] && db.failedAttempts[ip].count >= MAX_FAILED_ATTEMPTS) {
        const remaining = Math.ceil((db.failedAttempts[ip].timestamp + BLOCK_TIME_MS - now) / 1000);
        logger.warn(`🚫 IP ${ip} bloqueada por ${remaining}s más`);
        return res.status(429).json({ error: 'Demasiados intentos. Intenta en ' + remaining + ' segundos' });
    }

    var rawKey = req.headers['x-api-key'] || req.query.key;
    var key = rawKey ? rawKey.trim() : '';

    console.log("🔍 RECIBI:", key ? key.substring(0, 5) + '...' : '(vacío)', "| LONGITUD:", key.length, "| IP:", ip);

    if (!key || key !== MASTER_KEY) {
        // Registrar intento fallido
        if (!db.failedAttempts[ip]) db.failedAttempts[ip] = { count: 0, timestamp: now };
        db.failedAttempts[ip].count++;
        db.failedAttempts[ip].timestamp = now;
        saveDB();

        logAudit('auth_failed', ip, { reason: 'clave_invalida', ip: ip, userAgent: req.get('user-agent') });
        return res.status(401).json({ error: 'Clave inválida' });
    }

    // Resetear intentos al autenticar correctamente
    if (db.failedAttempts[ip]) {
        delete db.failedAttempts[ip];
        saveDB();
    }

    req.actor = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    req.clientIP = ip;
    req.userAgent = req.get('user-agent') || 'unknown';
    next();
}
app.use(authenticate);

// 📋 Validación
const vaultSchema = Joi.object({
    titulo: Joi.string().min(1).max(200).required(),
    contenido: Joi.string().min(1).max(50000).required(),
    tipo: Joi.string().valid('nota', 'documento', 'credencial').default('nota'),
    tags: Joi.array().items(Joi.string()).optional()
});

// 🪵 Auditoría MEJORADA (Función 2/3 ✅)
function logAudit(action, actor, metadata) {
    if (!metadata) metadata = {};
    db.audit.push({
        action: action,
        actor: actor,
        timestamp: new Date().toISOString(),
        ip: metadata.ip || 'unknown',
        userAgent: metadata.userAgent || 'unknown',
        metadata: metadata
    });
    // Mantener solo últimos 1000 registros para no inflar el archivo
    if (db.audit.length > 1000) db.audit = db.audit.slice(-1000);
    saveDB();
}

// ==================== RUTAS ====================

app.get('/', function(req, res) {
    res.json({
        api: "Personal Data Vault API PRO",
        version: "3.0-commercial",
        features: ["AES-256-GCM", "Anti-bruteforce", "Audit-logs", "Advanced-search"],
        status: "online"
    });
});

app.get('/health', function(req, res) {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 💾 Guardar dato
app.post('/vault', function(req, res) {
    const validation = vaultSchema.validate(req.body);
    if (validation.error) {
        return res.status(400).json({ error: validation.error.details[0].message });
    }
    const value = validation.value;

    const cryptoResult = encrypt(value.contenido);
    const newItem = {
        id: Date.now(),
        titulo: value.titulo,
        contenido_enc: cryptoResult.encrypted,
        iv: cryptoResult.iv,
        auth_tag: cryptoResult.authTag,
        tipo: value.tipo,
        tags: value.tags || [],
        created_at: new Date().toISOString()
    };

    db.vault.push(newItem);
    saveDB();
    logAudit('create', req.actor, { id: newItem.id, titulo: value.titulo, ip: req.clientIP, userAgent: req.userAgent });

    res.status(201).json({ success: true, id: newItem.id, mensaje: '✅ Guardado y cifrado' });
});

// 📋 Listar ítems CON BÚSQUEDA (Función 3/3 ✅)
app.get('/vault', function(req, res) {
    const search = (req.query.search || '').toLowerCase();
    const tagFilter = req.query.tag;
    const typeFilter = req.query.tipo;

    let items = db.vault.map(function(item) {
        return { id: item.id, titulo: item.titulo, tipo: item.tipo, tags: item.tags, created_at: item.created_at };
    });

    // Filtrar por búsqueda en título
    if (search) {
        items = items.filter(i => i.titulo.toLowerCase().includes(search));
    }
    // Filtrar por tag
    if (tagFilter) {
        items = items.filter(i => i.tags && i.tags.includes(tagFilter));
    }
    // Filtrar por tipo
    if (typeFilter) {
        items = items.filter(i => i.tipo === typeFilter);
    }

    logAudit('list', req.actor, { count: items.length, search: search || null, tag: tagFilter || null, ip: req.clientIP });
    res.json({ success: true, total: items.length, items: items, filters: { search, tag: tagFilter, tipo: typeFilter } });
});

// 🔓 Leer ítem específico
app.get('/vault/:id', function(req, res) {
    const item = db.vault.find(function(v) { return v.id == req.params.id; });
    if (!item) {
        return res.status(404).json({ error: 'No encontrado' });
    }

    try {
        const contenido = decrypt(item.iv, item.contenido_enc, item.auth_tag);
        logAudit('read', req.actor, { id: item.id, ip: req.clientIP, userAgent: req.userAgent });

        const responseData = {
            id: item.id,
            titulo: item.titulo,
            contenido: contenido,
            tipo: item.tipo,
            tags: item.tags,
            created_at: item.created_at
        };
        res.json({ success: true, data: responseData });
    } catch (e) {
        logger.error('❌ Error al descifrar: ' + e.message);
        res.status(500).json({ error: 'Error al procesar el contenido' });
    }
});

// 🗑️ Eliminar ítem
app.delete('/vault/:id', function(req, res) {
    const index = db.vault.findIndex(function(v) { return v.id == req.params.id; });
    if (index === -1) {
        return res.status(404).json({ error: 'No encontrado' });
    }
    const deleted = db.vault.splice(index, 1)[0];
    saveDB();
    logAudit('delete', req.actor, { id: deleted.id, ip: req.clientIP });
    res.json({ success: true, mensaje: '✅ Eliminado' });
});

// 📤 Exportar datos
app.get('/export', function(req, res) {
    const exported = db.vault.map(function(item) {
        try {
            return {
                id: item.id,
                titulo: item.titulo,
                contenido: decrypt(item.iv, item.contenido_enc, item.auth_tag),
                tipo: item.tipo,
                tags: item.tags,
                created_at: item.created_at
            };
        } catch (e) {
            return { id: item.id, error: 'desencriptado fallido' };
        }
    });
    logAudit('export', req.actor, { count: exported.length, ip: req.clientIP });
    res.setHeader('Content-Type', 'application/json');
    const filename = 'vault-' + new Date().toISOString().slice(0, 10) + '.json';
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.json({ exported_at: new Date().toISOString(), items: exported });
});

// 📊 Nueva ruta: Estadísticas de auditoría (valor empresarial)
app.get('/audit/stats', function(req, res) {
    const now = new Date();
    const last24h = db.audit.filter(a => new Date(a.timestamp) > new Date(now - 24 * 60 * 60 * 1000));

    const stats = {
        total_actions: db.audit.length,
        last_24h: last24h.length,
        by_action: {},
        unique_ips: [...new Set(db.audit.map(a => a.ip))].length
    };

    db.audit.forEach(a => {
        stats.by_action[a.action] = (stats.by_action[a.action] || 0) + 1;
    });

    logAudit('view_stats', req.actor, { ip: req.clientIP });
    res.json({ success: true, stats });
});

// 🚨 Manejo de errores
app.use(function(err, req, res, next) {
    logger.error(err);
    res.status(500).json({ error: 'Error interno' });
});

app.use('*', function(req, res) {
    res.status(404).json({ error: 'No encontrado' });
});

// 🚀 Iniciar servidor
app.listen(PORT, '0.0.0.0', function() {
    logger.info('🚀 API PRO corriendo en puerto ' + PORT);
    logger.info('🗄️ Datos guardados en: ' + DB_FILE);
    logger.info('🔒 Funciones activas: Anti-bruteforce, Audit-logs, Búsqueda avanzada');
});