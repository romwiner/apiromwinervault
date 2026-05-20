// mini-api.js - Versión mínima que SÍ funciona
const http = require('http');
const crypto = require('crypto');

const MASTER_KEY = 'test123';
const ENCRYPTION_KEY = crypto.randomBytes(32);

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'healthy', test: true }));
    return;
  }
  
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(3000, () => {
  console.log('✅ MINI API corriendo en http://localhost:3000');
  console.log('✅ Prueba: curl http://localhost:3000/health');
});