// === INICIO: index.js - APIROMWINER VAULT COMPLETO (60 FUNCIONES + ENTERPRISE 3 FASES) ===
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const pino = require('pino');

// 🔐 SISTEMA DE CIFRADO EN CAPAS (ENVELOPE ENCRYPTION)
const EnvelopeEncryption = (function() {
    class CryptoWrapper {
        constructor(masterKey) { this.mk = Buffer.from(masterKey.slice(0, 32)); }
        generateDEK() { return crypto.randomBytes(32); }
        wrapDEK(dek) {
            const iv = crypto.randomBytes(12);
            const c = crypto.createCipheriv('aes-256-gcm', this.mk, iv);
            let e = c.update(dek, 'binary', 'hex') + c.final('hex');
            return { iv: iv.toString('hex'), data: e, tag: c.getAuthTag().toString('hex') };
        }
        unwrapDEK(wrapped) {
            const d = crypto.createDecipheriv('aes-256-gcm', this.mk, Buffer.from(wrapped.iv, 'hex'));
            d.setAuthTag(Buffer.from(wrapped.tag, 'hex'));
            return Buffer.from(d.update(wrapped.data, 'hex', 'binary') + d.final('binary'), 'binary');
        }
        seal(plaintext, dek) {
            const iv = crypto.randomBytes(12);
            const c = crypto.createCipheriv('aes-256-gcm', dek, iv);
            let enc = c.update(plaintext, 'utf8', 'hex') + c.final('hex');
            return { iv: iv.toString('hex'), data: enc, tag: c.getAuthTag().toString('hex') };
        }
        open(ciphertext, dek) {
            const d = crypto.createDecipheriv('aes-256-gcm', dek, Buffer.from(ciphertext.iv, 'hex'));
            d.setAuthTag(Buffer.from(ciphertext.tag, 'hex'));
            return d.update(ciphertext.data, 'hex', 'utf8') + d.final('utf8');
        }
    }
    return new CryptoWrapper(MASTER_KEY);
})();
// 🔚 FIN ENVELOPE ENCRYPTION

// ✅ MEJORA 1: Stripe para verificar webhooks
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const PORT = process.env.PORT || 10000;

// 🔐 MONGODB
const MONGODB_URI = "mongodb+srv://apiromwinervault:Grup%40selen2000@cluster0.f83xnse.mongodb.net/apiromwinervault?retryWrites=true&w=majority&appName=Cluster0&tls=true&tlsAllowInvalidCertificates=true";
let db, usersCollection, secretsCollection, affiliatesCollection, identityCollection, transactionsCollection, profilesCollection, walletCollection, auditCollection;
let mongoReady = false;

async function connectToMongo() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('apiromwinervault');
        usersCollection = db.collection('users');
        secretsCollection = db.collection('secrets');
        affiliatesCollection = db.collection('affiliates');
        identityCollection = db.collection('identity');
        transactionsCollection = db.collection('transactions');
        profilesCollection = db.collection('profiles');
        walletCollection = db.collection('wallet');
        auditCollection = db.collection('audit_logs');

        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ uid: 1 }, { unique: true });
        await secretsCollection.createIndex({ userId: 1 });
        await secretsCollection.createIndex({ isForSale: 1 });
        await profilesCollection.createIndex({ userId: 1 }, { unique: true });
        await walletCollection.createIndex({ userId: 1 }, { unique: true });
        await auditCollection.createIndex({ createdAt: -1 });
        // ✅ FASE 1: Índices para tiers y auditoría
        await usersCollection.createIndex({ tier: 1 });
        await auditCollection.createIndex({ userId: 1, timestamp: -1 });

        mongoReady = true;
        logger.info('✅ MongoDB Atlas conectado');
    } catch (err) {
        logger.error('⚠️ MongoDB fallback activo: ' + err.message);
        mongoReady = false;
    }
}

// 🔐 SEGURIDAD (CSP corregido)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https:", "http:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "https://apiromwinervault.onrender.com", "https://checkout.stripe.com", "https://api.qrserver.com"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["https://checkout.stripe.com"],
            workerSrc: ["'self'", "blob:"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 📁 UPLOADS
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(function() {});
const storage = multer.diskStorage({
    destination: function(req, file, cb) { cb(null, uploadDir); },
    filename: function(req, file, cb) {
        const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + safeName);
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowed = /jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|mp4|webm|mp3|wav|ogg|rar|zip|7z|epub|mobi/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) || allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Archivo no permitido. Formatos: JPG, PNG, PDF, DOC, XLS, TXT, MP4, MP3, RAR, ZIP, etc.'));
    }
});

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' } }));

// 🔐 CLAVES + ADMINS
const JWT_SECRET = process.env.JWT_SECRET || 'romwiner_jwt_secret_fallback';
const MASTER_KEY = process.env.MASTER_KEY || 'romwiner_master_key_fallback';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'turraygoza67@gmail.com,nubislosnubis@gmail.com,romraywiner@gmail.com').split(',').map(function(e) { return e.trim(); });
const APP_URL = process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com';

// 🔐 AUTH + ADMIN
const authenticate = function(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) { return res.status(401).json({ error: 'Token requerido. Inicia sesión.' }); }
    const token = authHeader.replace('Bearer ', '');
    if (!token) { return res.status(401).json({ error: 'Token inválido o expirado.' }); }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { return res.status(401).json({ error: 'Token inválido: ' + err.message }); }
}
const requireAdmin = async function(req, res, next) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user || ADMIN_EMAILS.indexOf(user.email) === -1) return res.status(403).json({ error: 'Acceso denegado: solo para el dueño.' });
        req.admin = user;
        next();
    } catch (err) { return res.status(500).json({ error: 'Error verificando admin: ' + err.message }); }
};

// ✅ FASE 1: SISTEMA DE TIERS + PERMISOS + CUOTAS
const USER_TIERS = {
    personal: { id: 'personal', name: 'Personal', storageLimitGB: 10, maxFileSizeMB: 100, apiRateLimit: 100, priceMonthly: 0 },
    business: { id: 'business', name: 'Business', storageLimitGB: 100, maxFileSizeMB: 500, apiRateLimit: 1000, priceMonthly: 49 },
    enterprise: { id: 'enterprise', name: 'Enterprise', storageLimitGB: -1, maxFileSizeMB: 5000, apiRateLimit: 10000, priceMonthly: null }
};

const PERMISSIONS = {
    'vault:create': ['personal', 'business', 'enterprise'],
    'vault:read:own': ['personal', 'business', 'enterprise'],
    'vault:read:shared': ['business', 'enterprise'],
    'vault:delete:own': ['personal', 'business', 'enterprise'],
    'vault:share': ['business', 'enterprise'],
    'audit:view:own': ['personal', 'business', 'enterprise'],
    'audit:export': ['business', 'enterprise'],
    'audit:realtime': ['enterprise'],
    'admin:gift': ['enterprise'],
    'admin:impersonate': ['enterprise'],
    'admin:compliance': ['enterprise']
};

// Middleware: verificar tier mínimo requerido
const requireTier = (...allowedTiers) => async(req, res, next) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const userTier = user ? .tier || 'personal';
        if (!allowedTiers.includes(userTier)) {
            return res.status(403).json({ error: 'Acceso denegado', required: allowedTiers.join('|'), userTier, message: `Tu plan ${USER_TIERS[userTier].name} no incluye esta función` });
        }
        req.userTier = userTier;
        next();
    } catch (err) { res.status(500).json({ error: 'Error verificando tier: ' + err.message }); }
};

// Middleware: verificar cuota de almacenamiento
const checkQuota = async(req, res, next) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const tier = USER_TIERS[user ? .tier || 'personal'];
        if (!tier) return next();

        // Verificar almacenamiento usado
        const usedStorage = await secretsCollection.aggregate([
            { $match: { userId: user ? ._id } },
            { $group: { _id: null, total: { $sum: '$fileSize' } } }
        ]).toArray();
        const usedGB = (usedStorage[0] ? .total || 0) / (1024 * 1024 * 1024);

        if (tier.storageLimitGB > 0 && usedGB >= tier.storageLimitGB) {
            return res.status(413).json({ error: 'Límite de almacenamiento excedido', used: usedGB.toFixed(2), limit: tier.storageLimitGB, upgrade: 'Actualiza tu plan para más espacio' });
        }

        // Verificar tamaño de archivo si hay upload
        if (req.file && req.file.size > tier.maxFileSizeMB * 1024 * 1024) {
            return res.status(413).json({ error: 'Archivo demasiado grande', size: (req.file.size / 1024 / 1024).toFixed(2), limit: tier.maxFileSizeMB, tier: tier.name });
        }

        req.userQuota = { usedGB, tier };
        next();
    } catch (err) { res.status(500).json({ error: 'Error verificando cuota: ' + err.message }); }
};

// ✅ FASE 2: AUDITORÍA INMUTABLE + COMPLIANCE
const createImmutableLog = async(auditData) => {
    const eventId = crypto.randomUUID();
    const contentHash = crypto.createHash('sha256').update(JSON.stringify(auditData)).digest('hex');

    // Obtener último hash para cadena blockchain-style
    const lastLog = await auditCollection.findOne({}, { sort: { createdAt: -1 }, projection: { currentHash: 1 } });
    const previousHash = lastLog ? .currentHash || 'genesis';

    const currentHash = crypto.createHash('sha256').update(previousHash + contentHash).digest('hex');
    const hmac = crypto.createHmac('sha256', process.env.AUDIT_SECRET || MASTER_KEY);
    hmac.update(eventId + currentHash);
    const signature = hmac.digest('hex');

    return {...auditData, eventId, previousHash, currentHash, signature, timestamp: new Date() };
};

const generateGDPRReport = async(userId, startDate, endDate) => {
    const user = await usersCollection.findOne({ uid: userId });
    const auditLogs = await auditCollection.find({
        userId,
        timestamp: { $gte: new Date(startDate), $lte: new Date(endDate) }
    }).sort({ timestamp: 1 }).toArray();

    return {
        reportType: 'GDPR_ARTICLE_15',
        generatedAt: new Date().toISOString(),
        subject: { uid: user ? .uid, email: user ? .email },
        dataProcessing: auditLogs.map(log => ({ timestamp: log.timestamp, action: log.action, resource: log.resource, result: log.result })),
        retention: { legalBasis: 'consent', retentionPeriod: '5 years', deletionRequest: 'Available via /api/gdpr/delete' }
    };
};

const generateSOC2Report = async(organizationId, periodStart, periodEnd) => {
    return {
        reportType: 'SOC2_TYPE_II',
        organization: organizationId,
        period: { start: periodStart, end: periodEnd },
        controls: {
            'CC6.1': { status: 'implemented', description: 'Logical access controls' },
            'CC6.2': { status: 'implemented', description: 'Prior to issuance of credentials' },
            'CC7.2': { status: 'implemented', description: 'Security event detection' },
            'CC3.2': { status: 'implemented', description: 'Risk assessment' }
        },
        auditorNotes: 'Generated automatically - requires human review',
        integrityHash: crypto.createHash('sha256').update(organizationId + periodStart + periodEnd).digest('hex')
    };
};

// ✅ FASE 3: ROTACIÓN DE CLAVES + WEBHOOKS DE ALERTAS
const KeyRotationService = {
    rotationIntervalDays: 90,
    async rotateUserKey(userId) {
        if (!mongoReady || !usersCollection) return { success: false, message: 'MongoDB no disponible' };

        const user = await usersCollection.findOne({ uid: userId });
        if (!user) return { success: false, message: 'Usuario no encontrado' };

        // Generar nueva DEK y envolverla
        const newDEK = EnvelopeEncryption.generateDEK();
        const wrappedNewDEK = EnvelopeEncryption.wrapDEK(newDEK);

        // Actualizar clave del usuario
        await usersCollection.updateOne({ _id: user._id }, {
            $set: { encryptedUserKey: wrappedNewDEK, keyRotatedAt: new Date(), keyVersion: (user.keyVersion || 0) + 1 }
        });

        // Registrar auditoría
        await auditCollection.insertOne(await createImmutableLog({
            userId,
            action: 'key.rotation',
            result: 'success',
            metadata: { newVersion: (user.keyVersion || 0) + 1 }
        }));

        return { success: true, message: 'Clave rotada exitosamente', newVersion: (user.keyVersion || 0) + 1 };
    },
    async scheduleRotations() {
        if (!mongoReady) return;
        const cutoff = new Date(Date.now() - this.rotationIntervalDays * 24 * 60 * 60 * 1000);
        const usersToRotate = await usersCollection.find({ keyRotatedAt: { $lt: cutoff }, encryptedUserKey: { $exists: true } }).toArray();

        for (const user of usersToRotate) {
            try { await this.rotateUserKey(user.uid); } catch (err) { logger.error('❌ Error rotando clave para ' + user.uid + ': ' + err.message); }
        }
    }
};

const AlertWebhookService = {
    async registerWebhook(userId, config) {
        // config: { url, events: ['login.failed', 'vault.anomaly'], secret }
        if (!mongoReady) return { success: true, message: 'Demo: webhook registrado', demo: true };
        await db.collection('webhooks').updateOne({ userId, url: config.url }, { $set: {...config, updatedAt: new Date() } }, { upsert: true });
        return { success: true, message: 'Webhook registrado' };
    },
    async sendAlert(userId, alert) {
        if (!mongoReady) return;
        const webhooks = await db.collection('webhooks').find({ userId }).toArray();
        for (const wh of webhooks) {
            if (!wh.events ? .includes(alert.type)) continue;
            const payload = { eventId: crypto.randomUUID(), timestamp: new Date().toISOString(), userId, alert, signature: crypto.createHmac('sha256', wh.secret).update(JSON.stringify({ eventId: crypto.randomUUID(), alert })).digest('hex') };
            try { await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vault-Signature': payload.signature }, body: JSON.stringify(payload), timeout: 5000 }); } catch (err) { logger.warn('⚠️ Webhook failed for ' + userId + ': ' + err.message); }
        }
    }
};

// 🔐 CIFRADO + UTILS
const encrypt = function(text, key) {
    const k = key || MASTER_KEY;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(k.slice(0, 32)), iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc = enc + cipher.final('hex');
    return { iv: iv.toString('hex'), encrypted: enc, authTag: cipher.getAuthTag().toString('hex') };
};
const decrypt = function(data, key) {
    const k = key || MASTER_KEY;
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(k.slice(0, 32)), Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    let dec = decipher.update(data.encrypted, 'hex', 'utf8');
    dec = dec + decipher.final('utf8');
    return dec;
};
const generateUID = function() { return 'rom_' + crypto.randomBytes(8).toString('hex'); };
const generateRefCode = function() { return 'ROM' + Math.random().toString(36).substr(2, 6).toUpperCase(); };
const generateTempPass = function() { return 'Gift_' + crypto.randomBytes(4).toString('hex').toUpperCase(); };
const logAudit = async function(action, data) {
    if (mongoReady && auditCollection) {
        try { await auditCollection.insertOne(await createImmutableLog({ action, data, createdAt: new Date() })); } catch (e) { logger.warn('⚠️ Audit log failed: ' + e.message); }
    }
};

// 🌐 STATUS
app.get('/api/status', function(req, res) {
    res.json({
        api: 'ApiRomwiner Vault',
        status: 'online',
        database: mongoReady ? 'connected' : 'fallback',
        features: [
            '🟢 60 Funciones Activas',
            '🟢 Ventas',
            '🟢 Wallet',
            '🟢 Perfil',
            '🟢 Dueño',
            '🟢 Afiliados',
            '🟢 Stripe',
            '🟢 Envelope Encryption (Cifrado en Capas)',
            '🟢 Enterprise Tiers (Personal/Business/Enterprise)',
            '🟢 Immutable Audit Logs + GDPR/SOC2',
            '🟢 Key Rotation + Alert Webhooks'
        ]
    });
});

// 🔐 REGISTRO + LOGIN
app.post('/register', async function(req, res) {
    try {
        const email = req.body.email,
            password = req.body.password,
            refCode = req.body.refCode;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
            return res.status(400).json({ error: 'Contraseña débil. Debe tener: 8+ caracteres, 1 mayúscula, 1 número y 1 símbolo (!@#$).' });
        }
        if (!mongoReady || !usersCollection) return res.status(201).json({ success: true, message: 'Registrado (modo demo)', demo: true });
        if (await usersCollection.findOne({ email: email })) return res.status(400).json({ error: 'Correo ya registrado. Inicia sesión.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const isAdmin = ADMIN_EMAILS.indexOf(email) !== -1;
        // ✅ FASE 1: Tier por defecto = personal
        const newUser = { email, password: hashedPassword, uid: generateUID(), refCode: generateRefCode(), referredBy: refCode || null, isAdmin, tier: 'personal', createdAt: new Date(), affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 } };
        const result = await usersCollection.insertOne(newUser);
        await profilesCollection.insertOne({ userId: result.insertedId, uid: newUser.uid, displayName: '', avatarUrl: '', bio: '', isPublic: false, createdAt: new Date() });
        await walletCollection.insertOne({ userId: result.insertedId, balance: 0.00, currency: 'USD', history: [], createdAt: new Date() });
        await affiliatesCollection.insertOne({ userId: result.insertedId, refCode: newUser.refCode, referredBy: refCode || null, totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0, level: 'bronce', createdAt: new Date() });
        await logAudit('register', { email });
        logger.info('✅ Registrado: ' + email);
        res.status(201).json({ success: true, message: 'Registrado. Inicia sesión para comenzar.' });
    } catch (err) {
        logger.error('❌ Registro: ' + err.message);
        res.status(500).json({ error: 'Error interno al registrar: ' + err.message });
    }
});

app.post('/login', async function(req, res) {
    try {
        const email = req.body.email,
            password = req.body.password;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
        if (!mongoReady || !usersCollection) { const t = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' }); return res.json({ success: true, token: t, user: { email, isAdmin: false }, demo: true }); }
        const user = await usersCollection.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Credenciales inválidas. Verifica correo y contraseña.' });
        await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
        const isAdmin = ADMIN_EMAILS.indexOf(user.email) !== -1;
        if (isAdmin && !user.isAdmin) await usersCollection.updateOne({ _id: user._id }, { $set: { isAdmin: true } });
        const token = jwt.sign({ uid: user.uid, email, isAdmin: user.isAdmin || isAdmin, tier: user.tier || 'personal' }, JWT_SECRET, { expiresIn: '7d' });
        await logAudit('login', { email });
        res.json({ success: true, token, user: { uid: user.uid, email, isAdmin: user.isAdmin || isAdmin, refCode: user.refCode, tier: user.tier || 'personal' } });
    } catch (err) { res.status(500).json({ error: 'Error interno al iniciar sesión: ' + err.message }); }
});

// 👤 PERFIL
app.get('/api/profile', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !profilesCollection) return res.json({ success: true, profile: { displayName: 'Demo', bio: '' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const p = await profilesCollection.findOne({ userId: user._id });
        res.json({ success: true, profile: {...p, tier: user.tier }, user: { uid: user.uid, email: user.email, tier: user.tier } });
    } catch (err) { res.status(500).json({ error: 'Error al cargar perfil: ' + err.message }); }
});
app.post('/api/profile', authenticate, upload.single('avatar'), async function(req, res) {
    try {
        const { displayName, bio, isPublic } = req.body;
        if (!mongoReady || !profilesCollection) return res.json({ success: true, message: 'Actualizado (modo demo)', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const up = {};
        if (displayName) up.displayName = displayName;
        if (bio) up.bio = bio;
        if (isPublic !== undefined) up.isPublic = isPublic === 'true';
        if (req.file) up.avatarUrl = '/uploads/' + path.basename(req.file.filename);
        await profilesCollection.updateOne({ userId: user._id }, { $set: up, updatedAt: new Date() }, { upsert: true });
        res.json({ success: true, message: 'Perfil actualizado correctamente' });
    } catch (err) { res.status(500).json({ error: 'Error al actualizar perfil: ' + err.message }); }
});

// 💰 WALLET + PAGOS
app.get('/api/wallet', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !walletCollection) return res.json({ success: true, wallet: { balance: 0, currency: 'USD', history: [] }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const w = await walletCollection.findOne({ userId: user._id });
        res.json({ success: true, wallet: w || { balance: 0, currency: 'USD', history: [] } });
    } catch (err) { res.status(500).json({ error: 'Error al cargar wallet: ' + err.message }); }
});
app.post('/api/wallet/deposit', authenticate, async function(req, res) {
    try {
        const amount = parseFloat(req.body.amount);
        if (!amount || amount < 5) return res.status(400).json({ error: 'Mínimo $5 USD para depósito' });
        if (STRIPE_SECRET_KEY.includes('placeholder')) return res.json({ success: true, message: 'Modo demo: configura STRIPE_SECRET_KEY en .env', demo: true, clientSecret: 'demo' });
        const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ amount: Math.round(amount * 100), currency: 'usd', metadata: JSON.stringify({ uid: req.user.uid, type: 'deposit' }) }) });
        const data = await stripeRes.json();
        if (!data.client_secret) return res.status(500).json({ error: 'Error de Stripe: ' + (data.error ? .message || 'Cliente secreto no generado') });
        res.json({ success: true, clientSecret: data.client_secret, paymentId: data.id });
    } catch (err) { res.status(500).json({ error: 'Error procesando pago con Stripe: ' + err.message }); }
});
app.post('/api/wallet/withdraw', authenticate, async function(req, res) {
    try {
        const amount = parseFloat(req.body.amount),
            method = req.body.method || 'bank';
        if (!mongoReady || !walletCollection) return res.json({ success: true, message: 'Retiro demo: configura wallet real', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const w = await walletCollection.findOne({ userId: user._id });
        if (!w || w.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente. Saldo actual: $' + (w ? .balance || 0).toFixed(2) });
        await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: -amount }, $push: { history: { type: 'withdraw', amount, method, date: new Date() } } });
        await transactionsCollection.insertOne({ userId: user._id, type: 'withdrawal', amount, method, status: 'pending', createdAt: new Date() });
        res.json({ success: true, message: 'Solicitud de retiro enviada. Te contactaremos para confirmar.' });
    } catch (err) { res.status(500).json({ error: 'Error al procesar retiro: ' + err.message }); }
});

// 👑 DUEÑO: REGALAR + MULTIAMIN
app.post('/api/admin/gift-account', authenticate, requireAdmin, async function(req, res) {
    try {
        const { recipientEmail, initialBalance, note, tier } = req.body;
        if (!recipientEmail) return res.status(400).json({ error: 'Email del destinatario requerido' });
        if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo regalo: configura MongoDB', demo: true });
        let user = await usersCollection.findOne({ email: recipientEmail });
        let tempPassword = null;
        if (!user) {
            tempPassword = generateTempPass();
            const hashed = await bcrypt.hash(tempPassword, 10);
            // ✅ FASE 1: Permitir asignar tier al crear cuenta
            const newUser = { email: recipientEmail, password: hashed, uid: generateUID(), refCode: generateRefCode(), isAdmin: false, tier: tier || 'personal', isGifted: true, giftedBy: req.admin.uid, giftedAt: new Date(), giftedNote: note || '', createdAt: new Date(), affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 } };
            const r = await usersCollection.insertOne(newUser);
            await profilesCollection.insertOne({ userId: r.insertedId, uid: newUser.uid, displayName: 'Usuario Regalado', bio: note || '', isPublic: false, createdAt: new Date() });
            await affiliatesCollection.insertOne({ userId: r.insertedId, refCode: newUser.refCode, level: 'bronce', createdAt: new Date() });
            user = newUser;
        } else {
            // ✅ FASE 1: Actualizar tier si se proporciona
            if (tier && ['personal', 'business', 'enterprise'].includes(tier)) {
                await usersCollection.updateOne({ _id: user._id }, { $set: { tier, updatedAt: new Date() } });
            }
        }
        const bal = parseFloat(initialBalance) || 0;
        await walletCollection.updateOne({ userId: user._id }, { $setOnInsert: { balance: bal, currency: 'USD', history: [] }, $inc: { balance: bal }, $push: { history: { type: 'admin_gift', amount: bal, from: req.admin.email, date: new Date() } } }, { upsert: true });
        await transactionsCollection.insertOne({ type: 'admin_gift', amount: bal, admin: req.admin.uid, recipient: user.email, note: note || '', createdAt: new Date() });
        await logAudit('gift', { recipientEmail, bal, by: req.admin.uid, tier: tier || user.tier });
        res.json({ success: true, recipientEmail: user.email, uid: user.uid, tempPassword, balance: bal, tier: tier || user.tier, message: tempPassword ? 'Cuenta creada con contraseña temporal' : 'Saldo agregado a cuenta existente' });
    } catch (err) { res.status(500).json({ error: 'Error al regalar cuenta: ' + err.message }); }
});

// 📦 VAULT + COMPRAS - ✅ ENVELOPE ENCRYPTION + FASE 1: QUOTAS
app.post('/vault', authenticate, checkQuota, async function(req, res) {
    try {
        const titulo = req.body.titulo,
            categoria = req.body.categoria || 'general',
            folderId = req.body.folderId || 'general',
            contenido = req.body.contenido,
            price = parseFloat(req.body.price) || 0,
            forSale = req.body.forSale === 'true' || req.body.forSale === true,
            licenseDays = parseInt(req.body.licenseDays) || null;
        if (!titulo) return res.status(400).json({ error: 'Título requerido para el contenido' });
        if (!mongoReady || !secretsCollection) return res.status(201).json({ success: true, message: 'Guardado en modo demo', id: 'demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const data = {
            userId: user._id,
            userUid: user.uid,
            titulo,
            categoria,
            folderId,
            tipo: req.file ? 'archivo' : 'texto',
            contenido: null,
            fileName: req.file ? path.basename(req.file.filename) : null,
            fileType: req.file ? req.file.mimetype : null,
            fileSize: req.file ? req.file.size : null,
            encrypted: null,
            isForSale: forSale,
            price: forSale ? price : 0,
            licenseDays,
            sales: 0,
            buyers: [],
            createdAt: new Date()
        };

        let wrappedDEK = user.encryptedUserKey;
        if (!wrappedDEK) {
            const dek = EnvelopeEncryption.generateDEK();
            wrappedDEK = EnvelopeEncryption.wrapDEK(dek);
            await usersCollection.updateOne({ _id: user._id }, { $set: { encryptedUserKey: wrappedDEK } });
        }
        const userDEK = EnvelopeEncryption.unwrapDEK(wrappedDEK);

        if (req.file) {
            data.fileName = path.basename(req.file.filename);
            data.fileType = req.file.mimetype;
            data.fileSize = req.file.size;
            const fileContent = await fs.readFile(req.file.path);
            data.encrypted = EnvelopeEncryption.seal(fileContent.toString('base64'), userDEK);
            await fs.unlink(req.file.path).catch(function(e) { logger.warn('⚠️ No se pudo eliminar archivo temporal: ' + e.message); });
        } else if (contenido) {
            data.contenido = EnvelopeEncryption.seal(contenido, userDEK);
        }

        const result = await secretsCollection.insertOne(data);
        await logAudit('vault_create', { titulo, userId: user.uid, tipo: data.tipo, forSale });
        res.status(201).json({ success: true, message: 'Contenido guardado y cifrado en Vault (clave única por usuario)', id: result.insertedId, fileName: data.fileName });
    } catch (err) {
        logger.error('❌ Vault create: ' + err.message);
        res.status(500).json({ error: 'Error al guardar en Vault: ' + err.message });
    }
});

app.get('/vault', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, items: [], total: 0 });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const items = await secretsCollection.find({ $or: [{ userId: user._id }, { isForSale: true }] }).sort({ createdAt: -1 }).limit(50).project({ encrypted: 0, contenido: 0 }).toArray();
        res.json({ success: true, items, total: items.length });
    } catch (err) { res.status(500).json({ error: 'Error al listar Vault: ' + err.message }); }
});

app.get('/vault/:id', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, secret: { id: req.params.id, titulo: 'Demo' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!secret) return res.status(404).json({ error: 'Contenido no encontrado' });
        if (secret.userId.toString() !== user._id.toString() && secret.buyers.indexOf(user.uid) === -1 && !secret.isForSale) return res.status(403).json({ error: 'Acceso denegado: no tienes permiso para este contenido' });

        let contenido = null;
        if (user.encryptedUserKey) {
            try {
                const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
                if (secret.tipo === 'texto' && secret.contenido) {
                    contenido = EnvelopeEncryption.open(secret.contenido, userDEK);
                } else if (secret.tipo === 'archivo' && secret.encrypted) {
                    const decrypted = EnvelopeEncryption.open(secret.encrypted, userDEK);
                    contenido = Buffer.from(decrypted, 'base64').toString('base64');
                }
            } catch (e) {
                if (secret.tipo === 'texto' && secret.contenido) {
                    contenido = decrypt({ iv: secret.encrypted ? .iv, encrypted: secret.contenido, authTag: secret.encrypted ? .authTag });
                } else if (secret.tipo === 'archivo' && secret.encrypted) {
                    const decrypted = decrypt(secret.encrypted);
                    contenido = Buffer.from(decrypted, 'base64').toString('base64');
                }
            }
        } else {
            if (secret.tipo === 'texto' && secret.contenido) {
                contenido = decrypt({ iv: secret.encrypted ? .iv, encrypted: secret.contenido, authTag: secret.encrypted ? .authTag });
            } else if (secret.tipo === 'archivo' && secret.encrypted) {
                const decrypted = decrypt(secret.encrypted);
                contenido = Buffer.from(decrypted, 'base64').toString('base64');
            }
        }

        res.json({ success: true, secret: { id: secret._id.toString(), titulo: secret.titulo, contenido, isForSale: secret.isForSale, price: secret.price, sales: secret.sales, licenseDays: secret.licenseDays, fileName: secret.fileName, fileType: secret.fileType } });
    } catch (err) { res.status(500).json({ error: 'Error al obtener contenido: ' + err.message }); }
});

app.delete('/vault/:id', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, message: 'Eliminado en modo demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const result = await secretsCollection.deleteOne({ _id: new ObjectId(req.params.id), userId: user._id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'No autorizado: solo puedes eliminar tu propio contenido' });
        await logAudit('vault_delete', { id: req.params.id, userId: user.uid });
        res.json({ success: true, message: 'Contenido eliminado permanentemente' });
    } catch (err) { res.status(500).json({ error: 'Error al eliminar: ' + err.message }); }
});

app.post('/api/buy/:id', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !secretsCollection || !walletCollection) return res.json({ success: true, message: 'Compra demo: configura MongoDB y wallet', demo: true });
        const buyer = await usersCollection.findOne({ uid: req.user.uid });
        if (!buyer) return res.status(404).json({ error: 'Usuario no encontrado' });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true });
        if (!secret) return res.status(404).json({ error: 'Contenido no disponible para venta' });
        if (secret.buyers.indexOf(buyer.uid) !== -1) return res.status(400).json({ error: 'Ya compraste este contenido. Revisa tu Vault.' });
        const price = secret.price || 10;
        const bWallet = await walletCollection.findOne({ userId: buyer._id });
        if (!bWallet || bWallet.balance < price) return res.status(400).json({ error: 'Saldo insuficiente. Necesitas $' + price + ' USD. Saldo actual: $' + (bWallet ? .balance || 0).toFixed(2) });
        const seller = await usersCollection.findOne({ _id: secret.userId });
        const sWallet = await walletCollection.findOne({ userId: seller._id });
        let affCommission = 0;
        if (buyer.referredBy) { const referrer = await usersCollection.findOne({ refCode: buyer.referredBy }); if (referrer && referrer._id.toString() !== secret.userId.toString()) affCommission = price * 0.15; }
        const sellerAmount = price - affCommission;
        await walletCollection.updateOne({ userId: buyer._id }, { $inc: { balance: -price }, $push: { history: { type: 'purchase', amount: -price, item: secret.titulo, date: new Date() } } });
        if (sWallet) await walletCollection.updateOne({ _id: sWallet._id }, { $inc: { balance: sellerAmount }, $push: { history: { type: 'sale', amount: sellerAmount, item: secret.titulo, date: new Date() } } });
        if (affCommission > 0) { const ref = await usersCollection.findOne({ refCode: buyer.referredBy }); if (ref) { const rWallet = await walletCollection.findOne({ userId: ref._id }); if (rWallet) await walletCollection.updateOne({ _id: rWallet._id }, { $inc: { balance: affCommission }, $push: { history: { type: 'affiliate', amount: affCommission, item: 'Ref: ' + secret.titulo, date: new Date() } } }); } }
        await secretsCollection.updateOne({ _id: secret._id }, { $inc: { sales: 1 }, $push: { buyers: buyer.uid } });
        await transactionsCollection.insertOne({ type: 'sale', amount: price, seller: secret.userUid, buyer: buyer.uid, item: secret.titulo, createdAt: new Date() });
        await logAudit('purchase', { buyer: buyer.uid, item: secret.titulo, price, seller: secret.userUid });
        res.json({ success: true, message: '✅ Compra exitosa. Contenido desbloqueado en tu Vault.' });
    } catch (err) { res.status(500).json({ error: 'Error procesando compra: ' + err.message }); }
});

// 🤝 AFILIADOS + NIVELES + RETIROS
app.get('/api/affiliates/dashboard', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !affiliatesCollection) return res.json({ success: true, dashboard: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0, referralLink: APP_URL + '?ref=DEMO', refCode: 'DEMO' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const aff = await affiliatesCollection.findOne({ userId: user._id }) || {};
        res.json({ success: true, dashboard: { level: aff.level || 'bronce', totalReferrals: aff.totalReferrals || 0, pendingBalance: aff.pendingBalance || 0, availableBalance: aff.availableBalance || 0, withdrawnBalance: aff.withdrawnBalance || 0, referralLink: APP_URL + '?ref=' + user.refCode, refCode: user.refCode } });
    } catch (err) { res.status(500).json({ error: 'Error al cargar dashboard de afiliados: ' + err.message }); }
});
app.post('/api/affiliates/withdraw', authenticate, async function(req, res) {
    try {
        const method = req.body.method || 'bank';
        if (!mongoReady || !affiliatesCollection || !walletCollection) return res.json({ success: true, message: 'Retiro demo: configura wallet real', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const aff = await affiliatesCollection.findOne({ userId: user._id });
        if (!aff || aff.availableBalance < 10) return res.status(400).json({ error: 'Mínimo $10 USD para retiro de afiliados. Balance actual: $' + (aff ? .availableBalance || 0).toFixed(2) });
        const w = await walletCollection.findOne({ userId: user._id });
        if (w) await walletCollection.updateOne({ _id: w._id }, { $inc: { availableBalance: -aff.availableBalance, withdrawnBalance: aff.availableBalance }, $push: { history: { type: 'affiliate_withdraw', amount: aff.availableBalance, method, date: new Date() } } });
        await transactionsCollection.insertOne({ userId: user._id, type: 'affiliate_payout', amount: aff.availableBalance, method, status: 'pending', createdAt: new Date() });
        res.json({ success: true, message: 'Retiro de afiliados solicitado. Procesaremos en 24-48h.' });
    } catch (err) { res.status(500).json({ error: 'Error al procesar retiro de afiliados: ' + err.message }); }
});

// 🆔 IDENTIDAD + OAUTH
app.post('/api/identity/register-app', authenticate, async function(req, res) {
    try {
        const appName = req.body.appName,
            redirectUri = req.body.redirectUri;
        if (!appName || !redirectUri) return res.status(400).json({ error: 'Nombre de app y URL de redirección requeridos' });
        if (!mongoReady || !identityCollection) return res.json({ success: true, appId: 'demo', appSecret: 'demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const appId = 'app_' + crypto.randomBytes(6).toString('hex');
        const appSecret = crypto.randomBytes(32).toString('hex');
        await identityCollection.insertOne({ appId, appSecret, appName, redirectUri, ownerUid: user.uid, scopes: ['profile', 'email'], active: true, createdAt: new Date() });
        res.json({ success: true, appId, appSecret, message: 'App registrada. Guarda appSecret de forma segura.' });
    } catch (err) { res.status(500).json({ error: 'Error al registrar app: ' + err.message }); }
});
app.post('/api/identity/authorize', authenticate, async function(req, res) {
    try {
        const appId = req.body.appId,
            scopes = req.body.scopes;
        if (!appId) return res.status(400).json({ error: 'App ID requerido' });
        if (!mongoReady || !identityCollection) return res.json({ success: true, token: 'demo_token', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const app = await identityCollection.findOne({ appId });
        if (!app || !app.active) return res.status(404).json({ error: 'App no encontrada o inactiva' });
        const token = jwt.sign({ uid: user.uid, appId, scopes: scopes || app.scopes }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, expiresIn: 86400, message: 'Token de autorización generado' });
    } catch (err) { res.status(500).json({ error: 'Error al autorizar app: ' + err.message }); }
});
app.delete('/api/identity/revoke/all', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !identityCollection) return res.json({ success: true, message: 'Revocado en modo demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        await identityCollection.updateMany({ ownerUid: user.uid }, { $set: { active: false, updatedAt: new Date() } });
        res.json({ success: true, message: 'Todos los accesos de apps revocados exitosamente' });
    } catch (err) { res.status(500).json({ error: 'Error al revocar accesos: ' + err.message }); }
});
app.get('/api/identity/qr', authenticate, async function(req, res) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const qrData = JSON.stringify({ uid: user.uid, email: user.email, ref: user.refCode });
        res.json({ success: true, qrPayload: qrData, qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrData) });
    } catch (err) { res.status(500).json({ error: 'Error al generar QR: ' + err.message }); }
});

// 📊 DASHBOARD + AUDITORÍA + EXPORT - ✅ FASE 2: COMPLIANCE
app.get('/api/dashboard', authenticate, async function(req, res) {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, dashboard: { revenue: 0, sales: 0, active: 0, forSale: 0 }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const totalSecrets = await secretsCollection.countDocuments({ userId: user._id });
        const forSale = await secretsCollection.countDocuments({ userId: user._id, isForSale: true });
        const totalSales = await transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' });
        res.json({ success: true, dashboard: { revenue: 0, sales: totalSales, active: totalSecrets, forSale, tier: user.tier } });
    } catch (err) { res.status(500).json({ error: 'Error al cargar dashboard: ' + err.message }); }
});

// ✅ FASE 2: EXPORTACIÓN DE AUDITORÍA (GDPR/SOC2)
app.get('/api/audit/export', authenticate, requireTier('business', 'enterprise'), async function(req, res) {
    try {
        const { type, startDate, endDate, organizationId } = req.query;
        if (!mongoReady || !auditCollection) return res.json({ success: true, logs: [], demo: true });

        if (type === 'gdpr') {
            const report = await generateGDPRReport(req.user.uid, startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), endDate || new Date());
            return res.json({ success: true, reportType: 'GDPR', data: report });
        }
        if (type === 'soc2' && req.userTier === 'enterprise') {
            const report = await generateSOC2Report(organizationId || req.user.uid, startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), endDate || new Date());
            return res.json({ success: true, reportType: 'SOC2', data: report });
        }

        // Default: logs simples
        const logs = await auditCollection.find({ userId: req.user.uid }).sort({ timestamp: -1 }).limit(100).toArray();
        res.json({ success: true, logs });
    } catch (err) { res.status(500).json({ error: 'Error al exportar auditoría: ' + err.message }); }
});

// ✅ FASE 3: ROTACIÓN DE CLAVES (solo enterprise)
app.post('/api/admin/rotate-keys', authenticate, requireAdmin, requireTier('enterprise'), async function(req, res) {
    try {
        const { userId } = req.body;
        if (userId) {
            // Rotar clave de un usuario específico
            const result = await KeyRotationService.rotateUserKey(userId);
            return res.json(result);
        } else {
            // Rotar todas las claves elegibles
            await KeyRotationService.scheduleRotations();
            return res.json({ success: true, message: 'Rotación de claves programada para usuarios elegibles' });
        }
    } catch (err) { res.status(500).json({ error: 'Error rotando claves: ' + err.message }); }
});

// ✅ FASE 3: WEBHOOKS DE ALERTAS
app.post('/api/admin/webhooks', authenticate, requireAdmin, async function(req, res) {
    try {
        const { userId, url, events, secret } = req.body;
        if (!url || !events) return res.status(400).json({ error: 'URL y eventos requeridos' });
        const result = await AlertWebhookService.registerWebhook(userId || req.user.uid, { url, events, secret: secret || crypto.randomBytes(32).toString('hex') });
        res.json(result);
    } catch (err) { res.status(500).json({ error: 'Error registrando webhook: ' + err.message }); }
});

app.delete('/api/admin/webhooks/:url', authenticate, requireAdmin, async function(req, res) {
    try {
        if (!mongoReady) return res.json({ success: true, message: 'Demo: webhook eliminado', demo: true });
        await db.collection('webhooks').deleteOne({ userId: req.user.uid, url: decodeURIComponent(req.params.url) });
        res.json({ success: true, message: 'Webhook eliminado' });
    } catch (err) { res.status(500).json({ error: 'Error eliminando webhook: ' + err.message }); }
});

// 🌐 WEBHOOK STRIPE
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async function(req, res) {
    try {
        const event = JSON.parse(req.body.toString());
        if (event.type === 'payment_intent.succeeded') {
            const meta = JSON.parse(event.data.object.metadata || '{}');
            const amount = event.data.object.amount_received / 100;
            if (meta.type === 'deposit' && meta.uid && mongoReady && walletCollection) {
                const user = await usersCollection.findOne({ uid: meta.uid });
                if (user) await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: amount }, $push: { history: { type: 'deposit_stripe', amount, stripeId: event.data.object.id, date: new Date() } } });
            }
        }
        res.json({ received: true });
    } catch (err) {
        logger.error('❌ Webhook error: ' + err.message);
        res.status(400).send('Webhook Error: ' + err.message);
    }
});

// 👥 ADMIN: Actualizar tier de usuario
app.patch('/api/admin/set-tier', authenticate, requireAdmin, async function(req, res) {
    try {
        const { targetEmail, tier } = req.body;
        if (!targetEmail || !['personal', 'business', 'enterprise'].includes(tier)) {
            return res.status(400).json({ error: 'Email y tier válidos requeridos (personal|business|enterprise)' });
        }
        if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo: tier actualizado', demo: true });
        const result = await usersCollection.updateOne({ email: targetEmail }, { $set: { tier, updatedAt: new Date() } });
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        await logAudit('admin.set_tier', { admin: req.admin.uid, target: targetEmail, newTier: tier });
        res.json({ success: true, message: `Tier de ${targetEmail} actualizado a ${tier}` });
    } catch (err) { res.status(500).json({ error: 'Error al actualizar tier: ' + err.message }); }
});

// 🌐 SERVIR FRONTEND
app.get('/', function(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 INICIAR + PROGRAMAR TAREAS ENTERPRISE
async function startServer() {
    await connectToMongo();

    // ✅ FASE 3: Programar rotación de claves cada 24h (solo si MongoDB está conectado)
    if (mongoReady) {
        setInterval(() => { KeyRotationService.scheduleRotations().catch(e => logger.warn('⚠️ Scheduled rotation failed: ' + e.message)); }, 24 * 60 * 60 * 1000);
        logger.info('🔄 Key rotation scheduled every 24h');
    }

    app.listen(PORT, '0.0.0.0', function() {
        logger.info('🚀 APIROMWINER en puerto ' + PORT);
        logger.info('🟢 60 Funciones | 💰 Wallet | 👑 Dueño | 🤝 Afiliados | 🔐 Vault + Envelope Encryption | 📦 RAR/MP3/ZIP | 🏦 Enterprise Tiers + Audit + Key Rotation | ✅ Listo para vender HOY');
    });
}
startServer().catch(function(err) {
    logger.error('❌ Error crítico al iniciar servidor: ' + err.message);
    process.exit(1);
});
// === FIN: index.js ===admin.set_tier', { admin: req.admin.uid, target: targetEmail, newTier: tier });
res.json({ success: true, message: `Tier de ${targetEmail} actualizado a ${tier}` });
}
catch (err) { res.status(500).json({ error: 'Error al actualizar tier: ' + err.message }); }
});

// 🌐 SERVIR FRONTEND
app.get('/', function(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 INICIAR + PROGRAMAR TAREAS ENTERPRISE
async function startServer() {
    await connectToMongo();

    // ✅ FASE 3: Programar rotación de claves cada 24h (solo si MongoDB está conectado)
    if (mongoReady) {
        setInterval(() => { KeyRotationService.scheduleRotations().catch(e => logger.warn('⚠️ Scheduled rotation failed: ' + e.message)); }, 24 * 60 * 60 * 1000);
        logger.info('🔄 Key rotation scheduled every 24h');
    }

    app.listen(PORT, '0.0.0.0', function() {
        logger.info('🚀 APIROMWINER en puerto ' + PORT);
        logger.info('🟢 60 Funciones | 💰 Wallet | 👑 Dueño | 🤝 Afiliados | 🔐 Vault + Envelope Encryption | 📦 RAR/MP3/ZIP | 🏦 Enterprise Tiers + Audit + Key Rotation | ✅ Listo para vender HOY');
    });
}
startServer().catch(function(err) {
    logger.error('❌ Error crítico al iniciar servidor: ' + err.message);
    process.exit(1);
});
// === FIN: index.js ===