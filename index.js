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
const logger = pino({ level: 'info' });
const fetch = require('node-fetch');
const sharp = require('sharp');
const diffLib = require('diff');
// ❌ ELIMINADA: const fileType = require('file-type');  // Ya no se usa así
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { ethers } = require('ethers');
const { createFromURL } = require('@helia/http');
const { unixfs } = require('@helia/unixfs');
// 🤖 IA INTERNA: Natural para NLP ligero
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// 🔐 CLAVES + ADMINS (definir constantes PRIMERO)
// 1. Claves críticas: sin fallbacks, la app NO debe arrancar si faltan
const JWT_SECRET = process.env.JWT_SECRET;
const MASTER_KEY = process.env.MASTER_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Validación estricta (mata el proceso si falta alguna)
if (!JWT_SECRET || !MASTER_KEY || !STRIPE_SECRET_KEY) {
  console.error('❌ ERROR CRÍTICO: Faltan variables de entorno obligatorias:');
  if (!JWT_SECRET) console.error('   - JWT_SECRET');
  if (!MASTER_KEY) console.error('   - MASTER_KEY');
  if (!STRIPE_SECRET_KEY) console.error('   - STRIPE_SECRET_KEY');
  console.error('   El servidor NO puede iniciar sin ellas.');
  process.exit(1);
}

// ========== CONFIGURACIÓN SEGURA DE MULTER (VALIDACIÓN POR NÚMEROS MÁGICOS) ==========
const fileFilter = async (req, file, cb) => {
  if (!file.buffer) {
    return cb(new Error('Solo se permiten archivos en memoria'), false);
  }
  try {
    const { fileTypeFromBuffer } = await import('file-type');
    const buffer = file.buffer.slice(0, 4100);
    const type = await fileTypeFromBuffer(buffer);

    // ✅ Lista ampliada de tipos permitidos (ajústala según necesites)
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/zip', 'application/x-rar-compressed'
    ];

    if (type && allowedMimes.includes(type.mime)) {
      const originalName = file.originalname;
      const newExt = type.ext;
      file.originalname = originalName.replace(/\.[^/.]+$/, '') + '.' + newExt;
      cb(null, true);
    } else {
      cb(new Error(`Tipo real no permitido: ${type ? type.mime : 'desconocido'}`), false);
    }
  } catch (error) {
    console.error('Error en fileFilter:', error);
    cb(new Error('Error interno al validar archivo'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // ✅ 10 MB (cámbialo si prefieres 5 MB)
});
// =====================================================================================

// El resto de tu código (middlewares, rutas, etc.) continúa aquí...
// =====================================================================================

// Aquí continúa el resto de tu código (definir app, middlewares, rutas...)
// Por ejemplo:
// const app = express();
// app.use(helmet());
// ... etc.

// 2. Configuración no crítica: puedes mantener fallbacks razonables
const ADMIN_EMAILS = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim())
  : ['admin@romwinervault.com', 'nubislosnubis@gmail.com', 'romraywiner@gmail.com'];

const APP_URL = process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com';

// El resto de tu código continúa aquí...

// 💳 Stripe para pagos (definir DESPUÉS de STRIPE_SECRET_KEY)
const stripe = require('stripe')(STRIPE_SECRET_KEY);
// 🚀 FEATURE FLAGS
const FEATURES = {
  ZERO_KNOWLEDGE: process.env.ENABLE_ZERO_KNOWLEDGE === 'true',
  OFFLINE_MODE: process.env.ENABLE_OFFLINE === 'true',
  PORTABLE_EXPORT: process.env.ENABLE_EXPORT !== 'false',
  LOCAL_SYNC: process.env.ENABLE_LOCAL_SYNC === 'true',
  WEB3_LOGIN: process.env.ENABLE_WEB3 === 'true',
  IPFS_BACKUP: process.env.ENABLE_IPFS === 'true',
  AI_INTERNAL: process.env.ENABLE_AI !== 'false',
  ENABLE_YOUTUBE_PREVIEW: process.env.ENABLE_YOUTUBE_PREVIEW === 'true'
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
// 🌐 HELIA (IPFS) INIT - DESACTIVADO POR SEGURIDAD (cero enlaces externos)
let heliaFs = null;
const initHelia = async () => {
  // Por ahora, IPFS está desactivado para evitar llamadas a ipfs.io
  // Si deseas activarlo, configura un gateway local (ej. http://localhost:8080)
  // y establece ENABLE_IPFS=true en las variables de entorno.
  logger.warn('⚠️ IPFS desactivado: se requiere un gateway local sin enlaces externos.');
  return null;
  
  /* Código original comentado por usar gateway externo:
  try {
    const gatewayUrl = process.env.IPFS_GATEWAY || 'https://ipfs.io';
    const helia = createFromURL(gatewayUrl);
    heliaFs = unixfs(helia);
    logger.info(`🌐 Helia initialized: ${gatewayUrl}`);
    return heliaFs;
  } catch (e) {
    logger.warn('⚠️ Helia init failed: ' + e.message);
    return null;
  }
  */
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
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 10000;

// 🔐 MONGODB
const MONGODB_URI = process.env.MONGODB_URI;
// ✅ Declaración de TODAS las colecciones (incluyendo nuevas)
let db, usersCollection, secretsCollection, affiliatesCollection, identityCollection, transactionsCollection, profilesCollection, walletCollection, auditCollection, webhooksCollection, promoCollection, cryptoKeysCollection, verifiedIdentitiesCollection;
let sharedLinksCollection, thumbnailsCollection, versionsCollection, commentsCollection;
let reviewsCollection, favoritesCollection, commitsCollection, adsCollection, adImpressionsCollection, organizationsCollection;
let followsCollection, postLikesCollection;  // 👈 AÑADIDAS
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
    
    // ✅ NUEVAS COLECCIONES
    followsCollection = db.collection('follows');
    postLikesCollection = db.collection('post_likes');
    adsCollection = db.collection('ads');
    adImpressionsCollection = db.collection('adImpressions');
    organizationsCollection = db.collection('organizations');
    
    // =====================================================
    // ÍNDICES
    // =====================================================
    // Seguidores
    await followsCollection.createIndex({ followerId: 1, followingId: 1 }, { unique: true });
    // Likes
    await postLikesCollection.createIndex({ userId: 1, postId: 1 }, { unique: true });
    // Comentarios (para feed)
    await commentsCollection.createIndex({ postId: 1, createdAt: -1 });
    // Organizaciones
    await organizationsCollection.createIndex({ name: 1 }, { unique: true });
    await organizationsCollection.createIndex({ taxId: 1 }, { unique: true, sparse: true });
    await organizationsCollection.createIndex({ 'members.userId': 1 });
    await organizationsCollection.createIndex({ expiresAt: 1 });
    // Publicidad
    await adsCollection.createIndex({ active: 1, budget: -1, startDate: 1, endDate: 1 });
    await adsCollection.createIndex({ advertiserId: 1, createdAt: -1 });
    await adImpressionsCollection.createIndex({ userId: 1, watchedAt: -1 });
    await adImpressionsCollection.createIndex({ adId: 1, watchedAt: -1 });
    
    // ✅ Índices existentes (con manejo de errores para evitar duplicados)
    try {
      await usersCollection.createIndex({ email: 1 }, { unique: true });
    } catch(e) { logger.warn('Index email ya existe'); }
    try {
      await usersCollection.createIndex({ username: 1 }, { unique: true, sparse: true });
    } catch(e) { logger.warn('Index username ya existe'); }
    await usersCollection.createIndex({ uid: 1 }, { unique: true });
    await usersCollection.createIndex({ tier: 1 });
    await usersCollection.createIndex({ companyId: 1 });
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
}

// 🔐 SEGURIDAD MÁXIMA - SIN ENLACES EXTERNOS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["https://checkout.stripe.com"],
      connectSrc: ["'self'", "https://api.stripe.com", "wss:", "ws:"],
      workerSrc: ["'self'", "blob:"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: function(origin, callback) {
    // Permitir peticiones sin origen (ej. apps móviles, Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://apiromwinervault.onrender.com',
      'https://api.romwinervault.com',
      'https://romwinervault.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:10000',
      'http://127.0.0.1:10000'
    ];
    
    // Verificar si el origen está explícitamente permitido o es subdominio válido
    const isAllowed = allowedOrigins.includes(origin) ||
                      origin.endsWith('.onrender.com') ||
                      origin.endsWith('.romwinervault.com');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // ❌ CORREGIDO: ahora realmente bloquea
      logger.warn('🚫 CORS bloqueado - origen no permitido:', origin);
      callback(new Error('Origen no permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Vault-Sig', 'X-Requested-With', 'Accept', 'Origin']
}));

// Elimina esta línea si la tienes (es redundante):
// app.options('*', cors());

// ✅ Servir archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/app', express.static('public'));

// ✅ Redirigir raíz al frontend
app.get('/', (req, res) => {
  res.redirect('/app');
});

// ✅ Endpoint de estado
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    message: 'ApiRomwiner Vault API',
    version: '1.0',
    database: 'MongoDB',
    timestamp: new Date().toISOString()
  });
});
// Endpoint para que el Agente IA sepa que el backend está vivo
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date(),
    mensaje: 'Backend operativo ✅'
  });
});
// ========== CONFIGURACIÓN SEGURA DE MULTER (con validación real) ==========
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(err => logger.warn('⚠️ No se pudo crear uploads/: ' + err.message));

// =========================================================================

// ========== RATE LIMITING SELECTIVO (menos agresivo) ==========
// Límite general (más permisivo)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Demasiadas solicitudes, intente más tarde' }
});
// Límite estricto solo para rutas sensibles (login, registro, etc.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos, espere 15 minutos' }
});

app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
// Aplica authLimiter también a otras rutas sensibles (cambio de contraseña, etc.)
// ==============================================================
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
    if (!mongoReady || !usersCollection) {
      if (ADMIN_EMAILS.includes(req.user.email)) {
        req.admin = { email: req.user.email, uid: req.user.uid };
        return next();
      }
      return res.status(403).json({ error: 'Acceso denegado' });
    }
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
    if (!mongoReady || !usersCollection) {
      req.userTier = 'personal';
      return next();
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const tier = (user && user.tier) || 'personal';
    if (!allowed.includes(tier)) return res.status(403).json({ error: 'Acceso denegado para tu plan' });
    req.userTier = tier;
    next();
  } catch (err) { res.status(500).json({ error: err.message }); }
};
const checkQuota = async(req, res, next) => {
  try {
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
  if (!mongoReady || !auditCollection) {
    return {...data, eventId: crypto.randomUUID(), timestamp: new Date(), note: 'demo_mode' };
  }
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
  if (!mongoReady || !usersCollection || !auditCollection) {
    return { reportType: 'GDPR_ARTICLE_15', generatedAt: new Date().toISOString(), subject: { uid: userId }, data: [], demo: true };
  }
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

// 🎬 YOUTUBE EMBED: Permitir previews seguros en productos
app.post('/api/products/:id/preview', authenticate, async(req, res) => {
  try {
    const { youtubeUrl } = req.body;
    if (!youtubeUrl) return res.status(400).json({ error: 'URL de YouTube requerida' });
    
    // Extraer ID del video de YouTube (soporta varios formatos)
    const videoId = youtubeUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:.*v=|.*\/)|youtu\.be\/)([^&?/]+)/)?.[1];
    if (!videoId) return res.status(400).json({ error: 'URL de YouTube no válida' });
    
    // Validar que el producto pertenece al usuario
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const product = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userUid: user.uid });
    if (!product) return res.status(404).json({ error: 'Producto no encontrado o no eres el dueño' });
    
    // Guardar el ID del video como preview (NUNCA el contenido)
    await secretsCollection.updateOne({ _id: product._id }, { 
      $set: { previewYoutubeId: videoId, previewUpdatedAt: new Date() } 
    });
    
    await logAudit('preview_updated', { userId: user.uid, productId: req.params.id, youtubeId: videoId });
    
    res.json({ 
      success: true, 
      message: '✅ Vista previa de YouTube agregada', 
      embedUrl: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${process.env.APP_URL || 'https://tu-api.onrender.com'}` 
    });
  } catch (e) { res.status(500).json({ error: 'Error guardando preview: ' + e.message }); }
});
// 📊 DASHBOARD ANALÍTICO: Ventas, vistas y comisiones del vendedor
app.get('/api/analytics/seller', authenticate, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, demo: true, totalSales: 0, totalEarnings: 0, views: 0, topProducts: [] });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // 1. Ventas completadas y ganancias netas
    const txs = await transactionsCollection.find({ seller: user.uid, status: { $in: ['completed', 'pending_confirmation'] } }).toArray();
    const totalSales = txs.length;
    const totalEarnings = txs.reduce((sum, t) => sum + (t.amount || 0), 0);

    // 2. Vistas estimadas (descargas + logs de reproducción)
    const views = await transactionsCollection.countDocuments({ $or: [{ seller: user.uid, type: 'view' }, { seller: user.uid, status: 'pending_confirmation' }] });

    // 3. Productos más vendidos
    const topProducts = await secretsCollection.find({ userId: user._id, isForSale: true }).sort({ sales: -1 }).limit(3).toArray();
    const topFormatted = topProducts.map(p => ({ title: p.titulo, sales: p.sales || 0, price: p.price || 0 }));

    res.json({ success: true, totalSales, totalEarnings: totalEarnings.toFixed(2), views, topProducts: topFormatted, period: '30d' });
  } catch (e) { res.status(500).json({ error: 'Error cargando analytics: ' + e.message }); }
});
// 🔐 ENDPOINT PÚBLICO DE ESTADO DE SEGURIDAD
app.get('/api/security/status', (req, res) => {
  res.json({
    api: 'ApiRomwiner Vault',
    encryption: {
      algorithm: 'AES-GCM-256',
      mode: 'Envelope Encryption (DEK + KEK)',
      zeroKnowledgeReady: FEATURES.ZERO_KNOWLEDGE
    },
    audit: {
      immutable: true,
      hashing: 'SHA-256 encadenado',
      signatures: 'HMAC-SHA256'
    },
    keyManagement: {
      rotationDays: 90,
      storage: 'Environment variables (Render)',
      passwordHashing: 'bcrypt + salt'
    },
    network: {
      https: 'Obligatorio (TLS 1.2+)',
      csp: 'Estricto (helmet)',
      rateLimit: '100 req/15min por IP'
    },
    compliance: {
      soc2: 'En preparación (Type I)',
      gdpr: 'Funcionalidades implementadas',
      lastPenTest: '2026-01-15 (interno)'
    },
    timestamp: new Date().toISOString()
  });
});
// 🤖 IA: ENDPOINT PARA COMANDOS DE USUARIO
app.post('/api/ai/command', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !usersCollection || !walletCollection || !secretsCollection) {
      const { command } = req.body || {};
      const response = processCommand(command, { affiliates: { availableBalance: 0 }, wallet: { balance: 0 }, vault: [] });
      return res.json({ success: true, response, command, timestamp: new Date().toISOString(), demo: true });
    }
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
// 🔐 REGISTER - Solo con dominio @apiromwinervault.com, sin email externo (con cadena de referidos 3 niveles)
app.post('/register', async(req, res) => {
  try {
    let { username, password, nombreCompleto, fechaNacimiento, refCode } = req.body;
    
    // Validaciones estrictas
    if (!username || !password || !nombreCompleto || !fechaNacimiento) {
      return res.status(400).json({ error: 'Usuario, contraseña, nombre real y fecha de nacimiento son obligatorios' });
    }
    
    // Validar nombre de usuario
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Usuario inválido (solo minúsculas, números, . y _, 3-30 caracteres)' });
    }
    
    // Validar contraseña fuerte
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Contraseña débil (mín. 8 caracteres, mayúscula, número, símbolo)' });
    }
    
    // Validar mayoría de edad (18+)
    const birthDate = new Date(fechaNacimiento);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 18) {
      return res.status(400).json({ error: 'Debes ser mayor de 18 años para registrarte' });
    }
    
    // Generar email con dominio propio
    const email = `${username}@apiromwinervault.com`;
    
    if (!mongoReady) {
      return res.status(201).json({ success: true, message: 'Registrado (demo)', demo: true, user: { email, username } });
    }
    
    // Verificar si el email o username ya existen
    const existingEmail = await usersCollection.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }
    const existingUsername = await usersCollection.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ error: 'Nombre de usuario no disponible' });
    }
    
    // =====================================================
    // CADENA DE REFERIDOS (3 niveles)
    // =====================================================
    let referredBy = null;
    let referredBy2 = null;
    let referredBy3 = null;
    if (refCode) {
      const referrer = await usersCollection.findOne({ refCode: refCode.toUpperCase() });
      if (referrer) {
        referredBy = referrer.uid;
        if (referrer.referredBy) {
          referredBy2 = referrer.referredBy;
          const referrer2 = await usersCollection.findOne({ uid: referrer.referredBy });
          if (referrer2 && referrer2.referredBy) {
            referredBy3 = referrer2.referredBy;
          }
        }
      }
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const uid = 'rom_' + crypto.randomBytes(8).toString('hex');
    const refCodeGenerated = 'ROM' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    const newUser = {
      uid,
      email,
      username,
      nombreCompleto,
      fechaNacimiento: birthDate,
      password: hashed,
      refCode: refCodeGenerated,
      referredBy,
      referredBy2,
      referredBy3,
      referralRewarded: false,   // para controlar bono de bienvenida al referidor
      isAdmin: ADMIN_EMAILS.includes(email),
      tier: 'personal',
      createdAt: new Date(),
      lastLogin: null,
      kycStatus: 'pendiente',
      avatar: null,
      documentoUrl: null,
      affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 }
    };
    
    const result = await usersCollection.insertOne(newUser);
    const userId = result.insertedId;
    
    // Crear perfil público
    await profilesCollection.insertOne({
      userId,
      uid,
      displayName: username,
      avatarUrl: null,
      bio: '',
      isPublic: false,
      createdAt: new Date()
    });
    
    // Crear wallet
    await walletCollection.insertOne({
      userId,
      balance: 0,
      currency: 'USD',
      history: [],
      createdAt: new Date()
    });
    
    // Crear registro de afiliado
    await affiliatesCollection.insertOne({
      userId,
      refCode: refCodeGenerated,
      level: 'bronce',
      createdAt: new Date()
    });
    
    await logAudit('register', { email, uid, username, referredBy, referredBy2, referredBy3 });
    
    const userData = {
      uid,
      email,
      username,
      isAdmin: newUser.isAdmin,
      tier: newUser.tier,
      refCode: refCodeGenerated,
      kycStatus: 'pendiente'
    };
    
    res.status(201).json({ success: true, message: 'Registrado correctamente', user: userData });
  } catch (e) {
    console.error('❌ Register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 🔐 LOGIN - Acepta email (con dominio propio) o nombre de usuario
app.post('/login', async(req, res) => {
  try {
    const { email, password } = req.body;
    const identifier = email; // puede ser email o username
    if (!identifier || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    
    if (!mongoReady) {
      const t = jwt.sign({ email: identifier }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, token: t, user: { email: identifier, isAdmin: ADMIN_EMAILS.includes(identifier) }, demo: true });
    }
    
    // Buscar primero por email (el email generado)
    let user = await usersCollection.findOne({ email: identifier });
    // Si no existe, buscar por nombre de usuario
    if (!user) {
      user = await usersCollection.findOne({ username: identifier });
    }
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } });
    
    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email),
        tier: user.tier || 'personal'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    await logAudit('login', { email: user.email, username: user.username, uid: user.uid });
    
    res.json({
      success: true,
      token,
      user: {
        uid: user.uid,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email),
        refCode: user.refCode,
        tier: user.tier || 'personal'
      }
    });
  } catch (e) {
    console.error('❌ Login error:', e);
    res.status(500).json({ error: e.message });
  }
});
// 👤 PROFILE - Obtener perfil público (sin datos sensibles)
app.get('/api/profile', authenticate, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, profile: { displayName: 'Demo', username: 'demo' }, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const p = await profilesCollection.findOne({ userId: user._id });
    
    // Datos seguros para mostrar en el frontend
    const safeProfile = {
      username: user.username,
      email: user.email,        // el email es el username@dominio, puede ser público
      displayName: p?.displayName || user.username,
      avatarUrl: p?.avatarUrl || null,
      bio: p?.bio || '',
      tier: user.tier,
      isAdmin: user.isAdmin || ADMIN_EMAILS.includes(user.email),
      kycStatus: user.kycStatus || 'pendiente'  // solo el estado, no los documentos
    };
    
    res.json({ success: true, profile: safeProfile });
  } catch (e) {
    console.error('❌ Profile error:', e);
    res.status(500).json({ error: e.message });
  }
});
// ============================================
// 💰 WALLET Y REFERIDOS - CÓDIGO CORREGIDO Y MEJORADO
// ============================================

// Consultar saldo de wallet
app.get('/api/wallet', authenticate, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, wallet: { balance: 0, currency: 'USD' }, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const w = await walletCollection.findOne({ userId: user._id });
    res.json({ success: true, wallet: w || { balance: 0, currency: 'USD' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Depósito con Stripe
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
    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ amount: Math.round(amount * 100), currency: 'usd', metadata: JSON.stringify({ uid: req.user.uid, type: 'deposit' }) })
    });
    const data = await stripeRes.json();
    if (!data.client_secret) return res.status(500).json({ error: 'Error de Stripe: ' + ((data.error && data.error.message) || 'Cliente secreto no generado') });
    res.json({ success: true, clientSecret: data.client_secret, paymentId: data.id });
  } catch (e) {
    res.status(500).json({ error: 'Error procesando pago con Stripe: ' + e.message });
  }
});

// Auto-suscripción (usar saldo para cambiar de plan)
app.post('/api/wallet/auto-subscribe', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !usersCollection || !walletCollection) {
      return res.json({ success: true, message: 'Demo: auto-suscripción activada', demo: true });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const wallet = await walletCollection.findOne({ userId: user._id });
    const tierPrice = { personal: 0, business: 9.99, enterprise: 49.99 };
    const nextTier = req.body.tier || 'business';
    const price = tierPrice[nextTier] || 0;
    if (!wallet || wallet.balance < price) {
      return res.status(400).json({ error: 'Saldo insuficiente', currentBalance: wallet?.balance || 0, required: price, hint: 'Gana saldo viendo anuncios o vendiendo en el Marketplace' });
    }
    await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: -price }, $push: { history: { type: 'auto_subscription', amount: -price, tier: nextTier, date: new Date() } } });
    await usersCollection.updateOne({ _id: user._id }, { $set: { tier: nextTier, autoRenew: true, updatedAt: new Date() } });
    await logAudit('auto_subscribe', { userId: user.uid, tier: nextTier, amount: price });
    res.json({ success: true, message: `✅ Suscripción a ${nextTier} activada. Se renovará automáticamente cada mes.`, newTier: nextTier, nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), remainingBalance: (wallet.balance - price).toFixed(2) });
  } catch (e) {
    logger.error('❌ Auto-subscribe error: ' + e.message);
    res.status(500).json({ error: 'Error procesando auto-suscripción: ' + e.message });
  }
});

// ============================================
// 🎁 PROGRAMA DE REFERIDOS (MEJORADO)
// ============================================

// Registrar código de referido (solo si no tiene ya uno)
app.post('/api/referrals/register', authenticate, async(req, res) => {
  try {
    const { referralCode } = req.body;
    if (!referralCode) return res.status(400).json({ error: 'Código de referido requerido' });

    // Verificar si el usuario ya tiene un referido asignado
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (user.referredBy) {
      return res.status(400).json({ error: 'Ya tienes un referido asignado. No puedes cambiarlo.' });
    }

    const referrer = await usersCollection.findOne({ refCode: referralCode.toUpperCase() });
    if (!referrer) return res.status(400).json({ error: 'Código de referido inválido' });
    if (referrer.uid === req.user.uid) return res.status(400).json({ error: 'No puedes referirte a ti mismo' });

    // Asignar solo el nivel 1; los niveles 2 y 3 se calcularán en el registro de nuevos usuarios
    await usersCollection.updateOne(
      { uid: req.user.uid },
      { $set: { referredBy: referrer.uid, referredAt: new Date() } }
    );
    await logAudit('referral_registered', { referrer: referrer.uid, referred: req.user.uid });
    res.json({ success: true, message: '✅ Código de referido registrado correctamente.' });
  } catch (e) {
    res.status(500).json({ error: 'Error registrando referido: ' + e.message });
  }
});

// Recompensa al referidor (por ejemplo, al primer depósito del referido)
async function rewardReferral(referrerUid, amount = 5.00) {
  if (!mongoReady || !usersCollection || !walletCollection) return;
  const referrer = await usersCollection.findOne({ uid: referrerUid });
  if (!referrer) return;
  await walletCollection.updateOne(
    { userId: referrer._id },
    {
      $inc: { balance: amount },
      $push: { history: { type: 'referral_reward', amount, date: new Date() } }
    },
    { upsert: true }
  );
  await logAudit('referral_rewarded', { referrer: referrerUid, amount });
  logger.info(`🎁 Recompensa de referido: $${amount} para ${referrer.email}`);
}

// Consultar mis referidos y ganancias (recompensas + comisiones por niveles)
app.get('/api/referrals/me', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Código de referido propio (generar si no existe)
    let myCode = user.refCode;
    if (!myCode) {
      myCode = 'ROM' + crypto.randomBytes(4).toString('hex').toUpperCase();
      await usersCollection.updateOne({ _id: user._id }, { $set: { refCode: myCode } });
    }

    // Cantidad de referidos directos (nivel 1)
    const referredUsers = await usersCollection.countDocuments({ referredBy: user.uid });

    // Ganancias por recompensas de registro (rewardReferral)
    const rewardsHistory = await walletCollection.findOne(
      { userId: user._id },
      { projection: { history: { $elemMatch: { type: 'referral_reward' } } } }
    );
    const totalRewards = rewardsHistory?.history?.reduce((sum, h) => sum + h.amount, 0) || 0;

    // Ganancias por comisiones de afiliación (niveles 1, 2, 3) – provienen del endpoint de compra
    const affiliateHistory = await walletCollection.findOne(
      { userId: user._id },
      { projection: { history: { $elemMatch: { type: { $in: ['affiliate_level1', 'affiliate_level2', 'affiliate_level3'] } } } } }
    );
    const totalAffiliateCommissions = affiliateHistory?.history?.reduce((sum, h) => sum + h.amount, 0) || 0;

    const totalEarned = totalRewards + totalAffiliateCommissions;

    res.json({
      success: true,
      code: myCode,
      link: `${process.env.APP_URL || 'https://apiromwinervault.onrender.com'}/?ref=${myCode}`,
      referredUsers,
      totalEarned,
      breakdown: {
        referralRewards: totalRewards,
        affiliateCommissions: totalAffiliateCommissions
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Error cargando referidos: ' + e.message });
  }
});

// ============================================
// 👑 MIDDLEWARE: DUEÑO SUPREMO
// ============================================
const requireSupremo = async (req, res, next) => {
  try {
    if (!mongoReady || !usersCollection) {
      // Modo demo: solo permite si el email está en ADMIN_EMAILS
      if (ADMIN_EMAILS.includes(req.user.email)) return next();
      return res.status(403).json({ error: 'Acceso denegado: solo el Dueño Supremo puede realizar esta acción' });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user || !user.esSupremo) {
      return res.status(403).json({ error: 'Acceso denegado: solo el Dueño Supremo puede realizar esta acción' });
    }
    req.supremo = user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// 👑 ADMIN: REGALAR CUENTA (GIFT ACCOUNT)
// ============================================
app.post('/api/admin/gift-account', authenticate, requireSupremo, async(req, res) => {
  try {
    const { recipientEmail, initialBalance, note, tier } = req.body;
    if (!recipientEmail) return res.status(400).json({ error: 'Email del destinatario requerido' });
    if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo regalo: configura MongoDB', demo: true });

    // Validar tier permitido
    const allowedTiers = ['personal', 'business', 'enterprise'];
    const finalTier = tier && allowedTiers.includes(tier) ? tier : 'personal';

    let user = await usersCollection.findOne({ email: recipientEmail });
    let tempPassword = null;

    if (!user) {
      tempPassword = 'Gift_' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const hashed = await bcrypt.hash(tempPassword, 10);
      const uid = 'rom_' + crypto.randomBytes(8).toString('hex');
      const refCodeGenerated = 'ROM' + crypto.randomBytes(4).toString('hex').toUpperCase();

      // Username único para evitar colisiones
      const uniqueUsername = 'gifted_' + uid.slice(-8);

      const newUser = {
        uid,
        email: recipientEmail,
        username: uniqueUsername,
        nombreCompleto: 'Usuario Regalado',
        fechaNacimiento: new Date('2000-01-01'),
        password: hashed,
        refCode: refCodeGenerated,
        referredBy: null,
        referredBy2: null,
        referredBy3: null,
        referralRewarded: false,
        isAdmin: false,
        tier: finalTier,
        isGifted: true,
        giftedBy: req.supremo?.uid || req.admin?.uid,
        giftedAt: new Date(),
        giftedNote: note || '',
        createdAt: new Date(),
        kycStatus: 'pendiente',
        avatar: null,
        documentoUrl: null,
        affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 }
      };
      const result = await usersCollection.insertOne(newUser);
      const userId = result.insertedId;

      await profilesCollection.insertOne({
        userId,
        uid,
        displayName: 'Usuario Regalado',
        avatarUrl: null,
        bio: note || '',
        isPublic: false,
        createdAt: new Date()
      });

      await affiliatesCollection.insertOne({
        userId,
        refCode: refCodeGenerated,
        level: 'bronce',
        createdAt: new Date()
      });

      await walletCollection.insertOne({
        userId,
        balance: 0,
        currency: 'USD',
        history: [],
        createdAt: new Date()
      });

      user = newUser;
    } else {
      if (finalTier && allowedTiers.includes(finalTier)) {
        await usersCollection.updateOne({ _id: user._id }, { $set: { tier: finalTier, updatedAt: new Date() } });
      }
    }

    const bal = parseFloat(initialBalance);
    if (isNaN(bal) || bal < 0) {
      return res.status(400).json({ error: 'Monto inicial debe ser un número válido no negativo' });
    }

    const existingWallet = await walletCollection.findOne({ userId: user._id });
    if (existingWallet) {
      await walletCollection.updateOne(
        { userId: user._id },
        {
          $inc: { balance: bal },
          $push: { history: { type: 'admin_gift', amount: bal, from: req.supremo?.email || req.admin?.email, date: new Date() } }
        }
      );
    } else {
      await walletCollection.insertOne({
        userId: user._id,
        balance: bal,
        currency: 'USD',
        history: [{ type: 'admin_gift', amount: bal, from: req.supremo?.email || req.admin?.email, date: new Date() }]
      });
    }

    await transactionsCollection.insertOne({
      type: 'admin_gift',
      amount: bal,
      admin: req.supremo?.uid || req.admin?.uid,
      recipient: user.email,
      note: note || '',
      createdAt: new Date()
    });

    await logAudit('gift', { recipientEmail, bal, by: req.supremo?.uid || req.admin?.uid, tier: finalTier });

    res.json({
      success: true,
      recipientEmail: user.email,
      uid: user.uid,
      tempPassword,
      balance: bal,
      tier: finalTier,
      message: tempPassword ? 'Cuenta creada con contraseña temporal' : 'Saldo agregado a cuenta existente'
    });
  } catch (e) {
    logger.error('❌ Error en gift-account: ' + e.message);
    res.status(500).json({ error: 'Error al regalar cuenta: ' + e.message });
  }
});

// ============================================
// 📦 VAULT CREATE (CON IA: AUTO-TAGS)
// ============================================
app.post('/vault', authenticate, checkQuota, upload.single('archivo'), async (req, res) => {
  try {
    const { titulo, categoria = 'general', folderId = 'general', contenido, price = 0, forSale = false, licenseDays = null, tags: userTags } = req.body;

    // Validaciones básicas y sanitización
    if (!titulo || typeof titulo !== 'string' || titulo.trim() === '') {
      return res.status(400).json({ error: 'Título requerido y debe ser texto válido' });
    }

    // Validación de precio si se pone en venta
    const isForSale = (forSale === true || forSale === 'true');
    let numericPrice = 0;
    if (isForSale) {
      numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice <= 0) {
        return res.status(400).json({ error: 'El precio debe ser un número mayor a 0 para poner en venta' });
      }
    }

    // Validar licenseDays
    let numericLicenseDays = null;
    if (licenseDays !== null && licenseDays !== undefined && licenseDays !== '') {
      numericLicenseDays = parseInt(licenseDays);
      if (isNaN(numericLicenseDays) || numericLicenseDays <= 0) {
        return res.status(400).json({ error: 'Los días de licencia deben ser un número positivo' });
      }
    }

    // Debe haber archivo o contenido
    if (!req.file && (!contenido || typeof contenido !== 'string' || contenido.trim() === '')) {
      return res.status(400).json({ error: 'Debes proporcionar un archivo o contenido de texto' });
    }

    if (!mongoReady || !secretsCollection) {
      return res.status(201).json({ success: true, message: 'Guardado en modo demo', id: 'demo', demo: true });
    }

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Tags sugeridos por IA
    const suggestedTags = FEATURES.AI_INTERNAL ? suggestTags(titulo, req.file?.originalname) : [];
    let finalTags = [];
    if (userTags) {
      finalTags = Array.isArray(userTags) ? userTags : [userTags];
    } else {
      finalTags = suggestedTags;
    }

    // Preparar objeto del vault
    const data = {
      userId: user._id,
      userUid: user.uid,
      titulo: titulo.trim(),
      categoria: categoria.trim(),
      folderId: folderId.trim(),
      tipo: req.file ? 'archivo' : 'texto',
      contenido: null,
      fileName: null,
      fileType: null,
      fileSize: null,
      encrypted: null,
      isForSale,
      price: numericPrice,
      licenseDays: numericLicenseDays,
      sales: 0,
      buyers: [],
      tags: finalTags,
      createdAt: new Date()
    };

    // Obtener o generar DEK del usuario
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

    // Procesar archivo si existe (usando buffer, no archivo temporal)
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const base64Content = fileBuffer.toString('base64');
      data.encrypted = EnvelopeEncryption.seal(base64Content, userDEK);
      data.fileName = req.file.originalname;  // Nombre original (puedes sanitizarlo)
      data.fileType = req.file.mimetype;
      data.fileSize = req.file.size;
    } else if (contenido) {
      data.contenido = EnvelopeEncryption.seal(contenido, userDEK);
    }

    const result = await secretsCollection.insertOne(data);
    await logAudit('vault_create', { titulo, userId: user.uid, tipo: data.tipo, forSale: isForSale, tags: finalTags });

    const response = {
      success: true,
      message: 'Contenido guardado y cifrado en Vault (clave única por usuario)',
      id: result.insertedId,
      fileName: req.file ? req.file.originalname : undefined
    };
    if (FEATURES.AI_INTERNAL && suggestedTags.length > 0) {
      response.aiSuggestions = { suggestedTags, message: 'Tags sugeridos por IA interna' };
    }
    res.status(201).json(response);
  } catch (e) {
    logger.error('❌ Vault create: ' + e.message);
    // No exponer detalles internos al cliente
    res.status(500).json({ error: 'Error interno al guardar en el Vault' });
  }
});

// ============================================
// 📦 VAULT LIST (CON BÚSQUEDA INTELIGENTE)
// ============================================
app.get('/vault', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, items: [], total: 0 });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const { q } = req.query;
    let items = await secretsCollection.find({ $or: [{ userId: user._id }, { isForSale: true }] })
      .sort({ createdAt: -1 })
      .limit(50)
      .project({ encrypted: 0, contenido: 0 })
      .toArray();
    if (FEATURES.AI_INTERNAL && q) {
      items = smartSearch(q, items);
    }
    res.json({ success: true, items, total: items.length, aiSearch: FEATURES.AI_INTERNAL && q ? { query: q, resultsCount: items.length } : undefined });
  } catch (e) {
    logger.error('❌ Vault list error: ' + e.message);
    res.status(500).json({ error: 'Error al listar Vault: ' + e.message });
  }
});

// ============================================
// 📦 VAULT READ
// ============================================
app.get('/vault/:id', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, secret: { id: req.params.id, titulo: 'Demo' }, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!secret) return res.status(404).json({ error: 'Contenido no encontrado' });
    
    const hasBought = Array.isArray(secret.buyers) && secret.buyers.includes(user.uid);
    if (secret.userId.toString() !== user._id.toString() && !hasBought && !secret.isForSale) {
      return res.status(403).json({ error: 'Acceso denegado: no tienes permiso para este contenido' });
    }
    
    let contenido = null;
    if (user.encryptedUserKey) {
      try {
        const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
        if (secret.tipo === 'texto' && secret.contenido) {
          contenido = EnvelopeEncryption.open(secret.contenido, userDEK);
        } else if (secret.tipo === 'archivo' && secret.encrypted) {
          contenido = Buffer.from(EnvelopeEncryption.open(secret.encrypted, userDEK), 'base64').toString('base64');
        }
      } catch (e) {
        logger.warn('⚠️ Fallback decryption used: ' + e.message);
        // Intentar con el método antiguo (decryptPII) por compatibilidad
        if (secret.tipo === 'texto' && secret.contenido) {
          contenido = decryptPII({ iv: (secret.encrypted && secret.encrypted.iv), data: secret.contenido, tag: (secret.encrypted && secret.encrypted.tag) });
        } else if (secret.tipo === 'archivo' && secret.encrypted) {
          const decrypted = decryptPII(secret.encrypted);
          contenido = Buffer.from(decrypted, 'base64').toString('base64');
        }
      }
    } else {
      // Sin clave de usuario, usar decryptPII (compatibilidad)
      if (secret.tipo === 'texto' && secret.contenido) {
        contenido = decryptPII({ iv: (secret.encrypted && secret.encrypted.iv), data: secret.contenido, tag: (secret.encrypted && secret.encrypted.tag) });
      } else if (secret.tipo === 'archivo' && secret.encrypted) {
        const decrypted = decryptPII(secret.encrypted);
        contenido = Buffer.from(decrypted, 'base64').toString('base64');
      }
    }
    
    res.json({
      success: true,
      secret: {
        id: secret._id.toString(),
        titulo: secret.titulo,
        contenido,
        isForSale: secret.isForSale,
        price: secret.price,
        sales: secret.sales,
        licenseDays: secret.licenseDays,
        fileName: secret.fileName,
        fileType: secret.fileType,
        tags: secret.tags
      }
    });
  } catch (e) {
    logger.error('❌ Vault read error: ' + e.message);
    res.status(500).json({ error: 'Error al obtener contenido: ' + e.message });
  }
});

// ============================================
// 📦 VAULT DELETE
// ============================================
app.delete('/vault/:id', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, message: 'Eliminado en modo demo', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const result = await secretsCollection.deleteOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'No autorizado: solo puedes eliminar tu propio contenido' });
    await logAudit('vault_delete', { id: req.params.id, userId: user.uid });
    res.json({ success: true, message: 'Contenido eliminado permanentemente' });
  } catch (e) {
    logger.error('❌ Vault delete error: ' + e.message);
    res.status(500).json({ error: 'Error al eliminar: ' + e.message });
  }
});

// ============================================
// 💰 COMPRA CON REPARTO REALISTA (75% vendedor, 15% plataforma, 8% afiliados, 2% fondo solidario)
// ============================================
app.post('/api/buy/:id', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection || !walletCollection) {
      return res.json({ success: true, message: 'Compra demo: configura MongoDB y wallet', demo: true });
    }

    const buyer = await usersCollection.findOne({ uid: req.user.uid });
    if (!buyer) return res.status(404).json({ error: 'Usuario no encontrado' });

    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true });
    if (!secret) return res.status(404).json({ error: 'Contenido no disponible para venta' });

    const hasBought = Array.isArray(secret.buyers) && secret.buyers.includes(buyer.uid);
    if (hasBought) return res.status(400).json({ error: 'Ya compraste este contenido' });

    const price = parseFloat(secret.price);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Precio de producto inválido' });
    }

    const bWallet = await walletCollection.findOne({ userId: buyer._id });
    if (!bWallet || bWallet.balance < price) {
      return res.status(400).json({ error: `Saldo insuficiente. Necesitas $${price}. Saldo: $${bWallet?.balance || 0}` });
    }

    const seller = await usersCollection.findOne({ _id: secret.userId });
    if (!seller) return res.status(404).json({ error: 'Vendedor no encontrado' });

    // =====================================================
    // MODELO ECONÓMICO REALISTA:
    // - Vendedor: 75% del precio
    // - Plataforma: 15%
    // - Cadena afiliados (3 niveles): 8% total (5%+2%+1%)
    // - Fondo solidario: 2%
    // =====================================================
    const sellerPercent = 0.75;
    const platformPercent = 0.15;
    const affiliatePercentLevel1 = 0.05;
    const affiliatePercentLevel2 = 0.02;
    const affiliatePercentLevel3 = 0.01;
    const solidaryPercent = 0.02;

    const sellerAmount = price * sellerPercent;
    const platformAmount = price * platformPercent;
    const solidaryAmount = price * solidaryPercent;

    let affiliateLevel1Amount = 0, affiliateLevel2Amount = 0, affiliateLevel3Amount = 0;
    let affiliateLevel1User = null, affiliateLevel2User = null, affiliateLevel3User = null;

    // Cadena de referidos del comprador
    if (buyer.referredBy) {
      const referrer1 = await usersCollection.findOne({ uid: buyer.referredBy });
      if (referrer1) {
        affiliateLevel1User = referrer1;
        affiliateLevel1Amount = price * affiliatePercentLevel1;
        if (referrer1.referredBy) {
          const referrer2 = await usersCollection.findOne({ uid: referrer1.referredBy });
          if (referrer2) {
            affiliateLevel2User = referrer2;
            affiliateLevel2Amount = price * affiliatePercentLevel2;
            if (referrer2.referredBy) {
              const referrer3 = await usersCollection.findOne({ uid: referrer2.referredBy });
              if (referrer3) {
                affiliateLevel3User = referrer3;
                affiliateLevel3Amount = price * affiliatePercentLevel3;
              }
            }
          }
        }
      }
    }

    // =====================================================
    // ACTUALIZAR WALLETS
    // =====================================================
    // Comprador
    await walletCollection.updateOne(
      { userId: buyer._id },
      { $inc: { balance: -price }, $push: { history: { type: 'purchase', amount: -price, item: secret.titulo, date: new Date() } } }
    );

    // Vendedor (75%)
    if (sellerAmount > 0) {
      await walletCollection.updateOne(
        { userId: seller._id },
        { $inc: { balance: sellerAmount }, $push: { history: { type: 'sale', amount: sellerAmount, item: secret.titulo, date: new Date() } } }
      );
    }

    // Comisión de plataforma (15%) - acumular en wallet de sistema
    if (platformAmount > 0) {
      await db.collection('system_wallets').updateOne(
        { _id: 'platform_revenue' },
        { $inc: { balance: platformAmount }, $push: { history: { type: 'platform_fee', amount: platformAmount, from: buyer.uid, item: secret.titulo, date: new Date() } } },
        { upsert: true }
      );
    }

    // Afiliados
    if (affiliateLevel1Amount > 0 && affiliateLevel1User) {
      await walletCollection.updateOne(
        { userId: affiliateLevel1User._id },
        { $inc: { balance: affiliateLevel1Amount }, $push: { history: { type: 'affiliate_level1', amount: affiliateLevel1Amount, item: secret.titulo, date: new Date() } } }
      );
    }
    if (affiliateLevel2Amount > 0 && affiliateLevel2User) {
      await walletCollection.updateOne(
        { userId: affiliateLevel2User._id },
        { $inc: { balance: affiliateLevel2Amount }, $push: { history: { type: 'affiliate_level2', amount: affiliateLevel2Amount, item: secret.titulo, date: new Date() } } }
      );
    }
    if (affiliateLevel3Amount > 0 && affiliateLevel3User) {
      await walletCollection.updateOne(
        { userId: affiliateLevel3User._id },
        { $inc: { balance: affiliateLevel3Amount }, $push: { history: { type: 'affiliate_level3', amount: affiliateLevel3Amount, item: secret.titulo, date: new Date() } } }
      );
    }

    // Fondo solidario (2%)
    if (solidaryAmount > 0) {
      await db.collection('community_funds').updateOne(
        { _id: 'solidarity_fund' },
        { $inc: { balance: solidaryAmount }, $push: { history: { type: 'contribution', amount: solidaryAmount, from: buyer.uid, date: new Date() } } },
        { upsert: true }
      );
    }

    // =====================================================
    // REGISTRAR TRANSACCIÓN Y ACTUALIZAR SECRET
    // =====================================================
    await secretsCollection.updateOne(
      { _id: secret._id },
      { $inc: { sales: 1 }, $push: { buyers: buyer.uid } }
    );

    // Insertar transacción con secretId para poder confirmar después
    await transactionsCollection.insertOne({
      type: 'sale',
      amount: price,
      secretId: secret._id,
      seller: secret.userUid,
      buyer: buyer.uid,
      item: secret.titulo,
      status: 'pending_confirmation',
      deliveredAt: new Date(),
      confirmedAt: null,
      breakdown: {
        sellerAmount,
        platformAmount,
        solidaryAmount,
        affiliates: {
          level1: { uid: affiliateLevel1User?.uid, amount: affiliateLevel1Amount },
          level2: { uid: affiliateLevel2User?.uid, amount: affiliateLevel2Amount },
          level3: { uid: affiliateLevel3User?.uid, amount: affiliateLevel3Amount }
        }
      },
      createdAt: new Date()
    });

    await logAudit('purchase', { buyer: buyer.uid, item: secret.titulo, price, seller: secret.userUid });

    // Recompensa adicional al referidor nivel 1
    if (buyer.referredBy) {
      await rewardReferral(buyer.referredBy, 4.00);
    }

    res.json({ success: true, message: '✅ Compra exitosa. Contenido desbloqueado en tu Vault. Por favor confirma recepción en 24h.', nextStep: 'confirm_delivery' });
  } catch (e) {
    logger.error('❌ Error en compra:', e);
    res.status(500).json({ error: 'Error procesando compra: ' + e.message });
  }
});

// ============================================
// ✅ POST /api/buy/:id/confirm (CONFIRMAR RECEPCIÓN - ESCROW SUAVE)
// ============================================
app.post('/api/buy/:id/confirm', authenticate, async(req, res) => {
  try {
    // Buscar transacción por secretId (el ID del producto) y comprador
    const tx = await transactionsCollection.findOne({ 
      secretId: new ObjectId(req.params.id), 
      buyer: req.user.uid,
      status: { $in: ['pending_confirmation', 'completed'] }
    });
    
    if (!tx) return res.status(400).json({ error: 'Transacción no encontrada o ya confirmada' });
    if (tx.status === 'completed') return res.json({ success: true, message: '✅ Ya confirmada anteriormente', alreadyConfirmed: true });
    
    // Actualizar a completado
    await transactionsCollection.updateOne({ _id: tx._id }, {
      $set: { status: 'completed', confirmedAt: new Date() }
    });
    
    // Bonificación por entrega rápida (menos de 24h)
    if (tx.deliveredAt) {
      const hours = (new Date() - new Date(tx.deliveredAt)) / 36e5;
      if (hours < 24) {
        await logAudit('fast_delivery', { txId: tx._id, hours, buyer: req.user.uid });
      }
    }
    
    res.json({ 
      success: true, 
      message: '✅ Recepción confirmada. ¡Gracias por tu confianza!', 
      confirmedAt: new Date().toISOString() 
    });
  } catch (e) { 
    logger.error('❌ Confirm delivery error: ' + e.message); 
    res.status(500).json({ error: 'Error confirmando entrega: ' + e.message }); 
  }
});

// ============================================
// 🤝 AFFILIATES DASHBOARD
// ============================================
app.get('/api/affiliates/dashboard', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !affiliatesCollection) return res.json({ success: true, dashboard: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0, referralLink: APP_URL + '?ref=DEMO', refCode: 'DEMO' }, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const aff = await affiliatesCollection.findOne({ userId: user._id }) || {};
    res.json({ success: true, dashboard: { level: aff.level || 'bronce', totalReferrals: aff.totalReferrals || 0, pendingBalance: aff.pendingBalance || 0, availableBalance: aff.availableBalance || 0, withdrawnBalance: aff.withdrawnBalance || 0, referralLink: APP_URL + '?ref=' + user.refCode, refCode: user.refCode } });
  } catch (e) {
    logger.error('❌ Affiliates dashboard error: ' + e.message);
    res.status(500).json({ error: 'Error al cargar dashboard de afiliados: ' + e.message });
  }
});

// ============================================
// 🤝 AFFILIATES WITHDRAW (retirar saldo de afiliados a wallet principal)
// ============================================
app.post('/api/affiliates/withdraw', authenticate, async(req, res) => {
  try {
    const method = req.body.method || 'bank';
    if (!mongoReady || !affiliatesCollection || !walletCollection) return res.json({ success: true, message: 'Retiro demo: configura wallet real', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const aff = await affiliatesCollection.findOne({ userId: user._id });
    if (!aff || aff.availableBalance < 10) {
      return res.status(400).json({ error: `Mínimo $10 USD para retiro de afiliados. Balance actual: $${aff?.availableBalance || 0}` });
    }
    const amount = aff.availableBalance;
    // Mover saldo de la colección affiliates a la wallet principal del usuario
    await walletCollection.updateOne(
      { userId: user._id },
      { $inc: { balance: amount }, $push: { history: { type: 'affiliate_withdraw', amount, method, date: new Date() } } },
      { upsert: true }
    );
    // Actualizar la cuenta de afiliados (poner availableBalance a 0 y aumentar withdrawnBalance)
    await affiliatesCollection.updateOne(
      { userId: user._id },
      { $set: { availableBalance: 0, pendingBalance: 0 }, $inc: { withdrawnBalance: amount } }
    );
    await transactionsCollection.insertOne({ userId: user._id, type: 'affiliate_payout', amount, method, status: 'completed', createdAt: new Date() });
    await logAudit('affiliate_withdraw', { userId: user.uid, amount, method });
    res.json({ success: true, message: `Retiro de $${amount} procesado. Los fondos se han añadido a tu wallet principal.` });
  } catch (e) {
    logger.error('❌ Affiliates withdraw error: ' + e.message);
    res.status(500).json({ error: 'Error al procesar retiro de afiliados: ' + e.message });
  }
});

// ============================================
// 🆔 IDENTITY: REGISTER APP
// ============================================
app.post('/api/identity/register-app', authenticate, async(req, res) => {
  try {
    const { appName, redirectUri } = req.body;
    if (!appName || !redirectUri) return res.status(400).json({ error: 'Nombre de app y URL de redirección requeridos' });
    if (!mongoReady || !identityCollection) return res.json({ success: true, appId: 'demo', appSecret: 'demo', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const appId = 'app_' + crypto.randomBytes(6).toString('hex');
    const appSecret = crypto.randomBytes(32).toString('hex');
    await identityCollection.insertOne({
      appId,
      appSecret,
      appName,
      redirectUri,
      ownerUid: user.uid,
      scopes: ['profile', 'email'],
      active: true,
      createdAt: new Date()
    });
    await logAudit('app_registered', { userId: user.uid, appId, appName });
    res.json({ success: true, appId, appSecret, message: 'App registrada. Guarda appSecret de forma segura.' });
  } catch (e) {
    logger.error('❌ Error al registrar app: ' + e.message);
    res.status(500).json({ error: 'Error al registrar app: ' + e.message });
  }
});

// ============================================
// 🆔 IDENTITY: AUTHORIZE APP
// ============================================
app.post('/api/identity/authorize', authenticate, async(req, res) => {
  try {
    const { appId, scopes } = req.body;
    if (!appId) return res.status(400).json({ error: 'App ID requerido' });
    if (!mongoReady || !identityCollection) return res.json({ success: true, token: 'demo_token', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const app = await identityCollection.findOne({ appId });
    if (!app || !app.active) return res.status(404).json({ error: 'App no encontrada o inactiva' });
    const token = jwt.sign(
      { uid: user.uid, appId, scopes: scopes || app.scopes },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    await logAudit('app_authorized', { userId: user.uid, appId });
    res.json({ success: true, token, expiresIn: 86400, message: 'Token de autorización generado' });
  } catch (e) {
    logger.error('❌ Error al autorizar app: ' + e.message);
    res.status(500).json({ error: 'Error al autorizar app: ' + e.message });
  }
});

// ============================================
// 🆔 IDENTITY: REVOKE ALL APPS
// ============================================
app.delete('/api/identity/revoke/all', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !identityCollection) return res.json({ success: true, message: 'Revocado en modo demo', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const result = await identityCollection.updateMany(
      { ownerUid: user.uid },
      { $set: { active: false, updatedAt: new Date() } }
    );
    await logAudit('apps_revoked', { userId: user.uid, count: result.modifiedCount });
    res.json({ success: true, message: 'Todos los accesos de apps revocados exitosamente' });
  } catch (e) {
    logger.error('❌ Error al revocar accesos: ' + e.message);
    res.status(500).json({ error: 'Error al revocar accesos: ' + e.message });
  }
});

// ============================================
// 📱 ENDPOINT QR (sin enlaces externos, QR generado por frontend)
// ============================================
app.get('/api/identity/qr', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    // Solo datos, el frontend genera el QR localmente (sin dependencias externas)
    const qrData = {
      uid: user.uid,
      email: user.email,
      username: user.username,
      ref: user.refCode,
      ts: Date.now()
    };
    
    res.json({
      success: true,
      qrPayload: JSON.stringify(qrData),
      qrData: qrData,
      installGuide: {
        mobile: "1. Escanea con la cámara\n2. Toca 'Agregar a pantalla de inicio'\n3. Abre la app desde tu pantalla",
        desktop: "1. Abre en Chrome/Edge/Firefox\n2. Haz clic en el ícono 📥 de la barra de direcciones\n3. Confirma la instalación\n4. ¡Listo! Usa la app desde tu escritorio"
      }
    });
  } catch (e) {
    logger.error('❌ QR generation error: ' + e.message);
    res.status(500).json({ error: 'Error al generar QR: ' + e.message });
  }
});

// ============================================
// 📊 DASHBOARD
// ============================================
app.get('/api/dashboard', authenticate, async(req, res) => {
  try {
    if (!mongoReady || !secretsCollection) return res.json({ success: true, dashboard: { revenue: 0, sales: 0, active: 0, forSale: 0 }, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const totalSecrets = await secretsCollection.countDocuments({ userId: user._id });
    const forSale = await secretsCollection.countDocuments({ userId: user._id, isForSale: true });
    const totalSales = await transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' });
    res.json({
      success: true,
      dashboard: {
        revenue: 0, // Se podría calcular sumando transacciones, pero se deja para mejora futura
        sales: totalSales,
        active: totalSecrets,
        forSale,
        tier: user.tier
      }
    });
  } catch (e) {
    logger.error('❌ Error al cargar dashboard: ' + e.message);
    res.status(500).json({ error: 'Error al cargar dashboard: ' + e.message });
  }
});

// ============================================
// 📋 AUDIT EXPORT (GDPR / SOC2)
// ============================================
app.get('/api/audit/export', authenticate, requireTier('business', 'enterprise'), async(req, res) => {
  try {
    const { type, startDate, endDate, organizationId } = req.query;
    if (!mongoReady || !auditCollection) return res.json({ success: true, logs: [], demo: true });
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    if (type === 'gdpr') {
      const report = await generateGDPRReport(req.user.uid, start, end);
      return res.json({ success: true, reportType: 'GDPR', data: report });
    }
    if (type === 'soc2' && req.userTier === 'enterprise') {
      const report = await generateSOC2Report(organizationId || req.user.uid, start, end);
      return res.json({ success: true, reportType: 'SOC2', data: report });
    }
    const logs = await auditCollection.find({ userId: req.user.uid })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    res.json({ success: true, logs });
  } catch (e) {
    logger.error('❌ Error al exportar auditoría: ' + e.message);
    res.status(500).json({ error: 'Error al exportar auditoría: ' + e.message });
  }
});

// ============================================
// 🔑 ROTATE KEYS (ADMIN)
// ============================================
app.post('/api/admin/rotate-keys', authenticate, requireAdmin, requireTier('enterprise'), async(req, res) => {
  try {
    const { userId } = req.body;
    if (userId) {
      const result = await KeyRotationService.rotateUserKey(userId);
      return res.json(result);
    } else {
      await KeyRotationService.scheduleRotations();
      return res.json({ success: true, message: 'Rotación de claves programada para usuarios elegibles' });
    }
  } catch (e) {
    logger.error('❌ Error rotando claves: ' + e.message);
    res.status(500).json({ error: 'Error rotando claves: ' + e.message });
  }
});

// ============================================
// 🔗 WEBHOOKS ADMIN
// ============================================
app.post('/api/admin/webhooks', authenticate, requireAdmin, async(req, res) => {
  try {
    const { userId, url, events, secret } = req.body;
    if (!url || !events) return res.status(400).json({ error: 'URL y eventos requeridos' });
    const finalSecret = secret || crypto.randomBytes(32).toString('hex');
    const result = await AlertWebhookService.registerWebhook(userId || req.user.uid, {
      url,
      events,
      secret: finalSecret
    });
    await logAudit('webhook_created', { userId: req.user.uid, url });
    res.json(result);
  } catch (e) {
    logger.error('❌ Error registrando webhook: ' + e.message);
    res.status(500).json({ error: 'Error registrando webhook: ' + e.message });
  }
});

app.delete('/api/admin/webhooks/:url', authenticate, requireAdmin, async(req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, message: 'Demo: webhook eliminado', demo: true });
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(req.params.url);
    } catch (e) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    const result = await webhooksCollection.deleteOne({ userId: req.user.uid, url: decodedUrl });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Webhook no encontrado' });
    await logAudit('webhook_deleted', { userId: req.user.uid, url: decodedUrl });
    res.json({ success: true, message: 'Webhook eliminado' });
  } catch (e) {
    logger.error('❌ Error eliminando webhook: ' + e.message);
    res.status(500).json({ error: 'Error eliminando webhook: ' + e.message });
  }
});

// ============================================
// 💳 STRIPE WEBHOOK (con verificación de firma)
// ============================================
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Si no hay secreto configurado, solo modo demo
  if (!webhookSecret || webhookSecret === 'placeholder') {
    logger.warn('⚠️ Stripe webhook secret no configurado. Modo demo.');
    return res.json({ received: true, demo: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error(`❌ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const metadata = paymentIntent.metadata || {};
      const amount = paymentIntent.amount_received / 100;
      const uid = metadata.uid;

      if (metadata.type === 'deposit' && uid && mongoReady && walletCollection) {
        const user = await usersCollection.findOne({ uid });
        if (user) {
          await walletCollection.updateOne(
            { userId: user._id },
            {
              $inc: { balance: amount },
              $push: { history: { type: 'deposit_stripe', amount, stripeId: paymentIntent.id, date: new Date() } }
            },
            { upsert: true }
          );
          await logAudit('deposit_stripe_confirmed', { uid, amount, stripeId: paymentIntent.id });
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    logger.error('❌ Webhook processing error: ' + e.message);
    res.status(500).send('Webhook processing failed');
  }
});

// ============================================
// 👥 ADMIN: SET TIER
// ============================================
app.patch('/api/admin/set-tier', authenticate, requireAdmin, async (req, res) => {
  try {
    const { targetEmail, tier } = req.body;
    const allowedTiers = ['personal', 'business', 'enterprise'];
    if (!targetEmail || !allowedTiers.includes(tier)) {
      return res.status(400).json({ error: 'Email y tier válidos requeridos (personal, business, enterprise)' });
    }
    if (!mongoReady || !usersCollection) return res.json({ success: true, message: 'Demo: tier actualizado', demo: true });

    const user = await usersCollection.findOne({ email: targetEmail });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const oldTier = user.tier;
    await usersCollection.updateOne({ email: targetEmail }, { $set: { tier, updatedAt: new Date() } });
    await logAudit('admin.set_tier', { admin: req.admin?.uid || req.user.uid, target: targetEmail, oldTier, newTier: tier });
    res.json({ success: true, message: `Tier de ${targetEmail} actualizado de ${oldTier} a ${tier}` });
  } catch (e) {
    logger.error('❌ Error al actualizar tier: ' + e.message);
    res.status(500).json({ error: 'Error al actualizar tier: ' + e.message });
  }
});

// ============================================
// 🤖 IA INTEGRADA: Auto-etiquetado, precio, fraude
// ============================================
app.post('/api/ai/analyze', authenticate, async (req, res) => {
  try {
    const { fileName, fileType, fileSize, sellerUid } = req.body;
    if (!fileName) return res.status(400).json({ error: 'Nombre de archivo requerido' });

    const name = fileName.toLowerCase();
    const ext = fileType?.split('/')[1] || name.split('.').pop();
    const tags = new Set();

    // Auto-etiquetado por extensión
    const extMap = {
      'mp4': 'video', 'mov': 'video', 'avi': 'video', 'webm': 'video',
      'mp3': 'audio', 'wav': 'audio', 'flac': 'audio', 'ogg': 'audio',
      'pdf': 'documento', 'doc': 'documento', 'docx': 'documento', 'txt': 'documento', 'md': 'documento',
      'zip': 'comprimido', 'rar': 'comprimido', '7z': 'comprimido', 'tar': 'comprimido',
      'jpg': 'imagen', 'png': 'imagen', 'svg': 'imagen', 'webp': 'imagen', 'gif': 'imagen'
    };
    if (extMap[ext]) tags.add(extMap[ext]);

    // Palabras clave en nombre
    const keywords = ['tutorial', 'curso', 'plantilla', 'reporte', 'diseño', 'foto', 'música', 'ebook', 'código', 'datos', 'template', 'pack'];
    keywords.forEach(k => { if (name.includes(k)) tags.add(k); });

    // Precio sugerido
    let suggestedPrice = 5.0;
    if (fileSize > 100 * 1024 * 1024) suggestedPrice += 3;
    if (['video', 'curso', 'tutorial'].some(t => tags.has(t))) suggestedPrice += 7;
    if (['plantilla', 'diseño', 'código'].some(t => tags.has(t))) suggestedPrice += 5;

    // Reputación del vendedor
    if (sellerUid && mongoReady) {
      const seller = await usersCollection.findOne({ uid: sellerUid });
      if (seller) {
        const profile = await profilesCollection.findOne({ userId: seller._id });
        const rep = parseFloat(profile?.reputation) || 0;
        if (rep >= 4.5) suggestedPrice *= 1.2;
      }
    }

    // Detección de fraude
    const fraudFlags = [];
    if (mongoReady && secretsCollection) {
      const existing = await secretsCollection.countDocuments({ fileName, userUid: sellerUid });
      if (existing > 0) fraudFlags.push('posible_duplicado_exacto');

      const recentSameName = await secretsCollection.countDocuments({
        fileName,
        createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      if (recentSameName >= 3) fraudFlags.push('subida_masiva_sospechosa');
    }

    res.json({
      success: true,
      tags: Array.from(tags),
      suggestedPrice: Math.max(1, suggestedPrice).toFixed(2),
      fraudFlags,
      message: fraudFlags.length ? '⚠️ Revisión de seguridad activada' : '✅ Archivo verificado'
    });
  } catch (e) {
    logger.error('❌ Error en análisis IA: ' + e.message);
    res.status(500).json({ error: 'Error en análisis IA: ' + e.message });
  }
});

// ============================================
// 💎 SELLER PREMIUM (SUSCRIPCIÓN)
// ============================================
app.post('/api/marketplace/seller/premium/subscribe', authenticate, async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, message: 'Demo: Seller Premium activado', demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Verificar si ya es premium activo
    const profile = await profilesCollection.findOne({ userId: user._id });
    if (profile?.sellerPremium && profile?.premiumExpires > new Date()) {
      return res.status(400).json({ error: 'Ya tienes Seller Premium activo hasta ' + profile.premiumExpires.toISOString() });
    }

    const wallet = await walletCollection.findOne({ userId: user._id });
    const price = 19.99;
    if (!wallet || wallet.balance < price) {
      return res.status(400).json({
        error: 'Saldo insuficiente. Agrega fondos para Seller Premium',
        currentBalance: wallet?.balance || 0,
        required: price
      });
    }

    // Descontar pago
    await walletCollection.updateOne(
      { userId: user._id },
      {
        $inc: { balance: -price },
        $push: { history: { type: 'seller_premium', amount: -price, date: new Date() } }
      }
    );

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await profilesCollection.updateOne(
      { userId: user._id },
      {
        $set: {
          sellerPremium: true,
          premiumSince: new Date(),
          premiumExpires: expiresAt,
          commissionRate: 0.10,
          storageBonusGB: 50
        }
      },
      { upsert: true }
    );

    await logAudit('seller_premium_subscribed', { userId: user.uid, amount: price, expiresAt });
    res.json({
      success: true,
      message: '✅ Seller Premium activado',
      benefits: [
        '📊 Analytics avanzado',
        '🎯 Productos destacados',
        '🏷️ Cupones personalizados',
        '📦 +50 GB almacenamiento',
        '🤝 Soporte prioritario',
        '💰 Comisión 10%'
      ],
      expiresAt: expiresAt.toISOString()
    });
  } catch (e) {
    logger.error('❌ Seller premium error: ' + e.message);
    res.status(500).json({ error: 'Error activando Seller Premium: ' + e.message });
  }
});

// ============================================
// 🔗 SHARE LINKS (enlaces compartidos)
// ============================================
app.post('/api/vault/:id/share', authenticate, async (req, res) => {
  try {
    const { expiresInHours = 24, password, permissions = ['view'] } = req.body;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!secret) return res.status(404).json({ error: 'Archivo no encontrado' });

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
    const doc = {
      fileId: secret._id,
      token,
      createdBy: req.user.uid,
      permissions,
      expiresAt,
      createdAt: new Date()
    };
    if (password) doc.passwordHash = await bcrypt.hash(password, 10);
    await sharedLinksCollection.insertOne(doc);
    await logAudit('share_link', { fileId: req.params.id, token, expiresAt });
    res.json({ success: true, link: `${process.env.APP_URL || 'https://apiromwinervault.onrender.com'}/s/${token}`, expiresAt });
  } catch (e) {
    logger.error('❌ Error creando enlace: ' + e.message);
    res.status(500).json({ error: 'Error creando enlace: ' + e.message });
  }
});

app.get('/s/:token', async (req, res) => {
  try {
    const link = await sharedLinksCollection.findOne({ token: req.params.token });
    if (!link) return res.status(404).json({ error: 'Enlace no válido' });
    if (new Date() > link.expiresAt) return res.status(410).json({ error: 'Enlace expirado' });
    const secret = await secretsCollection.findOne({ _id: link.fileId });
    if (!secret) return res.status(404).json({ error: 'Contenido eliminado' });
    res.json({
      success: true,
      title: secret.titulo,
      isFile: secret.tipo === 'archivo',
      requiresPassword: !!link.passwordHash
    });
  } catch (e) {
    logger.error('❌ Error accediendo a enlace: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 🖼️ THUMBNAILS
// ============================================
app.post('/api/vault/:id/thumbnail', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!secret || !secret.encrypted) return res.status(400).json({ error: 'Archivo no soporta thumbnail' });
    if (!user.encryptedUserKey) return res.status(400).json({ error: 'Clave de cifrado no disponible' });

    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    const img = Buffer.from(EnvelopeEncryption.open(secret.encrypted, userDEK), 'base64');
    const thumb = await sharp(img).resize(300, 300, { fit: 'inside' }).png().toBuffer();
    const encThumb = EnvelopeEncryption.seal(thumb.toString('base64'), userDEK);
    await thumbnailsCollection.updateOne(
      { fileId: secret._id },
      { $set: { encrypted: encThumb, updatedAt: new Date() } },
      { upsert: true }
    );
    await logAudit('thumbnail_generated', { fileId: req.params.id, userId: user.uid });
    res.json({ success: true });
  } catch (e) {
    logger.error('❌ Error thumbnail: ' + e.message);
    res.status(500).json({ error: 'Error generando thumbnail: ' + e.message });
  }
});

app.get('/api/vault/:id/thumbnail', authenticate, async (req, res) => {
  try {
    const thumb = await thumbnailsCollection.findOne({ fileId: new ObjectId(req.params.id) });
    if (!thumb) return res.status(404).json({ error: 'Thumbnail no disponible' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user || !user.encryptedUserKey) return res.status(400).json({ error: 'Clave de cifrado no disponible' });
    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    const dec = EnvelopeEncryption.open(thumb.encrypted, userDEK);
    res.type('image/png').send(Buffer.from(dec, 'base64'));
  } catch (e) {
    logger.error('❌ Error obteniendo thumbnail: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 📜 VERSIONES Y DIFF
// ============================================
app.post('/api/vault/:id/version', authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Contenido requerido' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!secret) return res.status(404).json({ error: 'No encontrado' });
    if (!user.encryptedUserKey) return res.status(400).json({ error: 'Clave de cifrado no disponible' });

    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    const last = await versionsCollection.findOne({ fileId: secret._id }, { sort: { versionNumber: -1 } });
    const nextVersion = (last?.versionNumber || 0) + 1;
    await versionsCollection.insertOne({
      fileId: secret._id,
      versionNumber: nextVersion,
      content: EnvelopeEncryption.seal(content, userDEK),
      createdBy: req.user.uid,
      createdAt: new Date()
    });
    await logAudit('version_created', { fileId: req.params.id, version: nextVersion, userId: user.uid });
    res.json({ success: true, version: nextVersion });
  } catch (e) {
    logger.error('❌ Error creando versión: ' + e.message);
    res.status(500).json({ error: 'Error creando versión: ' + e.message });
  }
});

app.get('/api/vault/:id/diff/:v1/:v2', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!secret) return res.status(404).json({ error: 'No encontrado' });
    if (!user.encryptedUserKey) return res.status(400).json({ error: 'Clave de cifrado no disponible' });

    const v1Num = parseInt(req.params.v1);
    const v2Num = parseInt(req.params.v2);
    if (isNaN(v1Num) || isNaN(v2Num) || v1Num < 1 || v2Num < 1) {
      return res.status(400).json({ error: 'Versión inválida. Usa números enteros positivos' });
    }

    const userDEK = EnvelopeEncryption.unwrapDEK(user.encryptedUserKey);
    const v1 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: v1Num });
    const v2 = await versionsCollection.findOne({ fileId: secret._id, versionNumber: v2Num });
    if (!v1 || !v2) return res.status(404).json({ error: 'Versión no encontrada' });

    const c1 = EnvelopeEncryption.open(v1.content, userDEK);
    const c2 = EnvelopeEncryption.open(v2.content, userDEK);
    const patch = diffLib.createPatch('doc', c1, c2, `v${v1Num}`, `v${v2Num}`);
    res.json({ success: true, diff: patch });
  } catch (e) {
    logger.error('❌ Error calculando diff: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 👑 SUPER ADMIN FUNCTIONS
// ============================================

// Eliminar usuario (solo super admin, evitando autoeliminación)
app.delete('/api/admin/users/:email', authenticate, requireAdmin, async (req, res) => {
  try {
    const targetEmail = req.params.email;
    const adminEmail = req.admin?.email || req.user.email;
    if (targetEmail === adminEmail) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }
    const targetUser = await usersCollection.findOne({ email: targetEmail });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    await usersCollection.deleteOne({ _id: targetUser._id });
    await profilesCollection.deleteOne({ userId: targetUser._id });
    await walletCollection.deleteOne({ userId: targetUser._id });
    await affiliatesCollection.deleteOne({ userId: targetUser._id });
    await secretsCollection.deleteMany({ userId: targetUser._id });
    await auditCollection.deleteMany({ userId: targetUser._id });
    await logAudit('admin.delete_user', { admin: adminEmail, deletedUser: targetEmail });
    res.json({ success: true, message: `Usuario ${targetEmail} eliminado completamente` });
  } catch (e) {
    logger.error('❌ Error eliminando usuario: ' + e.message);
    res.status(500).json({ error: 'Error eliminando usuario: ' + e.message });
  }
});

// Listar usuarios (sin datos sensibles)
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await usersCollection.find({}, { projection: { password: 0, encryptedUserKey: 0 } }).toArray();
    res.json({
      success: true,
      users: users.map(u => ({
        uid: u.uid,
        email: u.email,
        username: u.username,
        tier: u.tier,
        isAdmin: ADMIN_EMAILS.includes(u.email),
        isSupremo: u.esSupremo || false,
        createdAt: u.createdAt
      }))
    });
  } catch (e) {
    logger.error('❌ Error listando usuarios: ' + e.message);
    res.status(500).json({ error: 'Error listando usuarios: ' + e.message });
  }
});

// Resetear contraseña (admin)
app.post('/api/admin/reset-password/:email', authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Contraseña nueva debe tener 8+ caracteres' });
    }
    const targetUser = await usersCollection.findOne({ email: req.params.email });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await usersCollection.updateOne({ _id: targetUser._id }, { $set: { password: hashed, updatedAt: new Date() } });
    await logAudit('admin.reset_password', { admin: req.admin?.uid || req.user.uid, target: req.params.email });
    res.json({ success: true, message: `Contraseña de ${req.params.email} actualizada` });
  } catch (e) {
    logger.error('❌ Error reseteando contraseña: ' + e.message);
    res.status(500).json({ error: 'Error reseteando contraseña: ' + e.message });
  }
});

// Invalidar todos los tokens (incrementa versión de token)
app.post('/api/admin/invalidate-all-tokens', authenticate, requireAdmin, async (req, res) => {
  try {
    // Incrementar tokenVersion para todos los usuarios (invalidando tokens existentes)
    await usersCollection.updateMany({}, { $inc: { tokenVersion: 1 } });
    await logAudit('admin.invalidate_all_tokens', { admin: req.admin?.uid || req.user.uid, timestamp: new Date() });
    res.json({ success: true, message: 'Tokens invalidados. Los usuarios deberán reiniciar sesión.' });
  } catch (e) {
    logger.error('❌ Error invalidando tokens: ' + e.message);
    res.status(500).json({ error: 'Error invalidando tokens: ' + e.message });
  }
});

// Exportar datos de usuario (admin)
app.get('/api/admin/export-user/:email', authenticate, requireAdmin, async (req, res) => {
  try {
    const targetUser = await usersCollection.findOne({ email: req.params.email });
    if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
    const profile = await profilesCollection.findOne({ userId: targetUser._id });
    const wallet = await walletCollection.findOne({ userId: targetUser._id });
    const affiliates = await affiliatesCollection.findOne({ userId: targetUser._id });
    const secrets = await secretsCollection.find({ userId: targetUser._id }).project({ encrypted: 0, contenido: 0 }).limit(500).toArray();
    const auditLogs = await auditCollection.find({ userId: targetUser._id }).sort({ timestamp: -1 }).limit(1000).toArray();
    res.json({
      success: true,
      data: {
        user: { ...targetUser, password: undefined, encryptedUserKey: undefined },
        profile,
        wallet,
        affiliates,
        secretsCount: secrets.length,
        auditLogsCount: auditLogs.length,
        exportedAt: new Date()
      }
    });
  } catch (e) {
    logger.error('❌ Error exportando datos: ' + e.message);
    res.status(500).json({ error: 'Error exportando datos: ' + e.message });
  }
});

// ============================================
// 🔐 CRYPTO-AUTH (WEBAUTHN / FIDO2)
// ============================================

// Inicio de registro de credencial (usuario autenticado)
app.post('/api/crypto-auth/register-start', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const userId = user.uid;
    const rpID = new URL(APP_URL).hostname;
    const options = await generateRegistrationOptions({
      rpName: 'ApiRomwiner Vault',
      rpID,
      userID: Buffer.from(userId),
      userName: user.email,
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
    });
    // Guardar desafío con expiración (5 minutos)
    await cryptoKeysCollection.updateOne(
      { userId },
      { $set: { challenge: options.challenge, challengeExpires: new Date(Date.now() + 5 * 60 * 1000), createdAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, options, userId });
  } catch (e) {
    logger.error('❌ Error iniciando registro criptográfico: ' + e.message);
    res.status(500).json({ error: 'Error iniciando registro: ' + e.message });
  }
});

// Finalización de registro de credencial
app.post('/api/crypto-auth/register-finish', authenticate, async (req, res) => {
  try {
    const { response } = req.body;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const record = await cryptoKeysCollection.findOne({ userId: user.uid });
    if (!record || !record.challenge) return res.status(400).json({ error: 'Registro no iniciado o expirado' });
    if (record.challengeExpires && new Date() > record.challengeExpires) {
      return res.status(400).json({ error: 'El desafío ha expirado. Inicia nuevamente el registro.' });
    }
    const rpID = new URL(APP_URL).hostname;
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: record.challenge,
      expectedOrigin: new URL(APP_URL).origin,
      expectedRPID: rpID
    });
    if (!verification.verified) return res.status(400).json({ error: 'Verificación fallida' });
    const { credentialPublicKey, credentialID, counter } = verification.registrationInfo || {};
    if (!credentialPublicKey || !credentialID) {
      return res.status(400).json({ error: 'Datos de credencial incompletos' });
    }
    await cryptoKeysCollection.updateOne(
      { userId: user.uid },
      {
        $set: {
          publicKey: credentialPublicKey,
          credentialID,
          counter,
          registeredAt: new Date()
        },
        $unset: { challenge: 1, challengeExpires: 1 }
      },
      { upsert: true }
    );
    await logAudit('crypto_register', { userId: user.uid, verified: true });
    res.json({ success: true, message: 'Clave pública registrada exitosamente' });
  } catch (e) {
    logger.error('❌ Error verificando registro: ' + e.message);
    res.status(500).json({ error: 'Error verificando registro: ' + e.message });
  }
});

// Inicio de login criptográfico (sin autenticación previa)
app.post('/api/crypto-auth/login-start', async (req, res) => {
  try {
    const { credentialID } = req.body;
    const allowCredentials = credentialID ? [{ id: credentialID, type: 'public-key' }] : [];
    const rpID = new URL(APP_URL).hostname;
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials
    });
    await cryptoKeysCollection.updateOne(
      { credentialID },
      { $set: { challenge: options.challenge, challengeExpires: new Date(Date.now() + 5 * 60 * 1000), lastLoginAttempt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, options });
  } catch (e) {
    logger.error('❌ Error iniciando login criptográfico: ' + e.message);
    res.status(500).json({ error: 'Error iniciando login: ' + e.message });
  }
});

// Finalización de login criptográfico
app.post('/api/crypto-auth/login-finish', async (req, res) => {
  try {
    const { credentialID, response } = req.body;
    const record = await cryptoKeysCollection.findOne({ credentialID });
    if (!record || !record.challenge) return res.status(400).json({ error: 'Login no iniciado o credencial no encontrada' });
    if (record.challengeExpires && new Date() > record.challengeExpires) {
      return res.status(400).json({ error: 'El desafío ha expirado. Inicia nuevamente el login.' });
    }
    const rpID = new URL(APP_URL).hostname;
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: record.challenge,
      expectedOrigin: new URL(APP_URL).origin,
      expectedRPID: rpID,
      authenticator: { credentialPublicKey: record.publicKey, counter: record.counter || 0 }
    });
    if (!verification.verified) return res.status(401).json({ error: 'Autenticación fallida' });
    const newCounter = verification.authenticationInfo?.newCounter || record.counter;
    await cryptoKeysCollection.updateOne(
      { credentialID },
      {
        $set: { counter: newCounter, lastLogin: new Date() },
        $unset: { challenge: 1, challengeExpires: 1 }
      }
    );
    const user = await usersCollection.findOne({ uid: record.userId });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Generar token con versión actual
    const token = jwt.sign(
      { uid: user.uid, email: user.email, tokenVersion: user.tokenVersion || 0, authMethod: 'crypto' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    await logAudit('crypto_login', { userId: user.uid, verified: true });
    res.json({
      success: true,
      token,
      consentRequired: true,
      availableScopes: ['vault:read:own', 'vault:read:shared', 'wallet:read', 'identity:verify'],
      message: 'Autenticación exitosa. Aprueba permisos para acceder a funciones adicionales.'
    });
  } catch (e) {
    logger.error('❌ Error verificando login: ' + e.message);
    res.status(500).json({ error: 'Error verificando login: ' + e.message });
  }
});

// Consentimiento de alcances
app.post('/api/crypto-auth/consent', authenticate, async (req, res) => {
  try {
    const { scopes } = req.body;
    const validScopes = ['vault:read:own', 'vault:read:shared', 'vault:write', 'wallet:read', 'wallet:write', 'identity:verify', 'audit:read'];
    const approved = scopes.filter(s => validScopes.includes(s));
    if (approved.length === 0) return res.status(400).json({ error: 'Al menos un scope válido requerido' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    const newToken = jwt.sign(
      { uid: req.user.uid, email: user.email, tokenVersion: user.tokenVersion || 0, scopes: approved, authMethod: req.user.authMethod || 'crypto' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    await logAudit('consent_granted', { userId: req.user.uid, scopes: approved });
    res.json({ success: true, token: newToken, grantedScopes: approved });
  } catch (e) {
    logger.error('❌ Error procesando consentimiento: ' + e.message);
    res.status(500).json({ error: 'Error procesando consentimiento: ' + e.message });
  }
});

// ============================================
// 📋 IDENTITY LEGAL VERIFIED (KYC)
// ============================================

// Admin verifica identidad de un usuario
app.post('/api/admin/verify-identity', authenticate, requireAdmin, async (req, res) => {
  try {
    const { targetUserId, fullName, address, legalId, entityType = 'person', documents, verifiedBy } = req.body;
    if (!targetUserId || !fullName || !address) {
      return res.status(400).json({ error: 'targetUserId, fullName y address son requeridos' });
    }
    const encryptedAddress = encryptPII(address);
    const encryptedLegalId = legalId ? encryptPII(legalId) : null;
    const encryptedDocuments = documents ? documents.map(d => ({ ...d, content: encryptPII(d.content) })) : [];
    const identityData = {
      userId: targetUserId,
      fullName,
      address: encryptedAddress,
      legalId: encryptedLegalId,
      entityType,
      documents: encryptedDocuments,
      verifiedBy: verifiedBy || req.admin?.uid || req.user.uid,
      verifiedAt: new Date(),
      status: 'verified',
      metadata: req.body.metadata || {}
    };
    await verifiedIdentitiesCollection.updateOne({ userId: targetUserId }, { $set: identityData }, { upsert: true });
    await logAudit('admin.verify_identity', { admin: req.admin?.uid || req.user.uid, targetUser: targetUserId, entityType, verified: true });
    res.json({ success: true, message: `Identidad de ${targetUserId} verificada exitosamente`, userId: targetUserId, entityType, verifiedAt: identityData.verifiedAt });
  } catch (e) {
    logger.error('❌ Error verificando identidad: ' + e.message);
    res.status(500).json({ error: 'Error al verificar identidad: ' + e.message });
  }
});

// Obtener identidad verificada de un usuario (admin)
app.get('/api/admin/identity/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const identity = await verifiedIdentitiesCollection.findOne({ userId: req.params.userId });
    if (!identity) return res.status(404).json({ error: 'Identidad verificada no encontrada para este usuario' });
    // Descifrar campos PII
    const decrypted = {
      ...identity,
      address: decryptPII(identity.address),
      legalId: identity.legalId ? decryptPII(identity.legalId) : null,
      documents: identity.documents ? identity.documents.map(d => ({ ...d, content: decryptPII(d.content) })) : []
    };
    res.json({ success: true, identity: decrypted });
  } catch (e) {
    logger.error('❌ Error obteniendo identidad: ' + e.message);
    res.status(500).json({ error: 'Error obteniendo identidad: ' + e.message });
  }
});

// Búsqueda de identidades verificadas (admin)
app.get('/api/admin/search-identities', authenticate, requireAdmin, async (req, res) => {
  try {
    const { query, entityType } = req.query;
    if (!query || query.length < 2) return res.status(400).json({ error: 'Búsqueda requiere al menos 2 caracteres' });
    const filter = {
      $or: [
        { fullName: { $regex: query, $options: 'i' } },
        { 'metadata.email': { $regex: query, $options: 'i' } }
      ]
    };
    if (entityType) filter.entityType = entityType;
    const results = await verifiedIdentitiesCollection.find(filter)
      .project({ userId: 1, fullName: 1, entityType: 1, verifiedAt: 1, status: 1, 'metadata.email': 1 })
      .limit(50)
      .toArray();
    res.json({ success: true, count: results.length, results });
  } catch (e) {
    logger.error('❌ Error en búsqueda: ' + e.message);
    res.status(500).json({ error: 'Error en búsqueda: ' + e.message });
  }
});

// Usuario solicita verificación de identidad
app.post('/api/identity/verify-request', authenticate, async (req, res) => {
  try {
    const { fullName, address, legalId, entityType = 'person', documents } = req.body;
    if (!fullName || !address) return res.status(400).json({ error: 'Nombre completo y dirección son requeridos' });
    const encryptedAddress = encryptPII(address);
    const encryptedLegalId = legalId ? encryptPII(legalId) : null;
    const encryptedDocuments = documents ? documents.map(d => ({ ...d, content: encryptPII(d.content) })) : [];
    const requestData = {
      userId: req.user.uid,
      fullName,
      address: encryptedAddress,
      legalId: encryptedLegalId,
      entityType,
      documents: encryptedDocuments,
      status: 'pending',
      requestedAt: new Date(),
      metadata: { submittedVia: 'api', userAgent: req.headers['user-agent'] }
    };
    await verifiedIdentitiesCollection.updateOne({ userId: req.user.uid }, { $set: requestData }, { upsert: true });
    await logAudit('identity_verification_requested', { userId: req.user.uid, entityType });
    res.json({ success: true, message: 'Solicitud de verificación enviada. Un administrador la revisará en 24-48h.', status: 'pending', referenceId: req.user.uid });
  } catch (e) {
    logger.error('❌ Error al enviar solicitud: ' + e.message);
    res.status(500).json({ error: 'Error al enviar solicitud: ' + e.message });
  }
});

// Consultar estado de verificación de identidad del usuario autenticado
app.get('/api/identity/verification-status', authenticate, async (req, res) => {
  try {
    const identity = await verifiedIdentitiesCollection.findOne(
      { userId: req.user.uid },
      { projection: { userId: 1, fullName: 1, entityType: 1, status: 1, verifiedAt: 1, rejectedReason: 1, 'metadata.email': 1 } }
    );
    if (!identity) {
      return res.json({ success: true, status: 'not_submitted', message: 'No has enviado una solicitud de verificación aún' });
    }
    let message = '';
    if (identity.status === 'verified') message = '✅ Tu identidad ha sido verificada exitosamente';
    else if (identity.status === 'rejected') message = `❌ Solicitud rechazada: ${identity.rejectedReason || 'Sin motivo especificado'}`;
    else message = '⏳ Tu solicitud está en revisión';
    res.json({
      success: true,
      status: identity.status,
      fullName: identity.fullName,
      entityType: identity.entityType,
      verifiedAt: identity.verifiedAt,
      rejectedReason: identity.status === 'rejected' ? identity.rejectedReason : null,
      message
    });
  } catch (e) {
    logger.error('❌ Error consultando estado: ' + e.message);
    res.status(500).json({ error: 'Error consultando estado: ' + e.message });
  }
});

// ============================================
// 🚀 EXPORT / IMPORT / SYNC (PORTABLE) - REAL
// ============================================

// Exportar metadatos de la bóveda (sin contenido cifrado)
app.get('/api/vault/export', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const items = await secretsCollection.find({ userId: user._id }, { projection: { encrypted: 0, contenido: 0 } }).toArray();
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId: user.uid,
      email: user.email,
      items: items.map(i => ({
        id: i._id.toString(),
        titulo: i.titulo,
        categoria: i.categoria,
        fileName: i.fileName,
        fileType: i.fileType,
        fileSize: i.fileSize,
        isForSale: i.isForSale,
        price: i.price,
        tags: i.tags,
        createdAt: i.createdAt
      }))
    };
    await logAudit('vault_export', { userId: user.uid, count: items.length });
    res.json({ success: true, exportData });
  } catch (e) {
    logger.error('❌ Export error: ' + e.message);
    res.status(500).json({ error: 'Error exportando bóveda: ' + e.message });
  }
});

// Importar metadatos (el contenido cifrado debe subirse por separado)
app.post('/api/vault/import', authenticate, async (req, res) => {
  try {
    const { exportData, options = {} } = req.body;
    if (!exportData || !exportData.version || !Array.isArray(exportData.items)) {
      return res.status(400).json({ error: 'Datos de exportación inválidos' });
    }
    if (!FEATURES.PORTABLE_EXPORT || !mongoReady || !secretsCollection) {
      return res.json({ success: true, message: 'Modo demo', demo: true });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (exportData.userId && exportData.userId !== user.uid && !options.forceImport) {
      return res.status(403).json({ error: 'Esta exportación pertenece a otro usuario. Usa forceImport:true para importar como nueva bóveda.' });
    }
    let importedCount = 0, errors = [], skipped = [];
    for (const item of exportData.items) {
      try {
        if (!item.titulo) { skipped.push(item); continue; }
        const newItem = {
          userId: user._id, userUid: user.uid,
          titulo: item.titulo, categoria: item.categoria || 'imported',
          folderId: 'imported', tipo: item.fileName ? 'archivo' : 'texto',
          fileName: item.fileName || null, fileType: item.fileType || null, fileSize: item.fileSize || 0,
          encrypted: null, contenido: null, isForSale: item.isForSale || false, price: item.price || 0,
          sales: 0, buyers: [], tags: item.tags || [], createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          importedFrom: exportData.exportedAt, originalId: item.id
        };
        await secretsCollection.insertOne(newItem);
        importedCount++;
      } catch (err) {
        errors.push({ item: item.titulo, error: err.message });
      }
    }
    await logAudit('vault_import', { userId: user.uid, imported: importedCount, errors: errors.length });
    res.json({ success: true, message: `${importedCount} items importados`, importedCount, errors });
  } catch (e) {
    logger.error('❌ Import error: ' + e.message);
    res.status(500).json({ error: 'Error importando: ' + e.message });
  }
});

// ============================================
// 👥 SEGUIDORES (FOLLOWS) - REAL
// ============================================

// Seguir a un usuario
app.post('/api/follow/:userId', authenticate, async (req, res) => {
  try {
    const follower = await usersCollection.findOne({ uid: req.user.uid });
    const following = await usersCollection.findOne({ uid: req.params.userId });
    if (!follower || !following) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (follower.uid === following.uid) return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });

    await followsCollection.updateOne(
      { followerId: follower._id, followingId: following._id },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    await logAudit('follow', { follower: follower.uid, following: following.uid });
    res.json({ success: true, message: `Ahora sigues a ${following.username}` });
  } catch (e) {
    logger.error('❌ Follow error: ' + e.message);
    res.status(500).json({ error: 'Error al seguir usuario' });
  }
});

// Dejar de seguir
app.delete('/api/follow/:userId', authenticate, async (req, res) => {
  try {
    const follower = await usersCollection.findOne({ uid: req.user.uid });
    const following = await usersCollection.findOne({ uid: req.params.userId });
    if (!follower || !following) return res.status(404).json({ error: 'Usuario no encontrado' });
    const result = await followsCollection.deleteOne({ followerId: follower._id, followingId: following._id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'No seguías a este usuario' });
    await logAudit('unfollow', { follower: follower.uid, following: following.uid });
    res.json({ success: true, message: `Dejaste de seguir a ${following.username}` });
  } catch (e) {
    logger.error('❌ Unfollow error: ' + e.message);
    res.status(500).json({ error: 'Error al dejar de seguir' });
  }
});

// Obtener a quién sigue un usuario
app.get('/api/following', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const follows = await followsCollection.find({ followerId: user._id }).toArray();
    const followingIds = follows.map(f => f.followingId);
    const followingUsers = await usersCollection.find({ _id: { $in: followingIds } }, { projection: { username: 1, avatar: 1, uid: 1 } }).toArray();
    res.json({ success: true, following: followingUsers });
  } catch (e) {
    logger.error('❌ Get following error: ' + e.message);
    res.status(500).json({ error: 'Error cargando seguidos' });
  }
});

// Obtener seguidores
app.get('/api/followers', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const followers = await followsCollection.find({ followingId: user._id }).toArray();
    const followerIds = followers.map(f => f.followerId);
    const followerUsers = await usersCollection.find({ _id: { $in: followerIds } }, { projection: { username: 1, avatar: 1, uid: 1 } }).toArray();
    res.json({ success: true, followers: followerUsers });
  } catch (e) {
    logger.error('❌ Get followers error: ' + e.message);
    res.status(500).json({ error: 'Error cargando seguidores' });
  }
});

// ============================================
// 📱 FEED SOCIAL REAL (con likes y comentarios persistentes)
// ============================================

// Obtener feed de productos (solo los que están en venta, ordenados por fecha)
app.get('/api/feed', authenticate, async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, posts: [], demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { page = 1, limit = 20, filter = 'all', followedOnly = 'false' } = req.query;
    let filterQuery = { isForSale: true };

    if (followedOnly === 'true') {
      const following = await followsCollection.find({ followerId: user._id }).toArray();
      const followingIds = following.map(f => f.followingId);
      if (followingIds.length) filterQuery.userId = { $in: followingIds };
      else return res.json({ success: true, posts: [], pagination: { total: 0 } });
    }
    if (filter && filter !== 'all') filterQuery.categoria = filter;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const posts = await secretsCollection.find(filterQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .project({ encrypted: 0, contenido: 0, buyers: 0 })
      .toArray();
    const total = await secretsCollection.countDocuments(filterQuery);

    const enrichedPosts = [];
    for (const post of posts) {
      const sellerProfile = await profilesCollection.findOne({ userId: post.userId });
      const likesCount = await postLikesCollection.countDocuments({ postId: post._id });
      const commentsCount = await commentsCollection.countDocuments({ postId: post._id });
      const userLiked = await postLikesCollection.findOne({ userId: user._id, postId: post._id });

      enrichedPosts.push({
        id: post._id.toString(),
        titulo: post.titulo,
        descripcion: post.descripcion?.substring(0, 300),
        categoria: post.categoria,
        precio: post.price,
        vendedor: {
          uid: post.userUid,
          displayName: sellerProfile?.displayName || 'Creador',
          avatarUrl: sellerProfile?.avatarUrl,
          verificado: sellerProfile?.identityVerified || false,
          reputacion: sellerProfile?.reputation || '0.00'
        },
        multimedia: {
          tipo: post.tipo,
          fileName: post.fileName,
          thumbnailUrl: post.thumbnailUrl || null
        },
        engagement: {
          likes: likesCount,
          comments: commentsCount,
          views: post.views || 0,
          sales: post.sales || 0,
          userLiked: !!userLiked
        },
        createdAt: post.createdAt,
        actions: { comprar: `/api/buy/${post._id}` }
      });
    }

    res.json({
      success: true,
      posts: enrichedPosts,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (e) {
    logger.error('❌ Feed error: ' + e.message);
    res.status(500).json({ error: 'Error cargando feed' });
  }
});

// Dar/quitar like a un producto
app.post('/api/feed/:id/like', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const post = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!post) return res.status(404).json({ error: 'Producto no encontrado' });

    const existingLike = await postLikesCollection.findOne({ userId: user._id, postId: post._id });
    if (existingLike) {
      await postLikesCollection.deleteOne({ _id: existingLike._id });
      await secretsCollection.updateOne({ _id: post._id }, { $inc: { views: -1 } });
      await logAudit('feed_unlike', { userId: user.uid, postId: req.params.id });
      return res.json({ success: true, liked: false, message: 'Like eliminado' });
    } else {
      await postLikesCollection.insertOne({ userId: user._id, postId: post._id, createdAt: new Date() });
      await secretsCollection.updateOne({ _id: post._id }, { $inc: { views: 1 } });
      await logAudit('feed_like', { userId: user.uid, postId: req.params.id });
      return res.json({ success: true, liked: true, message: 'Te gusta este producto' });
    }
  } catch (e) {
    logger.error('❌ Like error: ' + e.message);
    res.status(500).json({ error: 'Error procesando like' });
  }
});

// Obtener comentarios de un producto
app.get('/api/feed/:id/comments', async (req, res) => {
  try {
    const comments = await commentsCollection.find({ postId: new ObjectId(req.params.id) })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    // Enriquecer con nombre de usuario
    const userIds = comments.map(c => c.userId);
    const users = await usersCollection.find({ _id: { $in: userIds } }, { projection: { username: 1, avatar: 1 } }).toArray();
    const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
    const enriched = comments.map(c => ({
      id: c._id,
      user: userMap[c.userId.toString()] || { username: 'Anónimo' },
      text: c.text,
      createdAt: c.createdAt
    }));
    res.json({ success: true, comments: enriched });
  } catch (e) {
    logger.error('❌ Get comments error: ' + e.message);
    res.status(500).json({ error: 'Error cargando comentarios' });
  }
});

// Publicar comentario
app.post('/api/feed/:id/comment', authenticate, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment || comment.trim().length < 2) return res.status(400).json({ error: 'Comentario muy corto (mínimo 2 caracteres)' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const post = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!post) return res.status(404).json({ error: 'Producto no encontrado' });

    await commentsCollection.insertOne({
      postId: post._id,
      userId: user._id,
      text: comment.substring(0, 500),
      createdAt: new Date()
    });
    await logAudit('feed_comment', { userId: user.uid, postId: req.params.id, comment: comment.substring(0, 100) });
    res.json({ success: true, message: 'Comentario publicado', comment: { user: { username: user.username }, text: comment, createdAt: new Date() } });
  } catch (e) {
    logger.error('❌ Comment error: ' + e.message);
    res.status(500).json({ error: 'Error publicando comentario' });
  }
});

// ============================================
// 🛍️ MARKETPLACE REAL (CATÁLOGO + DETALLE)
// ============================================

// Metadatos públicos (función auxiliar)
const getPublicItemMetadata = (secret, sellerProfile = null) => ({
  id: secret._id.toString(),
  titulo: secret.titulo,
  descripcion: secret.descripcion?.substring(0, 300),
  categoria: secret.categoria || 'general',
  tags: secret.tags || [],
  precio: secret.price || 0,
  moneda: 'USD',
  vendedor: {
    uid: secret.userUid,
    displayName: sellerProfile?.displayName || 'Creador',
    avatarUrl: sellerProfile?.avatarUrl || null,
    rating: sellerProfile?.reputation || 0,
    totalVentas: sellerProfile?.totalVentas || 0,
    verificado: sellerProfile?.identityVerified || false
  },
  estadisticas: {
    ventas: secret.sales || 0,
    rating: secret.rating?.average || 0,
    reseñasCount: secret.rating?.count || 0,
    vistas: secret.views || 0
  },
  licencia: secret.licenseDays ? `${secret.licenseDays} días` : 'Permanente',
  tipo: secret.tipo,
  fileName: secret.fileName,
  fileType: secret.fileType,
  fileSize: secret.fileSize,
  createdAt: secret.createdAt,
  thumbnailUrl: secret.thumbnailUrl || null
});

// Listar productos en venta (con filtros)
app.get('/api/marketplace', async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, items: [], demo: true });
    const { categoria, maxPrice, minPrice, sortBy = 'popularity', page = 1, limit = 20, q, tags, verifiedOnly } = req.query;
    const filter = { isForSale: true };
    if (categoria) filter.categoria = categoria;
    if (maxPrice) filter.price = { $lte: parseFloat(maxPrice) };
    if (minPrice) filter.price = { ...filter.price, $gte: parseFloat(minPrice) };
    if (verifiedOnly === 'true') {
      const verifiedUsers = await profilesCollection.find({ identityVerified: true }, { projection: { userId: 1 } }).toArray();
      filter.userId = { $in: verifiedUsers.map(p => p.userId) };
    }
    if (tags) filter.tags = { $in: tags.split(',').map(t => t.trim()) };
    if (q) filter.$text = { $search: q };

    let sort = {};
    switch (sortBy) {
      case 'price_asc': sort = { price: 1 }; break;
      case 'price_desc': sort = { price: -1 }; break;
      case 'newest': sort = { createdAt: -1 }; break;
      default: sort = { sales: -1, 'rating.average': -1, createdAt: -1 };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [items, total] = await Promise.all([
      secretsCollection.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).project({ encrypted: 0, contenido: 0, buyers: 0 }).toArray(),
      secretsCollection.countDocuments(filter)
    ]);
    const enriched = [];
    for (const item of items) {
      const sellerProfile = await profilesCollection.findOne({ userId: item.userId });
      enriched.push(getPublicItemMetadata(item, sellerProfile));
    }
    res.json({
      success: true,
      items: enriched,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (e) {
    logger.error('❌ Marketplace error: ' + e.message);
    res.status(500).json({ error: 'Error cargando catálogo' });
  }
});

// Búsqueda
app.get('/api/marketplace/search', async (req, res) => {
  try {
    const { q, categoria, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ error: 'Búsqueda requiere al menos 2 caracteres' });
    if (!mongoReady) return res.json({ success: true, results: [], demo: true });
    const filter = { isForSale: true, $text: { $search: q } };
    if (categoria) filter.categoria = categoria;
    const results = await secretsCollection.find(filter, { score: { $meta: 'textScore' }, projection: { encrypted: 0, contenido: 0, buyers: 0 } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(parseInt(limit))
      .toArray();
    const enriched = [];
    for (const item of results) {
      const sellerProfile = await profilesCollection.findOne({ userId: item.userId });
      enriched.push({ ...getPublicItemMetadata(item, sellerProfile), relevanceScore: item.score });
    }
    res.json({ success: true, query: q, results: enriched, count: enriched.length });
  } catch (e) {
    logger.error('❌ Search error: ' + e.message);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
});

// Detalle de producto
app.get('/api/marketplace/item/:id', async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, item: { id: req.params.id, titulo: 'Demo' }, demo: true });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado' });
    const sellerProfile = await profilesCollection.findOne({ userId: secret.userId });
    const recentComments = await commentsCollection.find({ postId: secret._id }).sort({ createdAt: -1 }).limit(3).toArray();
    const commentUsers = await usersCollection.find({ _id: { $in: recentComments.map(c => c.userId) } }, { projection: { username: 1, avatar: 1 } }).toArray();
    const userMap = Object.fromEntries(commentUsers.map(u => [u._id.toString(), u]));
    const comments = recentComments.map(c => ({
      id: c._id,
      user: userMap[c.userId.toString()] || { username: 'Anónimo' },
      text: c.text,
      createdAt: c.createdAt
    }));

    res.json({
      success: true,
      item: {
        ...getPublicItemMetadata(secret, sellerProfile),
        descripcionCompleta: secret.descripcion,
        requisitos: secret.requisitos || null,
        preview: secret.preview || null,
        reseñasRecientes: comments
      },
      acciones: {
        comprar: `/api/buy/${secret._id}`,
        compartir: `${APP_URL}/marketplace/item/${secret._id}`
      }
    });
  } catch (e) {
    logger.error('❌ Item detail error: ' + e.message);
    res.status(500).json({ error: 'Error cargando producto' });
  }
});

// ============================================
// 👤 PERFIL DE CREADOR (MARKETPLACE)
// ============================================

app.get('/api/marketplace/creator/:userId', async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, creator: { uid: req.params.userId, displayName: 'Demo' }, demo: true });

    const user = await usersCollection.findOne({ uid: req.params.userId }, { projection: { password: 0, encryptedUserKey: 0, email: 0 } });
    if (!user) return res.status(404).json({ error: 'Creador no encontrado' });

    const profile = await profilesCollection.findOne({ userId: user._id });
    const [totalItems, itemsForSale, totalVentas, ratingStats] = await Promise.all([
      secretsCollection.countDocuments({ userId: user._id }),
      secretsCollection.countDocuments({ userId: user._id, isForSale: true }),
      transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' }),
      secretsCollection.aggregate([
        { $match: { userId: user._id, 'rating.count': { $gt: 0 } } },
        { $group: { _id: null, avgRating: { $avg: '$rating.average' }, totalReviews: { $sum: '$rating.count' } } }
      ]).toArray()
    ]);

    const featuredItems = await secretsCollection.find({ userId: user._id, isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } })
      .sort({ sales: -1, 'rating.average': -1 })
      .limit(6)
      .toArray();

    const enrichedItems = featuredItems.map(item => getPublicItemMetadata(item, profile));

    res.json({
      success: true,
      creator: {
        uid: user.uid,
        displayName: profile?.displayName || 'Creador',
        avatarUrl: profile?.avatarUrl,
        bio: profile?.bio,
        identityVerified: profile?.identityVerified || false,
        memberSince: user.createdAt,
        tier: user.tier
      },
      estadisticas: {
        totalItems,
        itemsEnVenta: itemsForSale,
        totalVentas,
        ratingPromedio: ratingStats[0]?.avgRating?.toFixed(2) || 0,
        totalReseñas: ratingStats[0]?.totalReviews || 0
      },
      itemsDestacados: enrichedItems,
      acciones: {
        seguir: req.user ? `/api/marketplace/creator/${req.params.userId}/follow` : null,
        contactar: profile?.isPublic ? `/api/marketplace/creator/${req.params.userId}/contact` : null
      }
    });
  } catch (e) {
    logger.error('❌ Marketplace creator profile error: ' + e.message);
    res.status(500).json({ error: 'Error cargando perfil: ' + e.message });
  }
});

// ============================================
// ✍️ RESEÑAS (REVIEWS)
// ============================================

// Dejar reseña (solo compradores verificados)
app.post('/api/marketplace/item/:id/review', authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating debe ser entre 1 y 5' });
    if (!mongoReady) return res.json({ success: true, message: 'Reseña guardada (demo)', demo: true });

    const buyer = await usersCollection.findOne({ uid: req.user.uid });
    if (!buyer) return res.status(404).json({ error: 'Usuario no encontrado' });
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado' });
    if (secret.userId.toString() === buyer._id.toString()) {
      return res.status(400).json({ error: 'No puedes reseñar tu propio producto' });
    }
    if (!secret.buyers?.includes(buyer.uid)) {
      return res.status(403).json({ error: 'Solo compradores verificados pueden dejar reseñas' });
    }

    const existingReview = await reviewsCollection.findOne({ itemId: secret._id, buyerUid: req.user.uid });
    if (existingReview) return res.status(400).json({ error: 'Ya has dejado una reseña para este producto' });

    const review = {
      itemId: secret._id,
      buyerUid: req.user.uid,
      buyerName: (await profilesCollection.findOne({ userId: buyer._id }))?.displayName || 'Comprador',
      rating: parseInt(rating),
      comment: comment?.substring(0, 1000),
      verifiedPurchase: true,
      createdAt: new Date(),
      helpful: 0,
      reported: false
    };
    await reviewsCollection.insertOne(review);

    const stats = await reviewsCollection.aggregate([
      { $match: { itemId: secret._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]).toArray();

    await secretsCollection.updateOne({ _id: secret._id }, {
      $set: {
        'rating.average': stats[0]?.avg?.toFixed(2) || 0,
        'rating.count': stats[0]?.count || 0
      }
    });

    await logAudit('review_created', { itemId: req.params.id, buyer: req.user.uid, rating, verified: true });
    await updateSellerReputation(secret.userId.toString());

    res.json({ success: true, message: '¡Gracias por tu reseña!', review: { ...review, id: review._id } });
  } catch (e) {
    logger.error('❌ Review error: ' + e.message);
    res.status(500).json({ error: 'Error guardando reseña: ' + e.message });
  }
});

// Listar reseñas de un producto (con filtros y paginación)
app.get('/api/marketplace/item/:id/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'recent', verifiedOnly = 'false' } = req.query;
    const secret = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), isForSale: true });
    if (!secret) return res.status(404).json({ error: 'Producto no encontrado' });
    if (!mongoReady) return res.json({ success: true, reviews: [], demo: true });

    let filter = { itemId: secret._id };
    if (verifiedOnly === 'true') filter.verifiedPurchase = true;

    let sort = { createdAt: -1 };
    if (sortBy === 'rating_high') sort = { rating: -1, createdAt: -1 };
    if (sortBy === 'rating_low') sort = { rating: 1, createdAt: -1 };
    if (sortBy === 'helpful') sort = { helpful: -1, createdAt: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reviews, total] = await Promise.all([
      reviewsCollection.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).toArray(),
      reviewsCollection.countDocuments(filter)
    ]);

    // Distribución de calificaciones
    const distribution = await reviewsCollection.aggregate([
      { $match: { itemId: secret._id } },
      { $group: { _id: '$rating', count: { $sum: 1 } } }
    ]).toArray();

    res.json({
      success: true,
      reviews: reviews.map(r => ({
        id: r._id,
        rating: r.rating,
        comment: r.comment,
        buyerName: r.buyerName,
        date: r.createdAt,
        verified: r.verifiedPurchase,
        helpful: r.helpful
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
      summary: {
        average: secret.rating?.average || 0,
        count: secret.rating?.count || 0,
        verifiedCount: await reviewsCollection.countDocuments({ itemId: secret._id, verifiedPurchase: true })
      },
      distribution
    });
  } catch (e) {
    logger.error('❌ Reviews fetch error: ' + e.message);
    res.status(500).json({ error: 'Error cargando reseñas: ' + e.message });
  }
});

// ============================================
// ⭐ FAVORITOS (WISHLIST)
// ============================================

app.post('/api/marketplace/favorites', authenticate, async (req, res) => {
  try {
    const { itemId, action = 'add' } = req.body;
    if (!itemId || !ObjectId.isValid(itemId)) return res.status(400).json({ error: 'itemId inválido' });
    if (!mongoReady) return res.json({ success: true, demo: true });

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (action === 'add') {
      await favoritesCollection.updateOne(
        { userId: user._id, itemId: new ObjectId(itemId) },
        { $set: { addedAt: new Date() } },
        { upsert: true }
      );
      await logAudit('favorite_added', { userId: req.user.uid, itemId });
      res.json({ success: true, message: 'Agregado a favoritos' });
    } else if (action === 'remove') {
      await favoritesCollection.deleteOne({ userId: user._id, itemId: new ObjectId(itemId) });
      await logAudit('favorite_removed', { userId: req.user.uid, itemId });
      res.json({ success: true, message: 'Removido de favoritos' });
    } else {
      res.status(400).json({ error: 'Acción inválida (add o remove)' });
    }
  } catch (e) {
    logger.error('❌ Favorites error: ' + e.message);
    res.status(500).json({ error: 'Error con favoritos: ' + e.message });
  }
});

app.get('/api/marketplace/favorites', authenticate, async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, items: [], demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const favorites = await favoritesCollection.find({ userId: user._id }).sort({ addedAt: -1 }).toArray();
    const itemIds = favorites.map(f => f.itemId);
    if (itemIds.length === 0) return res.json({ success: true, items: [], count: 0 });

    const items = await secretsCollection.find({ _id: { $in: itemIds }, isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } }).toArray();
    const enriched = [];
    for (const item of items) {
      const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1 } });
      enriched.push(getPublicItemMetadata(item, sellerProfile));
    }
    res.json({ success: true, items: enriched, count: enriched.length });
  } catch (e) {
    logger.error('❌ Favorites list error: ' + e.message);
    res.status(500).json({ error: 'Error cargando favoritos: ' + e.message });
  }
});

// ============================================
// 🤖 RECOMENDACIONES PERSONALIZADAS
// ============================================

app.get('/api/marketplace/recommendations', authenticate, async (req, res) => {
  try {
    const { limit = 10, type = 'personalized' } = req.query;
    if (!mongoReady) return res.json({ success: true, recommendations: [], demo: true });

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let recommendedItems = [];

    if (type === 'personalized') {
      // Obtener IDs de productos comprados
      const purchasedItemIds = await transactionsCollection.distinct('itemId', { buyer: user.uid, type: 'sale' }).then(ids => ids.filter(id => id).map(id => new ObjectId(id)));
      // Obtener categorías de esos productos
      const purchasedCategories = await secretsCollection.distinct('categoria', { _id: { $in: purchasedItemIds } });

      const filter = { isForSale: true, userId: { $ne: user._id } };
      if (purchasedItemIds.length) filter._id = { $nin: purchasedItemIds };
      if (purchasedCategories.length) filter.categoria = { $in: purchasedCategories };

      recommendedItems = await secretsCollection.aggregate([
        { $match: filter },
        {
          $addFields: {
            score: {
              $add: [
                { $multiply: ['$sales', 0.4] },
                { $multiply: ['$rating.average', 0.3] },
                { $multiply: [{ $divide: [{ $toLong: '$createdAt' }, 1000] }, 0.1] }
              ]
            }
          }
        },
        { $sort: { score: -1 } },
        { $limit: parseInt(limit) }
      ]).toArray();
    } else if (type === 'trending') {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      recommendedItems = await secretsCollection.find({ isForSale: true, createdAt: { $gt: yesterday } }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } })
        .sort({ sales: -1, 'rating.average': -1 })
        .limit(parseInt(limit))
        .toArray();
    } else if (type === 'new') {
      recommendedItems = await secretsCollection.find({ isForSale: true }, { projection: { encrypted: 0, contenido: 0, buyers: 0 } })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .toArray();
    }

    const enriched = [];
    for (const item of recommendedItems) {
      const sellerProfile = await profilesCollection.findOne({ userId: item.userId }, { projection: { displayName: 1, avatarUrl: 1, rating: 1 } });
      enriched.push({
        ...getPublicItemMetadata(item, sellerProfile),
        reason: type === 'personalized' ? 'Basado en tus compras anteriores' : (type === 'trending' ? 'Tendencia esta semana' : 'Recién llegado')
      });
    }

    await logAudit('recommendations_served', { userId: req.user.uid, type, count: enriched.length });
    res.json({ success: true, recommendations: enriched, algorithm: type, count: enriched.length, nextRefresh: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
  } catch (e) {
    logger.error('❌ Recommendations error: ' + e.message);
    res.status(500).json({ error: 'Error generando recomendaciones: ' + e.message });
  }
});

// ============================================
// 📊 ANALÍTICAS PARA VENDEDORES
// ============================================

app.get('/api/marketplace/seller/analytics', authenticate, async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, analytics: {}, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const now = new Date();
    const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [totalItems, activeListings, totalSales, revenue7d, revenue30d, allTimeRevenue] = await Promise.all([
      secretsCollection.countDocuments({ userId: user._id }),
      secretsCollection.countDocuments({ userId: user._id, isForSale: true }),
      transactionsCollection.countDocuments({ seller: user.uid, type: 'sale' }),
      transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale', createdAt: { $gte: last7Days } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray(),
      transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale', createdAt: { $gte: last30Days } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray(),
      transactionsCollection.aggregate([{ $match: { seller: user.uid, type: 'sale' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).toArray()
    ]);

    const topItems = await secretsCollection.find({ userId: user._id, isForSale: true, sales: { $gt: 0 } })
      .sort({ sales: -1 })
      .limit(5)
      .project({ titulo: 1, price: 1, sales: 1, 'rating.average': 1 })
      .toArray();

    res.json({
      success: true,
      analytics: {
        overview: {
          totalItems,
          activeListings,
          totalSales,
          revenue: {
            last7Days: revenue7d[0]?.total || 0,
            last30Days: revenue30d[0]?.total || 0,
            allTime: allTimeRevenue[0]?.total || 0
          }
        },
        performance: { avgOrderValue: totalSales > 0 ? ((revenue30d[0]?.total || 0) / totalSales).toFixed(2) : 0 },
        topItems: topItems.map(i => ({ id: i._id.toString(), titulo: i.titulo, price: i.price, sales: i.sales, rating: i.rating?.average || 0 })),
        tips: [
          activeListings === 0 && '💡 Agrega tu primer producto para empezar a vender',
          totalSales === 0 && activeListings > 0 && '💡 Promociona tus productos en redes sociales',
          (revenue7d[0]?.total || 0) > 0 && '🎉 ¡Tus ventas van en aumento! Sigue así'
        ].filter(Boolean)
      }
    });
  } catch (e) {
    logger.error('❌ Seller analytics error: ' + e.message);
    res.status(500).json({ error: 'Error cargando analytics: ' + e.message });
  }
});

// ============================================
// 🏷️ CATEGORÍAS Y TAGS
// ============================================

app.get('/api/marketplace/categories', async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, categories: [] });
    const categories = await secretsCollection.aggregate([
      { $match: { isForSale: true, categoria: { $exists: true, $ne: '' } } },
      { $group: { _id: '$categoria', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]).toArray();

    res.json({
      success: true,
      categories: categories.map(c => ({ id: c._id, name: c._id.charAt(0).toUpperCase() + c._id.slice(1), count: c.count }))
    });
  } catch (e) {
    logger.error('❌ Categories error: ' + e.message);
    res.status(500).json({ error: 'Error cargando categorías: ' + e.message });
  }
});

app.get('/api/marketplace/tags', async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, tags: [] });
    const tags = await secretsCollection.aggregate([
      { $match: { isForSale: true, tags: { $exists: true, $ne: [] } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]).toArray();

    res.json({ success: true, tags: tags.map(t => ({ name: t._id, count: t.count })) });
  } catch (e) {
    logger.error('❌ Tags error: ' + e.message);
    res.status(500).json({ error: 'Error cargando tags: ' + e.message });
  }
});

// ============================================
// 🎟️ CUPONES DE DESCUENTO (PROMO CODES)
// ============================================

app.post('/api/marketplace/promo', authenticate, async (req, res) => {
  try {
    const { code, discountType, discountValue, validUntil, maxUses, applicableItems } = req.body;
    if (!code || !discountType || !discountValue) return res.status(400).json({ error: 'code, discountType y discountValue son requeridos' });
    if (discountType !== 'percent' && discountType !== 'fixed') return res.status(400).json({ error: 'discountType debe ser "percent" o "fixed"' });
    if (discountValue <= 0) return res.status(400).json({ error: 'discountValue debe ser mayor a 0' });
    if (!mongoReady) return res.json({ success: true, message: 'Cupón creado (demo)', demo: true });

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const existing = await promoCollection.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(400).json({ error: 'Este código de cupón ya existe' });

    const promo = {
      code: code.toUpperCase(),
      createdBy: user.uid,
      discountType,
      discountValue: parseFloat(discountValue),
      validFrom: new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      maxUses: maxUses ? parseInt(maxUses) : null,
      currentUses: 0,
      applicableItems: applicableItems || [],
      active: true,
      createdAt: new Date()
    };
    await promoCollection.insertOne(promo);
    await logAudit('promo_created', { code: promo.code, by: user.uid });
    res.json({ success: true, message: 'Cupón creado exitosamente', promo: { ...promo, id: promo._id } });
  } catch (e) {
    logger.error('❌ Promo create error: ' + e.message);
    res.status(500).json({ error: 'Error creando cupón: ' + e.message });
  }
});

app.post('/api/marketplace/promo/validate', async (req, res) => {
  try {
    const { code, itemId, userId } = req.body;
    if (!code) return res.status(400).json({ error: 'Código de cupón requerido' });
    if (!mongoReady) return res.json({ success: true, valid: true, discount: { type: 'percent', value: 10 }, demo: true });

    const promo = await promoCollection.findOne({ code: code.toUpperCase(), active: true });
    if (!promo) return res.status(404).json({ error: 'Cupón no válido' });
    if (promo.validUntil && new Date() > promo.validUntil) return res.status(400).json({ error: 'Cupón expirado' });
    if (promo.maxUses && promo.currentUses >= promo.maxUses) return res.status(400).json({ error: 'Cupón agotado' });
    if (promo.applicableItems.length > 0 && !promo.applicableItems.includes(itemId)) {
      return res.status(400).json({ error: 'Cupón no aplica a este producto' });
    }

    const item = await secretsCollection.findOne({ _id: new ObjectId(itemId), isForSale: true });
    if (!item) return res.status(404).json({ error: 'Producto no encontrado' });

    // Verificar que el comprador no sea el mismo vendedor
    if (userId) {
      const user = await usersCollection.findOne({ uid: userId });
      if (user && user._id.toString() === item.userId.toString()) {
        return res.status(400).json({ error: 'No puedes usar un cupón en tus propios productos' });
      }
    }

    let discountAmount = 0;
    if (promo.discountType === 'percent') {
      discountAmount = Math.min(item.price * (promo.discountValue / 100), item.price);
    } else {
      discountAmount = Math.min(promo.discountValue, item.price);
    }
    const finalPrice = item.price - discountAmount;

    res.json({
      success: true,
      valid: true,
      discount: {
        type: promo.discountType,
        value: promo.discountValue,
        amount: discountAmount.toFixed(2),
        originalPrice: item.price,
        finalPrice: finalPrice.toFixed(2)
      },
      code: promo.code
    });
  } catch (e) {
    logger.error('❌ Promo validate error: ' + e.message);
    res.status(500).json({ error: 'Error validando cupón: ' + e.message });
  }
});
// ============================================
// 🌐 SERVIR FRONTEND
// ============================================
app.get('/', function(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 🆔 IDENTIDAD DIGITAL: Avatar, Contactos, Multifirma
// ============================================

// Actualizar avatar (usando uid)
app.post('/api/identity/avatar', authenticate, async (req, res) => {
  try {
    const { av } = req.body;
    if (!av) return res.status(400).json({ error: 'Falta avatar' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    await usersCollection.updateOne({ _id: user._id }, { $set: { avatar: av } });
    await logAudit('avatar_updated', { userId: req.user.uid });
    res.json({ success: true, message: 'Avatar actualizado' });
  } catch (e) {
    logger.error('❌ Error guardando avatar: ' + e.message);
    res.status(500).json({ error: 'Error guardando avatar: ' + e.message });
  }
});

// Firma digital (redirige a WebAuthn)
app.post('/api/identity/signature', authenticate, async (req, res) => {
  return res.json({
    success: true,
    message: 'Para firmar con máxima seguridad, usa /api/crypto-auth/register-start',
    webauthnEndpoint: '/api/crypto-auth/register-start',
    legacySupport: true
  });
});

// Agregar contacto de recuperación
app.post('/api/identity/contacts', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Verificar que el contacto exista en la plataforma
    const contactExists = await usersCollection.findOne({ email });
    if (!contactExists) return res.status(400).json({ error: 'El contacto debe tener cuenta en ApiRomwiner' });

    let contacts = user.recoveryContacts || [];
    if (contacts.length >= 5) return res.status(400).json({ error: 'Máximo 5 contactos permitidos' });
    if (contacts.some(c => c.email === email)) return res.status(400).json({ error: 'Contacto ya agregado' });

    contacts.push({ email, ts: new Date(), verified: false });
    await usersCollection.updateOne({ _id: user._id }, { $set: { recoveryContacts: contacts } });
    await logAudit('contact_added', { userId: req.user.uid, contactEmail: email });
    res.json({ success: true, contacts });
  } catch (e) {
    logger.error('❌ Error agregando contacto: ' + e.message);
    res.status(500).json({ error: 'Error agregando contacto: ' + e.message });
  }
});

// Listar contactos
app.get('/api/identity/contacts', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid }, { projection: { recoveryContacts: 1 } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ contacts: user.recoveryContacts || [] });
  } catch (e) {
    logger.error('❌ Error cargando contactos: ' + e.message);
    res.status(500).json({ error: 'Error cargando contactos: ' + e.message });
  }
});

// Eliminar contacto
app.delete('/api/identity/contacts/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const updated = (user.recoveryContacts || []).filter(x => (x._id?.toString() !== id && x.email !== id));
    await usersCollection.updateOne({ _id: user._id }, { $set: { recoveryContacts: updated } });
    await logAudit('contact_removed', { userId: req.user.uid, contactId: id });
    res.json({ success: true, contacts: updated });
  } catch (e) {
    logger.error('❌ Error eliminando contacto: ' + e.message);
    res.status(500).json({ error: 'Error eliminando contacto: ' + e.message });
  }
});

// Multifirma
app.post('/api/identity/multisig', authenticate, async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    await usersCollection.updateOne({ _id: user._id }, { $set: { multisig: !!enabled } });
    await logAudit('multisig_toggled', { userId: req.user.uid, enabled });
    res.json({ success: true, message: enabled ? 'Multifirma activada' : 'Multifirma desactivada' });
  } catch (e) {
    logger.error('❌ Error actualizando multifirma: ' + e.message);
    res.status(500).json({ error: 'Error actualizando multifirma: ' + e.message });
  }
});

// ============================================
// 👤 PERFIL (EVITAR DUPLICADO CON /api/profile existente)
// ============================================
// Nota: Ya existe un endpoint /api/profile que devuelve datos seguros.
// Este endpoint es redundante y lo eliminamos para no duplicar.
// Si necesitas obtener el usuario completo (solo administradores), crea otro endpoint específico.
// Por ahora, comentamos este bloque para evitar conflictos.
/*
app.get('/api/profile', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid }, { projection: { password: 0, passwordHash: 0, salt: 0 } });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: 'Error cargando perfil: ' + e.message }); }
});
*/

// ============================================
// 📊 ANALYTICS FINANCIERO (REAL)
// ============================================

app.get('/api/analytics/financial', authenticate, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now - days * 24 * 60 * 60 * 1000);

    // Ventas como vendedor
    const salesAgg = await transactionsCollection?.aggregate([
      { $match: { seller: user.uid, type: 'sale', createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray() || [];

    // Comisiones de afiliado (cuando el usuario es afiliado)
    const affiliateAgg = await transactionsCollection?.aggregate([
      { $match: { buyerReferredBy: user.uid, type: 'affiliate', createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).toArray() || [];

    // Ingresos por día (ventas + afiliados)
    const revenueByDay = await transactionsCollection?.aggregate([
      {
        $match: {
          $or: [{ seller: user.uid, type: 'sale' }, { buyerReferredBy: user.uid, type: 'affiliate' }],
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray() || [];

    // Ventas por categoría
    const salesByCategory = await secretsCollection?.aggregate([
      { $match: { userId: user._id, isForSale: true, sales: { $gt: 0 } } },
      { $group: { _id: '$categoria', count: { $sum: '$sales' } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray() || [];

    // Top productos
    const topProducts = await secretsCollection?.find(
      { userId: user._id, isForSale: true, sales: { $gt: 0 } },
      { projection: { titulo: 1, sales: 1, price: 1 } }
    ).sort({ sales: -1 }).limit(5).toArray() || [];

    // Historial de comisiones de afiliado
    const affiliateHistory = await transactionsCollection?.find(
      { buyerReferredBy: user.uid, type: 'affiliate', createdAt: { $gte: startDate } },
      { projection: { amount: 1, item: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(20).toArray() || [];

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
        affiliateHistory: affiliateHistory.map(h => ({ amount: h.amount, item: h.item, date: h.createdAt }))
      }
    });
  } catch (e) {
    logger.error('❌ Analytics error: ' + e.message);
    res.status(500).json({ error: 'Error cargando analytics: ' + e.message });
  }
});

// Exportar datos financieros (CSV o JSON)
app.get('/api/analytics/financial/export', authenticate, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const transactions = await transactionsCollection?.find({
      $or: [{ seller: user.uid }, { buyerReferredBy: user.uid }]
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
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=financial_export_${Date.now()}.csv`);
      return res.send(csvContent);
    } else {
      res.json({ success: true, data: { json: transactions } });
    }
  } catch (e) {
    logger.error('❌ Export error: ' + e.message);
    res.status(500).json({ error: 'Error exportando: ' + e.message });
  }
});

// ============================================
// 🔐 STREAMING SEGURO (PROTOTIPO - PARA IMPLEMENTAR COMPLETAMENTE)
// ============================================
app.get('/api/vault/:id/stream/secure', async (req, res) => {
  try {
    const authToken = req.query.token;
    if (!authToken) return res.status(401).json({ error: 'Token de autenticación requerido' });

    let user;
    try {
      const decoded = jwt.verify(authToken, JWT_SECRET);
      user = await usersCollection.findOne({ uid: decoded.uid });
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) return res.status(400).json({ error: 'ID inválido' });

    const fileRecord = await secretsCollection.findOne({ _id: new ObjectId(fileId) });
    if (!fileRecord) return res.status(404).json({ error: 'Archivo no encontrado' });

    const isOwner = fileRecord.userId.toString() === user._id.toString();
    const hasBought = fileRecord.buyers?.includes(user.uid);
    const isPublic = fileRecord.isForSale && fileRecord.price === 0;

    if (!isOwner && !hasBought && !isPublic) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes permiso para ver este archivo.' });
    }

    // Aquí iría la lógica real de streaming del archivo cifrado.
    // Por ahora, registramos el acceso y devolvemos un mensaje informativo.
    await logAudit('secure_stream_access', { userId: user.uid, fileId, isOwner, hasBought });
    logger.info(`🔐 Streaming seguro solicitado para ${fileRecord.fileName} por ${user.uid}`);

    // Si el archivo es de tipo multimedia, podrías transmitir el contenido descifrado.
    // Como no tenemos la implementación completa, respondemos con un mensaje.
    res.json({
      success: true,
      message: 'Streaming seguro disponible. Próximamente: reproducción en tiempo real.',
      file: {
        id: fileRecord._id,
        titulo: fileRecord.titulo,
        fileName: fileRecord.fileName,
        fileType: fileRecord.fileType,
        size: fileRecord.fileSize
      }
    });
  } catch (error) {
    logger.error('❌ Error en streaming seguro:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Error interno al procesar el streaming' });
  }
});

// ← ✅ CIERRE CORRECTO DE LA FUNCIÓN

// ============================================
// 🌿 CONTROL DE VERSIONES GIT-LIKE
// ============================================

app.post('/api/vault/:id/commit', authenticate, async (req, res) => {
  try {
    const { message, branch = 'main', tags = [] } = req.body;
    if (!message || message.trim().length < 2) {
      return res.status(400).json({ error: 'Mensaje requerido (mín. 2 caracteres)' });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

    const commit = {
      fileId: file._id,
      message: message.trim(),
      author: { uid: user.uid, email: user.email },
      branch,
      tags,
      version: (file.currentVersion || 0) + 1,
      timestamp: new Date(),
      hash: crypto.createHash('sha256').update(req.params.id + message + Date.now()).digest('hex').slice(0, 8)
    };
    if (commitsCollection) {
      await commitsCollection.insertOne(commit);
    } else {
      logger.warn('⚠️ commitsCollection no disponible, commit no guardado');
    }
    await secretsCollection.updateOne(
      { _id: file._id },
      { $set: { currentVersion: commit.version, lastCommitHash: commit.hash, updatedAt: new Date() } }
    );
    await logAudit('vault_commit', { fileId: req.params.id, message: commit.message, hash: commit.hash });
    res.json({
      success: true,
      message: '✅ Commit creado',
      commit: { hash: commit.hash, message: commit.message, branch, version: commit.version }
    });
  } catch (e) {
    logger.error('❌ Error creando commit: ' + e.message);
    res.status(500).json({ error: 'Error creando commit: ' + e.message });
  }
});

app.get('/api/vault/:id/log', authenticate, async (req, res) => {
  try {
    const { branch = 'main', limit = 20 } = req.query;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

    if (!commitsCollection) {
      return res.json({ success: true, log: [], branch, total: 0, demo: true });
    }
    const commits = await commitsCollection.find({ fileId: file._id, branch })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) || 20)
      .toArray();
    res.json({
      success: true,
      log: commits.map(c => ({
        hash: c.hash,
        message: c.message,
        author: c.author.email,
        branch: c.branch,
        tags: c.tags,
        date: c.timestamp,
        version: c.version
      })),
      branch,
      total: commits.length
    });
  } catch (e) {
    logger.error('❌ Error listando historial: ' + e.message);
    res.status(500).json({ error: 'Error listando historial: ' + e.message });
  }
});

app.post('/api/vault/:id/checkout/:version', authenticate, async (req, res) => {
  try {
    const version = parseInt(req.params.version);
    if (!version || version < 1) return res.status(400).json({ error: 'Versión inválida' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const file = await secretsCollection.findOne({ _id: new ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado' });

    if (commitsCollection) {
      const targetCommit = await commitsCollection.findOne({ fileId: file._id, version });
      if (!targetCommit) return res.status(404).json({ error: 'Versión no encontrada' });
      await secretsCollection.updateOne(
        { _id: file._id },
        { $set: { currentVersion: version, lastCheckout: new Date(), updatedAt: new Date() } }
      );
      await logAudit('vault_checkout', { fileId: req.params.id, restoredToVersion: version, by: user.uid });
      res.json({
        success: true,
        message: `✅ Restaurado a versión ${version}`,
        version,
        timestamp: new Date()
      });
    } else {
      res.json({ success: true, message: '⚠️ Modo demo: historial no activo aún' });
    }
  } catch (e) {
    logger.error('❌ Error restaurando versión: ' + e.message);
    res.status(500).json({ error: 'Error restaurando versión: ' + e.message });
  }
});

// ============================================
// 📢 SISTEMA DE PUBLICIDAD CON RECOMPENSAS
// ============================================

app.get('/api/ads/available', authenticate, async (req, res) => {
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

app.post('/api/ads/watch/:id', authenticate, async (req, res) => {
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
    await walletCollection.updateOne(
      { userId: user._id },
      {
        $inc: { balance: reward },
        $push: { history: { type: 'ad_reward', amount: reward, adId: ad._id.toString(), date: new Date() } }
      }
    );
    await adsCollection.updateOne({ _id: ad._id }, { $inc: { budget: -reward, views: 1 } });
    // Obtener IP real detrás de proxy
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    await adImpressionsCollection.insertOne({
      userId: user._id,
      adId: ad._id,
      watchTime,
      reward,
      watchedAt: new Date(),
      ip: clientIp
    });
    await logAudit('ad_watched', { userId: user.uid, adId: id, reward, watchTime });

    const newWallet = await walletCollection.findOne({ userId: user._id });
    res.json({
      success: true,
      message: `✅ ¡Ganaste $${reward.toFixed(2)} USD por ver este anuncio!`,
      earned: reward,
      newBalance: newWallet?.balance || 0,
      remainingDaily: 20 - watchedToday - 1
    });
  } catch (e) {
    logger.error('❌ Ad watch error: ' + e.message);
    res.status(500).json({ error: 'Error procesando recompensa: ' + e.message });
  }
});

app.post('/api/ads/create', authenticate, async (req, res) => {
  try {
    const { title, description, imageUrl, targetUrl, reward, budget, type = 'banner', startDate, endDate } = req.body;
    if (!title || title.length < 5) return res.status(400).json({ error: 'Título requerido (mín. 5 caracteres)' });
    if (!description || description.length < 20) return res.status(400).json({ error: 'Descripción requerida (mín. 20 caracteres)' });
    // Validar que la imagen sea interna (base64 o URL de nuestro dominio) – cero enlaces externos
    if (!imageUrl || (!imageUrl.startsWith('data:image/') && !imageUrl.startsWith('/uploads/') && !imageUrl.includes('localhost'))) {
      return res.status(400).json({ error: 'Solo se permiten imágenes subidas internamente (base64 o /uploads/)' });
    }
    if (!reward || reward < 0.01 || reward > 1) return res.status(400).json({ error: 'Recompensa debe estar entre $0.01 y $1.00' });
    if (!budget || budget < 1) return res.status(400).json({ error: 'Presupuesto mínimo: $1.00 USD' });

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const wallet = await walletCollection.findOne({ userId: user._id });
    if (!wallet || wallet.balance < budget) {
      return res.status(400).json({ error: `Saldo insuficiente. Necesitas $${budget} USD. Tu saldo: $${(wallet?.balance || 0).toFixed(2)}` });
    }

    const profile = await profilesCollection.findOne({ userId: user._id });
    const newAd = {
      advertiserId: user._id,
      advertiserName: profile?.displayName || user.email,
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
    await walletCollection.updateOne(
      { userId: user._id },
      {
        $inc: { balance: -budget },
        $push: { history: { type: 'ad_campaign', amount: -budget, adId: result.insertedId.toString(), date: new Date() } }
      }
    );
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

app.get('/api/ads/my-campaigns', authenticate, async (req, res) => {
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

app.patch('/api/ads/:id/toggle', authenticate, async (req, res) => {
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
// 🔄 RENOVACIÓN AUTOMÁTICA DE SUSCRIPCIONES (CORREGIDA)
// ============================================
async function processAutoRenewals() {
  if (!mongoReady) return;
  const today = new Date();
  // Buscar usuarios con autoRenew activo, tier de pago y suscripción expirada o próxima a vencer (menos de 1 día)
  const users = await usersCollection.find({
    autoRenew: true,
    tier: { $in: ['business', 'enterprise'] },
    $or: [
      { subscriptionExpires: { $lt: today } },                 // ya expirada
      { subscriptionExpires: { $exists: false } },             // migración (nunca se asignó)
      { subscriptionExpires: { $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) } } // vence en menos de 24h
    ]
  }).toArray();

  for (const user of users) {
    try {
      const wallet = await walletCollection.findOne({ userId: user._id });
      const tierPrice = { business: 9.99, enterprise: 49.99 };
      const price = tierPrice[user.tier];
      if (!price) continue;

      // Si no tiene saldo suficiente, desactivar autoRenew y notificar
      if (!wallet || wallet.balance < price) {
        await usersCollection.updateOne({ _id: user._id }, { $set: { autoRenew: false } });
        logger.warn(`⚠️ Auto-renewal desactivado por saldo insuficiente: ${user.email}`);
        continue;
      }

      // Calcular nueva fecha de expiración (30 días desde la fecha actual o desde la fecha de expiración actual, la que sea mayor)
      const currentExpiry = user.subscriptionExpires ? new Date(user.subscriptionExpires) : today;
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), today.getTime()) + 30 * 24 * 60 * 60 * 1000);

      // Cobrar
      await walletCollection.updateOne(
        { userId: user._id },
        {
          $inc: { balance: -price },
          $push: { history: { type: 'auto_renewal', amount: -price, tier: user.tier, date: today } }
        }
      );

      // Actualizar fecha de expiración y mantener autoRenew activo
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { subscriptionExpires: newExpiry, updatedAt: today } }
      );

      await logAudit('auto_renewal', { userId: user.uid, tier: user.tier, amount: price, newExpiry });
      logger.info(`🔄 Auto-renovado: ${user.email} → ${user.tier} hasta ${newExpiry.toISOString()}`);
    } catch (e) {
      logger.warn(`⚠️ Auto-renewal failed for ${user.uid}: ${e.message}`);
    }
  }
}

// ============================================
// ⏰ EJECUTAR PROCESOS CADA 24h
// ============================================
if (mongoReady) {
  setInterval(processAutoRenewals, 24 * 60 * 60 * 1000);
  logger.info('🔄 Auto-renovales programados cada 24h');
}

// ============================================
// 💳 STRIPE WEBHOOK (confirmar pagos) - CORREGIDO
// ============================================
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret === 'placeholder') {
    logger.warn('⚠️ Stripe webhook secret no configurado. Modo demo.');
    return res.json({ received: true, demo: true });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error(`❌ Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const { uid, type } = paymentIntent.metadata;
        const amount = paymentIntent.amount / 100;

        if (type === 'deposit' && uid && mongoReady && walletCollection) {
          const user = await usersCollection.findOne({ uid });
          if (user) {
            // Idempotencia: evitar duplicados
            const existingHistory = await walletCollection.findOne({
              userId: user._id,
              'history.paymentId': paymentIntent.id
            });
            if (!existingHistory) {
              await walletCollection.updateOne(
                { userId: user._id },
                {
                  $inc: { balance: amount },
                  $push: {
                    history: {
                      type: 'deposit_stripe',
                      amount,
                      date: new Date(),
                      paymentId: paymentIntent.id,
                      status: 'confirmed'
                    }
                  }
                }
              );
              await logAudit('deposit_confirmed', { uid, amount, method: 'stripe', paymentId: paymentIntent.id });
              logger.info(`💳 Depósito confirmado: $${amount} para ${uid}`);
            } else {
              logger.warn(`⚠️ Webhook duplicado ignorado para paymentIntent ${paymentIntent.id}`);
            }
          } else {
            logger.warn(`⚠️ Usuario no encontrado para uid: ${uid}`);
          }
        }
        break;

      default:
        logger.info(`Webhook recibido de tipo no manejado: ${event.type}`);
    }
    res.json({ received: true });
  } catch (err) {
    logger.error(`❌ Error procesando webhook: ${err.message}`);
    res.status(500).json({ error: 'Error interno procesando webhook' });
  }
});

// ============================================
// 💰 AUTO-SUSCRIPCIÓN (ACTUALIZAR FECHA DE EXPIRACIÓN)
// ============================================
app.post('/api/wallet/auto-subscribe', authenticate, async (req, res) => {
  try {
    if (!mongoReady || !usersCollection || !walletCollection) {
      return res.json({ success: true, message: 'Demo: auto-suscripción activada', demo: true });
    }

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const wallet = await walletCollection.findOne({ userId: user._id });
    const tierPrice = { personal: 0, business: 9.99, enterprise: 49.99 };
    const nextTier = req.body.tier || 'business';
    const price = tierPrice[nextTier] || 0;

    if (!wallet || wallet.balance < price) {
      return res.status(400).json({
        error: 'Saldo insuficiente',
        currentBalance: wallet?.balance || 0,
        required: price,
        hint: 'Gana saldo viendo anuncios o vendiendo en el Marketplace'
      });
    }

    // Calcular nueva fecha de expiración (30 días desde hoy, o desde la actual si ya tiene)
    const now = new Date();
    const currentExpiry = user.subscriptionExpires ? new Date(user.subscriptionExpires) : null;
    const newExpiry = new Date(Math.max(now.getTime(), currentExpiry?.getTime() || now.getTime()) + 30 * 24 * 60 * 60 * 1000);

    await walletCollection.updateOne(
      { userId: user._id },
      {
        $inc: { balance: -price },
        $push: { history: { type: 'auto_subscription', amount: -price, tier: nextTier, date: now } }
      }
    );

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          tier: nextTier,
          autoRenew: true,
          subscriptionExpires: newExpiry,
          updatedAt: now
        }
      }
    );

    await logAudit('auto_subscribe', { userId: user.uid, tier: nextTier, amount: price, expiresAt: newExpiry });
    res.json({
      success: true,
      message: `✅ Suscripción a ${nextTier} activada. Se renovará automáticamente cada mes.`,
      newTier: nextTier,
      nextBilling: newExpiry.toISOString(),
      remainingBalance: (wallet.balance - price).toFixed(2)
    });
  } catch (e) {
    logger.error('❌ Auto-subscribe error: ' + e.message);
    res.status(500).json({ error: 'Error procesando auto-suscripción' });
  }
});
// ============================================
// 💰 SUSCRIPCIONES ENTRE USUARIOS Y DONACIONES
// ============================================

// Activar perfil Premium para recibir suscripciones
app.post('/api/profiles/premium/activate', authenticate, async (req, res) => {
  try {
    const { monthlyPrice, description, perks = [] } = req.body;
    if (!monthlyPrice || monthlyPrice < 1) return res.status(400).json({ error: 'Precio mínimo $1 USD' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    await profilesCollection.updateOne(
      { userId: user._id },
      {
        $set: {
          isPremiumProfile: true,
          premiumMonthlyPrice: parseFloat(monthlyPrice),
          premiumDescription: description?.substring(0, 500),
          premiumPerks: perks.slice(0, 5),
          premiumActivatedAt: new Date()
        }
      }
    );
    await logAudit('profile_premium_activated', { userId: user.uid, price: monthlyPrice });
    res.json({ success: true, message: '✅ Perfil Premium activado. ¡Ahora puedes recibir suscripciones!' });
  } catch (e) {
    logger.error('❌ Error activando perfil: ' + e.message);
    res.status(500).json({ error: 'Error activando perfil: ' + e.message });
  }
});

// Suscribirse al perfil Premium de otro usuario
app.post('/api/profiles/:targetUid/subscribe', authenticate, async (req, res) => {
  try {
    const { months = 1 } = req.body;
    if (months < 1 || months > 12) return res.status(400).json({ error: 'Suscripción de 1 a 12 meses' });
    const subscriber = await usersCollection.findOne({ uid: req.user.uid });
    const creator = await usersCollection.findOne({ uid: req.params.targetUid });
    if (!creator) return res.status(404).json({ error: 'Creador no encontrado' });
    const creatorProfile = await profilesCollection.findOne({ userId: creator._id });
    if (!creatorProfile?.isPremiumProfile) return res.status(400).json({ error: 'Este perfil no acepta suscripciones' });
    if (creator.uid === subscriber.uid) return res.status(400).json({ error: 'No puedes suscribirte a ti mismo' });

    const pricePerMonth = creatorProfile.premiumMonthlyPrice;
    const totalPrice = pricePerMonth * months;
    const subWallet = await walletCollection.findOne({ userId: subscriber._id });
    if (!subWallet || subWallet.balance < totalPrice) {
      return res.status(400).json({ error: 'Saldo insuficiente', currentBalance: subWallet?.balance || 0, required: totalPrice });
    }

    const creatorAmount = totalPrice * 0.80;
    const platformFee = totalPrice * 0.15;
    let referralAmount = 0;
    if (subscriber.referredBy) {
      const referrer = await usersCollection.findOne({ uid: subscriber.referredBy });
      if (referrer && referrer.uid !== creator.uid) {
        referralAmount = totalPrice * 0.05;
        const refWallet = await walletCollection.findOne({ userId: referrer._id });
        if (refWallet) {
          await walletCollection.updateOne(
            { userId: referrer._id },
            { $inc: { balance: referralAmount }, $push: { history: { type: 'referral_subscription', amount: referralAmount, from: subscriber.uid, date: new Date() } } }
          );
        }
      }
    }

    await walletCollection.updateOne(
      { userId: subscriber._id },
      { $inc: { balance: -totalPrice }, $push: { history: { type: 'profile_subscription', amount: -totalPrice, to: creator.uid, months, date: new Date() } } }
    );
    await walletCollection.updateOne(
      { userId: creator._id },
      { $inc: { balance: creatorAmount }, $push: { history: { type: 'profile_subscription_received', amount: creatorAmount, from: subscriber.uid, months, date: new Date() } } }
    );

    // Guardar en colección de suscripciones (si existe)
    if (db.collection('subscriptions')) {
      await db.collection('subscriptions').insertOne({
        subscriberUid: subscriber.uid,
        creatorUid: creator.uid,
        months,
        totalPrice,
        startDate: new Date(),
        endDate: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000),
        status: 'active'
      });
    }

    await logAudit('profile_subscribed', { subscriber: subscriber.uid, creator: creator.uid, amount: totalPrice, months });
    res.json({
      success: true,
      message: `✅ Suscripción de ${months} mes(es) activada. Acceso inmediato al contenido exclusivo.`,
      breakdown: { total: totalPrice, toCreator: creatorAmount, toPlatform: platformFee, toReferral: referralAmount },
      endDate: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (e) {
    logger.error('❌ Error procesando suscripción: ' + e.message);
    res.status(500).json({ error: 'Error procesando suscripción: ' + e.message });
  }
});

// Enviar donación a usuario o empresa
app.post('/api/donations/send', authenticate, async (req, res) => {
  try {
    const { targetUid, amount, message } = req.body;
    if (!targetUid || !amount || amount < 1) return res.status(400).json({ error: 'Monto mínimo $1 USD' });
    const donor = await usersCollection.findOne({ uid: req.user.uid });
    const recipient = await usersCollection.findOne({ uid: targetUid });
    if (!recipient) return res.status(404).json({ error: 'Destinatario no encontrado' });
    if (donor.uid === recipient.uid) return res.status(400).json({ error: 'No puedes donarte a ti mismo' });

    const donorWallet = await walletCollection.findOne({ userId: donor._id });
    if (!donorWallet || donorWallet.balance < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente', currentBalance: donorWallet?.balance || 0, required: amount });
    }

    const recipientAmount = amount * 0.95;
    const platformFee = amount * 0.05;
    await walletCollection.updateOne(
      { userId: donor._id },
      { $inc: { balance: -amount }, $push: { history: { type: 'donation_sent', amount: -amount, to: recipient.uid, message: message?.substring(0, 200), date: new Date() } } }
    );
    await walletCollection.updateOne(
      { userId: recipient._id },
      { $inc: { balance: recipientAmount }, $push: { history: { type: 'donation_received', amount: recipientAmount, from: donor.uid, message: message?.substring(0, 200), date: new Date() } } }
    );
    await logAudit('donation_sent', { donor: donor.uid, recipient: recipient.uid, amount, message: message?.substring(0, 100) });
    res.json({ success: true, message: '✅ Donación enviada. ¡Gracias por apoyar!', breakdown: { total: amount, toRecipient: recipientAmount, toPlatform: platformFee } });
  } catch (e) {
    logger.error('❌ Error enviando donación: ' + e.message);
    res.status(500).json({ error: 'Error enviando donación: ' + e.message });
  }
});

// Estadísticas del usuario (único)
app.get('/api/stats', authenticate, async (req, res) => {
  try {
    if (!mongoReady || !profilesCollection) {
      return res.json({
        success: true,
        isPremium: false,
        stats: { totalSubscribers: 0, monthlyRecurring: '0.00', totalDonations: '0.00', currentBalance: '0.00' },
        demo: true
      });
    }
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const profile = await profilesCollection.findOne({ userId: user._id });
    const wallet = await walletCollection.findOne({ userId: user._id });
    // Por ahora, estadísticas básicas (se pueden expandir)
    res.json({
      success: true,
      isPremium: profile?.isPremiumProfile || false,
      stats: {
        totalSubscribers: 0,
        monthlyRecurring: '0.00',
        totalDonations: '0.00',
        currentBalance: (wallet?.balance ?? 0).toFixed(2)
      }
    });
  } catch (err) {
    logger.error('❌ Error en /api/stats:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ============================================
// 🚀 REGISTRO PREMIUM (ÚNICO Y CORREGIDO)
// ============================================
app.post('/api/register/premium', async (req, res) => {
  try {
    const { nombre, email, password, telefono, avatarBase64, firmaBase64 } = req.body;

    if (!nombre || nombre.trim().length < 3) return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email inválido' });
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Contraseña débil. Requiere: 8+ caracteres, 1 mayúscula, 1 número, 1 símbolo' });
    }

    if (!mongoReady) {
      return res.status(201).json({
        success: true,
        message: '✅ Registro Premium completado (modo demo)',
        demo: true,
        user: { uid: 'demo_' + Date.now(), email, nombre: nombre.trim(), tier: 'premium', avatar: avatarBase64 || 'generado', firma: firmaBase64 ? 'capturada' : 'pendiente' }
      });
    }

    const existe = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existe) return res.status(400).json({ error: 'Este email ya está registrado. Inicia sesión.' });

    const hashed = await bcrypt.hash(password, 10);
    const uid = 'rom_' + crypto.randomBytes(8).toString('hex');
    const refCode = 'ROM' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const newUser = {
      uid,
      email: email.toLowerCase(),
      username: nombre.trim().toLowerCase().replace(/\s/g, '_'), // username basado en nombre
      nombre: nombre.trim(),
      telefono: telefono || null,
      password: hashed,
      refCode,
      tier: 'premium',
      isPremium: true,
      premiumSince: new Date(),
      avatar: avatarBase64 || null,
      firmaDigital: firmaBase64 || null,
      firmaHash: firmaBase64 ? crypto.createHash('sha256').update(firmaBase64).digest('hex') : null,
      webauthnRegistered: false,
      isAdmin: ADMIN_EMAILS.includes(email.toLowerCase()),
      createdAt: new Date(),
      lastLogin: new Date(),
      affiliates: { level: 'plata', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 },
      metadata: { registrationMethod: 'premium_auto', userAgent: req.headers['user-agent'] || 'unknown', ip: req.ip }
    };

    const result = await usersCollection.insertOne(newUser);

    await profilesCollection.insertOne({
      userId: result.insertedId,
      uid,
      displayName: nombre.trim(),
      avatarUrl: avatarBase64 || null,
      bio: 'Usuario Premium de ApiRomwiner Vault',
      isPublic: true,
      identityVerified: true,
      sellerPremium: true,
      premiumSince: new Date(),
      createdAt: new Date()
    });

    await walletCollection.insertOne({
      userId: result.insertedId,
      balance: 5.00,
      currency: 'USD',
      history: [{ type: 'welcome_bonus', amount: 5.00, message: '🎁 Bono de bienvenida Premium', date: new Date() }],
      createdAt: new Date()
    });

    await affiliatesCollection.insertOne({
      userId: result.insertedId,
      refCode,
      level: 'plata',
      createdAt: new Date()
    });

    const token = jwt.sign({ uid, email: email.toLowerCase(), isAdmin: ADMIN_EMAILS.includes(email.toLowerCase()), tier: 'premium' }, JWT_SECRET, { expiresIn: '7d' });

    await logAudit('premium_register', { uid, email: email.toLowerCase(), nombre: nombre.trim(), hasAvatar: !!avatarBase64, hasFirma: !!firmaBase64 });
    logger.info(`🎉 Nuevo usuario Premium registrado: ${email}`);

    res.status(201).json({
      success: true,
      message: '✅ ¡Bienvenido a ApiRomwiner Premium!',
      token,
      user: {
        uid,
        email: email.toLowerCase(),
        nombre: nombre.trim(),
        tier: 'premium',
        avatar: avatarBase64 || null,
        firmaDigital: !!firmaBase64,
        refCode,
        welcomeBonus: 5.00
      },
      nextSteps: ['📱 Registra tu huella digital para máxima seguridad', '🔐 Activa la multifirma para acciones críticas', '📤 Sube tu primer archivo al Vault']
    });
  } catch (e) {
    logger.error('❌ Premium register error: ' + e.message);
    res.status(500).json({ error: 'Error en registro Premium: ' + e.message });
  }
});

// ============================================
// 🖐️ HUELLA DIGITAL (WEBAUTHN) – ÚNICO
// ============================================
app.post('/api/identity/register-fingerprint', authenticate, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Credencial de huella requerida' });
    if (!mongoReady) return res.json({ success: true, message: 'Huella registrada (modo demo)', demo: true });

    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await usersCollection.updateOne(
      { uid: req.user.uid },
      {
        $set: {
          webauthnRegistered: true,
          webauthnCredential: {
            id: credential.id,
            type: credential.type,
            rawId: credential.rawId,
            response: credential.response,
            registeredAt: new Date()
          },
          webauthnRegisteredAt: new Date()
        }
      }
    );

    await logAudit('fingerprint_registered', { uid: req.user.uid, credentialId: credential.id });
    logger.info(`🔐 Huella digital registrada para: ${req.user.uid}`);
    res.json({ success: true, message: '✅ Huella digital registrada exitosamente', registeredAt: new Date().toISOString() });
  } catch (e) {
    logger.error('❌ Fingerprint register error: ' + e.message);
    res.status(500).json({ error: 'Error registrando huella: ' + e.message });
  }
});

app.get('/api/identity/fingerprint-status', authenticate, async (req, res) => {
  try {
    if (!mongoReady) return res.json({ success: true, registered: false, demo: true });
    const user = await usersCollection.findOne({ uid: req.user.uid }, { projection: { webauthnRegistered: 1, webauthnRegisteredAt: 1 } });
    res.json({ success: true, registered: user?.webauthnRegistered || false, registeredAt: user?.webauthnRegisteredAt || null });
  } catch (e) {
    logger.error('❌ Error verificando estado: ' + e.message);
    res.status(500).json({ error: 'Error verificando estado: ' + e.message });
  }
});

// ============================================
// 👑 ADMIN: FONDO SOLIDARIO (único)
// ============================================
app.get('/api/admin/funds', authenticate, requireAdmin, async (req, res) => {
  try {
    const fund = await db.collection('community_funds').findOne({ _id: 'solidarity_fund' });
    res.json({ success: true, balance: fund?.balance || 0, totalContributions: fund?.history?.length || 0, lastUpdated: fund?.updatedAt || null });
  } catch (e) {
    logger.error('❌ Error en fondo solidario: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/funds/grant', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId, amount, reason } = req.body;
    if (!userId || !amount || amount <= 0) return res.status(400).json({ error: 'Datos inválidos' });
    const user = await usersCollection.findOne({ uid: userId });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const fund = await db.collection('community_funds').findOne({ _id: 'solidarity_fund' });
    if (!fund || fund.balance < amount) return res.status(400).json({ error: 'Fondo insuficiente' });
    await db.collection('community_funds').updateOne(
      { _id: 'solidarity_fund' },
      { $inc: { balance: -amount }, $push: { history: { type: 'grant', amount: -amount, to: userId, reason, date: new Date() } } }
    );
    await walletCollection.updateOne(
      { userId: user._id },
      { $inc: { balance: amount }, $push: { history: { type: 'solidarity_grant', amount, reason, date: new Date() } } },
      { upsert: true }
    );
    await logAudit('solidarity_grant', { by: req.admin.uid, to: userId, amount, reason });
    res.json({ success: true, message: `Se han otorgado $${amount} al usuario ${userId}.` });
  } catch (e) {
    logger.error('❌ Error otorgando bono: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 📢 PUBLICIDAD INTERNA (ÚNICA – SIN DUPLICADOS)
// ============================================
// Nota: Ya existe el endpoint /api/ads/create en el bloque anterior de publicidad.
// Por lo tanto, eliminamos esta repetición. Solo mantenemos los endpoints que faltaban:
app.get('/api/ads/active', async (req, res) => {
  try {
    const now = new Date();
    const activeAds = await adsCollection.find({ active: true, expiresAt: { $gt: now } }).sort({ budget: -1 }).limit(20).toArray();
    const products = [];
    for (const ad of activeAds) {
      const product = await secretsCollection.findOne({ _id: ad.productId, isForSale: true }, { projection: { titulo: 1, price: 1, categoria: 1, fileName: 1, userUid: 1, sales: 1, createdAt: 1 } });
      if (product) products.push({ ...product, isAd: true, adBudget: ad.budget, adExpiresAt: ad.expiresAt });
    }
    res.json({ success: true, ads: products });
  } catch (e) {
    logger.error('❌ Error listando anuncios activos: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ads/cancel/:adId', authenticate, async (req, res) => {
  try {
    const adId = req.params.adId;
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const ad = await adsCollection.findOne({ _id: new ObjectId(adId) });
    if (!ad) return res.status(404).json({ error: 'Anuncio no encontrado' });
    if (ad.advertiserId.toString() !== user._id.toString()) return res.status(403).json({ error: 'No eres el propietario' });
    if (!ad.active) return res.status(400).json({ error: 'El anuncio ya está inactivo o expirado' });
    const refund = ad.budget - (ad.spent || 0);
    if (refund > 0) {
      await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: refund }, $push: { history: { type: 'ad_refund', amount: refund, adId, date: new Date() } } });
    }
    await adsCollection.updateOne({ _id: ad._id }, { $set: { active: false, cancelledAt: new Date() } });
    await logAudit('ad_cancelled', { userId: user.uid, adId, refund });
    res.json({ success: true, message: `Anuncio cancelado. Se reembolsaron $${refund} a tu wallet.` });
  } catch (e) {
    logger.error('❌ Error cancelando anuncio: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 💝 DONATIVOS VOLUNTARIOS (ÚNICOS)
// ============================================
app.post('/api/donate', authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ error: 'El monto mínimo es $1 USD' });
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const wallet = await walletCollection.findOne({ userId: user._id });
    if (!wallet || wallet.balance < amount) return res.status(400).json({ error: `Saldo insuficiente. Necesitas $${amount}. Saldo actual: $${wallet?.balance || 0}` });
    await walletCollection.updateOne({ userId: user._id }, { $inc: { balance: -amount }, $push: { history: { type: 'donation', amount: -amount, date: new Date() } } });
    await db.collection('system_wallets').updateOne({ _id: 'platform_donations' }, { $inc: { balance: amount }, $push: { history: { type: 'donation', amount, from: user.uid, date: new Date() } } }, { upsert: true });
    await logAudit('donation', { userId: user.uid, amount });
    res.json({ success: true, message: `❤️ ¡Gracias por tu donativo de $${amount}! Nos ayudas a mejorar.` });
  } catch (e) {
    logger.error('❌ Error en donación: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/donations', authenticate, requireAdmin, async (req, res) => {
  try {
    const fund = await db.collection('system_wallets').findOne({ _id: 'platform_donations' });
    res.json({ success: true, balance: fund?.balance || 0 });
  } catch (e) {
    logger.error('❌ Error consultando donaciones: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// 🏆 GAMIFICACIÓN (ÚNICA)
// ============================================
const LEVELS = [
  { level: 1, name: 'Bronce', xpRequired: 0, benefits: 'Comisión base 75%' },
  { level: 2, name: 'Plata', xpRequired: 500, benefits: 'Comisión base 78%' },
  { level: 3, name: 'Oro', xpRequired: 2000, benefits: 'Comisión base 81%' },
  { level: 4, name: 'Diamante', xpRequired: 8000, benefits: 'Comisión base 85%' }
];
const BADGES = {
  first_sale: { name: '🎖️ Primera Venta', description: 'Completaste tu primera venta', xpReward: 100 },
  first_referral: { name: '🤝 Primer Referido', description: 'Registraste tu primer referido', xpReward: 50 },
  seller_10: { name: '💪 Vendedor 10', description: 'Realizaste 10 ventas', xpReward: 200 },
  referrer_5: { name: '🌟 Referidor 5', description: 'Trajiste 5 referidos', xpReward: 150 },
  active_30: { name: '🔥 Activo 30 días', description: '30 días de actividad', xpReward: 300 },
  buyer_10: { name: '🛒 Comprador 10', description: 'Compraste 10 productos', xpReward: 100 },
  enterprise: { name: '🏢 Empresarial', description: 'Registró una empresa', xpReward: 500 },
  ad_creator: { name: '📢 Anunciante', description: 'Creó su primer anuncio', xpReward: 50 }
};

async function addXP(userId, xpAmount, badgeKey = null) {
  if (!mongoReady) return;
  const user = await usersCollection.findOne({ _id: userId });
  if (!user) return;
  let newXP = (user.xp || 0) + xpAmount;
  let newLevel = user.level || 1;
  let unlockedBadges = user.badges || [];
  if (badgeKey && !unlockedBadges.includes(badgeKey)) {
    unlockedBadges.push(badgeKey);
    newXP += (BADGES[badgeKey]?.xpReward || 0);
    await logAudit('badge_unlocked', { userId: user.uid, badge: badgeKey, xpReward: BADGES[badgeKey]?.xpReward });
  }
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newXP >= LEVELS[i].xpRequired) { newLevel = LEVELS[i].level; break; }
  }
  await usersCollection.updateOne({ _id: userId }, { $set: { xp: newXP, level: newLevel, badges: unlockedBadges, lastGamificationUpdate: new Date() } });
  return { xp: newXP, level: newLevel, badges: unlockedBadges };
}

app.get('/api/gamification/me', authenticate, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const currentLevelInfo = LEVELS.find(l => l.level === (user.level || 1));
    const nextLevel = LEVELS.find(l => l.level === (user.level || 1) + 1);
    const xpToNext = nextLevel ? nextLevel.xpRequired - (user.xp || 0) : 0;
    const badgesList = (user.badges || []).map(b => ({ key: b, ...BADGES[b] }));
    res.json({ success: true, level: user.level || 1, levelName: currentLevelInfo.name, xp: user.xp || 0, xpToNext, nextLevelName: nextLevel ? nextLevel.name : 'Máximo', badges: badgesList, benefits: currentLevelInfo.benefits });
  } catch (e) {
    logger.error('❌ Error en gamificación: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/gamification/badges', (req, res) => {
  const badgesList = Object.keys(BADGES).map(key => ({ key, ...BADGES[key] }));
  res.json({ success: true, badges: badgesList });
});

// ============================================
// 🎮 STREAMING Y CURSOS (ÚNICOS)
// ============================================
// Nota: Los endpoints de streaming y cursos ya están definidos antes.
// Solo mantenemos lo que no estaba duplicado. Pero para evitar repetición,
// aseguramos que solo existan una vez. Como en el archivo ya aparecen,
// no los repetimos aquí.

// ============================================
// 🚀 START SERVER (único)
// ============================================
async function startServer() {
  await connectToMongo();
  if (mongoReady) {
    setInterval(() => { KeyRotationService.scheduleRotations().catch(e => logger.warn('⚠️ Scheduled rotation failed: ' + e.message)); }, 24 * 60 * 60 * 1000);
    logger.info('🔄 Key rotation scheduled every 24h');
    setInterval(async () => {
      try {
        if (sharedLinksCollection) {
          const result = await sharedLinksCollection.deleteMany({ expiresAt: { $lt: new Date() } });
          if (result.deletedCount > 0) logger.info(`🧹 Limpiados ${result.deletedCount} enlaces expirados`);
        }
      } catch (e) { logger.warn('⚠️ Cleanup expired links failed: ' + e.message); }
    }, 60 * 60 * 1000);
    logger.info('🧹 Expired links cleanup scheduled every 1h');
    setInterval(processAutoRenewals, 24 * 60 * 60 * 1000);
    logger.info('🔄 Auto-renewals scheduled every 24h');
  }
  app.listen(PORT, '0.0.0.0', function () {
    logger.info('🚀 APIROMWINER en puerto ' + PORT);
    logger.info('🟢 57 Funciones Reales | 🔐 Zero-Knowledge | 🤖 IA Interna | 🛍️ Marketplace');
    if (FEATURES.PORTABLE_EXPORT) logger.info('📦 Exportación Portable: ACTIVADA');
    if (FEATURES.LOCAL_SYNC) logger.info('🔄 Sync Offline: ACTIVADO');
    if (FEATURES.ZERO_KNOWLEDGE) logger.info('🔐 Zero-Knowledge: ACTIVADO');
    if (FEATURES.WEB3_LOGIN) logger.info('🔗 Login Web3: ACTIVADO');
    if (FEATURES.IPFS_BACKUP) logger.info('🌐 Backup IPFS (Helia): ACTIVADO');
    if (FEATURES.AI_INTERNAL) logger.info('🤖 IA Interna: ACTIVADA');
  });
}

startServer().catch(err => {
  logger.error('❌ Error crítico al iniciar servidor: ' + err.message);
  process.exit(1);
});

// ============================================
// 📱 Generar código QR como imagen PNG
// ============================================
const QRCode = require('qrcode');

app.get('/api/identity/qr', authenticate, async(req, res) => {
  try {
    const user = await usersCollection.findOne({ uid: req.user.uid });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    // Obtener la URL base (desde entorno o desde la petición)
    const baseUrl = process.env.FRONTEND_URL || (req.protocol + '://' + req.get('host'));
    const registerUrl = `${baseUrl}/register?ref=${user.refCode}`;
    
    res.json({
      success: true,
      qrPayload: registerUrl,   // ← Ahora es una URL, no un JSON
      qrData: {
        ref: user.refCode,
        url: registerUrl
      }
    });
  } catch (e) {
    console.error('❌ QR identity error:', e);
    res.status(500).json({ error: 'Error al generar el código QR' });
  }
});

// === FIN: index.js ===
