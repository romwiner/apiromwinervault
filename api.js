const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    message: 'ApiRomwiner Vault API',
    version: '1.0',
    database: 'MongoDB',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
