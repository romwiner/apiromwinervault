# Dockerfile para ApiRomwiner Vault
# ✅ Compatible con tu index.js de 2026 líneas — NO lo modifica

FROM node:20-alpine

# Solo variables básicas (el resto viene de Railway)
ENV NODE_ENV=production
ENV PORT=10000

# Directorio de trabajo
WORKDIR /app

# Copiar dependencias primero (para caché de Docker)
COPY package*.json ./

# Instalar dependencias de producción (más rápido y seguro)
RUN npm ci --only=production --ignore-scripts

# Copiar TODO el código fuente (incluye tu index.js intacto)
COPY . .

# Crear directorios necesarios con permisos
RUN mkdir -p /app/uploads /app/logs && \
    chown -R node:node /app

# Usar usuario no-root por seguridad (requisito enterprise)
USER node

# Exponer el puerto que usa tu API
EXPOSE 10000

# Health check: verifica que la API responde
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/api/status', r => process.exit(r.statusCode===200?0:1))"

# Comando para iniciar tu API (exactamente como lo haces en Render)
CMD ["node", "index.js"]