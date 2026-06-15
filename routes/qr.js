const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

// Verifica que el usuario esté logueado
const isAuthenticated = (req, res, next) => {
    if (req.user || (req.session && req.session.user)) {
        return next();
    }
    return res.status(401).json({ success: false, message: "Debes iniciar sesión" });
};

// Endpoint para generar QR
router.post('/api/generate-qr', isAuthenticated, async (req, res) => {
    try {
        const { text, size = 400 } = req.body;

        if (!text) {
            return res.status(400).json({ success: false, message: "Falta el texto o URL" });
        }

        const qrCode = await QRCode.toDataURL(text, {
            width: parseInt(size),
            errorCorrectionLevel: 'H'
        });

        res.json({
            success: true,
            qrCode: qrCode
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error al generar el código QR" });
    }
});

module.exports = router;
