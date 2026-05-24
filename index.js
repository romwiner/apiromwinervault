// === INICIO: index.js - APIROMWINER VAULT COMPLETO - SIN OPTIONAL CHAINING ===
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

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
const PORT = process.env.PORT || 10000;

// 🔐 CONEXIÓN MONGODB (URI corregida, sin srv problems en Render)
const MONGODB_URI = "mongodb+srv://apiromwinervault:Grup%40selen2000@cluster0.f83xnse.mongodb.net/apiromwinervault?retryWrites=true&w=majority&appName=Cluster0";

let db, usersCollection, secretsCollection, affiliatesCollection, identityCollection, transactionsCollection;

// 🔗 CONECTAR A MONGODB
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
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ uid: 1 }, { unique: true });
        await secretsCollection.createIndex({ userId: 1 });
        logger.info('✅ MongoDB Atlas conectado');
    } catch (err) {
        logger.error('❌ MongoDB error: ' + err.message);
    }
}

// 🔐 SEGURIDAD
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://apiromwinervault.onrender.com"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    }
}));
app.use(cors({ origin: process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// 📁 UPLOADS
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(function() {});
const storage = multer.diskStorage({
    destination: function(req, file, cb) { cb(null, uploadDir); },
    filename: function(req, file, cb) { cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname); }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowed = /jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|mp4|webm/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext || mime) { cb(null, true); } else { cb(new Error('Archivo no permitido')); }
    }
});

// 🚦 RATE LIMIT
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Demasiadas solicitudes' } }));

// 🔐 CLAVES
const JWT_SECRET = process.env.JWT_SECRET || 'romwiner_jwt_secret_fallback';
const MASTER_KEY = process.env.MASTER_KEY || 'romwiner_master_key_fallback';

// 🔐 AUTENTICACIÓN (CORREGIDO: SIN ?. - USANDO if NORMAL)
const authenticate = function(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) { return res.status(401).json({ error: 'Token requerido' }); }
    const token = authHeader.replace('Bearer ', '');
    if (!token) { return res.status(401).json({ error: 'Token requerido' }); }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// 🔐 CIFRADO AES-256-GCM
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

// 🆔 UTILS
const generateUID = function() { return 'rom_' + crypto.randomBytes(8).toString('hex'); };
const generateRefCode = function() { return 'ROM' + Math.random().toString(36).substr(2, 6).toUpperCase(); };

// 🌐 STATUS
app.get('/api/status', function(req, res) {
    res.json({
        api: 'ApiRomwiner Vault',
        status: 'online',
        database: db ? 'connected' : 'disconnected',
        features: ['🟢 Identidad', '🟢 Pagos', '🟢 Archivos', '🟢 Auditoría', '🟢 MongoDB', '🟢 Afiliados', '🟢 Vault']
    });
});

// 🔐 REGISTRO
app.post('/register', async function(req, res) {
    try {
        const email = req.body.email;
        const password = req.body.password;
        const refCode = req.body.refCode;
        if (!email || !password) { return res.status(400).json({ error: 'Email y contraseña requeridos' }); }
        const existing = await usersCollection.findOne({ email: email });
        if (existing) { return res.status(400).json({ error: 'Correo ya registrado' }); }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            email: email,
            password: hashedPassword,
            uid: generateUID(),
            refCode: generateRefCode(),
            referredBy: refCode || null,
            createdAt: new Date(),
            updatedAt: new Date(),
            isAdmin: false,
            affiliates: { level: 'bronce', totalReferrals: 0, pendingBalance: 0, availableBalance: 0, withdrawnBalance: 0 }
        };
        const result = await usersCollection.insertOne(newUser);
        if (refCode) {
            const referrer = await usersCollection.findOne({ refCode: refCode });
            if (referrer) {
                await affiliatesCollection.updateOne({ userId: referrer._id }, { $inc: { totalReferrals: 1, pendingBalance: 1 }, $set: { updatedAt: new Date() } }, { upsert: true });
                const aff = await affiliatesCollection.findOne({ userId: referrer._id });
                let newLevel = 'bronce';
                if (aff && aff.totalReferrals && aff.totalReferrals >= 51) { newLevel = 'oro'; } else if (aff && aff.totalReferrals && aff.totalReferrals >= 11) { newLevel = 'plata'; }
                await usersCollection.updateOne({ _id: referrer._id }, { $set: { 'affiliates.level': newLevel, updatedAt: new Date() } });
            }
        }
        await affiliatesCollection.insertOne({
            userId: result.insertedId,
            refCode: newUser.refCode,
            referredBy: refCode || null,
            totalReferrals: 0,
            pendingBalance: 0,
            availableBalance: 0,
            withdrawnBalance: 0,
            level: 'bronce',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        logger.info('✅ Registrado: ' + email);
        res.status(201).json({ success: true, message: 'Registrado. Inicia sesión.' });
    } catch (err) {
        logger.error('❌ Registro: ' + err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 🔐 LOGIN
app.post('/login', async function(req, res) {
    try {
        const email = req.body.email;
        const password = req.body.password;
        if (!email || !password) { return res.status(400).json({ error: 'Email y contraseña requeridos' }); }
        const user = await usersCollection.findOne({ email: email });
        if (!user) { return res.status(401).json({ error: 'Credenciales inválidas' }); }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) { return res.status(401).json({ error: 'Credenciales inválidas' }); }
        const token = jwt.sign({ uid: user.uid, email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
        await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date(), updatedAt: new Date() } });
        logger.info('✅ Login: ' + email);
        res.json({
            success: true,
            message: 'Bienvenido',
            token: token,
            user: { uid: user.uid, email: user.email, isAdmin: user.isAdmin, refCode: user.refCode, affiliates: user.affiliates }
        });
    } catch (err) {
        logger.error('❌ Login: ' + err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 🔐 PERFIL
app.get('/api/me', authenticate, async function(req, res) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        res.json({ uid: user.uid, email: user.email, isAdmin: user.isAdmin, refCode: user.refCode, affiliates: user.affiliates, createdAt: user.createdAt });
    } catch (err) {
        logger.error('❌ Perfil: ' + err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 📋 VAULT: CREAR
app.post('/vault', authenticate, upload.single('archivo'), async function(req, res) {
    try {
        const titulo = req.body.titulo;
        const categoria = req.body.categoria || 'general';
        const folderId = req.body.folderId || 'general';
        const contenido = req.body.contenido;
        const price = req.body.price;
        const licenseDays = req.body.licenseDays;
        const forSale = req.body.forSale;
        if (!titulo) { return res.status(400).json({ error: 'Título requerido' }); }
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const secretData = {
            userId: user._id,
            userUid: user.uid,
            titulo: titulo,
            categoria: categoria,
            folderId: folderId,
            tipo: req.file ? 'archivo' : 'texto',
            contenido: null,
            fileName: null,
            fileType: null,
            fileSize: null,
            encrypted: null,
            isForSale: forSale === 'true' || forSale === true,
            price: (forSale === 'true' || forSale === true) ? (parseFloat(price) || 0) : null,
            licenseDays: (forSale === 'true' || forSale === true) ? (parseInt(licenseDays) || null) : null,
            sales: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        if (req.file) {
            secretData.fileName = req.file.originalname;
            secretData.fileType = req.file.mimetype;
            secretData.fileSize = req.file.size;
            const fileContent = await fs.readFile(req.file.path);
            secretData.encrypted = encrypt(fileContent.toString('base64'));
            await fs.unlink(req.file.path).catch(function() {});
        } else if (contenido) {
            secretData.contenido = encrypt(contenido).encrypted;
        }
        const result = await secretsCollection.insertOne(secretData);
        logger.info('✅ Secreto: ' + titulo + ' por ' + user.email);
        res.status(201).json({ success: true, message: 'Guardado', id: result.insertedId });
    } catch (err) {
        logger.error('❌ Vault crear: ' + err.message);
        res.status(500).json({ error: 'Error al guardar' });
    }
});

// 📋 VAULT: LISTAR
app.get('/vault', authenticate, async function(req, res) {
    try {
        const tipo = req.query.tipo;
        const folderId = req.query.folderId;
        const categoria = req.query.categoria;
        const forSale = req.query.forSale;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const filter = { userId: user._id };
        if (tipo) { filter.tipo = tipo; }
        if (folderId) { filter.folderId = folderId; }
        if (categoria) { filter.categoria = categoria; }
        if (forSale !== undefined) { filter.isForSale = forSale === 'true'; }
        const items = await secretsCollection.find(filter).sort({ createdAt: -1 }).limit(100).project({ encrypted: 0, contenido: 0 }).toArray();
        const formatted = items.map(function(item) {
            return {
                id: item._id.toString(),
                titulo: item.titulo,
                categoria: item.categoria,
                folderId: item.folderId,
                tipo: item.tipo,
                fileName: item.fileName,
                fileType: item.fileType,
                fileSize: item.fileSize,
                isForSale: item.isForSale,
                price: item.price,
                licenseDays: item.licenseDays,
                sales: item.sales,
                created_at: item.createdAt
            };
        });
        res.json({ success: true, items: formatted, total: formatted.length });
    } catch (err) {
        logger.error('❌ Vault listar: ' + err.message);
        res.status(500).json({ error: 'Error cargando' });
    }
});

// 📋 VAULT: OBTENER UNO
app.get('/vault/:id', authenticate, async function(req, res) {
    try {
        const id = req.params.id;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const secret = await secretsCollection.findOne({ _id: new ObjectId(id), userId: user._id });
        if (!secret) { return res.status(404).json({ error: 'Secreto no encontrado' }); }
        let contenido = null;
        if (secret.tipo === 'texto' && secret.contenido && secret.encrypted) {
            contenido = decrypt({ iv: secret.encrypted.iv, encrypted: secret.contenido, authTag: secret.encrypted.authTag });
        } else if (secret.tipo === 'archivo' && secret.encrypted) {
            const dec = decrypt(secret.encrypted);
            contenido = Buffer.from(dec, 'base64').toString('base64');
        }
        res.json({
            success: true,
            secret: {
                id: secret._id.toString(),
                titulo: secret.titulo,
                categoria: secret.categoria,
                folderId: secret.folderId,
                tipo: secret.tipo,
                fileName: secret.fileName,
                fileType: secret.fileType,
                fileSize: secret.fileSize,
                contenido: contenido,
                isForSale: secret.isForSale,
                price: secret.price,
                licenseDays: secret.licenseDays,
                sales: secret.sales,
                created_at: secret.createdAt
            }
        });
    } catch (err) {
        logger.error('❌ Vault obtener: ' + err.message);
        res.status(500).json({ error: 'Error cargando' });
    }
});

// 📋 VAULT: ELIMINAR
app.delete('/vault/:id', authenticate, async function(req, res) {
    try {
        const id = req.params.id;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const result = await secretsCollection.deleteOne({ _id: new ObjectId(id), userId: user._id });
        if (result.deletedCount === 0) { return res.status(404).json({ error: 'No encontrado o no autorizado' }); }
        logger.info('✅ Eliminado: ' + id + ' por ' + user.email);
        res.json({ success: true, message: 'Eliminado' });
    } catch (err) {
        logger.error('❌ Vault eliminar: ' + err.message);
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// 🤝 AFILIADOS: DASHBOARD
app.get('/api/affiliates/dashboard', authenticate, async function(req, res) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const aff = await affiliatesCollection.findOne({ userId: user._id });
        const level = aff && aff.level ? aff.level : 'bronce';
        const totalReferrals = aff && aff.totalReferrals ? aff.totalReferrals : 0;
        const pendingBalance = aff && aff.pendingBalance ? aff.pendingBalance : 0;
        const availableBalance = aff && aff.availableBalance ? aff.availableBalance : 0;
        const withdrawnBalance = aff && aff.withdrawnBalance ? aff.withdrawnBalance : 0;
        const frontendUrl = process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com';
        const dashboard = {
            referralLink: frontendUrl + '?ref=' + user.refCode,
            refCode: user.refCode,
            level: level,
            totalReferrals: totalReferrals,
            pendingBalance: pendingBalance,
            availableBalance: availableBalance,
            withdrawnBalance: withdrawnBalance
        };
        res.json({ success: true, dashboard: dashboard });
    } catch (err) {
        logger.error('❌ Afiliados dashboard: ' + err.message);
        res.status(500).json({ error: 'Error cargando' });
    }
});

// 🤝 AFILIADOS: RETIRAR
app.post('/api/affiliates/withdraw', authenticate, async function(req, res) {
    try {
        const method = req.body.method || 'manual';
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const aff = await affiliatesCollection.findOne({ userId: user._id });
        if (!aff || !aff.availableBalance || aff.availableBalance < 10) { return res.status(400).json({ error: 'Mínimo $10 para retirar' }); }
        await transactionsCollection.insertOne({ userId: user._id, type: 'withdrawal', amount: aff.availableBalance, method: method, status: 'pending', createdAt: new Date() });
        await affiliatesCollection.updateOne({ userId: user._id }, { $inc: { withdrawnBalance: aff.availableBalance, availableBalance: -aff.availableBalance }, $set: { updatedAt: new Date() } });
        logger.info('✅ Retiro solicitado: $' + aff.availableBalance + ' por ' + user.email);
        res.json({ success: true, message: 'Solicitud enviada. Te contactaremos.' });
    } catch (err) {
        logger.error('❌ Afiliados retiro: ' + err.message);
        res.status(500).json({ error: 'Error procesando' });
    }
});

// 🆔 IDENTIDAD: REGISTRAR APP
app.post('/api/identity/register-app', authenticate, async function(req, res) {
    try {
        const appName = req.body.appName;
        const redirectUri = req.body.redirectUri;
        if (!appName || !redirectUri) { return res.status(400).json({ error: 'Nombre y URL requeridos' }); }
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const appId = 'app_' + crypto.randomBytes(6).toString('hex');
        const appSecret = crypto.randomBytes(32).toString('hex');
        await identityCollection.insertOne({ appId: appId, appSecret: appSecret, appName: appName, redirectUri: redirectUri, ownerUid: user.uid, scopes: ['profile', 'email'], active: true, createdAt: new Date(), updatedAt: new Date() });
        logger.info('✅ App registrada: ' + appName + ' por ' + user.email);
        res.json({ success: true, appId: appId, appSecret: appSecret, message: 'Guarda estas credenciales de forma segura' });
    } catch (err) {
        logger.error('❌ Identidad registrar app: ' + err.message);
        res.status(500).json({ error: 'Error registrando' });
    }
});

// 🆔 IDENTIDAD: AUTORIZAR
app.post('/api/identity/authorize', authenticate, async function(req, res) {
    try {
        const appId = req.body.appId;
        const scopes = req.body.scopes;
        if (!appId) { return res.status(400).json({ error: 'App ID requerido' }); }
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const app = await identityCollection.findOne({ appId: appId });
        if (!app || !app.active) { return res.status(404).json({ error: 'App no encontrada o inactiva' }); }
        const tokenScopes = scopes && scopes.length > 0 ? scopes : (app.scopes || ['profile', 'email']);
        const token = jwt.sign({ uid: user.uid, appId: appId, scopes: tokenScopes }, JWT_SECRET, { expiresIn: '24h' });
        logger.info('✅ Token generado para ' + app.appName + ' por ' + user.email);
        res.json({ success: true, token: token, expiresIn: 86400 });
    } catch (err) {
        logger.error('❌ Identidad autorizar: ' + err.message);
        res.status(500).json({ error: 'Error autorizando' });
    }
});

// 🆔 IDENTIDAD: REVOCAR TODOS
app.delete('/api/identity/revoke/all', authenticate, async function(req, res) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        await identityCollection.updateMany({ ownerUid: user.uid }, { $set: { active: false, updatedAt: new Date() } });
        logger.info('✅ Accesos revocados para ' + user.email);
        res.json({ success: true, message: 'Todos los accesos han sido revocados' });
    } catch (err) {
        logger.error('❌ Identidad revocar: ' + err.message);
        res.status(500).json({ error: 'Error revocando' });
    }
});

// 💰 DASHBOARD NEGOCIO
app.get('/api/dashboard', authenticate, async function(req, res) {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) { return res.status(404).json({ error: 'Usuario no encontrado' }); }
        const totalSecrets = await secretsCollection.countDocuments({ userId: user._id });
        const forSale = await secretsCollection.countDocuments({ userId: user._id, isForSale: true });
        res.json({ success: true, dashboard: { revenue: 0, sales: 0, active: totalSecrets, forSale: forSale } });
    } catch (err) {
        logger.error('❌ Dashboard: ' + err.message);
        res.status(500).json({ error: 'Error cargando' });
    }
});

// 🌐 ROOT: SERVIR INDEX.HTML CON ANTI-CACHÉ (TU ÍNDICE VERDE 🟢)
app.get('/', function(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 INICIAR SERVIDOR
async function startServer() {
    await connectToMongo();
    app.listen(PORT, '0.0.0.0', function() {
        logger.info('🚀 APIROMWINER en puerto ' + PORT);
        logger.info('🟢 Identidad | 🟢 Pagos | 🟢 Archivos | 🟢 Auditoría | 🟢 MongoDB Atlas | 🟢 Listo');
    });
}

startServer().catch(function(err) {
    logger.error('❌ Error iniciando servidor: ' + err.message);
    process.exit(1);
});
// === FIN: index.js ===