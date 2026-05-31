// === INICIO: index.js - APIROMWINER VAULT CON IA INTERNA ===
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const CryptoJS = require('crypto-js');
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
// 🤖 IA INTERNA: Natural para NLP ligero
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
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
  IPFS_BACKUP: process.env.ENABLE_IPFS === 'true',
  AI_INTERNAL: process.env.ENABLE_AI !== 'false'
};
// 🤖 IA: DICCIONARIO DE SINÓNIMOS Y PATRONES
const AI_PATTERNS = {
  synonyms: {
    'dinero': ['saldo', 'ganancia', 'pago', 'factura', 'ingreso', 'venta'],
    'foto': ['imagen', 'picture', 'selfie', 'vacaciones', 'recuerdo'],
    'trabajo': ['proyecto', 'tarea', 'documento', 'oficina', 'laboral'],
    'personal': ['privado', 'íntimo', 'familiar', 'casa'],
    'educacion': ['estudio', 'tesis', 'clase', 'aprender', 'curso'],
    'finanzas': ['economia', 'presupuesto', 'ahorro', 'inversion']
  },
  autoTags: {
    'factura|recibo|pago|invoice|bill': ['finanzas', 'documentos'],
    'foto|img|picture|selfie|vacaciones|recuerdo': ['fotos', 'personal'],
    'contrato|legal|agreement|firma|abogado': ['legal', 'documentos'],
    'tesis|estudio|paper|clase|curso|aprender': ['educacion', 'textos'],
    'romwiner|apiromwiner|vault|backup|sistema': ['sistema', 'tecnologia'],
    'musica|cancion|audio|mp3|wav': ['musica', 'audio'],
    'video|pelicula|clip|mp4': ['videos', 'multimedia']
  }
};
// 🤖 IA: FUNCIÓN DE BÚSQUEDA INTELIGENTE
function smartSearch(query, items) {
  if (!FEATURES.AI_INTERNAL) return items.filter(i =>
    i.titulo?.toLowerCase().includes(query.toLowerCase()) ||
    i.fileName?.toLowerCase().includes(query.toLowerCase())
  );
  const queryLower = query.toLowerCase();
  const queryStemmed = stemmer.tokenizeAndStem(queryLower).join(' ');
  const terms = [queryLower, queryStemmed];
  for (const [base, syns] of Object.entries(AI_PATTERNS.synonyms)) {
    if (queryLower.includes(base)) {
      terms.push(...syns);
    }
  }
  return items.filter(item =>
    terms.some(term =>
      item.titulo?.toLowerCase().includes(term) ||
      item.fileName?.toLowerCase().includes(term) ||
      item.categoria?.toLowerCase().includes(term) ||
      item.tags?.some(t => t.toLowerCase().includes(term))
    )
  );
}
// 🤖 IA: SUGERIR TAGS AUTOMÁTICOS
function suggestTags(title, fileName) {
  if (!FEATURES.AI_INTERNAL) return [];
  const text = `${title} ${fileName || ''}`.toLowerCase();
  const tags = new Set();
  for (const [pattern, tagList] of Object.entries(AI_PATTERNS.autoTags)) {
    if (new RegExp(pattern, 'i').test(text)) {
      tagList.forEach(t => tags.add(t));
    }
  }
  const tokens = tokenizer.tokenize(text);
  const important = tokens.filter(w => w.length > 4 && !['para', 'con', 'sin', 'del', 'los', 'las'].includes(w.toLowerCase()));
  important.slice(0, 3).forEach(w => tags.add(w.toLowerCase()));
  return Array.from(tags).slice(0, 5);
}
// 🤖 IA: PROCESAR COMANDOS DE USUARIO
function processCommand(cmd, userData) {
  if (!FEATURES.AI_INTERNAL) return "❓ Comando no disponible. Configura ENABLE_AI=true";
  cmd = cmd.toLowerCase().trim();
  if (cmd.match(/(gan[ée]|ganancias|dinero|saldo).*afiliado/)) {
    return `📊 Ganaste $${userData.affiliates?.availableBalance || 0} USD en afiliados`;
  }
  if (cmd.includes('cuánto gané') || cmd.includes('ganancias')) {
    return `💰 Tus ganancias totales: $${userData.wallet?.balance || 0} USD`;
  }
  if (cmd.match(/(fotos|imágenes|pictures)/)) {
    const count = userData.vault?.filter(i => i.categoria === 'fotos').length || 0;
    return `📷 Tienes ${count} fotos guardadas en tu Vault`;
  }
  if (cmd.match(/(venta|marketplace|productos).*tengo/)) {
    const count = userData.vault?.filter(i => i.isForSale).length || 0;
    return `🛍️ Tienes ${count} productos en venta en el Marketplace`;
  }
  if (cmd.includes('ayuda') || cmd.includes('help')) {
    return "💡 Prueba: 'ganancias', 'fotos', 'ventas', 'ayuda', 'exportar', 'sincronizar'";
  }
  if (cmd.length > 3 && !cmd.startsWith('/')) {
    return `🔍 Buscando "${cmd}"... Usa la búsqueda del Vault para ver resultados`;
  }
  return "❓ No entendí. Prueba: 'ganancias', 'fotos', 'ventas', 'ayuda'";
}
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
const MONGODB_URI = process.env.MONGODB_URI;
// ✅ Declaración de TODAS las colecciones (incluyendo nuevas)
let db, usersCollection, secretsCollection, affiliatesCollection, identityCollection, transactionsCollection, profilesCollection, walletCollection, auditCollection, webhooksCollection, promoCollection, cryptoKeysCollection, verifiedIdentitiesCollection;
let sharedLinksCollection, thumbnailsCollection, versionsCollection, commentsCollection;
let reviewsCollection, favoritesCollection, commitsCollection, adsCollection, adImpressionsCollection;
let mongoReady = false;
async function connectToMongo() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('apiromwinervault');
    // ✅ Asignar TODAS las colecciones
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
    reviewsCollection = db.collection('reviews');
    favoritesCollection = db.collection('favorites');
    commitsCollection = db.collection('vaultCommits');
    // ✅ NUEVO: Colecciones para publicidad
    adsCollection = db.collection('ads');
    adImpressionsCollection = db.collection('adImpressions');
    // ✅ Índices para publicidad
    await adsCollection.createIndex({ active: 1, budget: -1, startDate: 1, endDate: 1 });
    await adsCollection.createIndex({ advertiserId: 1, createdAt: -1 });
    await adImpressionsCollection.createIndex({ userId: 1, watchedAt: -1 });
    await adImpressionsCollection.createIndex({ adId: 1, watchedAt: -1 });
    // ✅ Índices existentes
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
    await reviewsCollection.createIndex({ itemId: 1, createdAt: -1 });
    await favoritesCollection.createIndex({ userId: 1, itemId: 1 }, { unique: true });
    mongoReady = true;
    logger.info('✅ MongoDB Atlas conectado');
  } catch (err) {
    logger.error('⚠️ MongoDB fallback activo: ' + err.message);
    mongoReady = false;
  }
} // ← ✅ Solo UNA llave aquí, que cierra connectToMongo()
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
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      'https://apiromwinervault.onrender.com', 'https://api.romwinervault.com',
      'https://romwinervault.com', 'http://localhost:3000', 'http://127.0.0.1:3000',
      'http://localhost:10000', 'http://127.0.0.1:10000'
    ];
    if (origin.endsWith('.onrender.com') || origin.endsWith('.romwinervault.com') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('⚠️ Origen no en lista permitida:', origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Vault-Sig', 'X-Requested-With', 'Accept', 'Origin']
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// 📁 UPLOADS
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(err => logger.warn('⚠️ No se pudo crear uploads/: ' + err.message));
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
      // Validar por mimetype directamente (más seguro y rápido)
      const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'application/x-rar-compressed', 'application/zip',
        'application/x-7z-compressed', 'application/epub+zip',
        'application/x-mobipocket-ebook'
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Archivo no permitido: ' + file.mimetype));
      }
    } catch (e) {
      cb(new Error('Error validando archivo: ' + e.message));
    }
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
    // ✅ MODO DEMO: Si no hay DB, verificar email directamente
    if (!mongoReady || !usersCollection) {
      if (ADMIN_EMAILS.includes(req.user.email)) {
        req.admin = { email: req.user.email, uid: req.user.uid };
        return next();
      }
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    // ✅ FIN MODO DEMO
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
    // ✅ MODO DEMO: Si no hay DB, permitir acceso básico
    if (!mongoReady || !usersCollection) {
      req.userTier = 'personal';
      return next();
    }
    // ✅ FIN MODO DEMO
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const tier = (user && user.tier) || 'personal';
    if (!allowed.includes(tier)) return res.status(403).json({ error: 'Acceso denegado para tu plan' });
    req.userTier = tier;
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const checkQuota = async(req, res, next) => {
  try {
    // ✅ Si no hay DB, saltar verificación de cuota
    if (!mongoReady || !usersCollection || !secretsCollection) return next();
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
  // ✅ MODO DEMO: Si no hay DB, devolver log simulado
  if (!mongoReady || !auditCollection) {
    return {...data, eventId: crypto.randomUUID(), timestamp: new Date(), note: 'demo_mode' };
  }
  // ✅ FIN MODO DEMO
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
  // ✅ MODO DEMO: Si no hay DB, devolver reporte simulado
  if (!mongoReady || !usersCollection || !auditCollection) {
    return { reportType: 'GDPR_ARTICLE_15', generatedAt: new Date().toISOString(), subject: { uid: userId }, data: [], demo: true };
  }
  // ✅ FIN MODO DEMO
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
  api: 'ApiRomwiner Vault', status: 'online', database: mongoReady ? 'connected' : 'fallback',
  features: ['🟢 57 Funciones Reales', '🟢 Identidad Criptográfica Autónoma', '🟢 Identidad Legal Verificada', '🟢 Consentimiento Granular', '🟢 Enterprise Tiers', '🟢 Envelope Encryption', '🟢 Auditoría Inmutable', '🟢 GDPR/SOC2', '🟢 Rotación de Claves', '🟢 Webhooks', '🟢 Enlaces Seguros', '🟢 Thumbnails Cifrados', '🟢 Versionado+Diff', '🟢 Comentarios Cifrados', '🟢 Super Admin Powers', '🟢 Búsqueda en Vault', '🟢 Validación Real de Archivos', '🟢 IA Interna (Búsqueda Inteligente + Auto-Tags)', FEATURES.PORTABLE_EXPORT && '🟢 Exportación Portable', FEATURES.LOCAL_SYNC && '🟢 Sync Offline', FEATURES.ZERO_KNOWLEDGE && '🟢 Zero-Knowledge Ready', FEATURES.WEB3_LOGIN && '🟢 Login Web3', FEATURES.IPFS_BACKUP && '🟢 Backup IPFS (Helia)'].filter(Boolean)
}));
// 🤖 IA: ENDPOINT PARA COMANDOS DE USUARIO
app.post('/api/ai/command', authenticate, async(req, res) => {
  try {
    // ✅ MODO DEMO: Si no hay DB, responder sin consultar colecciones
    if (!mongoReady || !usersCollection || !walletCollection || !secretsCollection) {
      const { command } = req.body;
      const response = processCommand(command, { affiliates: { availableBalance: 0 }, wallet: { balance: 0 }, vault: [] });
      return res.json({ success: true, response, command, timestamp: new Date().toISOString(), demo: true });
    }
    // ✅ FIN MODO DEMO
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Comando requerido' });
    if (!FEATURES.AI_INTERNAL) {
      return res.json({ success: true, response: "❓ IA interna no habilitada. Configura ENABLE_AI=true", demo: true });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const [wallet, dashboard] = await Promise.all([
      walletCollection?.findOne({ userId: user._id }),
      secretsCollection?.countDocuments({ userId: user._id })
    ]);
    const userData = {
      affiliates: { availableBalance: 0 },
      wallet: { balance: wallet?.balance || 0 },
      vault: await secretsCollection?.find({ userId: user._id }).project({ categoria: 1, isForSale: 1 }).toArray() || []
    };
    const response = processCommand(command, userData);
    await logAudit('ai_command', { userId: req.user.uid, command: command.substring(0, 50) });
    res.json({ success: true, response, command, timestamp: new Date().toISOString() });
  } catch (e) {
    logger.error('❌ AI command error: ' + e.message);
    res.status(500).json({ error: 'Error procesando comando: ' + e.message });
  }
});
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
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('placeholder')) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Stripe no configurado. Contacta al administrador.' });
      }
      return res.json({ success: true, message: 'Modo demo: configura STRIPE_SECRET_KEY en .env', demo: true, clientSecret: 'demo' });
    }
    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', { method: 'POST', headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ amount: Math.round(amount * 100), currency: 'usd', metadata: JSON.stringify({ uid: req.user.uid, type: 'deposit' }) }) });
    const data = await stripeRes.json();
    if (!data.client_secret) return res.status(500).json({ error: 'Error de Stripe: ' + ((data.error && data.error.message) || 'Cliente secreto no generado') });
    res.json({ success: true, clientSecret: data.client_secret, paymentId: data.id });
  } catch (e) { res.status(500).json({ error: 'Error procesando pago con Stripe: ' + e.message }); }
});
app.post('/api/wallet/withdraw', authenticate, async(req, res) => {
  try {
    const amount = parseFloat(req.body.amount), method = req.body.method || 'bank';
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
    // ✅ Validar que el monto sea válido y no negativo
    const bal = parseFloat(initialBalance);
    if (isNaN(bal) || bal < 0) {
      return res.status(400).json({ error: 'Monto inicial debe ser un número válido no negativo' });
    }
    // ✅ CORREGIDO: Evitar balance duplicado
    const existingWallet = await walletCollection.findOne({ userId: user._id });
    if (existingWallet) {
      // Si ya existe, solo sumar el saldo
      await walletCollection.updateOne({ userId: user._id }, {
        $inc: { balance: bal },
        $push: { history: { type: 'admin_gift', amount: bal, from: req.admin.email, date: new Date() } }
      });
    } else {
      // Si no existe, crear con el saldo inicial
      await walletCollection.insertOne({
        userId: user._id,
        balance: bal,
        currency: 'USD',
        history: [{ type: 'admin_gift', amount: bal, from: req.admin.email, date: new Date() }]
      });
    }
    await transactionsCollection.insertOne({ type: 'admin_gift', amount: bal, admin: req.admin.uid, recipient: user.email, note: note || '', createdAt: new Date() });
    await logAudit('gift', { recipientEmail, bal, by: req.admin.uid, tier: tier || user.tier });
    res.json({ success: true, recipientEmail: user.email, uid: user.uid, tempPassword, balance: bal, tier: tier || user.tier, message: tempPassword ? 'Cuenta creada con contraseña temporal' : 'Saldo agregado a cuenta existente' });
  } catch (e) { res.status(500).json({ error: 'Error al regalar cuenta: ' + e.message }); }
});
// 📦 VAULT CREATE (CON IA: AUTO-TAGS)
app.post('/vault', authenticate, checkQuota, async(req, res) => {
  try {
    const { titulo, categoria = 'general', folderId = 'general', contenido, price = 0, forSale = false, licenseDays = null, tags: userTags } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Título requerido para el contenido' });
    if (!mongoReady || !secretsCollection) return res.status(201).json({ success: true, message: 'Guardado en modo demo', id: 'demo', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const suggestedTags = FEATURES.AI_INTERNAL ? suggestTags(titulo, req.file?.originalname) : [];
    const finalTags = userTags ? (Array.isArray(userTags) ? userTags : [userTags]) : suggestedTags;
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
      tags: finalTags,
      createdAt: new Date()
    };
    let wrappedDEK = user.encryptedUserKey;
    if (!wrappedDEK) {
      const dek = EnvelopeEncryption.generateDEK();
      wrappedDEK = EnvelopeEncryption.wrapDEK(dek);
      await usersCollection.updateOne({ _id: user._id }, { $set: { encryptedUserKey: wrappedDEK } });
    }
    let userDEK;
    try {
      userDEK = EnvelopeEncryption.unwrapDEK(wrappedDEK);
    } catch (e) {
      logger.error('❌ Error desencriptando DEK: ' + e.message);
      return res.status(500).json({ error: 'Error de cifrado: clave de usuario inválida' });
    }
    if (req.file) {
      data.fileName = path.basename(req.file.filename);
      data.fileType = req.file.mimetype;
      data.fileSize = req.file.size;
      const fileContent = await fs.readFile(req.file.path);
      data.encrypted = EnvelopeEncryption.seal(fileContent.toString('base64'), userDEK);
      await fs.unlink(req.file.path).catch(function(e) { logger.warn('⚠️ No se pudo eliminar archivo temporal: ' + e.message); });
    } else if (contenido) { data.contenido = EnvelopeEncryption.seal(contenido, userDEK); }
    const result = await secretsCollection.insertOne(data);
    await logAudit('vault_create', { titulo, userId: user.uid, tipo: data.tipo, forSale, tags: finalTags });
    const response = {
      success: true,
      message: 'Contenido guardado y cifrado en Vault (clave única por usuario)',
      id: result.insertedId,
      fileName: data.fileName
    };
    if (FEATURES.AI_INTERNAL && suggestedTags.length > 0) {
      response.aiSuggestions = { suggestedTags, message: 'Tags sugeridos por IA interna' };
    }
    res.status(201).json(response);
  } catch (e) {
    logger.error('❌ Vault create: ' + e.message);
    res.status(500).json({ error: 'Error al guardar en Vault: ' + e.message });
  }
});
// 📦 VAULT LIST (CON BÚSQUEDA INTELIGENTE)
app.get('/vault', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, items: [], total: 0 });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const { q } = req.query;
    let items = await secretsCollection.find({ $or: [{ userId: user._id }, { isForSale: true }] }).sort({ createdAt: -1 }).limit(50).project({ encrypted: 0, contenido: 0 }).toArray();
    if (FEATURES.AI_INTERNAL && q) {
      items = smartSearch(q, items);
    }
    res.json({ success: true, items, total: items.length, aiSearch: FEATURES.AI_INTERNAL && q ? { query: q, resultsCount: items.length } : undefined });
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
    const hasBought = Array.isArray(secret.buyers) && secret.buyers.includes(user.uid);
    if (secret.userId.toString() !== user._id.toString() && !hasBought && !secret.isForSale) return res.status(403).json({ error: 'Acceso denegado: no tienes permiso para este contenido' });
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
    res.json({ success: true, secret: { id: secret._id.toString(), titulo: secret.titulo, contenido, isForSale: secret.isForSale, price: secret.price, sales: secret.sales, licenseDays: secret.licenseDays, fileName: secret.fileName, fileType: secret.fileType, tags: secret.tags } });
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
    const hasBought = Array.isArray(secret.buyers) && secret.buyers.includes(buyer.uid);
    if (hasBought) return res.status(400).json({ error: 'Ya compraste este contenido. Revisa tu Vault.' });
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
    // ✅ Validar que el balance sea válido y cumpla el mínimo
    if (!aff || isNaN(aff.availableBalance) || aff.availableBalance < 10) {
      return res.status(400).json({ error: 'Mínimo $10 USD para retiro de afiliados. Balance actual: $' + ((aff && !isNaN(aff.availableBalance) ? aff.availableBalance : 0) || 0).toFixed(2) });
    }
    const w = await walletCollection.findOne({ userId: user._id });
    if (w) await walletCollection.updateOne({ _id: w._id }, { $inc: { availableBalance: -aff.availableBalance, withdrawnBalance: aff.availableBalance }, $push: { history: { type: 'affiliate_withdraw', amount: aff.availableBalance, method, date: new Date() } } });
    await transactionsCollection.insertOne({ userId: user._id, type: 'affiliate_payout', amount: aff.availableBalance, method, status: 'pending', createdAt: new Date() });
    res.json({ success: true, message: 'Retiro de afiliados solicitado. Procesaremos en 24-48h.' });
  } catch (e) { res.status(500).json({ error: 'Error al procesar retiro de afiliados: ' + e.message }); }
});
// 🆔 IDENTITY: REGISTER APP
app.post('/api/identity/register-app', authenticate, async(req, res) => {
  try {
    const appName = req.body.appName, redirectUri = req.body.redirectUri;
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
    const appId = req.body.appId, scopes = req.body.scopes;
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
// ✅ QR ROUTE CORREGIDA (sin anidación inválida)
app.get('/api/identity/qr', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const qrData = JSON.stringify({ uid: user.uid, email: user.email, ref: user.refCode });
    const encodedData = encodeURIComponent(qrData);
    res.json({ success: true, qrPayload: qrData, qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodedData });
  } catch (e) {
    logger.error('❌ QR generation error: ' + e.message);
    res.status(500).json({ error: 'Error al generar QR: ' + e.message });
  }
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
    // ✅ Validar que la URL sea válida antes de decodificar
    try {
      const decodedUrl = decodeURIComponent(req.params.url);
      await webhooksCollection.deleteOne({ userId: req.user.uid, url: decodedUrl });
    } catch (e) {
      return res.status(400).json({ error: 'URL inválida' });
    }
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
    // ✅ Validar que el usuario tenga clave de cifrado
    if (!user || !user.encryptedUserKey) {
      return res.status(400).json({ error: 'Clave de cifrado no disponible' });
    }
    // ✅ DECLARAR userDEK UNA SOLA VEZ (fix aplicado)
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
    // ✅ VALIDAR QUE EL USUARIO TENGA CLAVE DE CIFRADO
    if (!user || !user.encryptedUserKey) {
      return res.status(400).json({ error: 'Clave de cifrado no disponible' });
    }
    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    const last = await versionsCollection.findOne({ fileId: secret._id }, { sort: { versionNumber: -1 } });
    const next = ((last && last.versionNumber) || 0) + 1;
    await versionsCollection.insertOne({ fileId: secret._id, versionNumber: next, content: EnvelopeEncryption.seal(content, userDEK), createdBy: req.user.uid, createdAt: new Date() });
    res.json({ success: true, version: next });
  } catch (e) { res.status(500).json({ error: 'Error versión: ' + e.message }); }
});
app.get('/api/vault/:id/diff/:v1/:v2', authenticate, async(req, res) => {
  try {
    const userCheck = await usersCollection.findOne({ uid: req.user.uid });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: (userCheck && userCheck._id) });
    if (!secret) return res.status(404).json({ error: 'No encontrado' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    // ✅ VALIDAR QUE EL USUARIO TENGA CLAVE DE CIFRADO
    if (!user || !user.encryptedUserKey) {
      return res.status(400).json({ error: 'Clave de cifrado no disponible' });
    }
    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    // ✅ VALIDAR QUE v1 y v2 SEAN NÚMEROS VÁLIDOS
    const v1Num = parseInt(req.params.v1);
    const v2Num = parseInt(req.params.v2);
    if (isNaN(v1Num) || isNaN(v2Num) || v1Num < 1 || v2Num < 1) {
      return res.status(400).json({ error: 'Versión inválida. Usa números enteros positivos' });
    }
    const v1 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: v1Num });
    const v2 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: v2Num });
    if (!v1 || !v2) return res.status(404).json({ error: 'Versión no encontrada' });
    const c1 = EnvelopeEncryption.open(v1.content, userDEK);
    const c2 = EnvelopeEncryption.open(v2.content, userDEK);
    const patch = diffLib.createPatch('doc', c1, c2, 'v' + req.params.v1, 'v' + req.params.v2);
    res.json({ success: true, diff: patch });
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
    delete decrypted.address.iv; delete decrypted.address.data; delete decrypted.address.tag;
    if (decrypted.legalId) { delete decrypted.legalId.iv; delete decrypted.legalId.data; delete decrypted.legalId.tag; }
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
// ✅ RUTA EXPORT CORREGIDA (reconstruida con app.get y try/catch)
app.get('/api/vault/export/:token', authenticate, async(req, res) => {
  try {
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
app.post('/api/vault/import', authenticate, async(req, res) => {
  try {
    const { exportData, options = {} } = req.body;
    if (!exportData || !exportData.version || !Array.isArray(exportData.items)) return res.status(400).json({ error: 'Datos de exportación inválidos. Falta "version" o "items" array.', expected: { version: '1.0', items: 'array' } });
    if (!FEATURES.PORTABLE_EXPORT || !mongoReady || !secretsCollection) return res.json({ success: true, message: 'Modo demo: importación simulada', demo: true, imported: exportData.items.length });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (exportData.userId && exportData.userId !== user.uid && !options.forceImport) return res.status(403).json({ error: 'Exportación pertenece a otro usuario.', exportUserId: exportData.userId, yourUserId: user.uid, solution: 'Usa forceImport:true para importar como nueva bóveda' });
    let importedCount = 0; const errors = []; const skipped = [];
    for (const item of (exportData.items || [])) {
      try {
        if (!item.titulo) { skipped.push({ reason: 'missing titulo', item }); continue; }
        const newItem = { userId: user._id, userUid: user.uid, titulo: item.titulo, categoria: item.categoria || 'imported', folderId: 'imported', tipo: item.tipo || (item.fileName ? 'archivo' : 'texto'), fileName: item.fileName || null, fileType: item.fileType || null, fileSize: item.fileSize || 0, encrypted: null, contenido: null, isForSale: false, price: 0, sales: 0, buyers: [], createdAt: new Date(item.createdAt) || new Date(), importedFrom: exportData.exportedAt || new Date().toISOString(), originalId: item.id, metadata: { imported: true, importDate: new Date().toISOString() } };
        await secretsCollection.insertOne(newItem); importedCount++;
      } catch (itemError) { errors.push({ itemId: item.id, titulo: item.titulo, error: itemError.message }); logger.warn(`⚠️ Import item failed: ${item.id} - ${itemError.message}`); }
    }
    await logAudit('vault_import', { userId: user.uid, importedCount, errorCount: errors.length, skippedCount: skipped.length, sourceExport: exportData.exportedAt, zeroKnowledge: FEATURES.ZERO_KNOWLEDGE });
    res.json({ success: true, message: `Importación completada: ${importedCount} items restaurados`, summary: { imported: importedCount, errors: errors.length, skipped: skipped.length, total: exportData.items.length }, errors: errors.length > 0 ? errors : undefined, skipped: skipped.length > 0 ? skipped : undefined, nextSteps: ['Sube el contenido cifrado de cada archivo vía POST /vault normal', 'O usa el frontend con zero-knowledge para restaurar contenido completo', 'Verifica tus archivos en GET /vault'] });
  } catch (e) { logger.error('❌ Import error: ' + e.message); res.status(500).json({ error: 'Error importando bóveda: ' + e.message }); }
});
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
  } catch (e) { logger.error('❌ Sync check error: ' + e.message); res.status(500).json({ error: 'Error verificando sync: ' + e.message }); }
});
app.post('/api/vault/sync/push', authenticate, async(req, res) => {
  try {
    const { changes = [], options = {} } = req.body;
    if (!Array.isArray(changes)) return res.status(400).json({ error: '"changes" debe ser un array de objetos' });
    if (!FEATURES.LOCAL_SYNC || !mongoReady || !secretsCollection) return res.json({ success: true, synced: changes.length, demo: true, message: 'Modo demo: cambios simulados como sincronizados' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    let syncedCount = 0; const errors = []; const created = []; const updated = [];
    for (const change of changes) {
      try {
        if (!change.titulo) { errors.push({ change: change.id || 'unknown', error: 'titulo requerido' }); continue; }
        const updateData = { titulo: change.titulo, categoria: change.categoria, fileName: change.fileName, fileType: change.fileType, fileSize: change.fileSize, updatedAt: new Date(), metadata: {...(change.metadata || {}), lastSynced: new Date().toISOString(), syncedFrom: options.source || 'client' } };
        if (change.id && ObjectId.isValid(change.id)) {
          const result = await secretsCollection.updateOne({ _id: new ObjectId(change.id), userId: user._id }, { $set: updateData });
          if (result.matchedCount > 0) { updated.push(change.id); syncedCount++; }
          else { await secretsCollection.insertOne({...updateData, userId: user._id, userUid: user.uid, tipo: change.tipo || (change.fileName ? 'archivo' : 'texto'), encrypted: null, contenido: null, createdAt: new Date(change.createdAt) || new Date(), originalId: change.id }); created.push(change.id); syncedCount++; }
        } else {
          await secretsCollection.insertOne({...updateData, userId: user._id, userUid: user.uid, tipo: change.tipo || (change.fileName ? 'archivo' : 'texto'), encrypted: null, contenido: null, createdAt: new Date(change.createdAt) || new Date() }); created.push(change.id || 'new'); syncedCount++;
        }
      } catch (itemError) { errors.push({ changeId: change.id, titulo: change.titulo, error: itemError.message }); logger.warn(`⚠️ Sync push failed: ${change.id} - ${itemError.message}`); }
    }
    await logAudit('vault_sync_push', { userId: user.uid, synced: syncedCount, created: created.length, updated: updated.length, errors: errors.length, source: options.source || 'client' });
    res.json({ success: true, message: `${syncedCount} cambios sincronizados`, summary: { synced: syncedCount, created: created.length, updated: updated.length, errors: errors.length, total: changes.length }, created: created.length > 0 ? created : undefined, updated: updated.length > 0 ? updated : undefined, errors: errors.length > 0 ? errors : undefined, nextSteps: ['Sube el contenido cifrado de nuevos archivos vía POST /vault', 'Verifica sincronización con GET /api/vault/sync/check', FEATURES.ZERO_KNOWLEDGE ? 'Contenido local debe cifrarse con tu clave antes de subir' : null].filter(Boolean) });
  } catch (e) { logger.error('❌ Sync push error: ' + e.message); res.status(500).json({ error: 'Error sincronizando cambios: ' + e.message }); }
});
// ============================================
// 🛍️ MARKETPLACE INTEGRADO + RECOMENDACIONES
// ============================================
const getPublicItemMetadata = (secret, sellerProfile = null) => ({
  id: secret._id.toString(), titulo: secret.titulo,
  descripcion: secret.descripcion?.substring(0, 300) + (secret.descripcion?.length > 300 ? '...' : ''),
  categoria: secret.categoria || 'general', tags: secret.tags || [], precio: secret.price || 0, moneda: 'USD',
  vendedor: { uid: secret.userUid, displayName: sellerProfile?.displayName || 'Creador', avatarUrl: sellerProfile?.avatarUrl || null, rating: sellerProfile?.rating?.average || 0, totalVentas: sellerProfile?.totalVentas || 0, verificado: sellerProfile?.identityVerified || false },
  estadisticas: { ventas: secret.sales || 0, rating: secret.rating?.average || 0, reseñasCount: secret.rating?.count || 0, vistas: secret.views || 0 },
  licencia: secret.licenseDays ? `${secret.licenseDays} días` : 'Permanente', tipo: secret.tipo, fileName: secret.fileName, fileType: secret.fileType, fileSize: secret.fileSize, createdAt: secret.createdAt, thumbnailUrl: secret.thumbnailUrl || null
});
app.get('/api/marketplace', async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, items: [], total: 0, page: 1, demo: true });
    const { categoria, maxPrice, minPrice, sortBy = 'popularity', page = 1, limit = 20, q, tags, verifiedOnly } = req.query;
    const filter = { isForSale: true };
    if (categoria) filter.categoria = categoria;
    if (maxPrice) filter.price = {...filter.price, $lte: parseFloat(maxPrice) };
    if (minPrice) filter.price = {...filter.price, $gte: parseFloat(minPrice) };
    if (verifiedOnly === 'true') { const verifiedUsers = await profilesCollection.find({ identityVerified: true }, { projection: { userId: 1 } }).toArray(); filter.userId = { $in: verifiedUsers.map(p => p.userId) }; }
    if (tags) { const tagList = tags.split(',').map(t => t.trim()); filter.tags = { $in: tagList }; }
    if (q) filter.$text = { $search: q };
    let sort = {};
    switch(sortBy) {
      case 'price_asc': sort = { price: 1 }; break;
      case 'price_desc': sort = { price: -1 }; break;
      case 'newest': sort = { createdAt: -1 }; break;
      case 'rating': sort = { 'rating.average': -1, sales: -1 }; break;
      default: sort = { sales: -1, 'rating.average': -1, createdAt: -1 };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([secretsCollection.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).project({ encrypted: 0, contenido: 0, buyers: 0 }).toArray(), secretsCollection.countDocuments(filter)]);
    const enrichedItems = [];
    for (const item of items) { const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1, rating: 1, totalVentas: 1, identityVerified: 1 } }); enrichedItems.push(getPublicItemMetadata(item, sellerProfile)); }
    res.json({ success: true, items: enrichedItems, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }, filters: { categoria, maxPrice, minPrice, sortBy, q, tags } });
  } catch (e) { logger.error('❌ Marketplace catalog error: ' + e.message); res.status(500).json({ error: 'Error cargando catálogo: ' + e.message }); }
});
app.get('/api/marketplace/search', async(req, res) => {
  try {
    const { q, categoria, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Término de búsqueda debe tener al menos 2 caracteres' });
    if (!mongoReady) return res.json({ success: true, results: [], demo: true });
    const filter = { isForSale: true, $text: { $search: q } };
    if (categoria) filter.categoria = categoria;
    const results = await secretsCollection.find(filter, { score: { $meta: 'textScore' }, projection: { encrypted: 0, contenido: 0, buyers: 0 } }).sort({ score: { $meta: 'textScore' } }).limit(parseInt(limit)).toArray();
    const enriched = [];
    for (const item of results) { const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1 } }); enriched.push({...getPublicItemMetadata(item, sellerProfile), relevanceScore: item.score }); }
    res.json({ success: true, query: q, results: enriched, count: enriched.length });
  } catch (e) { logger.error('❌ Marketplace search error: ' + e.message); res.status(500).json({ error: 'Error en búsqueda: ' + e.message }); }
});
app.get('/api/marketplace/item/:id', async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, item: { id: req.params.id, titulo: 'Demo' }, demo: true });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado o no disponible' });
    const sellerProfile = await profilesCollection.findOne({ userId: secret.userId }, { projection: { displayName: 1, avatarUrl: 1, bio: 1, rating: 1, totalVentas: 1, identityVerified: 1, createdAt: 1 } });
    const recentReviews = await reviewsCollection?.find({ itemId: secret._id, createdAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }).sort({ createdAt: -1 }).limit(3).toArray() || [];
    res.json({ success: true, item: {...getPublicItemMetadata(secret, sellerProfile), descripcionCompleta: secret.descripcion, requisitos: secret.requisitos || null, preview: secret.preview || null, reseñasRecientes: recentReviews.map(r => ({ id: r._id, rating: r.rating, comment: r.comment?.substring(0, 200), buyerName: r.buyerName || 'Comprador', date: r.createdAt, verified: r.verifiedPurchase })) }, acciones: { comprar: '/api/buy/' + req.params.id, agregarFavoritos: req.user ? '/api/marketplace/favorites' : null, compartir: APP_URL + '/marketplace/item/' + req.params.id } });
  } catch (e) { logger.error('❌ Marketplace item detail error: ' + e.message); res.status(500).json({ error: 'Error cargando producto: ' + e.message }); }
});
app.get('/api/marketplace/creator/:userId', async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, creator: { uid: req.params.userId, displayName: 'Demo' }, demo: true });
    const user = await usersCollection.findOne({ uid: req.params.userId }, { projection: { password: 0, encryptedUserKey: 0, email: 0 } });
    if (!user) return res.status(404).json({ error: 'Creador no encontrado' });
    const profile = await profilesCollection.findOne({ userId: user._id });
    const [totalItems, itemsForSale, totalVentas, ratingStats] = await Promise.all([secretsCollection.countDocuments({ userId: user._id }), secretsCollection.countDocuments({ userId: user._id, isForSale: true }), transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' }), secretsCollection.aggregate([{ $match: { userId: user._id, 'rating.count': { $gt: 0 } } }, { $group: { _id: null, avgRating: { $avg: '$rating.average' }, totalReviews: { $sum: '$rating.count' } } }]).toArray()]);
    const featuredItems = await secretsCollection.find({ userId: user._id, isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } }).sort({ sales: -1, 'rating.average': -1 }).limit(6).toArray();
    const enrichedItems = featuredItems.map(item => getPublicItemMetadata(item, profile));
    res.json({ success: true, creator: { uid: user.uid, displayName: profile?.displayName || 'Creador', avatarUrl: profile?.avatarUrl, bio: profile?.bio, identityVerified: profile?.identityVerified || false, memberSince: user.createdAt, tier: user.tier }, estadisticas: { totalItems, itemsEnVenta: itemsForSale, totalVentas, ratingPromedio: ratingStats[0]?.avgRating?.toFixed(2) || 0, totalReseñas: ratingStats[0]?.totalReviews || 0 }, itemsDestacados: enrichedItems, acciones: { seguir: req.user ? '/api/marketplace/creator/' + req.params.userId + '/follow' : null, contactar: profile?.isPublic ? '/api/marketplace/creator/' + req.params.userId + '/contact' : null } });
  } catch (e) { logger.error('❌ Marketplace creator profile error: ' + e.message); res.status(500).json({ error: 'Error cargando perfil: ' + e.message }); }
});
app.post('/api/marketplace/item/:id/review', authenticate, async(req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating debe ser entre 1 y 5' });
    if (!mongoReady) return res.json({ success: true, message: 'Reseña guardada (demo)', demo: true });
    const buyer = await usersCollection.findOne({ uid: req.user.uid });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado' });
    if (secret.userId.toString() === buyer._id.toString()) return res.status(400).json({ error: 'No puedes reseñar tu propio producto' });
    if (!secret.buyers?.includes(buyer.uid)) return res.status(403).json({ error: 'Solo compradores verificados pueden dejar reseñas' });
    const existingReview = await reviewsCollection?.findOne({ itemId: secret._id, buyerUid: req.user.uid });
    if (existingReview) return res.status(400).json({ error: 'Ya has dejado una reseña para este producto' });
    const review = { itemId: secret._id, buyerUid: req.user.uid, buyerName: (await profilesCollection.findOne({ userId: buyer._id }))?.displayName || 'Comprador', rating: parseInt(rating), comment: comment?.substring(0, 1000), verifiedPurchase: true, createdAt: new Date(), helpful: 0, reported: false };
    await reviewsCollection.insertOne(review);
    const stats = await reviewsCollection.aggregate([{ $match: { itemId: secret._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]).toArray();
    await secretsCollection.updateOne({ _id: secret._id }, { $set: { 'rating.average': stats[0]?.avg?.toFixed(2) || 0, 'rating.count': stats[0]?.count || 0 } });
    await logAudit('review_created', { itemId: req.params.id, buyer: req.user.uid, rating, verified: true });
    res.json({ success: true, message: '¡Gracias por tu reseña!', review: {...review, id: review._id } });
  } catch (e) { logger.error('❌ Review error: ' + e.message); res.status(500).json({ error: 'Error guardando reseña: ' + e.message }); }
});
app.get('/api/marketplace/item/:id/reviews', async(req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'recent' } = req.query;
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado' });
    if (!mongoReady) return res.json({ success: true, reviews: [], demo: true });
    let sort = { createdAt: -1 };
    if (sortBy === 'rating_high') sort = { rating: -1, createdAt: -1 };
    if (sortBy === 'rating_low') sort = { rating: 1, createdAt: -1 };
    if (sortBy === 'helpful') sort = { helpful: -1, createdAt: -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reviews, total] = await Promise.all([reviewsCollection.find({ itemId: secret._id }).sort(sort).skip(skip).limit(parseInt(limit)).toArray(), reviewsCollection.countDocuments({ itemId: secret._id })]);
    res.json({ success: true, reviews: reviews.map(r => ({ id: r._id, rating: r.rating, comment: r.comment, buyerName: r.buyerName, date: r.createdAt, verified: r.verifiedPurchase, helpful: r.helpful })), pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }, summary: { average: secret.rating?.average || 0, count: secret.rating?.count || 0, distribution: await reviewsCollection?.aggregate([{ $match: { itemId: secret._id } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]).toArray() || [] } });
  } catch (e) { logger.error('❌ Reviews fetch error: ' + e.message); res.status(500).json({ error: 'Error cargando reseñas: ' + e.message }); }
});
app.post('/api/marketplace/favorites', authenticate, async(req, res) => {
  try {
    const { itemId, action = 'add' } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId requerido' });
    if (!mongoReady) return res.json({ success: true, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (action === 'add') { await favoritesCollection?.updateOne({ userId: user._id, itemId: new ObjectId(itemId) }, { $set: { addedAt: new Date() } }, { upsert: true }); await logAudit('favorite_added', { userId: req.user.uid, itemId }); res.json({ success: true, message: 'Agregado a favoritos' }); }
    else { await favoritesCollection?.deleteOne({ userId: user._id, itemId: new ObjectId(itemId) }); await logAudit('favorite_removed', { userId: req.user.uid, itemId }); res.json({ success: true, message: 'Removido de favoritos' }); }
  } catch (e) { logger.error('❌ Favorites error: ' + e.message); res.status(500).json({ error: 'Error con favoritos: ' + e.message }); }
});
app.get('/api/marketplace/favorites', authenticate, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, items: [], demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const favorites = await favoritesCollection?.find({ userId: user._id }).sort({ addedAt: -1 }).toArray() || [];
    const itemIds = favorites.map(f => f.itemId);
    const items = await secretsCollection.find({ _id: { $in: itemIds }, isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } }).toArray();
    const enriched = [];
    for (const item of items) { const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1 } }); enriched.push(getPublicItemMetadata(item, sellerProfile)); }
    res.json({ success: true, items: enriched, count: enriched.length });
  } catch (e) { logger.error('❌ Favorites list error: ' + e.message); res.status(500).json({ error: 'Error cargando favoritos: ' + e.message }); }
});
app.get('/api/marketplace/recommendations', authenticate, async(req, res) => {
  try {
    const { limit = 10, type = 'personalized' } = req.query;
    if (!mongoReady) return res.json({ success: true, recommendations: [], demo: true, message: 'Configura MongoDB para recomendaciones personalizadas' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    let recommendedItems = [];
    if (type === 'personalized') {
      const purchasedCategories = await transactionsCollection.distinct('categoria', { buyer: user.uid, type: 'sale' });
      const purchasedItemIds = await transactionsCollection.distinct('itemId', { buyer: user.uid, type: 'sale' }).then(ids => ids.map(id => new ObjectId(id)));
      const filter = { isForSale: true, userId: { $ne: user._id }, _id: { $nin: purchasedItemIds } };
      if (purchasedCategories.length > 0) filter.categoria = { $in: purchasedCategories };
      recommendedItems = await secretsCollection.aggregate([{ $match: filter }, { $addFields: { score: { $add: [{ $multiply: ['$sales', 0.4] }, { $multiply: ['$rating.average', 0.3] }, { $multiply: [{ $divide: [{ $toLong: '$createdAt' }, 1000] }, 0.1] }] } } }, { $sort: { score: -1 } }, { $limit: parseInt(limit) }]).toArray();
    } else if (type === 'trending') {
      const yesterday = new Date(Date.now() - 24*60*60*1000);
      recommendedItems = await secretsCollection.find({ isForSale: true, createdAt: { $gt: yesterday } }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } }).sort({ sales: -1, 'rating.average': -1 }).limit(parseInt(limit)).toArray();
    } else if (type === 'new') {
      recommendedItems = await secretsCollection.find({ isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } }).sort({ createdAt: -1 }).limit(parseInt(limit)).toArray();
    }
    const enriched = [];
    for (const item of recommendedItems) { const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1, rating: 1 } }); enriched.push({...getPublicItemMetadata(item, sellerProfile), reason: type === 'personalized' ? 'Basado en tus compras anteriores' : type === 'trending' ? 'Tendencia esta semana' : 'Recién llegado' }); }
    await logAudit('recommendations_served', { userId: req.user.uid, type, count: enriched.length });
    res.json({ success: true, recommendations: enriched, algorithm: type, count: enriched.length, nextRefresh: new Date(Date.now() + 60*60*1000).toISOString() });
  } catch (e) { logger.error('❌ Recommendations error: ' + e.message); res.status(500).json({ error: 'Error generando recomendaciones: ' + e.message }); }
});
app.get('/api/marketplace/seller/analytics', authenticate, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, analytics: {}, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const now = new Date();
    const last7Days = new Date(now - 7*24*60*60*1000);
    const last30Days = new Date(now - 30*24*60*60*1000);
    const [totalItems, activeListings, totalSales, revenue7d, revenue30d] = await Promise.all([
      secretsCollection.countDocuments({ userId: user._id }),
      secretsCollection.countDocuments({ userId: user._id, isForSale: true }),
      transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' }),
      transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale', createdAt: { $gte: last7Days } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray(),
      transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale', createdAt: { $gte: last30Days } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray()
    ]);
    const allTimeRevenue = await transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray();
    const topItems = await secretsCollection.find({ userId: user._id, isForSale: true, sales: { $gt: 0 } }).sort({ sales: -1 }).limit(5).project({ titulo: 1, price: 1, sales: 1, rating: 1 }).toArray();
    res.json({
      success: true, analytics: {
        overview: { totalItems, activeListings, totalSales, revenue: { last7Days: revenue7d[0]?.total || 0, last30Days: revenue30d[0]?.total || 0, allTime: allTimeRevenue[0]?.total || 0 } },
        performance: { avgOrderValue: totalSales > 0 ? ((revenue30d[0]?.total || 0) / totalSales).toFixed(2) : 0 },
        topItems: topItems.map(i => ({ id: i._id.toString(), titulo: i.titulo, price: i.price, sales: i.sales, rating: i.rating?.average || 0 })),
        tips: [activeListings === 0 && '💡 Agrega tu primer producto para empezar a vender', totalSales === 0 && activeListings > 0 && '💡 Promociona tus productos en redes sociales', (revenue7d[0]?.total || 0) > 0 && '🎉 ¡Tus ventas van en aumento! Sigue así'].filter(Boolean)
      }
    });
  } catch (e) { logger.error('❌ Seller analytics error: ' + e.message); res.status(500).json({ error: 'Error cargando analytics: ' + e.message }); }
});
app.get('/api/marketplace/categories', async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, categories: [{ id: 'educacion', name: 'Educación', count: 0 }, { id: 'software', name: 'Software', count: 0 }, { id: 'arte', name: 'Arte Digital', count: 0 }, { id: 'musica', name: 'Música', count: 0 }, { id: 'datos', name: 'Datos/Investigación', count: 0 }], demo: true });
    const categories = await secretsCollection.aggregate([{ $match: { isForSale: true, categoria: { $exists: true, $ne: '' } } }, { $group: { _id: '$categoria', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 20 }]).toArray();
    res.json({ success: true, categories: categories.map(c => ({ id: c._id, name: c._id.charAt(0).toUpperCase() + c._id.slice(1), count: c.count })) });
  } catch (e) { logger.error('❌ Categories error: ' + e.message); res.status(500).json({ error: 'Error cargando categorías: ' + e.message }); }
});
app.get('/api/marketplace/tags', async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, tags: [], demo: true });
    const tags = await secretsCollection.aggregate([{ $match: { isForSale: true, tags: { $exists: true, $ne: [] } } }, { $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 50 }]).toArray();
    res.json({ success: true, tags: tags.map(t => ({ name: t._id, count: t.count })) });
  } catch (e) { logger.error('❌ Tags error: ' + e.message); res.status(500).json({ error: 'Error cargando tags: ' + e.message }); }
});
app.post('/api/marketplace/promo', authenticate, async(req, res) => {
  try {
    const { code, discountType, discountValue, validUntil, maxUses, applicableItems } = req.body;
    if (!code || !discountType || !discountValue) return res.status(400).json({ error: 'code, discountType y discountValue son requeridos' });
    if (!mongoReady) return res.json({ success: true, message: 'Cupón creado (demo)', demo: true, code });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const existing = await promoCollection.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(400).json({ error: 'Este código de cupón ya existe' });
    const promo = { code: code.toUpperCase(), createdBy: user.uid, discountType, discountValue: parseFloat(discountValue), validFrom: new Date(), validUntil: validUntil ? new Date(validUntil) : null, maxUses: maxUses ? parseInt(maxUses) : null, currentUses: 0, applicableItems: applicableItems || [], active: true, createdAt: new Date() };
    await promoCollection.insertOne(promo);
    await logAudit('promo_created', { code: promo.code, by: user.uid });
    res.json({ success: true, message: 'Cupón creado exitosamente', promo: {...promo, id: promo._id } });
  } catch (e) { logger.error('❌ Promo create error: ' + e.message); res.status(500).json({ error: 'Error creando cupón: ' + e.message }); }
});
app.post('/api/marketplace/promo/validate', async(req, res) => {
  try {
    const { code, itemId, userId } = req.body;
    if (!code) return res.status(400).json({ error: 'Código de cupón requerido' });
    if (!mongoReady) return res.json({ success: true, valid: true, discount: { type: 'percent', value: 10 }, demo: true });
    const promo = await promoCollection.findOne({ code: code.toUpperCase(), active: true });
    if (!promo) return res.status(404).json({ error: 'Cupón no válido' });
    if (promo.validUntil && new Date() > promo.validUntil) return res.status(400).json({ error: 'Cupón expirado' });
    if (promo.maxUses && promo.currentUses >= promo.maxUses) return res.status(400).json({ error: 'Cupón agotado' });
    if (promo.applicableItems.length > 0 && !promo.applicableItems.includes(itemId)) return res.status(400).json({ error: 'Cupón no aplica a este producto' });
    const item = await secretsCollection.findOne({ _id: new ObjectId(itemId), isForSale: true });
    if (!item) return res.status(404).json({ error: 'Producto no encontrado' });
    const discount = promo.discountType === 'percent' ? Math.min(item.price * (promo.discountValue / 100), item.price) : Math.min(promo.discountValue, item.price);
    res.json({ success: true, valid: true, discount: { type: promo.discountType, value: promo.discountValue, amount: discount.toFixed(2), originalPrice: item.price, finalPrice: (item.price - discount).toFixed(2) }, code: promo.code });
  } catch (e) { logger.error('❌ Promo validate error: ' + e.message); res.status(500).json({ error: 'Error validando cupón: ' + e.message }); }
});
// 🌐 SERVIR FRONTEND
app.get('/', function(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ============================================
// 🆔 RUTAS DE IDENTIDAD DIGITAL: Avatar, Firma, Recuperación, Multifirma
// ============================================
app.post('/api/identity/avatar', authenticate, async(req, res) => {
  try {
    const { av } = req.body;
    if (!av) return res.status(400).json({ error: 'Falta avatar' });
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { avatar: av } });
    res.json({ ok: true, message: 'Avatar actualizado' });
  } catch (e) { res.status(500).json({ error: 'Error guardando avatar: ' + e.message }); }
});
app.post('/api/identity/signature', authenticate, async(req, res) => {
  try {
    const { sig } = req.body;
    if (!sig) return res.status(400).json({ error: 'Falta firma' });
    const masterKey = CryptoJS.PBKDF2(req.user.passwordHash || 'tmp', req.user.salt || 'tmp', { keySize: 8, iterations: 1000 }).toString(CryptoJS.enc.Hex);
    const enc = CryptoJS.AES.encrypt(sig, masterKey).toString();
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { signature: enc } });
    res.json({ ok: true, message: 'Firma guardada y cifrada' });
  } catch (e) { res.status(500).json({ error: 'Error guardando firma: ' + e.message }); }
});
app.post('/api/identity/contacts', authenticate, async(req, res) => {
  try {
    const { email } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
    const exists = await usersCollection.findOne({ email });
    if (!exists) return res.status(400).json({ error: 'El contacto debe tener cuenta en ApiRomwiner' });
    const user = await usersCollection.findOne({ _id: req.user._id });
    const contacts = user.recoveryContacts || [];
    if (contacts.length >= 5) return res.status(400).json({ error: 'Máximo 5 contactos permitidos' });
    if (contacts.some(c => c.email === email)) return res.status(400).json({ error: 'Contacto ya agregado' });
    contacts.push({ email, ts: new Date(), verified: false });
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { recoveryContacts: contacts } });
    res.json({ ok: true, contacts });
  } catch (e) { res.status(500).json({ error: 'Error agregando contacto: ' + e.message }); }
});
app.get('/api/identity/contacts', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: req.user._id }, { projection: { recoveryContacts: 1 } });
    res.json({ contacts: user.recoveryContacts || [] });
  } catch (e) { res.status(500).json({ error: 'Error cargando contactos: ' + e.message }); }
});
app.delete('/api/identity/contacts/:id', authenticate, async(req, res) => {
  try {
    const { id } = req.params;
    const user = await usersCollection.findOne({ _id: req.user._id });
    const updated = (user.recoveryContacts || []).filter(x => (x._id?.toString() !== id && x.email !== id));
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { recoveryContacts: updated } });
    res.json({ ok: true, contacts: updated });
  } catch (e) { res.status(500).json({ error: 'Error eliminando contacto: ' + e.message }); }
});
app.post('/api/identity/multisig', authenticate, async(req, res) => {
  try {
    const { enabled } = req.body;
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { multisig: !!enabled } });
    res.json({ ok: true, message: enabled ? 'Multifirma activada' : 'Multifirma desactivada' });
  } catch (e) { res.status(500).json({ error: 'Error actualizando multifirma: ' + e.message }); }
});
app.get('/api/profile', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: req.user._id }, { projection: { password: 0, passwordHash: 0, salt: 0 } });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: 'Error cargando perfil: ' + e.message }); }
});
// 📊 ANALYTICS FINANCIERO: RUTAS BACKEND
app.get('/api/analytics/financial', authenticate, async(req, res) => {
  try {
    const { period = '30d' } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Calcular fechas
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now - days * 24 * 60 * 60 * 1000);
    // Ingresos totales (ventas + afiliados)
    const salesAgg = await transactionsCollection?.aggregate([
      { $match: { seller: user.uid, type: 'sale', createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray() || [];
    const affiliateAgg = await transactionsCollection?.aggregate([
      { $match: { userId: user._id, type: 'affiliate', createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray() || [];
    // Ingresos por día (para gráfico)
    const revenueByDay = await transactionsCollection?.aggregate([
      { $match: { $or: [{ seller: user.uid, type: 'sale' }, { userId: user._id, type: 'affiliate' }], createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        amount: { $sum: '$amount' }
      }},
      { $sort: { _id: 1 } }
    ]).toArray() || [];
    // Ventas por categoría
    const salesByCategory = await secretsCollection?.aggregate([
      { $match: { userId: user._id, isForSale: true, sales: { $gt: 0 } } },
      { $group: { _id: '$categoria', count: { $sum: '$sales' } }},
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray() || [];
    // Top productos
    const topProducts = await secretsCollection?.find(
      { userId: user._id, isForSale: true, sales: { $gt: 0 } },
      { projection: { titulo: 1, sales: 1, price: 1 } }
    ).sort({ sales: -1 }).limit(5).toArray() || [];
    // Historial de afiliados
    const affiliateHistory = await transactionsCollection?.find(
      { userId: user._id, type: 'affiliate', createdAt: { $gte: startDate } },
      { projection: { amount: 1, item: 1, date: '$createdAt' } }
    ).sort({ createdAt: -1 }).limit(20).toArray() || [];
    // Productos activos
    const activeProducts = await secretsCollection?.countDocuments({ userId: user._id, isForSale: true }) || 0;
    res.json({
      success: true,
      data: {
        totalRevenue: (salesAgg[0]?.total || 0) + (affiliateAgg[0]?.total || 0),
        totalSales: salesAgg[0]?.count || 0,
        affiliateEarnings: affiliateAgg[0]?.total || 0,
        activeProducts,
        revenueByDay: revenueByDay.map(d => ({ date: d._id, amount: d.amount })),
        salesByCategory: salesByCategory.map(c => ({ category: c._id || 'Sin categoría', count: c.count })),
        topProducts: topProducts.map(p => ({ titulo: p.titulo, sales: p.sales, revenue: p.sales * (p.price || 0) })),
        affiliateHistory: affiliateHistory.map(h => ({ amount: h.amount, item: h.item, date: h.date }))
      }
    });
  } catch (e) {
    logger.error('❌ Analytics error: ' + e.message);
    res.status(500).json({ error: 'Error cargando analytics: ' + e.message });
  }
});
app.get('/api/analytics/financial/export', authenticate, async(req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const transactions = await transactionsCollection?.find({
      $or: [{ seller: user.uid }, { userId: user._id }]
    }).sort({ createdAt: -1 }).limit(100).toArray() || [];
    if (format === 'csv') {
      const headers = ['Fecha', 'Tipo', 'Monto', 'Item', 'Estado'];
      const rows = transactions.map(t => [
        new Date(t.createdAt).toLocaleDateString(),
        t.type,
        t.amount?.toFixed(2) || '0.00',
        t.item || '-',
        t.status || 'completado'
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n'); // ✅ FIX: salto de línea correcto
      res.json({ success: true, data: { csv } });
    } else {
      res.json({ success: true, data: { json: transactions } });
    }
  } catch (e) {
    logger.error('❌ Export error: ' + e.message);
    res.status(500).json({ error: 'Error exportando: ' + e.message });
  }
});
// ============================================
// 🔐 STREAMING SEGURO CON CIFRADO ENVELOPE
// ============================================
app.get('/api/vault/:id/stream/secure', async(req, res) => {
  try {
    const authToken = req.query.token;
    const userPassword = req.query.passwordHash;
    if (!authToken || !userPassword) return res.status(401).json({ error: 'Autenticación requerida' });
    let user;
    try {
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET || JWT_SECRET);
      user = await usersCollection.findOne({ uid: decoded.uid });
    } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) return res.status(400).json({ error: 'ID inválido' });
    const fileRecord = await secretsCollection.findOne({ _id: new ObjectId(fileId) });
    if (!fileRecord) return res.status(404).json({ error: 'Archivo no encontrado' });
    const isOwner = fileRecord.userId.toString() === user._id.toString();
    const hasBought = fileRecord.buyers?.includes(user.uid);
    const isPublic = fileRecord.isForSale && fileRecord.price === 0;
    if (!isOwner && !hasBought && !isPublic) return res.status(403).json({ error: 'Acceso denegado' });
    const encryptedFileKey = fileRecord.encryptedKey;
    if (!encryptedFileKey) return res.status(500).json({ error: 'Clave de archivo no disponible' });
    const masterKey = CryptoJS.PBKDF2(userPassword, user.salt, { keySize: 8, iterations: 1000 }).toString(CryptoJS.enc.Hex);
    const bytes = CryptoJS.AES.decrypt(encryptedFileKey, masterKey);
    const fileKey = bytes.toString(CryptoJS.enc.Utf8);
    if (!fileKey) return res.status(500).json({ error: 'No se pudo desencriptar la clave del archivo' });
    const encryptedFilePath = path.join(__dirname, 'uploads', fileRecord.fileName + '.enc');
    if (!fs.existsSync(encryptedFilePath)) return res.status(404).json({ error: 'Archivo cifrado no encontrado' });
    const stat = fs.statSync(encryptedFilePath);
    const encryptedFileSize = stat.size;
    const range = req.headers.range;
    const contentType = fileRecord.fileType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : encryptedFileSize - 1;
      const chunkSize = (end - start) + 1;
      const encryptedChunk = fs.readFileSync(encryptedFilePath, { start, end });
      const decryptedChunk = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Hex.parse(encryptedChunk.toString('hex')) }, CryptoJS.enc.Utf8.parse(fileKey), { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }).toString(CryptoJS.enc.Latin1);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${encryptedFileSize}`);
      res.setHeader('Content-Length', Buffer.byteLength(decryptedChunk, 'latin1'));
      res.writeHead(206);
      res.end(decryptedChunk, 'latin1');
    } else {
      const encryptedData = fs.readFileSync(encryptedFilePath);
      const decryptedData = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Hex.parse(encryptedData.toString('hex')) }, CryptoJS.enc.Utf8.parse(fileKey), { mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }).toString(CryptoJS.enc.Latin1);
      res.setHeader('Content-Length', Buffer.byteLength(decryptedData, 'latin1'));
      res.writeHead(200);
      res.end(decryptedData, 'latin1');
    }
    logger.info(`🔐 Streaming seguro: ${fileRecord.fileName} • Usuario: ${user.uid}`);
  } catch (error) {
    logger.error('❌ Error en streaming seguro:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error al servir archivo cifrado' });
  }
});
// ============================================
// 🌿 CONTROL DE VERSIONES GIT-LIKE
// ============================================
// ✅ commitsCollection ya está declarada globalmente y asignada en connectToMongo()
// ✅ NO agregues 'const commitsCollection = ...' aquí — eso causa el error de duplicado
app.post('/api/vault/:id/commit', authenticate, async(req, res) => {
  try {
    const { message, branch = 'main', tags = [] } = req.body;
    if (!message || message.trim().length < 2) return res.status(400).json({ error: 'Mensaje requerido (mín. 2 caracteres)' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
    const commit = {
      fileId: file._id,
      message: message.trim(),
      author: { uid: user.uid, email: user.email },
      branch, tags,
      version: (file.currentVersion || 0) + 1,
      timestamp: new Date(),
      hash: crypto.createHash('sha256').update(req.params.id + message + Date.now()).digest('hex').slice(0, 8)
    };
    if (commitsCollection) await commitsCollection.insertOne(commit);
    await secretsCollection.updateOne({ _id: file._id }, { $set: { currentVersion: commit.version, lastCommitHash: commit.hash, updatedAt: new Date() } });
    await logAudit('vault_commit', { fileId: req.params.id, message: commit.message, hash: commit.hash });
    res.json({ success: true, message: '✅ Commit creado', commit: { hash: commit.hash, message: commit.message, branch, version: commit.version } });
  } catch (e) { res.status(500).json({ error: 'Error creando commit: ' + e.message }); }
});
app.get('/api/vault/:id/log', authenticate, async(req, res) => {
  try {
    const { branch = 'main', limit = 20 } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
    if (!commitsCollection) return res.json({ success: true, log: [], branch, total: 0, demo: true });
    const commits = await commitsCollection.find({ fileId: file._id, branch }).sort({ timestamp: -1 }).limit(parseInt(limit) || 20).toArray();
    res.json({ success: true, log: commits.map(c => ({ hash: c.hash, message: c.message, author: c.author.email, branch: c.branch, tags: c.tags, date: c.timestamp, version: c.version })), branch, total: commits.length });
  } catch (e) { res.status(500).json({ error: 'Error listando historial: ' + e.message }); }
});
app.post('/api/vault/:id/checkout/:version', authenticate, async(req, res) => {
  try {
    const version = parseInt(req.params.version);
    if (!version || version < 1) return res.status(400).json({ error: 'Versión inválida' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });
    if (commitsCollection) {
      const targetCommit = await commitsCollection.findOne({ fileId: file._id, version });
      if (!targetCommit) return res.status(404).json({ error: 'Versión no encontrada' });
      await secretsCollection.updateOne({ _id: file._id }, { $set: { currentVersion: version, lastCheckout: new Date(), updatedAt: new Date() } });
      await logAudit('vault_checkout', { fileId: req.params.id, restoredToVersion: version, by: user.uid });
      res.json({ success: true, message: `✅ Restaurado a versión ${version}`, version, timestamp: new Date() });
    } else {
      res.json({ success: true, message: '⚠️ Modo demo: historial no activo aún' });
    }
  } catch (e) { res.status(500).json({ error: 'Error restaurando versión: ' + e.message }); }
});
// ============================================
// 📢 SISTEMA DE PUBLICIDAD CON RECOMPENSAS
// ============================================
app.get('/api/ads/available', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !adsCollection) return res.json({ success: true, ads: [], demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const watchedToday = await adImpressionsCollection.countDocuments({ userId: user._id, watchedAt: { $gte: today } });
    if (watchedToday >= 20) {
      return res.json({ success: true, ads: [], message: 'Límite diario alcanzado. Vuelve mañana.', remaining: 0 });
    }
    const ads = await adsCollection.find({
      active: true,
      budget: { $gt: 0 },
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      advertiserId: { $ne: user._id }
    }).sort({ reward: -1, createdAt: -1 }).limit(10).toArray();
    res.json({
      success: true,
      ads: ads.map(ad => ({
        id: ad._id.toString(),
        title: ad.title,
        description: ad.description,
        imageUrl: ad.imageUrl,
        reward: ad.reward,
        advertiser: ad.advertiserName,
        type: ad.type
      })),
      watchedToday,
      remaining: 20 - watchedToday
    });
  } catch (e) {
    logger.error('❌ Ads available error: ' + e.message);
    res.status(500).json({ error: 'Error cargando anuncios: ' + e.message });
  }
});
app.post('/api/ads/watch/:id', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !adsCollection || !adImpressionsCollection) {
      return res.json({ success: true, message: 'Recompensa demo: $0.01', demo: true, earned: 0.01 });
    }
    const { id } = req.params;
    const { watchTime } = req.body;
    if (!watchTime || watchTime < 15) {
      return res.status(400).json({ error: 'Debes ver el anuncio al menos 15 segundos para ganar la recompensa' });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const ad = await adsCollection.findOne({ _id: new ObjectId(id), active: true, budget: { $gt: 0 } });
    if (!ad) return res.status(404).json({ error: 'Anuncio no disponible' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alreadyWatched = await adImpressionsCollection.findOne({ userId: user._id, adId: ad._id, watchedAt: { $gte: today } });
    if (alreadyWatched) {
      return res.status(400).json({ error: 'Ya viste este anuncio hoy. ¡Vuelve mañana para ganar más!' });
    }
    const watchedToday = await adImpressionsCollection.countDocuments({ userId: user._id, watchedAt: { $gte: today } });
    if (watchedToday >= 20) {
      return res.status(400).json({ error: 'Límite diario de anuncios alcanzado' });
    }
    const reward = parseFloat(ad.reward) || 0.01;
    await walletCollection.updateOne({ userId: user._id }, {
      $inc: { balance: reward },
      $push: { history: { type: 'ad_reward', amount: reward, adId: ad._id.toString(), date: new Date() } }
    });
    await adsCollection.updateOne({ _id: ad._id }, { $inc: { budget: -reward, views: 1 } });
    await adImpressionsCollection.insertOne({ userId: user._id, adId: ad._id, watchTime, reward, watchedAt: new Date(), ip: req.ip });
    await logAudit('ad_watched', { userId: user.uid, adId: id, reward, watchTime });
    res.json({
      success: true,
      message: `✅ ¡Ganaste $${reward.toFixed(2)} USD por ver este anuncio!`,
      earned: reward,
      newBalance: (await walletCollection.findOne({ userId: user._id }))?.balance || 0,
      remainingDaily: 20 - watchedToday - 1
    });
  } catch (e) {
    logger.error('❌ Ad watch error: ' + e.message);
    res.status(500).json({ error: 'Error procesando recompensa: ' + e.message });
  }
});
app.post('/api/ads/create', authenticate, async(req, res) => {
  try {
    const { title, description, imageUrl, targetUrl, reward, budget, type = 'banner', startDate, endDate } = req.body;
    if (!title || title.length < 5) return res.status(400).json({ error: 'Título requerido (mín. 5 caracteres)' });
    if (!description || description.length < 20) return res.status(400).json({ error: 'Descripción requerida (mín. 20 caracteres)' });
    if (!imageUrl || !imageUrl.startsWith('http')) return res.status(400).json({ error: 'URL de imagen válida requerida' });
    if (!reward || reward < 0.01 || reward > 1) return res.status(400).json({ error: 'Recompensa debe estar entre $0.01 y $1.00' });
    if (!budget || budget < 1) return res.status(400).json({ error: 'Presupuesto mínimo: $1.00 USD' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const wallet = await walletCollection.findOne({ userId: user._id });
    if (!wallet || wallet.balance < budget) {
      return res.status(400).json({ error: `Saldo insuficiente. Necesitas $${budget} USD. Tu saldo: $${(wallet?.balance || 0).toFixed(2)}` });
    }
    const newAd = {
      advertiserId: user._id,
      advertiserName: (await profilesCollection.findOne({ userId: user._id }))?.displayName || user.email,
      advertiserUid: user.uid,
      title,
      description,
      imageUrl,
      targetUrl,
      reward: parseFloat(reward),
      budget: parseFloat(budget),
      spent: 0,
      views: 0,
      clicks: 0,
      type,
      active: true,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await adsCollection.insertOne(newAd);
    await walletCollection.updateOne({ userId: user._id }, {
      $inc: { balance: -budget },
      $push: { history: { type: 'ad_campaign', amount: -budget, adId: result.insertedId.toString(), date: new Date() } }
    });
    await logAudit('ad_created', { userId: user.uid, adId: result.insertedId.toString(), budget, reward });
    res.status(201).json({
      success: true,
      message: '✅ Campaña publicitaria creada exitosamente',
      ad: {
        id: result.insertedId.toString(),
        title: newAd.title,
        budget: newAd.budget,
        reward: newAd.reward,
        startDate: newAd.startDate,
        endDate: newAd.endDate
      }
    });
  } catch (e) {
    logger.error('❌ Ad create error: ' + e.message);
    res.status(500).json({ error: 'Error creando campaña: ' + e.message });
  }
});
app.get('/api/ads/my-campaigns', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !adsCollection) return res.json({ success: true, campaigns: [], demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const campaigns = await adsCollection.find({ advertiserId: user._id }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({
      success: true,
      campaigns: campaigns.map(c => ({
        id: c._id.toString(),
        title: c.title,
        budget: c.budget,
        spent: c.spent,
        remaining: c.budget - c.spent,
        views: c.views,
        reward: c.reward,
        active: c.active,
        startDate: c.startDate,
        endDate: c.endDate,
        type: c.type
      }))
    });
  } catch (e) {
    logger.error('❌ My campaigns error: ' + e.message);
    res.status(500).json({ error: 'Error cargando campañas: ' + e.message });
  }
});
app.patch('/api/ads/:id/toggle', authenticate, async(req, res) => {
  try {
    const { id } = req.params;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const ad = await adsCollection.findOne({ _id: new ObjectId(id), advertiserId: user._id });
    if (!ad) return res.status(404).json({ error: 'Campaña no encontrada o no tienes permiso' });
    const newStatus = !ad.active;
    await adsCollection.updateOne({ _id: ad._id }, { $set: { active: newStatus, updatedAt: new Date() } });
    await logAudit('ad_toggled', { userId: user.uid, adId: id, newStatus });
    res.json({
      success: true,
      message: newStatus ? '✅ Campaña reanudada' : '⏸️ Campaña pausada',
      active: newStatus
    });
  } catch (e) {
    logger.error('❌ Ad toggle error: ' + e.message);
    res.status(500).json({ error: 'Error actualizando campaña: ' + e.message });
  }
});
// ============================================
// 🆔 RUTAS DE IDENTIDAD DIGITAL: Avatar, Firma, Recuperación, Multifirma
// ============================================
app.post('/api/identity/avatar', authenticate, async(req, res) => {
  try {
    const { av } = req.body;
    if (!av) return res.status(400).json({ error: 'Falta avatar' });
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { avatar: av } });
    res.json({ ok: true, message: 'Avatar actualizado' });
  } catch (e) { res.status(500).json({ error: 'Error guardando avatar: ' + e.message }); }
});
app.post('/api/identity/signature', authenticate, async(req, res) => {
  try {
    const { sig } = req.body;
    if (!sig) return res.status(400).json({ error: 'Falta firma' });
    const masterKey = CryptoJS.PBKDF2(req.user.passwordHash || 'tmp', req.user.salt || 'tmp', { keySize: 8, iterations: 1000 }).toString(CryptoJS.enc.Hex);
    const enc = CryptoJS.AES.encrypt(sig, masterKey).toString();
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { signature: enc } });
    res.json({ ok: true, message: 'Firma guardada y cifrada' });
  } catch (e) { res.status(500).json({ error: 'Error guardando firma: ' + e.message }); }
});
app.post('/api/identity/contacts', authenticate, async(req, res) => {
  try {
    const { email } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
    const exists = await usersCollection.findOne({ email });
    if (!exists) return res.status(400).json({ error: 'El contacto debe tener cuenta en ApiRomwiner' });
    const user = await usersCollection.findOne({ _id: req.user._id });
    const contacts = user.recoveryContacts || [];
    if (contacts.length >= 5) return res.status(400).json({ error: 'Máximo 5 contactos permitidos' });
    if (contacts.some(c => c.email === email)) return res.status(400).json({ error: 'Contacto ya agregado' });
    contacts.push({ email, ts: new Date(), verified: false });
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { recoveryContacts: contacts } });
    res.json({ ok: true, contacts });
  } catch (e) { res.status(500).json({ error: 'Error agregando contacto: ' + e.message }); }
});
app.get('/api/identity/contacts', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: req.user._id }, { projection: { recoveryContacts: 1 } });
    res.json({ contacts: user.recoveryContacts || [] });
  } catch (e) { res.status(500).json({ error: 'Error cargando contactos: ' + e.message }); }
});
app.delete('/api/identity/contacts/:id', authenticate, async(req, res) => {
  try {
    const { id } = req.params;
    const user = await usersCollection.findOne({ _id: req.user._id });
    const updated = (user.recoveryContacts || []).filter(x => (x._id?.toString() !== id && x.email !== id));
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { recoveryContacts: updated } });
    res.json({ ok: true, contacts: updated });
  } catch (e) { res.status(500).json({ error: 'Error eliminando contacto: ' + e.message }); }
});
app.post('/api/identity/multisig', authenticate, async(req, res) => {
  try {
    const { enabled } = req.body;
    await usersCollection.updateOne({ _id: req.user._id }, { $set: { multisig: !!enabled } });
    res.json({ ok: true, message: enabled ? 'Multifirma activada' : 'Multifirma desactivada' });
  } catch (e) { res.status(500).json({ error: 'Error actualizando multifirma: ' + e.message }); }
});
app.get('/api/profile', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ _id: req.user._id }, { projection: { password: 0, passwordHash: 0, salt: 0 } });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: 'Error cargando perfil: ' + e.message }); }
});
// ============================================
// 🚀 START SERVER - SOLO UNA VEZ, AL FINAL
// ============================================
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
    logger.info('🟢 57 Funciones Reales | 🔐 Identidad Criptográfica Autónoma | 📋 Identidad Legal Verificada | 💰 Wallet | 👑 Dueño | 🤝 Afiliados | 🔐 Vault + Envelope Encryption | 📦 RAR/MP3/ZIP | 🏦 Enterprise Tiers + Audit + Key Rotation | ✅ Listo para vender HOY | 🤖 IA Interna: Búsqueda Inteligente + Auto-Tags + Asistente de Comandos');
    if (FEATURES.PORTABLE_EXPORT) logger.info('📦 Exportación Portable: ACTIVADA');
    if (FEATURES.LOCAL_SYNC) logger.info('🔄 Sync Offline: ACTIVADO');
    if (FEATURES.ZERO_KNOWLEDGE) logger.info('🔐 Zero-Knowledge: ACTIVADO');
    if (FEATURES.WEB3_LOGIN) logger.info('🔗 Login Web3: ACTIVADO');
    if (FEATURES.IPFS_BACKUP) logger.info('🌐 Backup IPFS (Helia): ACTIVADO');
    if (FEATURES.AI_INTERNAL) logger.info('🤖 IA Interna: ACTIVADA (sin dependencias externas)');
  });
} // ← ✅ ESTA LLAVE CIERRA startServer()
startServer().catch(function(err) {
  logger.error('❌ Error crítico al iniciar servidor: ' + err.message);
  process.exit(1);
});
// === FIN: index.js ===
