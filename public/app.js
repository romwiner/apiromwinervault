// ============================================
// 📁 ARCHIVO: public/app.js
// 📝 Este es el código que se ejecuta en el navegador
// ============================================

// === CONFIGURACIÓN ===
const API_URL = window.location.origin; // Usa la misma URL donde está alojado
let token = localStorage.getItem('token') || null;
let currentUser = null;
let userTier = 'personal';
let userQuota = null;

// === HELPERS ===

// ✅ Sanitizar mensajes de error (previene XSS)
function sanitizeErrorMessage(msg) {
  if (!msg) return '';
  return String(msg)
    .replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]))
    .substring(0, 300);
}

// ✅ Función para hacer peticiones a la API
async function req(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  };
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

// ✅ Función para mostrar mensajes en consola
function log(msg, type = 'info') {
  const colors = {
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336'
  };
  
  console.log(
    `%c[${type.toUpperCase()}] ${msg}`,
    `color: ${colors[type] || colors.info}; font-weight: bold;`
  );
}

// ✅ Función para mostrar notificaciones
function showNotification(msg, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = msg;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : '#2196F3'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

// ✅ Función placeholder para cargar usuario (personaliza según tu lógica)
async function loadUser() {
  if (!token) return null;
  
  try {
    // TODO: Cambia esto por tu endpoint real de usuario
    const userData = await req('/api/user/me');
    currentUser = userData;
    userTier = userData.tier || 'personal';
    userQuota = userData.quota || null;
    return userData;
  } catch (error) {
    log('Error cargando usuario: ' + sanitizeErrorMessage(error.message), 'warning');
    // Si el token es inválido, limpiar
    if (error.message.includes('401')) {
      localStorage.removeItem('token');
      token = null;
    }
    return null;
  }
}

// ✅ Función placeholder para mostrar dashboard
function showDashboard() {
  log('Mostrando dashboard del usuario', 'success');
  // TODO: Implementa tu lógica de dashboard aquí
  // Por ejemplo: mostrar nombre, avatar, etc.
}

// === INICIALIZACIÓN ===
let globalListenersInitialized = false;

async function init() {
  log('🚀 Iniciando aplicación...', 'info');
  
  // Verificar conexión API con reintentos
  let retries = 0;
  const maxRetries = 3;
  
  while (retries < maxRetries) {
    try {
      const s = await req('/api/status');
      const statusDot = document.getElementById('apiStatus');
      const statusText = document.getElementById('statusText');
      
      if (statusDot && statusText) {
        if (s.status === 'online' || s.success) {
          statusDot.className = 'status-dot online';
          statusText.textContent = `✅ Online • ${s.database || 'MongoDB'}`;
          log('🟢 API responde correctamente', 'success');
          showNotification('✅ Conectado al servidor', 'success', 3000);
        } else {
          statusDot.className = 'status-dot offline';
          statusText.textContent = '⚠️ Mantenimiento';
          log('⚠️ API en mantenimiento', 'warning');
        }
      }
      break;
    } catch (e) {
      retries++;
      const safeMsg = sanitizeErrorMessage(e.message);
      log(`⚠️ Intento ${retries}/${maxRetries}: ${safeMsg}`, 'warning');
      
      if (retries === maxRetries) {
        const statusDot = document.getElementById('apiStatus');
        const statusText = document.getElementById('statusText');
        if (statusDot) statusDot.className = 'status-dot offline';
        if (statusText) statusText.textContent = '❌ Sin conexión';
        log('❌ API no responde tras 3 intentos', 'error');
        showNotification('❌ Error de conexión. Verifica tu internet.', 'error', 5000);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }
  
  // Cargar sesión si hay token
  if (token) {
    try {
      await loadUser();
      if (currentUser) {
        showDashboard();
        updateTierUI();
      }
    } catch (e) {
      const safeMsg = sanitizeErrorMessage(e.message);
      log('⚠️ Error cargando usuario: ' + safeMsg, 'warning');
    }
  }
  
  // Configurar event listeners
  setupGlobalListeners();
}

// === ACTUALIZAR UI SEGÚN TIER ===
function updateTierUI() {
  // Mostrar/ocultar funciones enterprise
  document.querySelectorAll('.enterprise-only').forEach(el => {
    const isVisible = userTier === 'enterprise';
    el.style.display = isVisible ? '' : 'none';
    el.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  });
  
  // Actualizar badge de tier
  const badge = document.getElementById('userTierBadge');
  if (badge) {
    const safeTier = String(userTier || 'personal').replace(/[^a-z]/gi, '').substring(0, 20);
    badge.textContent = safeTier.charAt(0).toUpperCase() + safeTier.slice(1);
    badge.className = `tier-badge tier-${safeTier}`;
  }
  
  // Mostrar cuota si existe
  if (userQuota) {
    const quotaDisplay = document.getElementById('quotaDisplay');
    const quotaFill = document.getElementById('quotaFill');
    const quotaText = document.getElementById('quotaText');
    
    if (quotaDisplay && quotaFill && quotaText) {
      const used = Number(userQuota.used || 0);
      const limit = Number(userQuota.limit || 0);
      const pct = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
      
      quotaFill.style.width = pct + '%';
      quotaFill.setAttribute('aria-valuenow', Math.round(pct));
      quotaText.textContent = `${used} / ${limit} items`;
      quotaDisplay.classList.remove('hidden');
      quotaDisplay.setAttribute('aria-hidden', 'false');
      
      if (pct >= 90) {
        quotaText.className = 'quota-critical';
        quotaText.textContent += ' ⚠️ Casi lleno';
      } else if (pct >= 75) {
        quotaText.className = 'quota-warning';
        quotaText.textContent += ' ⚠️ 75% usado';
      }
    }
  }
}

// === EVENT LISTENERS GLOBALES ===
function setupGlobalListeners() {
  if (globalListenersInitialized) return;
  
  // Recargar usuario cuando la pestaña vuelve a estar activa
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && token) {
      loadUser().catch(e => log('Error recargando usuario', 'warning'));
    }
  });
  
  // Capturar errores globales
  window.addEventListener('error', (e) => {
    log('Error global: ' + sanitizeErrorMessage(e.message), 'error');
  });
  
  // Capturar promesas rechazadas
  window.addEventListener('unhandledrejection', (e) => {
    log('Promesa rechazada: ' + sanitizeErrorMessage(e.reason), 'error');
  });
  
  globalListenersInitialized = true;
  log('✅ Event listeners configurados', 'success');
}

// === INICIAR LA APLICACIÓN ===
document.addEventListener('DOMContentLoaded', () => {
  init();
});
