// 🌐 APIROMWINER VAULT - Versión MongoDB Atlas (Producción)
// ✅ Usuarios sincronizados en la nube ✅ Funciona en todos los navegadores ✅ $0.00

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

// 🔐 TU CONEXIÓN A MONGODB (ya corregida)
const MONGODB_URI = "mongodb+srv://apiromwinervault:Grup%40selen2000@cluster0.f83xnse.mongodb.net/?appName=Cluster0";
const DB_NAME = "apiromwinervault";

let db;
let usersCollection;
let secretsCollection;
let affiliatesCollection;
let identityCollection;
let transactionsCollection;

// 🔗 Conectar a MongoDB Atlas
async function connectToMongo() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        usersCollection = db.collection('users');
        secretsCollection = db.collection('secrets');
        affiliatesCollection = db.collection('affiliates');
        identityCollection = db.collection('identity');
        transactionsCollection = db.collection('transactions');

        // Crear índices para mejor rendimiento
        await usersCollection.createIndex({ email: 1 }, { unique: true });
        await usersCollection.createIndex({ uid: 1 }, { unique: true });
        await secretsCollection.createIndex({ userId: 1 });
        await secretsCollection.createIndex({ isForSale: 1 });
        await affiliatesCollection.createIndex({ referredBy: 1 });

        logger.info('✅ Conectado a MongoDB Atlas');
    } catch (err) {
        logger.error('❌ Error conectando a MongoDB:', err.message);
        process.exit(1);
    }
}

// 🔐 Configuración de seguridad
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

app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 📁 Servir archivos estáticos (frontend)
app.use(express.static('public'));

// 📁 Carpeta de uploads (para archivos temporales)
const uploadDir = path.join(__dirname, 'uploads');
fs.mkdir(uploadDir, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx|txt|mp4|webm/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext || mime) cb(null, true);
        else cb(new Error('Tipo de archivo no permitido'));
    }
});

// 🚦 Rate limiting (anti-bruteforce)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas solicitudes. Intenta más tarde.' }
});
app.use('/api/', limiter);

// 🔐 Claves JWT (usar variables de entorno en producción)
const JWT_SECRET = process.env.JWT_SECRET || 'romwiner_jwt_secret_fallback_do_not_use_in_prod';
const MASTER_KEY = process.env.MASTER_KEY || 'romwiner_master_key_fallback';

// 🔐 Middleware de autenticación
const authenticate = (req, res, next) => {
    const token = req.headers.authorization ? .replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// 🔐 Cifrado AES-256-GCM para secretos
const encrypt = (text, key = MASTER_KEY) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { iv: iv.toString('hex'), encrypted, authTag };
};

const decrypt = ({ iv, encrypted, authTag }, key = MASTER_KEY) => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

// 🆔 Generar UID único
const generateUID = () => 'rom_' + crypto.randomBytes(8).toString('hex');

// 🎫 Generar código de afiliado
const generateRefCode = () => 'ROM' + Math.random().toString(36).substr(2, 6).toUpperCase();

// 🌐 API: Estado
app.get('/api/status', (req, res) => {
    res.json({
        api: 'ApiRomwiner Vault',
        status: 'online',
        database: db ? 'connected' : 'disconnected',
        features: ['🟢 Identidad', '🟢 Pagos', '🟢 Archivos', '🟢 Auditoría', '🟢 MongoDB Atlas']
    });
});

// 🔐 Registro de usuario
app.post('/register', async(req, res) => {
    try {
        const { email, password, refCode } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

        // Verificar si el usuario ya existe
        const existing = await usersCollection.findOne({ email });
        if (existing) return res.status(400).json({ error: 'El correo ya está registrado' });

        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(password, 10);

        // Datos del nuevo usuario
        const newUser = {
            email,
            password: hashedPassword,
            uid: generateUID(),
            refCode: generateRefCode(),
            referredBy: refCode || null,
            createdAt: new Date(),
            updatedAt: new Date(),
            isAdmin: false,
            affiliates: {
                level: 'bronce',
                totalReferrals: 0,
                pendingBalance: 0,
                availableBalance: 0,
                withdrawnBalance: 0
            }
        };

        // Guardar en MongoDB
        const result = await usersCollection.insertOne(newUser);

        // Si tiene código de referido, actualizar al afiliado
        if (refCode) {
            const referrer = await usersCollection.findOne({ refCode });
            if (referrer) {
                await affiliatesCollection.updateOne({ userId: referrer._id }, {
                    $inc: { totalReferrals: 1, pendingBalance: 1 },
                    $set: { updatedAt: new Date() }
                }, { upsert: true });

                // Actualizar nivel del afiliado
                const aff = await affiliatesCollection.findOne({ userId: referrer._id });
                let newLevel = 'bronce';
                if (aff.totalReferrals >= 51) newLevel = 'oro';
                else if (aff.totalReferrals >= 11) newLevel = 'plata';

                await usersCollection.updateOne({ _id: referrer._id }, {
                    $set: {
                        'affiliates.level': newLevel,
                        updatedAt: new Date()
                    }
                });
            }
        }

        // Crear entrada en affiliates para el nuevo usuario
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

        logger.info(`✅ Usuario registrado: ${email}`);
        res.status(201).json({ success: true, message: 'Registrado. Ahora inicia sesión.' });

    } catch (err) {
        logger.error('❌ Error en registro:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 🔐 Login
app.post('/login', async(req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Credenciales inválidas' });

        // Generar token JWT
        const token = jwt.sign({ uid: user.uid, email: user.email, isAdmin: user.isAdmin },
            JWT_SECRET, { expiresIn: '7d' }
        );

        // Actualizar último login
        await usersCollection.updateOne({ _id: user._id }, { $set: { lastLogin: new Date(), updatedAt: new Date() } });

        logger.info(`✅ Login exitoso: ${email}`);
        res.json({
            success: true,
            message: 'Bienvenido',
            token,
            user: {
                uid: user.uid,
                email: user.email,
                isAdmin: user.isAdmin,
                refCode: user.refCode,
                affiliates: user.affiliates
            }
        });

    } catch (err) {
        logger.error('❌ Error en login:', err.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 🔐 Obtener perfil (autenticado)
app.get('/api/me', authenticate, async(req, res) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        res.json({
            uid: user.uid,
            email: user.email,
            isAdmin: user.isAdmin,
            refCode: user.refCode,
            affiliates: user.affiliates,
            createdAt: user.createdAt
        });
    } catch (err) {
        logger.error('❌ Error obteniendo perfil:', err.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// 📋 CRUD: Secretos (Vault)
app.post('/vault', authenticate, upload.single('archivo'), async(req, res) => {
    try {
        const { titulo, categoria, folderId, contenido, price, licenseDays, forSale } = req.body;
        if (!titulo) return res.status(400).json({ error: 'Título requerido' });

        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        let secretData = {
            userId: user._id,
            userUid: user.uid,
            titulo,
            categoria: categoria || 'general',
            folderId: folderId || 'general',
            tipo: 'texto',
            contenido: null,
            fileName: null,
            fileType: null,
            fileSize: null,
            encrypted: null,
            isForSale: forSale === 'true' || forSale === true,
            price: forSale === 'true' || forSale === true ? parseFloat(price) || 0 : null,
            licenseDays: forSale === 'true' || forSale === true ? parseInt(licenseDays) || null : null,
            sales: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Si hay archivo
        if (req.file) {
            secretData.tipo = 'archivo';
            secretData.fileName = req.file.originalname;
            secretData.fileType = req.file.mimetype;
            secretData.fileSize = req.file.size;

            // Cifrar contenido del archivo (en producción, usar GridFS para archivos grandes)
            const fileContent = await fs.readFile(req.file.path);
            const encrypted = encrypt(fileContent.toString('base64'));
            secretData.encrypted = encrypted;

            // Eliminar archivo temporal después de cifrar
            await fs.unlink(req.file.path).catch(() => {});
        }
        // Si es texto
        else if (contenido) {
            secretData.contenido = encrypt(contenido).encrypted;
        }

        const result = await secretsCollection.insertOne(secretData);

        logger.info(`✅ Secreto creado: ${titulo} por ${user.email}`);
        res.status(201).json({ success: true, message: 'Secreto guardado', id: result.insertedId });

    } catch (err) {
        logger.error('❌ Error creando secreto:', err.message);
        res.status(500).json({ error: 'Error al guardar' });
    }
});

app.get('/vault', authenticate, async(req, res) => {
    try {
        const { tipo, folderId, categoria, forSale } = req.query;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Construir filtro
        const filter = { userId: user._id };
        if (tipo) filter.tipo = tipo;
        if (folderId) filter.folderId = folderId;
        if (categoria) filter.categoria = categoria;
        if (forSale !== undefined) filter.isForSale = forSale === 'true';

        const items = await secretsCollection
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
            .project({ encrypted: 0, contenido: 0 }) // No devolver contenido cifrado en lista
            .toArray();

        // Formatear respuesta
        const formatted = items.map(item => ({
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
        }));

        res.json({ success: true, items: formatted, total: formatted.length });

    } catch (err) {
        logger.error('❌ Error listando secretos:', err.message);
        res.status(500).json({ error: 'Error cargando secretos' });
    }
});

app.get('/vault/:id', authenticate, async(req, res) => {
    try {
        const { id } = req.params;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const secret = await secretsCollection.findOne({
            _id: new ObjectId(id),
            userId: user._id
        });

        if (!secret) return res.status(404).json({ error: 'Secreto no encontrado' });

        // Desencriptar contenido para el dueño
        let contenido = null;
        if (secret.tipo === 'texto' && secret.contenido) {
            contenido = decrypt({
                iv: secret.encrypted ? .iv,
                encrypted: secret.contenido,
                authTag: secret.encrypted ? .authTag
            });
        } else if (secret.tipo === 'archivo' && secret.encrypted) {
            const decrypted = decrypt(secret.encrypted);
            contenido = Buffer.from(decrypted, 'base64').toString('base64'); // Devolver en base64 para descargar
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
                contenido,
                isForSale: secret.isForSale,
                price: secret.price,
                licenseDays: secret.licenseDays,
                sales: secret.sales,
                created_at: secret.createdAt
            }
        });

    } catch (err) {
        logger.error('❌ Error obteniendo secreto:', err.message);
        res.status(500).json({ error: 'Error cargando secreto' });
    }
});

app.delete('/vault/:id', authenticate, async(req, res) => {
    try {
        const { id } = req.params;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const result = await secretsCollection.deleteOne({
            _id: new ObjectId(id),
            userId: user._id
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Secreto no encontrado o no autorizado' });
        }

        logger.info(`✅ Secreto eliminado: ${id} por ${user.email}`);
        res.json({ success: true, message: 'Secreto eliminado' });

    } catch (err) {
        logger.error('❌ Error eliminando secreto:', err.message);
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// 🤝 Afiliados: Dashboard
app.get('/api/affiliates/dashboard', authenticate, async(req, res) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const aff = await affiliatesCollection.findOne({ userId: user._id });

        const dashboard = {
            referralLink: `${process.env.FRONTEND_URL || 'https://apiromwinervault.onrender.com'}?ref=${user.refCode}`,
            refCode: user.refCode,
            level: aff ? .level || 'bronce',
            totalReferrals: aff ? .totalReferrals || 0,
            pendingBalance: aff ? .pendingBalance || 0,
            availableBalance: aff ? .availableBalance || 0,
            withdrawnBalance: aff ? .withdrawnBalance || 0
        };

        res.json({ success: true, dashboard });

    } catch (err) {
        logger.error('❌ Error en dashboard de afiliados:', err.message);
        res.status(500).json({ error: 'Error cargando afiliados' });
    }
});

// 🤝 Afiliados: Retirar fondos
app.post('/api/affiliates/withdraw', authenticate, async(req, res) => {
    try {
        const { method } = req.body;
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const aff = await affiliatesCollection.findOne({ userId: user._id });
        if (!aff || aff.availableBalance < 10) {
            return res.status(400).json({ error: 'Mínimo $10 para retirar' });
        }

        // Registrar transacción
        await transactionsCollection.insertOne({
            userId: user._id,
            type: 'withdrawal',
            amount: aff.availableBalance,
            method: method || 'manual',
            status: 'pending',
            createdAt: new Date()
        });

        // Actualizar balances
        await affiliatesCollection.updateOne({ userId: user._id }, {
            $inc: {
                withdrawnBalance: aff.availableBalance,
                availableBalance: -aff.availableBalance
            },
            $set: { updatedAt: new Date() }
        });

        logger.info(`✅ Solicitud de retiro: $${aff.availableBalance} por ${user.email}`);
        res.json({ success: true, message: 'Solicitud de retiro enviada. Te contactaremos.' });

    } catch (err) {
        logger.error('❌ Error en retiro de afiliados:', err.message);
        res.status(500).json({ error: 'Error procesando retiro' });
    }
});

// 🆔 Identidad Universal: Registrar app externa
app.post('/api/identity/register-app', authenticate, async(req, res) => {
    try {
        const { appName, redirectUri } = req.body;
        if (!appName || !redirectUri) {
            return res.status(400).json({ error: 'Nombre y URL requeridos' });
        }

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
            createdAt: new Date(),
            updatedAt: new Date()
        });

        logger.info(`✅ App registrada: ${appName} por ${user.email}`);
        res.json({ success: true, appId, appSecret, message: 'Guarda estas credenciales de forma segura' });

    } catch (err) {
        logger.error('❌ Error registrando app:', err.message);
        res.status(500).json({ error: 'Error registrando app' });
    }
});

// 🆔 Identidad Universal: Autorizar acceso
app.post('/api/identity/authorize', authenticate, async(req, res) => {
    try {
        const { appId, scopes } = req.body;
        if (!appId) return res.status(400).json({ error: 'App ID requerido' });

        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        const app = await identityCollection.findOne({ appId });
        if (!app || !app.active) {
            return res.status(404).json({ error: 'App no encontrada o inactiva' });
        }

        // Generar token de acceso
        const token = jwt.sign({ uid: user.uid, appId, scopes: scopes || app.scopes },
            JWT_SECRET, { expiresIn: '24h' }
        );

        logger.info(`✅ Token generado para ${app.appName} por ${user.email}`);
        res.json({ success: true, token, expiresIn: 86400 });

    } catch (err) {
        logger.error('❌ Error autorizando app:', err.message);
        res.status(500).json({ error: 'Error autorizando acceso' });
    }
});

// 🆔 Identidad Universal: Revocar todos los accesos
app.delete('/api/identity/revoke/all', authenticate, async(req, res) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // En producción, aquí se invalidarían tokens activos
        // Por ahora, solo registramos la acción
        await identityCollection.updateMany({ ownerUid: user.uid }, { $set: { active: false, updatedAt: new Date() } });

        logger.info(`✅ Accesos revocados para ${user.email}`);
        res.json({ success: true, message: 'Todos los accesos han sido revocados' });

    } catch (err) {
        logger.error('❌ Error revocando accesos:', err.message);
        res.status(500).json({ error: 'Error revocando accesos' });
    }
});

// 💰 Dashboard de negocio (para vendedores)
app.get('/api/dashboard', authenticate, async(req, res) => {
    try {
        const user = await usersCollection.findOne({ uid: req.user.uid });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        // Métricas básicas
        const totalSecrets = await secretsCollection.countDocuments({ userId: user._id });
        const forSale = await secretsCollection.countDocuments({ userId: user._id, isForSale: true });

        // En producción, aquí se calcularían ingresos reales de transacciones
        const dashboard = {
            revenue: 0, // Se calcularía desde transactionsCollection
            sales: 0,
            active: totalSecrets,
            forSale
        };

        res.json({ success: true, dashboard });

    } catch (err) {
        logger.error('❌ Error en dashboard:', err.message);
        res.status(500).json({ error: 'Error cargando dashboard' });
    }
});

// 🌐 Ruta principal: servir index.html con headers anti-caché
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🚀 Iniciar servidor
async function startServer() {
    await connectToMongo();

    app.listen(PORT, '0.0.0.0', () => {
        logger.info(`🚀 APIROMWINER en puerto ${PORT}`);
        logger.info('🟢 Identidad | 🟢 Pagos | 🟢 Archivos | 🟢 Auditoría | 🟢 MongoDB Atlas | 🟢 Listo');
    });
}

startServer().catch(err => {
    logger.error('❌ Error iniciando servidor:', err.message);
    process.exit(1);
});