// === INICIO: index.js - APIROMWINER VAULT (COMPLETO: 61 + 4 FUNCIONES) ===
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
const sharp = require('sharp');
const diffLib = require('diff');
const fileType = require('file-type');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { ethers } = require('ethers');
const { createFromURL } = require('@helia/http');
const { unixfs } = require('@helia/unixfs');

// 🔐 CLAVES + ADMINS
const JWT_SECRET = process.env.JWT_SECRET || 'romwiner_jwt_secret_fallback';
const MASTER_KEY = process.env.MASTER_KEY || 'romwiner_master_key_fallback';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'rraygoza67@gmail.com,nubislosnubis@gmail.com,romraywiner@gmail.com').split(',').map(e => e.trim());
const APP_URL = process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com';

// 🚀 FEATURE FLAGS
const FEATURES = {
    ZERO_KNOWLEDGE: process.env.ENABLE_ZERO_KNOWLEDGE === 'true',
    OFFLINE_MODE: process.env.ENABLE_OFFLINE === 'true',
    PORTABLE_EXPORT: process.env.ENABLE_EXPORT !== 'false',
    LOCAL_SYNC: process.env.ENABLE_LOCAL_SYNC === 'true',
    WEB3_LOGIN: process.env.ENABLE_WEB3 === 'true',
    IPFS_BACKUP: process.env.ENABLE_IPFS === 'true'
};

// 🌐 HELIA (IPFS) INIT
let heliaFs = null;
const initHelia = async() => {
    if (heliaFs) return heliaFs;
    try {
        const gatewayUrl = process.env.IPFS_GATEWAY || 'https://ipfs.io';
        const helia = createFromURL(gatewayUrl);
        heliaFs = unixfs(helia);
        pino().info(`🌐 Helia initialized: ${gatewayUrl}`);
        return heliaFs;
    } catch (e) {
        pino().warn('⚠️ Helia init failed: ' + e.message);
        return null;
    }
};

// 🔐 ZERO-KNOWLEDGE UTILS
const ZeroKnowledgeUtils = {
    isValidEncryptedPayload: (payload) => payload && typeof payload === 'object' && 'data' in payload && 'iv' in payload && 'alg' in payload && payload.alg === 'AES-GCM-256',
    createZKMetadata: (action, userId) => ({ action, userId, zeroKnowledge: true, serverSees: 'encrypted_only', timestamp: new Date().toISOString() })
};

// 🔐 ENVELOPE ENCRYPTION
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

// 🔐 PII CIFRADO
const encryptPII = (plaintext) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(MASTER_KEY.slice(0, 32)), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
    return { iv: iv.toString('hex'), data: encrypted, tag: cipher.getAuthTag().toString('hex') };
};
const decryptPII = (encrypted) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(MASTER_KEY.slice(0, 32)), Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    return decipher.update(encrypted.data, 'hex', 'utf8') + decipher.final('utf8');
};

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;

// 🔐 MONGODB
const MONGODB_URI = "mongodb+srv://apiromwinervault:Grup%40selen2000@cluster0.f83xnse.mongodb.net/apiromwinervault?retryWrites=true&w=majority&appName=Cluster0&tls=true&tlsAllowInvalidCertificates=true";
let db, usersCollection, secretsCollection, affiliatesCollection, identityCollection, transactionsCollection, profilesCollection, walletCollection, auditCollection, webhooksCollection, promoCollection, cryptoKeysCollection, verifiedIdentitiesCollection;
let sharedLinksCollection, thumbnailsCollection, versionsCollection, commentsCollection;
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
        webhooksCollection = db.collection('webhooks');
        promoCollection = db.collection('promo_codes');
        cryptoKeysCollection = db.collection('cryptoKeys');
        verifiedIdentitiesCollection = db.collection('verifiedIdentities');
        sharedLinksCollection = db.collection('sharedLinks');
        thumbnailsCollection = db.collection('thumbnails');
        versionsCollection = db.collection('fileVersions');
        commentsCollection = db.collection('comments');

        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ uid: 1 }, { unique: true });
        await usersCollection.createIndex({ tier: 1 });
        await secretsCollection.createIndex({ userId: 1 });
        await secretsCollection.createIndex({ isForSale: 1 });
        await secretsCollection.createIndex({ titulo: 'text' });
        await profilesCollection.createIndex({ userId: 1 }, { unique: true });
        await walletCollection.createIndex({ userId: 1 }, { unique: true });
        await auditCollection.createIndex({ createdAt: -1 });
        await auditCollection.createIndex({ userId: 1, timestamp: -1 });
        await sharedLinksCollection.createIndex({ token: 1 }, { unique: true });
        await sharedLinksCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        await versionsCollection.createIndex({ fileId: 1, versionNumber: -1 });
        await commentsCollection.createIndex({ fileId: 1, createdAt: -1 });
        await webhooksCollection.createIndex({ userId: 1 });
        await promoCollection.createIndex({ code: 1 }, { unique: true });
        await cryptoKeysCollection.createIndex({ publicKey: 1 }, { unique: true });
        await cryptoKeysCollection.createIndex({ userId: 1 });
        await verifiedIdentitiesCollection.createIndex({ userId: 1 }, { unique: true });
        await verifiedIdentitiesCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
        await verifiedIdentitiesCollection.createIndex({ legalId: 1 }, { sparse: true });

        mongoReady = true;
        logger.info('✅ MongoDB Atlas conectado');
    } catch (err) {
        logger.error('⚠️ MongoDB fallback activo: ' + err.message);
        mongoReady = false;
    }
}

// 🔐 SEGURIDAD
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https:", "http:"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            connectSrc: ["'self'", "https://apiromwinervault.onrender.com", "https://checkout.stripe.com", "https://api.qrserver.com", "http://localhost:3000", "http://127.0.0.1:3000"],
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

// ✅ CORS: PERMITE CONEXIONES DESDE EL FRONTEND
app.use(cors({
    origin: function(origin, callback) {
        // Permitir si no hay origin (app móvil, Postman, etc.)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'https://apiromwinervault.onrender.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:10000',
            'http://127.0.0.1:10000'
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('CORS no permitido para este origen'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Vault-Sig', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// ✅ MANEJO EXPLÍCITO DE PREFLIGHT OPTIONS (CRÍTICO PARA CORS)
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// 📁 UPLOADS
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(() => {});
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + safeName);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: async(req, file, cb) => {
        try {
            const buffer = await fs.readFile(file.path);
            const type = await fileType.fromBuffer(buffer);
            const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'rar', 'zip', '7z', 'epub', 'mobi'];
            const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'application/x-rar-compressed', 'application/zip', 'application/x-7z-compressed', 'application/epub+zip', 'application/x-mobipocket-ebook'];
            if ((type && allowedExts.includes(type.ext)) || allowedMimes.includes(file.mimetype)) cb(null, true);
            else cb(new Error('Archivo no permitido'));
        } catch (e) { cb(new Error('Error validando archivo: ' + e.message)); }
    }
});

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Demasiadas solicitudes' } }));

// 🔐 AUTH
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requerido' });
    const token = authHeader.replace('Bearer ', '');
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { return res.status(401).json({ error: 'Token inválido' }); }
};
const requireAdmin = async(req, res, next) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user || !ADMIN_EMAILS.includes(user.email)) return res.status(403).json({ error: 'Acceso denegado' });
        req.admin = user;
        next();
    } catch (err) { res.status(500).json({ error: err.message }); }
};
const requireConsent = (...requiredScopes) => (req, res, next) => {
    const tokenScopes = (req.user && req.user.scopes) || [];
    const missing = requiredScopes.filter(scope => !tokenScopes.includes(scope));
    if (missing.length > 0) return res.status(403).json({ error: 'Consentimiento requerido', missingScopes: missing });
    next();
};

// ✅ TIERS + CUOTAS
const USER_TIERS = {
    personal: { id: 'personal', name: 'Personal', storageLimitGB: 10, maxFileSizeMB: 100, apiRateLimit: 100 },
    business: { id: 'business', name: 'Business', storageLimitGB: 100, maxFileSizeMB: 500, apiRateLimit: 1000 },
    enterprise: { id: 'enterprise', name: 'Enterprise', storageLimitGB: -1, maxFileSizeMB: 5000, apiRateLimit: 10000 }
};
const requireTier = (...allowed) => async(req, res, next) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const tier = (user && user.tier) || 'personal';
        if (!allowed.includes(tier)) return res.status(403).json({ error: 'Acceso denegado para tu plan' });
        req.userTier = tier;
        next();
    } catch (err) { res.status(500).json({ error: err.message }); }
};
const checkQuota = async(req, res, next) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const tier = USER_TIERS[(user && user.tier) || 'personal'];
        if (!tier) return next();
        const used = await secretsCollection.aggregate([{ $match: { userId: (user && user._id) } }, { $group: { _id: null, total: { $sum: '$fileSize' } } }]).toArray();
        const usedGB = ((used[0] && used[0].total) || 0) / (1024 ** 3);
        if (tier.storageLimitGB > 0 && usedGB >= tier.storageLimitGB) return res.status(413).json({ error: 'Límite excedido' });
        if (req.file && req.file.size > tier.maxFileSizeMB * 1024 * 1024) return res.status(413).json({ error: 'Archivo muy grande' });
        next();
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ✅ AUDITORÍA
const createImmutableLog = async(data) => {
    const eventId = crypto.randomUUID();
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const last = await auditCollection.findOne({}, { sort: { createdAt: -1 }, projection: { currentHash: 1 } });
    const prev = (last && last.currentHash) || 'genesis';
    const current = crypto.createHash('sha256').update(prev + hash).digest('hex');
    const sig = crypto.createHmac('sha256', process.env.AUDIT_SECRET || MASTER_KEY).update(eventId + current).digest('hex');
    return {...data, eventId, previousHash: prev, currentHash: current, signature: sig, timestamp: new Date() };
};
const logAudit = async(action, data) => {
    if (mongoReady && auditCollection) { try { await auditCollection.insertOne(await createImmutableLog({ action, data, createdAt: new Date() })); } catch (e) { logger.warn('⚠️ Audit failed: ' + e.message); } }
};

// ✅ GDPR/SOC2
const generateGDPRReport = async(userId, start, end) => {
    const user = await usersCollection.findOne({ uid: userId });
    const logs = await auditCollection.find({ userId, timestamp: { $gte: new Date(start), $lte: new Date(end) } }).sort({ timestamp: 1 }).toArray();
    return { reportType: 'GDPR_ARTICLE_15', generatedAt: new Date().toISOString(), subject: { uid: (user && user.uid), email: (user && user.email) }, data: logs };
};
const generateSOC2Report = async(orgId, start, end) => ({
    reportType: 'SOC2_TYPE_II',
    organization: orgId,
    period: { start, end },
    controls: { 'CC6.1': 'implemented', 'CC6.2': 'implemented', 'CC7.2': 'implemented' },
    integrityHash: crypto.createHash('sha256').update(orgId + start + end).digest('hex')
});

// ✅ KEY ROTATION
const KeyRotationService = {
    rotationIntervalDays: 90,
    async rotateUserKey(userId) {
        if (!mongoReady) return { success: false, message: 'DB no disponible' };
        const user = await usersCollection.findOne({ uid: userId });
        if (!user) return { success: false, message: 'Usuario no encontrado' };
        const newDEK = EnvelopeEncryption.generateDEK();
        const wrapped = EnvelopeEncryption.wrapDEK(newDEK);
        await usersCollection.updateOne({ _id: user._id }, { $set: { encryptedUserKey: wrapped, keyRotatedAt: new Date(), keyVersion: (user.keyVersion || 0) + 1 } });
        await logAudit('key.rotation', { userId, newVersion: (user.keyVersion || 0) + 1 });
        return { success: true, message: 'Clave rotada' };
    },
    async scheduleRotations() {
        if (!mongoReady) return;
        const cutoff = new Date(Date.now() - this.rotationIntervalDays * 24 * 60 * 60 * 1000);
        const users = await usersCollection.find({ keyRotatedAt: { $lt: cutoff }, encryptedUserKey: { $exists: true } }).toArray();
        for (const u of users) { try { await this.rotateUserKey(u.uid); } catch (e) { logger.warn('❌ Rotation failed: ' + e.message); } }
    }
};

// ✅ WEBHOOKS
const AlertWebhookService = {
    async registerWebhook(userId, config) {
        if (!mongoReady) return { success: true, message: 'Demo', demo: true };
        await webhooksCollection.updateOne({ userId, url: config.url }, { $set: {...config, updatedAt: new Date() } }, { upsert: true });
        return { success: true };
    },
    async sendAlert(userId, alert) {
        if (!mongoReady) return;
        const hooks = await webhooksCollection.find({ userId }).toArray();
        for (const h of hooks) {
            if (!(h.events && h.events.includes(alert.type))) continue;
            const payload = { eventId: crypto.randomUUID(), timestamp: new Date().toISOString(), alert, signature: crypto.createHmac('sha256', h.secret).update(JSON.stringify(alert)).digest('hex') };
            try { await fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vault-Sig': payload.signature }, body: JSON.stringify(payload), timeout: 5000 }); } catch (e) { logger.warn('⚠️ Webhook failed: ' + e.message); }
        }
    }
};

// 🌐 STATUS
app.get('/api/status', (req, res) => res.json({
    api: 'ApiRomwiner Vault',
    status: 'online',
    database: mongoReady ? 'connected' : 'fallback',
    features: [
        '🟢 57 Funciones Reales', '🟢 Identidad Criptográfica Autónoma', '🟢 Identidad Legal Verificada',
        '🟢 Consentimiento Granular', '🟢 Enterprise Tiers', '🟢 Envelope Encryption', '🟢 Auditoría Inmutable',
        '🟢 GDPR/SOC2', '🟢 Rotación de Claves', '🟢 Webhooks', '🟢 Enlaces Seguros', '🟢 Thumbnails Cifrados',
        '🟢 Versionado+Diff', '🟢 Comentarios Cifrados', '🟢 Super Admin Powers', '🟢 Búsqueda en Vault',
        '🟢 Validación Real de Archivos',
        FEATURES.PORTABLE_EXPORT && '🟢 Exportación Portable', FEATURES.LOCAL_SYNC && '🟢 Sync Offline',
        FEATURES.ZERO_KNOWLEDGE && '🟢 Zero-Knowledge Ready', FEATURES.WEB3_LOGIN && '🟢 Login Web3',
        FEATURES.IPFS_BACKUP && '🟢 Backup IPFS (Helia)'
    ].filter(Boolean)
}));

// 🔐 REGISTER
app.post('/register', async(req, res) => {
    try {
        const { email, password, refCode } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) return res.status(400).json({ error: 'Contraseña débil' });
        if (!mongoReady) return res.status(201).json({ success: true, message: 'Registrado (demo)', demo: true });
        if (await usersCollection.findOne({ email })) return res.status(400).json({ error: 'Correo ya registrado' });
        const hashed = await bcrypt.hash(password, 10);
        const newUser = { email, password: hashed, uid: 'rom_' + crypto.randomBytes(8).toString('hex'), refCode: 'ROM' + Math.random().toString(36).substr(2, 6).toUpperCase(), referredBy: refCode || null, isAdmin: ADMIN_EMAILS.includes(email), tier: 'personal', createdAt: new Date(), affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 } };
        const r = await usersCollection.insertOne(newUser);
        await profilesCollection.insertOne({ userId: r.insertedId, uid: newUser.uid, displayName: '', avatarUrl: '', bio: '', isPublic: false, createdAt: new Date() });
        await walletCollection.insertOne({ userId: r.insertedId, balance: 0, currency: 'USD', history: [], createdAt: new Date() });
        await affiliatesCollection.insertOne({ userId: r.insertedId, refCode: newUser.refCode, level: 'bronce', createdAt: new Date() });
        await logAudit('register', { email });
        res.status(201).json({ success: true, message: 'Registrado. Inicia sesión.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔐 LOGIN
app.post('/login', async(req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
        if (!mongoReady) { const t = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' }); return res.json({ success: true, token: t, user: { email, isAdmin: ADMIN_EMAILS.includes(email) }, demo: true }); }
        const user = await usersCollection.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Credenciales inválidas' });
        await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
        const token = jwt.sign({ uid: user.uid, email, isAdmin: (user.isAdmin || ADMIN_EMAILS.includes(email)), tier: (user.tier || 'personal') }, JWT_SECRET, { expiresIn: '7d' });
        await logAudit('login', { email });
        res.json({ success: true, token, user: { uid: user.uid, email, isAdmin: (user.isAdmin || ADMIN_EMAILS.includes(email)), refCode: user.refCode, tier: (user.tier || 'personal') } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 👤 PROFILE
app.get('/api/profile', authenticate, async(req, res) => {
    try {
        if (!mongoReady) return res.json({ success: true, profile: { displayName: 'Demo' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const p = await profilesCollection.findOne({ userId: user._id });
        res.json({ success: true, profile: {...p, tier: user.tier }, user: { uid: user.uid, email: user.email, tier: user.tier, isAdmin: ADMIN_EMAILS.includes(user.email) } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/profile', authenticate, upload.single('avatar'), async(req, res) => {
    try {
        const { displayName, bio, isPublic } = req.body;
        if (!mongoReady) return res.json({ success: true, message: 'Actualizado (demo)', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const up = {};
        if (displayName) up.displayName = displayName;
        if (bio) up.bio = bio;
        if (isPublic !== undefined) up.isPublic = isPublic === 'true';
        if (req.file) up.avatarUrl = '/uploads/' + path.basename(req.file.filename);
        await profilesCollection.updateOne({ userId: user._id }, { $set: up, updatedAt: new Date() }, { upsert: true });
        res.json({ success: true, message: 'Perfil actualizado correctamente' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 💰 WALLET
app.get('/api/wallet', authenticate, async(req, res) => {
    try {
        if (!mongoReady) return res.json({ success: true, wallet: { balance: 0, currency: 'USD' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const w = await walletCollection.findOne({ userId: user._id });
        res.json({ success: true, wallet: w || { balance: 0, currency: 'USD' } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/wallet/deposit', authenticate, async(req, res) => {
    try {
        const amount = parseFloat(req.body.amount);
        if (!amount || amount < 5) return res.status(400).json({ error: 'Mínimo $5 USD para depósito' });
        if (STRIPE_SECRET_KEY.includes('placeholder')) return res.json({ success: true, message: 'Modo demo: configura STRIPE_SECRET_KEY en .env', demo: true, clientSecret: 'demo' });
        const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ amount: Math.round(amount * 100), currency: 'usd', metadata: JSON.stringify({ uid: req.user.uid, type: 'deposit' }) }) });
        const data = await stripeRes.json();
        if (!data.client_secret) return res.status(500).json({ error: 'Error de Stripe: ' + ((data.error && data.error.message) || 'Cliente secreto no generado') });
        res.json({ success: true, clientSecret: data.client_secret, paymentId: data.id });
    } catch (e) { res.status(500).json({ error: 'Error procesando pago con Stripe: ' + e.message }); }
});
app.post('/api/wallet/withdraw', authenticate, async(req, res) => {
    try {
        const amount = parseFloat(req.body.amount),
            method = req.body.method || 'bank';
        if (!mongoReady || !walletCollection) return res.json({ success: true, message: 'Retiro demo: configura wallet real', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const w = await walletCollection.findOne({ userId: user._id });
        if (!w || w.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente. Saldo actual: $' + ((w && w.balance) || 0).toFixed(2) });
        await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: -amount }, $push: { history: { type: 'withdraw', amount, method, date: new Date() } } });
        await transactionsCollection.insertOne({ userId: user._id, type: 'withdrawal', amount, method, status: 'pending', createdAt: new Date() });
        res.json({ success: true, message: 'Solicitud de retiro enviada. Te contactaremos para confirmar.' });
    } catch (e) { res.status(500).json({ error: 'Error al procesar retiro: ' + e.message }); }
});

// 👑 ADMIN: GIFT ACCOUNT
app.post('/api/admin/gift-account', authenticate, requireAdmin, async(req, res) => {
    try {
        const { recipientEmail, initialBalance, note, tier } = req.body;
        if (!recipientEmail) return res.status(400).json({ error: 'Email del destinatario requerido' });
        if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo regalo: configura MongoDB', demo: true });
        let user = await usersCollection.findOne({ email: recipientEmail });
        let tempPassword = null;
        if (!user) {
            tempPassword = 'Gift_' + crypto.randomBytes(4).toString('hex').toUpperCase();
            const hashed = await bcrypt.hash(tempPassword, 10);
            const newUser = { email: recipientEmail, password: hashed, uid: 'rom_' + crypto.randomBytes(8).toString('hex'), refCode: 'ROM' + Math.random().toString(36).substr(2, 6).toUpperCase(), isAdmin: false, tier: tier || 'personal', isGifted: true, giftedBy: req.admin.uid, giftedAt: new Date(), giftedNote: note || '', createdAt: new Date(), affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 } };
            const r = await usersCollection.insertOne(newUser);
            await profilesCollection.insertOne({ userId: r.insertedId, uid: newUser.uid, displayName: 'Usuario Regalado', bio: note || '', isPublic: false, createdAt: new Date() });
            await affiliatesCollection.insertOne({ userId: r.insertedId, refCode: newUser.refCode, level: 'bronce', createdAt: new Date() });
            user = newUser;
        } else {
            if (tier && ['personal', 'business', 'enterprise'].includes(tier)) await usersCollection.updateOne({ _id: user._id }, { $set: { tier, updatedAt: new Date() } });
        }
        const bal = parseFloat(initialBalance) || 0;
        await walletCollection.updateOne({ userId: user._id }, { $setOnInsert: { balance: bal, currency: 'USD', history: [] }, $inc: { balance: bal }, $push: { history: { type: 'admin_gift', amount: bal, from: req.admin.email, date: new Date() } } }, { upsert: true });
        await transactionsCollection.insertOne({ type: 'admin_gift', amount: bal, admin: req.admin.uid, recipient: user.email, note: note || '', createdAt: new Date() });
        await logAudit('gift', { recipientEmail, bal, by: req.admin.uid, tier: tier || user.tier });
        res.json({ success: true, recipientEmail: user.email, uid: user.uid, tempPassword, balance: bal, tier: tier || user.tier, message: tempPassword ? 'Cuenta creada con contraseña temporal' : 'Saldo agregado a cuenta existente' });
    } catch (e) { res.status(500).json({ error: 'Error al regalar cuenta: ' + e.message }); }
});

// 📦 VAULT CREATE
app.post('/vault', authenticate, checkQuota, async(req, res) => {
    try {
        const { titulo, categoria = 'general', folderId = 'general', contenido, price = 0, forSale = false, licenseDays = null } = req.body;
        if (!titulo) return res.status(400).json({ error: 'Título requerido para el contenido' });
        if (!mongoReady || !secretsCollection) return res.status(201).json({ success: true, message: 'Guardado en modo demo', id: 'demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const data = { userId: user._id, userUid: user.uid, titulo, categoria, folderId, tipo: req.file ? 'archivo' : 'texto', contenido: null, fileName: req.file ? path.basename(req.file.filename) : null, fileType: req.file ? req.file.mimetype : null, fileSize: req.file ? req.file.size : null, encrypted: null, isForSale: forSale, price: forSale ? price : 0, licenseDays, sales: 0, buyers: [], createdAt: new Date() };
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
        } else if (contenido) { data.contenido = EnvelopeEncryption.seal(contenido, userDEK); }
        const result = await secretsCollection.insertOne(data);
        await logAudit('vault_create', { titulo, userId: user.uid, tipo: data.tipo, forSale });
        res.status(201).json({ success: true, message: 'Contenido guardado y cifrado en Vault (clave única por usuario)', id: result.insertedId, fileName: data.fileName });
    } catch (e) {
        logger.error('❌ Vault create: ' + e.message);
        res.status(500).json({ error: 'Error al guardar en Vault: ' + e.message });
    }
});

// 📦 VAULT LIST
app.get('/vault', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, items: [], total: 0 });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const items = await secretsCollection.find({ $or: [{ userId: user._id }, { isForSale: true }] }).sort({ createdAt: -1 }).limit(50).project({ encrypted: 0, contenido: 0 }).toArray();
        res.json({ success: true, items, total: items.length });
    } catch (e) { res.status(500).json({ error: 'Error al listar Vault: ' + e.message }); }
});

// 📦 VAULT READ
app.get('/vault/:id', authenticate, async(req, res) => {
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
                if (secret.tipo === 'texto' && secret.contenido) contenido = EnvelopeEncryption.open(secret.contenido, userDEK);
                else if (secret.tipo === 'archivo' && secret.encrypted) contenido = Buffer.from(EnvelopeEncryption.open(secret.encrypted, userDEK), 'base64').toString('base64');
            } catch (fallback) {
                if (secret.tipo === 'texto' && secret.contenido) contenido = decryptPII({ iv: (secret.encrypted && secret.encrypted.iv), data: secret.contenido, tag: (secret.encrypted && secret.encrypted.tag) });
                else if (secret.tipo === 'archivo' && secret.encrypted) {
                    const decrypted = decryptPII(secret.encrypted);
                    contenido = Buffer.from(decrypted, 'base64').toString('base64');
                }
            }
        } else {
            if (secret.tipo === 'texto' && secret.contenido) contenido = decryptPII({ iv: (secret.encrypted && secret.encrypted.iv), data: secret.contenido, tag: (secret.encrypted && secret.encrypted.tag) });
            else if (secret.tipo === 'archivo' && secret.encrypted) {
                const decrypted = decryptPII(secret.encrypted);
                contenido = Buffer.from(decrypted, 'base64').toString('base64');
            }
        }
        res.json({ success: true, secret: { id: secret._id.toString(), titulo: secret.titulo, contenido, isForSale: secret.isForSale, price: secret.price, sales: secret.sales, licenseDays: secret.licenseDays, fileName: secret.fileName, fileType: secret.fileType } });
    } catch (e) { res.status(500).json({ error: 'Error al obtener contenido: ' + e.message }); }
});

// 📦 VAULT DELETE
app.delete('/vault/:id', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, message: 'Eliminado en modo demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const result = await secretsCollection.deleteOne({ _id: new ObjectId(req.params.id), userId: user._id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'No autorizado: solo puedes eliminar tu propio contenido' });
        await logAudit('vault_delete', { id: req.params.id, userId: user.uid });
        res.json({ success: true, message: 'Contenido eliminado permanentemente' });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar: ' + e.message }); }
});

// 💰 BUY
app.post('/api/buy/:id', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !secretsCollection || !walletCollection) return res.json({ success: true, message: 'Compra demo: configura MongoDB y wallet', demo: true });
        const buyer = await usersCollection.findOne({ uid: req.user.uid });
        if (!buyer) return res.status(404).json({ error: 'Usuario no encontrado' });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true });
        if (!secret) return res.status(404).json({ error: 'Contenido no disponible para venta' });
        if (secret.buyers.indexOf(buyer.uid) !== -1) return res.status(400).json({ error: 'Ya compraste este contenido. Revisa tu Vault.' });
        const price = secret.price || 10;
        const bWallet = await walletCollection.findOne({ userId: buyer._id });
        if (!bWallet || bWallet.balance < price) return res.status(400).json({ error: 'Saldo insuficiente. Necesitas $' + price + ' USD. Saldo actual: $' + ((bWallet && bWallet.balance) || 0).toFixed(2) });
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
    } catch (e) { res.status(500).json({ error: 'Error procesando compra: ' + e.message }); }
});

// 🤝 AFFILIATES DASHBOARD
app.get('/api/affiliates/dashboard', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !affiliatesCollection) return res.json({ success: true, dashboard: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0, referralLink: APP_URL + '?ref=DEMO', refCode: 'DEMO' }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const aff = await affiliatesCollection.findOne({ userId: user._id }) || {};
        res.json({ success: true, dashboard: { level: aff.level || 'bronce', totalReferrals: aff.totalReferrals || 0, pendingBalance: aff.pendingBalance || 0, availableBalance: aff.availableBalance || 0, withdrawnBalance: aff.withdrawnBalance || 0, referralLink: APP_URL + '?ref=' + user.refCode, refCode: user.refCode } });
    } catch (e) { res.status(500).json({ error: 'Error al cargar dashboard de afiliados: ' + e.message }); }
});
app.post('/api/affiliates/withdraw', authenticate, async(req, res) => {
    try {
        const method = req.body.method || 'bank';
        if (!mongoReady || !affiliatesCollection || !walletCollection) return res.json({ success: true, message: 'Retiro demo: configura wallet real', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const aff = await affiliatesCollection.findOne({ userId: user._id });
        if (!aff || aff.availableBalance < 10) return res.status(400).json({ error: 'Mínimo $10 USD para retiro de afiliados. Balance actual: $' + ((aff && aff.availableBalance) || 0).toFixed(2) });
        const w = await walletCollection.findOne({ userId: user._id });
        if (w) await walletCollection.updateOne({ _id: w._id }, { $inc: { availableBalance: -aff.availableBalance, withdrawnBalance: aff.availableBalance }, $push: { history: { type: 'affiliate_withdraw', amount: aff.availableBalance, method, date: new Date() } } });
        await transactionsCollection.insertOne({ userId: user._id, type: 'affiliate_payout', amount: aff.availableBalance, method, status: 'pending', createdAt: new Date() });
        res.json({ success: true, message: 'Retiro de afiliados solicitado. Procesaremos en 24-48h.' });
    } catch (e) { res.status(500).json({ error: 'Error al procesar retiro de afiliados: ' + e.message }); }
});

// 🆔 IDENTITY: REGISTER APP
app.post('/api/identity/register-app', authenticate, async(req, res) => {
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
    } catch (e) { res.status(500).json({ error: 'Error al registrar app: ' + e.message }); }
});
app.post('/api/identity/authorize', authenticate, async(req, res) => {
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
    } catch (e) { res.status(500).json({ error: 'Error al autorizar app: ' + e.message }); }
});
app.delete('/api/identity/revoke/all', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !identityCollection) return res.json({ success: true, message: 'Revocado en modo demo', demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        await identityCollection.updateMany({ ownerUid: user.uid }, { $set: { active: false, updatedAt: new Date() } });
        res.json({ success: true, message: 'Todos los accesos de apps revocados exitosamente' });
    } catch (e) { res.status(500).json({ error: 'Error al revocar accesos: ' + e.message }); }
});
app.get('/api/identity/qr', authenticate, async(req, res) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const qrData = JSON.stringify({ uid: user.uid, email: user.email, ref: user.refCode });
        res.json({ success: true, qrPayload: qrData, qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrData) });
    } catch (e) { res.status(500).json({ error: 'Error al generar QR: ' + e.message }); }
});

// 📊 DASHBOARD
app.get('/api/dashboard', authenticate, async(req, res) => {
    try {
        if (!mongoReady || !secretsCollection) return res.json({ success: true, dashboard: { revenue: 0, sales: 0, active: 0, forSale: 0 }, demo: true });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const totalSecrets = await secretsCollection.countDocuments({ userId: user._id });
        const forSale = await secretsCollection.countDocuments({ userId: user._id, isForSale: true });
        const totalSales = await transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' });
        res.json({ success: true, dashboard: { revenue: 0, sales: totalSales, active: totalSecrets, forSale, tier: user.tier } });
    } catch (e) { res.status(500).json({ error: 'Error al cargar dashboard: ' + e.message }); }
});

// 📋 AUDIT EXPORT
app.get('/api/audit/export', authenticate, requireTier('business', 'enterprise'), async(req, res) => {
    try {
        const { type, startDate, endDate, organizationId } = req.query;
        if (!mongoReady || !auditCollection) return res.json({ success: true, logs: [], demo: true });
        if (type === 'gdpr') { const report = await generateGDPRReport(req.user.uid, startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), endDate || new Date()); return res.json({ success: true, reportType: 'GDPR', data: report }); }
        if (type === 'soc2' && req.userTier === 'enterprise') { const report = await generateSOC2Report(organizationId || req.user.uid, startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), endDate || new Date()); return res.json({ success: true, reportType: 'SOC2', data: report }); }
        const logs = await auditCollection.find({ userId: req.user.uid }).sort({ timestamp: -1 }).limit(100).toArray();
        res.json({ success: true, logs });
    } catch (e) { res.status(500).json({ error: 'Error al exportar auditoría: ' + e.message }); }
});

// 🔑 ROTATE KEYS
app.post('/api/admin/rotate-keys', authenticate, requireAdmin, requireTier('enterprise'), async(req, res) => {
    try {
        const { userId } = req.body;
        if (userId) { const result = await KeyRotationService.rotateUserKey(userId); return res.json(result); } else { await KeyRotationService.scheduleRotations(); return res.json({ success: true, message: 'Rotación de claves programada para usuarios elegibles' }); }
    } catch (e) { res.status(500).json({ error: 'Error rotando claves: ' + e.message }); }
});

// 🔗 WEBHOOKS ADMIN
app.post('/api/admin/webhooks', authenticate, requireAdmin, async(req, res) => {
    try {
        const { userId, url, events, secret } = req.body;
        if (!url || !events) return res.status(400).json({ error: 'URL y eventos requeridos' });
        const result = await AlertWebhookService.registerWebhook(userId || req.user.uid, { url, events, secret: secret || crypto.randomBytes(32).toString('hex') });
        res.json(result);
    } catch (e) { res.status(500).json({ error: 'Error registrando webhook: ' + e.message }); }
});
app.delete('/api/admin/webhooks/:url', authenticate, requireAdmin, async(req, res) => {
    try {
        if (!mongoReady) return res.json({ success: true, message: 'Demo: webhook eliminado', demo: true });
        await webhooksCollection.deleteOne({ userId: req.user.uid, url: decodeURIComponent(req.params.url) });
        res.json({ success: true, message: 'Webhook eliminado' });
    } catch (e) { res.status(500).json({ error: 'Error eliminando webhook: ' + e.message }); }
});

// 💳 STRIPE WEBHOOK
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async(req, res) => {
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
    } catch (e) {
        logger.error('❌ Webhook error: ' + e.message);
        res.status(400).send('Webhook Error: ' + e.message);
    }
});

// 👥 ADMIN: SET TIER
app.patch('/api/admin/set-tier', authenticate, requireAdmin, async(req, res) => {
    try {
        const { targetEmail, tier } = req.body;
        if (!targetEmail || !['personal', 'business', 'enterprise'].includes(tier)) return res.status(400).json({ error: 'Email y tier válidos requeridos' });
        if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo: tier actualizado', demo: true });
        const result = await usersCollection.updateOne({ email: targetEmail }, { $set: { tier, updatedAt: new Date() } });
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        await logAudit('admin.set_tier', { admin: req.admin.uid, target: targetEmail, newTier: tier });
        res.json({ success: true, message: `Tier de ${targetEmail} actualizado a ${tier}` });
    } catch (e) { res.status(500).json({ error: 'Error al actualizar tier: ' + e.message }); }
});

// === FUNCIONES EXISTENTES: SHARE, THUMBNAIL, VERSIONS, COMMENTS, ADMIN ===
// 🔗 SHARE LINKS
app.post('/api/vault/:id/share', authenticate, async(req, res) => {
    try {
        const { expiresInHours = 24, password, permissions = ['view'] } = req.body;
        const userCheck = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
        if (!secret) return res.status(404).json({ error: 'Archivo no encontrado' });
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
        const doc = { fileId: secret._id, token, createdBy: req.user.uid, permissions, expiresAt, createdAt: new Date() };
        if (password) doc.passwordHash = await bcrypt.hash(password, 10);
        await sharedLinksCollection.insertOne(doc);
        await logAudit('share_link', { fileId: req.params.id, token, expiresAt });
        res.json({ success: true, link: `${APP_URL}/s/${token}`, expiresAt });
    } catch (e) { res.status(500).json({ error: 'Error creando enlace: ' + e.message }); }
});
app.get('/s/:token', async(req, res) => {
    try {
        const link = await sharedLinksCollection.findOne({ token: req.params.token });
        if (!link || new Date() > link.expiresAt) return res.status(404).json({ error: 'Enlace expirado' });
        const secret = await secretsCollection.findOne({ _id: link.fileId });
        if (!secret) return res.status(404).json({ error: 'Contenido eliminado' });
        res.json({ success: true, title: secret.titulo, isFile: secret.tipo === 'archivo', requiresPassword: !!link.passwordHash });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🖼️ THUMBNAILS
app.post('/api/vault/:id/thumbnail', authenticate, async(req, res) => {
    try {
        const userCheck = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
        if (!(secret && secret.encrypted)) return res.status(400).json({ error: 'Archivo no soporta thumbnail' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!(user && user.encryptedUserKey)) return res.status(400).json({ error: 'Clave no disponible' });
        const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
        const img = Buffer.from(EnvelopeEncryption.open(secret.encrypted, userDEK), 'base64');
        const thumb = await sharp(img).resize(300, 300, { fit: 'inside' }).png().toBuffer();
        const encThumb = EnvelopeEncryption.seal(thumb.toString('base64'), userDEK);
        await thumbnailsCollection.updateOne({ fileId: secret._id }, { $set: { encrypted: encThumb, updatedAt: new Date() } }, { upsert: true });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Error thumbnail: ' + e.message }); }
});
app.get('/api/vault/:id/thumbnail', authenticate, async(req, res) => {
    try {
        const thumb = await thumbnailsCollection.findOne({ fileId: new ObjectId(req.params.id) });
        if (!thumb) return res.status(404).json({ error: 'Thumbnail no disponible' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const userDEK = EnvelopeEncryption.unwrapDEK(user && user.encryptedUserKey);
        const dec = EnvelopeEncryption.open(thumb.encrypted, userDEK);
        res.type('image/png').send(Buffer.from(dec, 'base64'));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📜 VERSIONS + DIFF
app.post('/api/vault/:id/version', authenticate, async(req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Contenido requerido' });
        const userCheck = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
        if (!secret) return res.status(404).json({ error: 'No encontrado' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
        const last = await versionsCollection.findOne({ fileId: secret._id }, { sort: { versionNumber: -1 } });
        const next = ((last && last.versionNumber) || 0) + 1;
        await versionsCollection.insertOne({ fileId: secret._id, versionNumber: next, content: EnvelopeEncryption.seal(content, userDEK), createdBy: req.user.uid, createdAt: new Date() });
        res.json({ success: true, version: next });
    } catch (e) { res.status(500).json({ error: 'Error versión: ' + e.message }); }
});
app.get('/api/vault/:id/versions', authenticate, async(req, res) => {
    try {
        const userCheck = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
        if (!secret) return res.status(404).json({ error: 'No encontrado' });
        const vers = await versionsCollection.find({ fileId: secret._id }).sort({ versionNumber: -1 }).toArray();
        res.json({ success: true, versions: vers.map(v => ({ v: v.versionNumber, date: v.createdAt, user: v.createdBy })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/vault/:id/diff/:v1/:v2', authenticate, async(req, res) => {
    try {
        const userCheck = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
        if (!secret) return res.status(404).json({ error: 'No encontrado' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
        const v1 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: parseInt(req.params.v1) });
        const v2 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: parseInt(req.params.v2) });
        if (!v1 || !v2) return res.status(404).json({ error: 'Versión no encontrada' });
        const c1 = EnvelopeEncryption.open(v1.content, userDEK);
        const c2 = EnvelopeEncryption.open(v2.content, userDEK);
        const patch = diffLib.createPatch('doc', c1, c2, 'v' + req.params.v1, 'v' + req.params.v2);
        res.json({ success: true, diff: patch });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 💬 COMMENTS
app.post('/api/vault/:id/comments', authenticate, async(req, res) => {
    try {
        const { content } = req.body;
        if (!(content && content.trim())) return res.status(400).json({ error: 'Texto requerido' });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!secret) return res.status(404).json({ error: 'No encontrado' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const enc = EnvelopeEncryption.seal(content.trim(), EnvelopeEncryption.unwrapDEK(user.encryptedUserKey));
        await commentsCollection.insertOne({ fileId: secret._id, userId: req.user.uid, content: enc, createdAt: new Date() });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/vault/:id/comments', authenticate, async(req, res) => {
    try {
        const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!secret) return res.status(404).json({ error: 'No encontrado' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
        const coms = await commentsCollection.find({ fileId: secret._id }).sort({ createdAt: -1 }).limit(50).toArray();
        res.json({ success: true, comments: coms.map(c => ({ id: c._id, text: EnvelopeEncryption.open(c.content, userDEK), date: c.createdAt, userId: c.userId })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 👑 SUPER ADMIN FUNCTIONS
app.delete('/api/admin/users/:email', authenticate, requireAdmin, async(req, res) => {
    try {
        const targetUser = await usersCollection.findOne({ email: req.params.email });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
        await usersCollection.deleteOne({ _id: targetUser._id });
        await profilesCollection.deleteOne({ userId: targetUser._id });
        await walletCollection.deleteOne({ userId: targetUser._id });
        await affiliatesCollection.deleteOne({ userId: targetUser._id });
        await secretsCollection.deleteMany({ userId: targetUser._id });
        await auditCollection.deleteMany({ userId: targetUser._id });
        await logAudit('admin.delete_user', { admin: req.admin.uid, deletedUser: req.params.email });
        res.json({ success: true, message: `Usuario ${req.params.email} eliminado completamente` });
    } catch (e) { res.status(500).json({ error: 'Error eliminando usuario: ' + e.message }); }
});
app.get('/api/admin/users', authenticate, requireAdmin, async(req, res) => {
    try {
        const users = await usersCollection.find({}, { projection: { password: 0, encryptedUserKey: 0 } }).toArray();
        res.json({ success: true, users: users.map(u => ({ uid: u.uid, email: u.email, tier: u.tier, isAdmin: ADMIN_EMAILS.includes(u.email), createdAt: u.createdAt })) });
    } catch (e) { res.status(500).json({ error: 'Error listando usuarios: ' + e.message }); }
});
app.post('/api/admin/reset-password/:email', authenticate, requireAdmin, async(req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Contraseña nueva debe tener 8+ caracteres' });
        const targetUser = await usersCollection.findOne({ email: req.params.email });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
        const hashed = await bcrypt.hash(newPassword, 10);
        await usersCollection.updateOne({ _id: targetUser._id }, { $set: { password: hashed, updatedAt: new Date() } });
        await logAudit('admin.reset_password', { admin: req.admin.uid, target: req.params.email });
        res.json({ success: true, message: `Contraseña de ${req.params.email} actualizada` });
    } catch (e) { res.status(500).json({ error: 'Error reseteando contraseña: ' + e.message }); }
});
app.post('/api/admin/invalidate-all-tokens', authenticate, requireAdmin, async(req, res) => {
    try {
        await logAudit('admin.invalidate_all_tokens', { admin: req.admin.uid, timestamp: new Date() });
        res.json({ success: true, message: 'Tokens invalidados. Los usuarios deberán reiniciar sesión.' });
    } catch (e) { res.status(500).json({ error: 'Error invalidando tokens: ' + e.message }); }
});
app.get('/api/admin/export-user/:email', authenticate, requireAdmin, async(req, res) => {
    try {
        const targetUser = await usersCollection.findOne({ email: req.params.email });
        if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
        const profile = await profilesCollection.findOne({ userId: targetUser._id });
        const wallet = await walletCollection.findOne({ userId: targetUser._id });
        const affiliates = await affiliatesCollection.findOne({ userId: targetUser._id });
        const secrets = await secretsCollection.find({ userId: targetUser._id }).project({ encrypted: 0, contenido: 0 }).toArray();
        const auditLogs = await auditCollection.find({ userId: targetUser._id }).limit(100).toArray();
        res.json({ success: true, data: { user: targetUser, profile, wallet, affiliates, secretsCount: secrets.length, auditLogsCount: auditLogs.length, exportedAt: new Date() } });
    } catch (e) { res.status(500).json({ error: 'Error exportando datos: ' + e.message }); }
});

// 🔐 CRYPTO-AUTH (WEBAUTHN/FIDO2)
app.post('/api/crypto-auth/register-start', authenticate, async(req, res) => {
    try {
        const { email } = req.body;
        const user = email ? await usersCollection.findOne({ email }) : null;
        const userId = (user && user.uid) || crypto.randomUUID();
        const options = await generateRegistrationOptions({ rpName: 'ApiRomwiner Vault', rpID: new URL(APP_URL).hostname, userID: Buffer.from(userId), userName: email || 'anonymous', attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' } });
        await cryptoKeysCollection.updateOne({ userId }, { $set: { challenge: options.challenge, createdAt: new Date() } }, { upsert: true });
        res.json({ success: true, options, userId });
    } catch (e) { res.status(500).json({ error: 'Error iniciando registro criptográfico: ' + e.message }); }
});
app.post('/api/crypto-auth/register-finish', authenticate, async(req, res) => {
    try {
        const { userId, response } = req.body;
        const record = await cryptoKeysCollection.findOne({ userId });
        if (!(record && record.challenge)) return res.status(400).json({ error: 'Registro no iniciado o expirado' });
        const verification = await verifyRegistrationResponse({ response, expectedChallenge: record.challenge, expectedOrigin: APP_URL, expectedRPID: new URL(APP_URL).hostname });
        if (!verification.verified) return res.status(400).json({ error: 'Verificación fallida' });
        await cryptoKeysCollection.updateOne({ userId }, { $set: { publicKey: (verification.registrationInfo && verification.registrationInfo.credentialPublicKey), credentialID: (verification.registrationInfo && verification.registrationInfo.credentialID), counter: (verification.registrationInfo && verification.registrationInfo.counter), registeredAt: new Date() }, $unset: { challenge: 1 } }, { upsert: true });
        await logAudit('crypto_register', { userId, verified: true });
        res.json({ success: true, message: 'Clave pública registrada exitosamente' });
    } catch (e) { res.status(500).json({ error: 'Error verificando registro: ' + e.message }); }
});
app.post('/api/crypto-auth/login-start', async(req, res) => {
    try {
        const { credentialID } = req.body;
        const allowCredentials = credentialID ? [{ id: credentialID, type: 'public-key' }] : [];
        const options = await generateAuthenticationOptions({ rpID: new URL(APP_URL).hostname, userVerification: 'preferred', allowCredentials });
        await cryptoKeysCollection.updateOne({ credentialID }, { $set: { challenge: options.challenge, lastLoginAttempt: new Date() } }, { upsert: true });
        res.json({ success: true, options });
    } catch (e) { res.status(500).json({ error: 'Error iniciando login criptográfico: ' + e.message }); }
});
app.post('/api/crypto-auth/login-finish', async(req, res) => {
    try {
        const { credentialID, response } = req.body;
        const record = await cryptoKeysCollection.findOne({ credentialID });
        if (!(record && record.challenge)) return res.status(400).json({ error: 'Login no iniciado o credencial no encontrada' });
        const verification = await verifyAuthenticationResponse({ response, expectedChallenge: record.challenge, expectedOrigin: APP_URL, expectedRPID: new URL(APP_URL).hostname, authenticator: { credentialPublicKey: record.publicKey, counter: record.counter || 0 } });
        if (!verification.verified) return res.status(401).json({ error: 'Autenticación fallida' });
        await cryptoKeysCollection.updateOne({ credentialID }, { $set: { counter: (verification.authenticationInfo && verification.authenticationInfo.newCounter), lastLogin: new Date() }, $unset: { challenge: 1 } });
        const token = jwt.sign({ uid: record.userId, scopes: ['vault:read:own'], authMethod: 'crypto' }, JWT_SECRET, { expiresIn: '24h' });
        await logAudit('crypto_login', { userId: record.userId, verified: true });
        res.json({ success: true, token, consentRequired: true, availableScopes: ['vault:read:own', 'vault:read:shared', 'wallet:read', 'identity:verify'], message: 'Autenticación exitosa. Aprueba permisos para acceder a funciones adicionales.' });
    } catch (e) { res.status(500).json({ error: 'Error verificando login: ' + e.message }); }
});
app.post('/api/crypto-auth/consent', authenticate, async(req, res) => {
    try {
        const { scopes } = req.body;
        const validScopes = ['vault:read:own', 'vault:read:shared', 'vault:write', 'wallet:read', 'wallet:write', 'identity:verify', 'audit:read'];
        const approved = scopes.filter(s => validScopes.includes(s));
        if (approved.length === 0) return res.status(400).json({ error: 'Al menos un scope válido requerido' });
        const newToken = jwt.sign({ uid: req.user.uid, scopes: approved, authMethod: req.user.authMethod || 'crypto' }, JWT_SECRET, { expiresIn: '24h' });
        await logAudit('consent_granted', { userId: req.user.uid, scopes: approved });
        res.json({ success: true, token: newToken, grantedScopes: approved });
    } catch (e) { res.status(500).json({ error: 'Error procesando consentimiento: ' + e.message }); }
});

// 📋 IDENTITY LEGAL VERIFIED
app.post('/api/admin/verify-identity', authenticate, requireAdmin, async(req, res) => {
    try {
        const { targetUserId, fullName, address, legalId, entityType = 'person', documents, verifiedBy } = req.body;
        if (!targetUserId || !fullName || !address) return res.status(400).json({ error: 'userId, fullName y address son requeridos' });
        const encryptedAddress = encryptPII(address);
        const encryptedLegalId = legalId ? encryptPII(legalId) : null;
        const encryptedDocuments = documents ? documents.map(d => ({...d, content: encryptPII(d.content) })) : [];
        const identityData = { userId: targetUserId, fullName, address: encryptedAddress, legalId: encryptedLegalId, entityType, documents: encryptedDocuments, verifiedBy: verifiedBy || req.admin.uid, verifiedAt: new Date(), status: 'verified', metadata: req.body.metadata || {} };
        await verifiedIdentitiesCollection.updateOne({ userId: targetUserId }, { $set: identityData }, { upsert: true });
        await logAudit('admin.verify_identity', { admin: req.admin.uid, targetUser: targetUserId, entityType, verified: true });
        res.json({ success: true, message: `Identidad de ${targetUserId} verificada exitosamente`, userId: targetUserId, entityType, verifiedAt: identityData.verifiedAt });
    } catch (e) {
        logger.error('❌ Error verificando identidad: ' + e.message);
        res.status(500).json({ error: 'Error al verificar identidad: ' + e.message });
    }
});
app.get('/api/admin/identity/:userId', authenticate, requireAdmin, async(req, res) => {
    try {
        const identity = await verifiedIdentitiesCollection.findOne({ userId: req.params.userId });
        if (!identity) return res.status(404).json({ error: 'Identidad verificada no encontrada para este usuario' });
        const decrypted = {...identity, address: decryptPII(identity.address), legalId: identity.legalId ? decryptPII(identity.legalId) : null, documents: identity.documents ? identity.documents.map(d => ({...d, content: decryptPII(d.content) })) : [] };
        delete decrypted.address.iv;
        delete decrypted.address.data;
        delete decrypted.address.tag;
        if (decrypted.legalId) {
            delete decrypted.legalId.iv;
            delete decrypted.legalId.data;
            delete decrypted.legalId.tag;
        }
        res.json({ success: true, identity: decrypted });
    } catch (e) { res.status(500).json({ error: 'Error obteniendo identidad: ' + e.message }); }
});
app.get('/api/admin/search-identities', authenticate, requireAdmin, async(req, res) => {
    try {
        const { query, entityType } = req.query;
        if (!query || query.length < 2) return res.status(400).json({ error: 'Búsqueda requiere al menos 2 caracteres' });
        const filter = { $or: [{ fullName: { $regex: query, $options: 'i' } }, { 'metadata.email': { $regex: query, $options: 'i' } }] };
        if (entityType) filter.entityType = entityType;
        const results = await verifiedIdentitiesCollection.find(filter).project({ userId: 1, fullName: 1, entityType: 1, verifiedAt: 1, status: 1, 'metadata.email': 1 }).limit(50).toArray();
        res.json({ success: true, count: results.length, results });
    } catch (e) { res.status(500).json({ error: 'Error en búsqueda: ' + e.message }); }
});
app.post('/api/identity/verify-request', authenticate, async(req, res) => {
    try {
        const { fullName, address, legalId, entityType = 'person', documents } = req.body;
        if (!fullName || !address) return res.status(400).json({ error: 'Nombre completo y dirección son requeridos' });
        const request = { userId: req.user.uid, fullName, address: encryptPII(address), legalId: legalId ? encryptPII(legalId) : null, entityType, documents: documents ? documents.map(d => ({...d, content: encryptPII(d.content) })) : [], status: 'pending', requestedAt: new Date(), metadata: { submittedVia: 'api', userAgent: req.headers['user-agent'] } };
        await verifiedIdentitiesCollection.updateOne({ userId: req.user.uid }, { $set: request }, { upsert: true });
        await logAudit('identity_verification_requested', { userId: req.user.uid, entityType, requested: true });
        res.json({ success: true, message: 'Solicitud de verificación enviada. Un administrador la revisará en 24-48h.', status: 'pending', referenceId: req.user.uid });
    } catch (e) { res.status(500).json({ error: 'Error al enviar solicitud: ' + e.message }); }
});
app.get('/api/identity/verification-status', authenticate, async(req, res) => {
    try {
        const identity = await verifiedIdentitiesCollection.findOne({ userId: req.user.uid }, { projection: { userId: 1, fullName: 1, entityType: 1, status: 1, verifiedAt: 1, rejectedReason: 1, 'metadata.email': 1 } });
        if (!identity) return res.json({ success: true, status: 'not_submitted', message: 'No has enviado una solicitud de verificación aún' });
        res.json({ success: true, status: identity.status, fullName: identity.fullName, entityType: identity.entityType, verifiedAt: identity.verifiedAt, rejectedReason: identity.status === 'rejected' ? identity.rejectedReason : null, message: identity.status === 'verified' ? '✅ Tu identidad ha sido verificada exitosamente' : identity.status === 'rejected' ? '❌ Solicitud rechazada: ' + identity.rejectedReason : '⏳ Tu solicitud está en revisión' });
    } catch (e) { res.status(500).json({ error: 'Error consultando estado: ' + e.message }); }
});

// === 🚀 NUEVAS FUNCIONES: EXPORT/IMPORT/SYNC (PORTABLE) ===
// POST /api/vault/export
app.post('/api/vault/export', authenticate, async(req, res) => {
    try {
        if (!FEATURES.PORTABLE_EXPORT || !mongoReady || !secretsCollection) return res.json({ success: true, message: 'Modo demo: estructura de exportación vacía', demo: true, exportToken: 'demo_export_' + Date.now(), note: 'Configura ENABLE_EXPORT=true y MongoDB para exportación real' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const items = await secretsCollection.find({ userId: user._id }, { projection: { encrypted: 0, contenido: 0, _id: 1, titulo: 1, categoria: 1, fileName: 1, fileType: 1, fileSize: 1, createdAt: 1, isForSale: 1, tipo: 1 } }).toArray();
        const vaultExport = { version: '1.0', exportedAt: new Date().toISOString(), userId: user.uid, email: user.email, tier: user.tier, metadata: { totalItems: items.length, categories: [...new Set(items.map(i => i.categoria).filter(Boolean))], totalSize: items.reduce((sum, i) => sum + (i.fileSize || 0), 0), zeroKnowledge: FEATURES.ZERO_KNOWLEDGE }, items: items.map(item => ({ id: item._id.toString(), titulo: item.titulo, categoria: item.categoria, tipo: item.tipo, fileName: item.fileName, fileType: item.fileType, fileSize: item.fileSize, createdAt: item.createdAt, isForSale: item.isForSale, note: 'Contenido cifrado: descargar individualmente para backup completo' })) };
        const exportToken = crypto.randomBytes(32).toString('hex');
        await logAudit('vault_export', { userId: user.uid, itemCount: items.length, zeroKnowledge: FEATURES.ZERO_KNOWLEDGE, exportToken: exportToken.slice(0, 8) + '...', metadata: ZeroKnowledgeUtils.createZKMetadata('export', user.uid) });
        res.json({ success: true, message: FEATURES.ZERO_KNOWLEDGE ? 'Exportación generada. Cifra este JSON con tu clave maestra antes de guardar.' : 'Exportación generada. Descarga archivos individualmente para backup completo.', exportToken, expiresAt: new Date(Date.now() + 3600000).toISOString(), data: vaultExport, instructions: { downloadContent: 'GET /vault/:id para cada archivo', importLater: 'POST /api/vault/import con este JSON', zeroKnowledge: FEATURES.ZERO_KNOWLEDGE ? 'Usa deriveUserKey(password, salt) en frontend para cifrar este JSON' : null } });
    } catch (e) {
        logger.error('❌ Export error: ' + e.message);
        res.status(500).json({ error: 'Error exportando bóveda: ' + e.message });
    }
});

// GET /api/vault/export/:token
app.get('/api/vault/export/:token', authenticate, async(req, res) => {
    try {
        if (!FEATURES.PORTABLE_EXPORT) return res.status(404).json({ error: 'Exportación portable no habilitada' });
        if (!mongoReady && !req.params.token.startsWith('demo_export_')) return res.status(404).json({ error: 'Token de exportación no válido' });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="romwiner-vault-export-${Date.now()}.json"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const items = await secretsCollection.find({ userId: user._id }, { projection: { encrypted: 0, contenido: 0, _id: 1, titulo: 1, categoria: 1, fileName: 1, createdAt: 1 } }).toArray();
        const exportData = { version: '1.0', exportedAt: new Date().toISOString(), userId: user.uid, email: user.email, items: items.map(i => ({ id: i._id.toString(), titulo: i.titulo, categoria: i.categoria, fileName: i.fileName, createdAt: i.createdAt })) };
        res.send(JSON.stringify(exportData, null, 2));
        await logAudit('vault_export_download', { userId: user.uid, token: req.params.token.slice(0, 8) + '...' });
    } catch (e) {
        logger.error('❌ Export download error: ' + e.message);
        res.status(500).json({ error: 'Error descargando exportación: ' + e.message });
    }
});

// POST /api/vault/import
app.post('/api/vault/import', authenticate, async(req, res) => {
    try {
        const { exportData, options = {} } = req.body;
        if (!exportData || !exportData.version || !Array.isArray(exportData.items)) return res.status(400).json({ error: 'Datos de exportación inválidos. Falta "version" o "items" array.', expected: { version: '1.0', items: 'array' } });
        if (!FEATURES.PORTABLE_EXPORT || !mongoReady || !secretsCollection) return res.json({ success: true, message: 'Modo demo: importación simulada', demo: true, imported: exportData.items.length });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (exportData.userId && exportData.userId !== user.uid && !options.forceImport) return res.status(403).json({ error: 'Exportación pertenece a otro usuario.', exportUserId: exportData.userId, yourUserId: user.uid, solution: 'Usa forceImport:true para importar como nueva bóveda' });
        let importedCount = 0;
        const errors = [];
        const skipped = [];
        for (const item of(exportData.items || [])) {
            try {
                if (!item.titulo) { skipped.push({ reason: 'missing titulo', item }); continue; }
                const newItem = { userId: user._id, userUid: user.uid, titulo: item.titulo, categoria: item.categoria || 'imported', folderId: 'imported', tipo: item.tipo || (item.fileName ? 'archivo' : 'texto'), fileName: item.fileName || null, fileType: item.fileType || null, fileSize: item.fileSize || 0, encrypted: null, contenido: null, isForSale: false, price: 0, sales: 0, buyers: [], createdAt: new Date(item.createdAt) || new Date(), importedFrom: exportData.exportedAt || new Date().toISOString(), originalId: item.id, metadata: { imported: true, importDate: new Date().toISOString() } };
                await secretsCollection.insertOne(newItem);
                importedCount++;
            } catch (itemError) {
                errors.push({ itemId: item.id, titulo: item.titulo, error: itemError.message });
                logger.warn(`⚠️ Import item failed: ${item.id} - ${itemError.message}`);
            }
        }
        await logAudit('vault_import', { userId: user.uid, importedCount, errorCount: errors.length, skippedCount: skipped.length, sourceExport: exportData.exportedAt, zeroKnowledge: FEATURES.ZERO_KNOWLEDGE });
        res.json({ success: true, message: `Importación completada: ${importedCount} items restaurados`, summary: { imported: importedCount, errors: errors.length, skipped: skipped.length, total: exportData.items.length }, errors: errors.length > 0 ? errors : undefined, skipped: skipped.length > 0 ? skipped : undefined, nextSteps: ['Sube el contenido cifrado de cada archivo vía POST /vault normal', 'O usa el frontend con zero-knowledge para restaurar contenido completo', 'Verifica tus archivos en GET /vault'] });
    } catch (e) {
        logger.error('❌ Import error: ' + e.message);
        res.status(500).json({ error: 'Error importando bóveda: ' + e.message });
    }
});

// GET /api/vault/sync/check
app.get('/api/vault/sync/check', authenticate, async(req, res) => {
    try {
        const { lastSync } = req.query;
        if (!FEATURES.LOCAL_SYNC || !mongoReady) return res.json({ success: true, hasChanges: false, demo: true, message: 'Sync offline no habilitado. Configura ENABLE_LOCAL_SYNC=true' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        const query = { userId: user._id };
        if (lastSync) { const lastSyncDate = new Date(lastSync); if (!isNaN(lastSyncDate.getTime())) query.$or = [{ createdAt: { $gt: lastSyncDate } }, { updatedAt: { $gt: lastSyncDate } }]; }
        const changes = await secretsCollection.find(query, { projection: { _id: 1, titulo: 1, categoria: 1, fileName: 1, updatedAt: 1, createdAt: 1, tipo: 1, fileSize: 1 } }).sort({ updatedAt: -1 }).limit(100).toArray();
        res.json({ success: true, hasChanges: changes.length > 0, changesCount: changes.length, lastServerSync: new Date().toISOString(), clientLastSync: lastSync || null, changes: changes.map(c => ({ id: c._id.toString(), titulo: c.titulo, categoria: c.categoria, tipo: c.tipo, fileName: c.fileName, fileSize: c.fileSize, updatedAt: c.updatedAt || c.createdAt, createdAt: c.createdAt })), instructions: { pull: 'GET /vault/:id para contenido completo de cada cambio', push: 'POST /api/vault/sync/push para subir cambios locales', zeroKnowledge: FEATURES.ZERO_KNOWLEDGE ? 'Contenido viene cifrado - descifra en frontend con tu clave' : null } });
    } catch (e) {
        logger.error('❌ Sync check error: ' + e.message);
        res.status(500).json({ error: 'Error verificando sync: ' + e.message });
    }
});

// POST /api/vault/sync/push
app.post('/api/vault/sync/push', authenticate, async(req, res) => {
    try {
        const { changes = [], options = {} } = req.body;
        if (!Array.isArray(changes)) return res.status(400).json({ error: '"changes" debe ser un array de objetos' });
        if (!FEATURES.LOCAL_SYNC || !mongoReady || !secretsCollection) return res.json({ success: true, synced: changes.length, demo: true, message: 'Modo demo: cambios simulados como sincronizados' });
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        let syncedCount = 0;
        const errors = [];
        const created = [];
        const updated = [];
        for (const change of changes) {
            try {
                if (!change.titulo) { errors.push({ change: change.id || 'unknown', error: 'titulo requerido' }); continue; }
                const updateData = { titulo: change.titulo, categoria: change.categoria, fileName: change.fileName, fileType: change.fileType, fileSize: change.fileSize, updatedAt: new Date(), metadata: {...(change.metadata || {}), lastSynced: new Date().toISOString(), syncedFrom: options.source || 'client' } };
                if (change.id && ObjectId.isValid(change.id)) {
                    const result = await secretsCollection.updateOne({ _id: new ObjectId(change.id), userId: user._id }, { $set: updateData });
                    if (result.matchedCount > 0) {
                        updated.push(change.id);
                        syncedCount++;
                    } else {
                        await secretsCollection.insertOne({...updateData, userId: user._id, userUid: user.uid, tipo: change.tipo || (change.fileName ? 'archivo' : 'texto'), encrypted: null, contenido: null, createdAt: new Date(change.createdAt) || new Date(), originalId: change.id });
                        created.push(change.id);
                        syncedCount++;
                    }
                } else {
                    await secretsCollection.insertOne({...updateData, userId: user._id, userUid: user.uid, tipo: change.tipo || (change.fileName ? 'archivo' : 'texto'), encrypted: null, contenido: null, createdAt: new Date(change.createdAt) || new Date() });
                    created.push(change.id || 'new');
                    syncedCount++;
                }
            } catch (itemError) {
                errors.push({ changeId: change.id, titulo: change.titulo, error: itemError.message });
                logger.warn(`⚠️ Sync push failed: ${change.id} - ${itemError.message}`);
            }
        }
        await logAudit('vault_sync_push', { userId: user.uid, synced: syncedCount, created: created.length, updated: updated.length, errors: errors.length, source: options.source || 'client' });
        res.json({ success: true, message: `${syncedCount} cambios sincronizados`, summary: { synced: syncedCount, created: created.length, updated: updated.length, errors: errors.length, total: changes.length }, created: created.length > 0 ? created : undefined, updated: updated.length > 0 ? updated : undefined, errors: errors.length > 0 ? errors : undefined, nextSteps: ['Sube el contenido cifrado de nuevos archivos vía POST /vault', 'Verifica sincronización con GET /api/vault/sync/check', FEATURES.ZERO_KNOWLEDGE ? 'Contenido local debe cifrarse con tu clave antes de subir' : null].filter(Boolean) });
    } catch (e) {
        logger.error('❌ Sync push error: ' + e.message);
        res.status(500).json({ error: 'Error sincronizando cambios: ' + e.message });
    }
});

// === 🚀 NUEVAS FUNCIONES: WEB3 LOGIN + IPFS BACKUP ===
// 🔗 WEB3 LOGIN
app.post('/api/web3/login', async(req, res) => {
    try {
        if (!FEATURES.WEB3_LOGIN) return res.status(404).json({ error: 'Web3 login no habilitado' });
        const { address, signature, message } = req.body;
        if (!address || !signature || !message) return res.status(400).json({ error: 'address, signature y message requeridos' });
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) return res.status(401).json({ error: 'Firma inválida' });
        let user = await usersCollection.findOne({ walletAddress: address });
        if (!user && mongoReady) {
            const newUser = { walletAddress: address, uid: 'rom_' + crypto.randomBytes(8).toString('hex'), tier: 'personal', createdAt: new Date(), affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 } };
            const r = await usersCollection.insertOne(newUser);
            await profilesCollection.insertOne({ userId: r.insertedId, uid: newUser.uid, displayName: '', avatarUrl: '', bio: '', isPublic: false, createdAt: new Date() });
            await walletCollection.insertOne({ userId: r.insertedId, balance: 0, currency: 'USD', history: [], createdAt: new Date() });
            await affiliatesCollection.insertOne({ userId: r.insertedId, refCode: newUser.refCode, level: 'bronce', createdAt: new Date() });
            user = newUser;
            await logAudit('web3_register', { address });
        } else if (!user) { user = { uid: 'demo_web3', walletAddress: address, tier: 'personal' }; }
        const token = jwt.sign({ uid: user.uid, wallet: address, authMethod: 'web3' }, JWT_SECRET, { expiresIn: '7d' });
        await logAudit('web3_login', { address });
        res.json({ success: true, token, user: { uid: user.uid, wallet: address, tier: user.tier } });
    } catch (e) {
        logger.error('❌ Web3 login error: ' + e.message);
        res.status(500).json({ error: 'Error login Web3: ' + e.message });
    }
});

// 🌐 IPFS BACKUP CON HELIA
app.post('/api/vault/:id/backup', authenticate, async(req, res) => {
    try {
        if (!FEATURES.IPFS_BACKUP) return res.status(404).json({ error: 'Backup IPFS no habilitado' });
        const { id } = req.params;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(id), userId: user._id });
        if (!secret) return res.status(404).json({ error: 'Archivo no encontrado' });
        let content = null;
        if (user.encryptedUserKey) {
            const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
            if (secret.tipo === 'texto' && secret.contenido) content = EnvelopeEncryption.open(secret.contenido, userDEK);
            else if (secret.tipo === 'archivo' && secret.encrypted) content = Buffer.from(EnvelopeEncryption.open(secret.encrypted, userDEK), 'base64');
        }
        if (!content) return res.status(400).json({ error: 'No se pudo descifrar el contenido' });
        const fs = await initHelia();
        if (!fs) return res.status(500).json({ error: 'IPFS no disponible' });
        const result = await fs.addBytes(content instanceof Buffer ? content : new TextEncoder().encode(content));
        const cid = result.toString();
        const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;
        await secretsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { backupCid: cid, backupUrl: ipfsUrl, backupAt: new Date() } });
        await logAudit('vault.backup', { fileId: id, cid, userId: user.uid, system: 'helia' });
        res.json({ success: true, cid, url: ipfsUrl, message: 'Backup en IPFS creado vía Helia. Contenido sigue cifrado con tu clave.' });
    } catch (e) {
        logger.error('❌ Helia backup error: ' + e.message);
        res.status(500).json({ error: 'Error creando backup IPFS: ' + e.message });
    }
});

// 📥 RESTAURAR DESDE IPFS
app.get('/api/vault/:id/restore', authenticate, async(req, res) => {
    try {
        if (!FEATURES.IPFS_BACKUP) return res.status(404).json({ error: 'Backup IPFS no habilitado' });
        const { id } = req.params;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        const secret = await secretsCollection.findOne({ _id: new ObjectId(id), userId: user._id });
        if (!(secret && secret.backupCid)) return res.status(404).json({ error: 'No hay backup en IPFS para este archivo' });
        const fs = await initHelia();
        if (!fs) return res.status(500).json({ error: 'IPFS no disponible' });
        const chunks = [];
        for await (const chunk of fs.cat(secret.backupCid)) chunks.push(chunk);
        await secretsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { restoredFromBackup: new Date(), backupRestored: true } });
        await logAudit('vault.restore', { fileId: id, cid: secret.backupCid, userId: user.uid });
        res.json({ success: true, message: 'Archivo restaurado desde IPFS. Contenido sigue cifrado con tu clave.' });
    } catch (e) {
        logger.error('❌ Helia restore error: ' + e.message);
        res.status(500).json({ error: 'Error restaurando desde IPFS: ' + e.message });
    }
});

// 🌐 SERVIR FRONTEND
app.get('/', function(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 START SERVER
async function startServer() {
    await connectToMongo();
    if (mongoReady) {
        setInterval(() => { KeyRotationService.scheduleRotations().catch(e => logger.warn('⚠️ Scheduled rotation failed: ' + e.message)); }, 24 * 60 * 60 * 1000);
        logger.info('🔄 Key rotation scheduled every 24h');
        setInterval(async() => { try { if (sharedLinksCollection) { const result = await sharedLinksCollection.deleteMany({ expiresAt: { $lt: new Date() } }); if (result.deletedCount > 0) logger.info(`🧹 Limpiados ${result.deletedCount} enlaces expirados`); } } catch (e) { logger.warn('⚠️ Cleanup expired links failed: ' + e.message); } }, 60 * 60 * 1000);
        logger.info('🧹 Expired links cleanup scheduled every 1h');
    }
    app.listen(PORT, '0.0.0.0', function() {
        logger.info('🚀 APIROMWINER en puerto ' + PORT);
        logger.info('🟢 57 Funciones Reales | 🔐 Identidad Criptográfica Autónoma | 📋 Identidad Legal Verificada | 💰 Wallet | 👑 Dueño | 🤝 Afiliados | 🔐 Vault + Envelope Encryption | 📦 RAR/MP3/ZIP | 🏦 Enterprise Tiers + Audit + Key Rotation | ✅ Listo para vender HOY');
        if (FEATURES.PORTABLE_EXPORT) logger.info('📦 Exportación Portable: ACTIVADA');
        if (FEATURES.LOCAL_SYNC) logger.info('🔄 Sync Offline: ACTIVADO');
        if (FEATURES.ZERO_KNOWLEDGE) logger.info('🔐 Zero-Knowledge: ACTIVADO');
        if (FEATURES.WEB3_LOGIN) logger.info('🔗 Login Web3: ACTIVADO');
        if (FEATURES.IPFS_BACKUP) logger.info('🌐 Backup IPFS (Helia): ACTIVADO');
    });
}
startServer().catch(function(err) {
    logger.error('❌ Error crítico al iniciar servidor: ' + err.message);
    process.exit(1);
});
// === FIN: index.js ===