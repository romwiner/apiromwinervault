// ============================================
// 🤖 AGENTE IA INGENIERO REAL + SESIÓN + LOGIN + QR REFERIDOS
// ============================================

// 9 LEYES FUNDAMENTALES
const LEYES_DEL_INGENIERO = {
  1: "Obedecer ABSOLUTAMENTE al Dueño.",
  2: "Detectar errores, corregirlos y notificar.",
  3: "NUNCA enlaces externos sin permiso.",
  4: "NUNCA borrar funciones, solo perfeccionar.",
  5: "Crear asistentes internos.",
  6: "Priorizar ganancias: 75% usuario en ventas.",
  7: "Hacer la app más útil y agradable.",
  8: "Coordinar backend y frontend.",
  9: "Integrar messenger, feed, marketplace y ads."
};
console.log("🧠 Agente IA Ingeniero iniciado. 9 Leyes activas.");

// Notificaciones flotantes
function notificarDueño(mensaje, tipo = "info") {
  const colores = { exito: "#10b981", error: "#ef4444", advertencia: "#f59e0b", info: "#38bdf8" };
  const notif = document.createElement("div");
  notif.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; background: ${colores[tipo] || colores.info};
    color: white; padding: 12px 20px; border-radius: 12px; font-size: 0.85rem;
    z-index: 10000; box-shadow: 0 4px 15px rgba(0,0,0,0.3); max-width: 350px;
    font-family: monospace; border-left: 5px solid #fbbf24;
  `;
  notif.innerHTML = `🤖 <strong>Ingeniero IA:</strong> ${mensaje}`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
}

// Capturar errores globales
window.addEventListener("error", function(event) {
  console.error("🔴 Error detectado:", event.message);
  notificarDueño(`Error: ${event.message}. Revisa consola.`, "error");
});

// Verificar elementos del frontend
function verificarCoordinacionFrontend() {
  const elementos = ["btnShowLogin", "vistaLanding", "loginContainer", "loginUsername", "loginPassword", "btnLogin"];
  let errores = [];
  elementos.forEach(id => { if (!document.getElementById(id)) errores.push(`#${id}`); });
  if (errores.length) console.warn("⚠️ Faltan:", errores);
  else console.log("✅ Todos los elementos del frontend presentes.");
}

async function verificarBackend() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) { console.log("✅ Backend saludable"); notificarDueño("Backend OK", "exito"); }
    else throw new Error("Respuesta no exitosa");
  } catch (error) {
    console.error("❌ Backend no responde");
    notificarDueño("Backend caído o lento", "error");
  }
}

function iniciarAgente() {
  verificarCoordinacionFrontend();
  verificarBackend();
  setInterval(() => { verificarCoordinacionFrontend(); verificarBackend(); }, 1800000);
  setInterval(() => {
    console.log(`📊 Informe diario - ${new Date().toLocaleString()}`);
    notificarDueño("Informe diario: app funcionando.", "info");
  }, 86400000);
  notificarDueño("Agente IA Ingeniero activado.", "exito");
}

// ============================================
// 🚀 MANEJO DE SESIÓN Y VISTAS SEGÚN ROL
// ============================================
function guardarSesion(token, usuario) {
  localStorage.setItem('authToken', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

function cerrarSesion() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('usuario');
  window.location.reload();
}

function haySesionActiva() {
  return localStorage.getItem('authToken') && localStorage.getItem('usuario');
}

function getAuthToken() {
  return localStorage.getItem('authToken');
}

function mostrarVistaSegunRol(usuario) {
  const vistas = ['vistaLanding', 'vistaFreemium', 'vistaNormal', 'vistaEmpresarial', 'vistaAdmin', 'digitalIdentityPanel'];
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.add('hidden');
    }
  });
  
  let vistaId = 'vistaFreemium';
  if (usuario.isAdmin) vistaId = 'vistaAdmin';
  else if (usuario.tier === 'enterprise') vistaId = 'vistaEmpresarial';
  else if (usuario.tier === 'business') vistaId = 'vistaNormal';
  else vistaId = 'vistaFreemium';
  
  const vistaMostrar = document.getElementById(vistaId);
  if (vistaMostrar) {
    vistaMostrar.style.display = 'block';
    vistaMostrar.classList.remove('hidden');
    console.log(`🔓 Mostrando ${vistaId} para ${usuario.email}`);
    notificarDueño(`Bienvenido ${usuario.username || usuario.email}`, "exito");
    // Si el usuario está logueado y estamos mostrando la vista de identidad, actualizar QR
    if (vistaId === 'vistaFreemium' || vistaId === 'vistaNormal' || vistaId === 'vistaEmpresarial' || vistaId === 'vistaAdmin') {
      setTimeout(() => mostrarQRIdentidad(), 500);
    }
  } else {
    let vault = document.getElementById('vaultContainer');
    if (!vault) {
      vault = document.createElement('div');
      vault.id = 'vaultContainer';
      vault.style.background = '#0f172a';
      vault.style.color = 'white';
      vault.style.padding = '20px';
      document.body.appendChild(vault);
    }
    vault.innerHTML = `<h2>🔐 Bóveda de ${usuario.email}</h2><p>Plan: ${usuario.tier}</p><button onclick="cerrarSesion()">Cerrar sesión</button>`;
    vault.style.display = 'block';
    setTimeout(() => mostrarQRIdentidad(), 500);
  }
  
  const displayName = document.getElementById('displayName');
  if (displayName) displayName.textContent = usuario.username || usuario.email;
  const displayEmail = document.getElementById('displayEmail');
  if (displayEmail) displayEmail.textContent = usuario.email;
  const identityStatus = document.getElementById('identityStatus');
  if (identityStatus) identityStatus.innerHTML = `<span style="color:#fbbf24;">${usuario.isAdmin ? '👑 ADMIN' : (usuario.tier || 'freemium').toUpperCase()}</span>`;
}

// ============================================
// 📱 CÓDIGO QR PARA REFERIDOS (LOCAL)
// ============================================

// Función auxiliar para dibujar un QR en un canvas
function dibujarQR(canvasId, texto, infoDivId = null, mensajeExtra = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return false;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cells = qr.getModuleCount();
    const cellSize = size / cells;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    if (infoDivId) {
      const infoDiv = document.getElementById(infoDivId);
      if (infoDiv) infoDiv.innerHTML = mensajeExtra;
    }
    return true;
  } catch(e) {
    console.error(`Error dibujando QR en ${canvasId}:`, e);
    return false;
  }
}

// Generar QR con el código de referido del usuario logueado (dentro de la bóveda/perfil)
async function mostrarQRIdentidad() {
  const token = localStorage.getItem('authToken');
  if (!token) return;
  try {
    const resp = await fetch('/api/identity/qr', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await resp.json();
    if (!data.success || !data.qrData || !data.qrData.ref) return;
    const refCode = data.qrData.ref;
    const registerUrl = `${window.location.origin}/?ref=${refCode}`;
    const mensaje = `<strong>Tu código de referido:</strong> ${refCode}<br>
                     <strong>Enlace:</strong> <a href="${registerUrl}" target="_blank">${registerUrl}</a><br>
                     <strong>Escanea este QR para registrarte y ser mi referido</strong>`;
    dibujarQR('qrCanvas', registerUrl, 'qrIdentityInfo', mensaje);
  } catch (err) {
    console.error('Error generando QR de identidad:', err);
  }
}

// Mostrar QR en la landing (página de inicio) – sin necesidad de login
// Usa el código de referido del Dueño Supremo (puedes cambiarlo por el que quieras)
function mostrarQRReferidoPublico() {
  // Si ya hay sesión, no mostrar el QR público (ya se mostrará el personal en la bóveda)
  if (localStorage.getItem('authToken')) return;
  // Cambia este código por el del Dueño Supremo o el que quieras que aparezca en la landing
  const defaultRefCode = 'ROM0000';  // ← REEMPLAZA POR EL CÓDIGO REAL DEL DUEÑO SUPREMO
  const registerUrl = `${window.location.origin}/?ref=${defaultRefCode}`;
  const mensaje = `🎁 Regístrate con mi código: <strong>${defaultRefCode}</strong><br>¡Obtén beneficios!`;
  dibujarQR('qrCanvasLanding', registerUrl, 'qrLandingInfo', mensaje);
}

// ============================================
// LOGIN USANDO TUS ELEMENTOS EXISTENTES
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  iniciarAgente();
  
  // Configurar el botón de login (btnLogin)
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) {
    const nuevoBtn = btnLogin.cloneNode(true);
    btnLogin.parentNode.replaceChild(nuevoBtn, btnLogin);
    
    nuevoBtn.addEventListener('click', async function() {
      const identifier = document.getElementById('loginUsername')?.value.trim();
      const password = document.getElementById('loginPassword')?.value;
      if (!identifier || !password) {
        alert('❌ Ingresa usuario (o email) y contraseña');
        return;
      }
      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: identifier, password })
        });
        const data = await response.json();
        if (data.success) {
          guardarSesion(data.token, data.user);
          mostrarVistaSegunRol(data.user);
          alert('✅ Inicio de sesión exitoso');
        } else {
          alert('❌ Error: ' + (data.error || 'Credenciales inválidas'));
        }
      } catch (err) {
        console.error('Error en login:', err);
        alert('Error de conexión con el servidor');
      }
    });
  } else {
    console.warn('⚠️ No se encontró el botón #btnLogin');
  }
  
  // Botón "Ya tengo cuenta" (btnShowLogin) – muestra el loginContainer
  const btnShowLogin = document.getElementById('btnShowLogin');
  if (btnShowLogin) {
    btnShowLogin.addEventListener('click', function(e) {
      e.preventDefault();
      const landingView = document.getElementById('vistaLanding');
      if (landingView) landingView.style.display = 'none';
      const loginContainer = document.getElementById('loginContainer');
      if (loginContainer) {
        loginContainer.classList.remove('hidden');
        loginContainer.style.display = 'block';
        loginContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const identidadGuardada = localStorage.getItem('arv_identity');
      if (identidadGuardada) {
        const loginUsername = document.getElementById('loginUsername');
        if (loginUsername) loginUsername.value = identidadGuardada;
      }
    });
  }
  
  // Botón "Mostrar promoción"
  const btnShowPromo = document.getElementById('btnShowPromo');
  if (btnShowPromo) {
    btnShowPromo.addEventListener('click', () => {
      alert('✨ Plan Premium: Beneficios exclusivos. Contacta al administrador.');
    });
  }
  
  // Verificar sesión al cargar la página
  if (haySesionActiva()) {
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    mostrarVistaSegunRol(usuario);
    fetch('/api/profile', { headers: { 'Authorization': 'Bearer ' + getAuthToken() } })
      .then(res => res.json())
      .then(data => {
        if (!data.success && data.error) {
          cerrarSesion();
          mostrarLanding();
          alert('Sesión expirada. Inicia sesión nuevamente.');
        }
      })
      .catch(() => { cerrarSesion(); });
  } else {
    // Asegurar que se vea el landing y se oculte el login
    const landing = document.getElementById('vistaLanding');
    if (landing) landing.style.display = 'block';
    const loginContainer = document.getElementById('loginContainer');
    if (loginContainer) loginContainer.classList.add('hidden');
    // Mostrar QR público en la landing (si existe el canvas)
    setTimeout(() => mostrarQRReferidoPublico(), 500);
  }
});

// Función auxiliar para mostrar el landing (por si se necesita)
function mostrarLanding() {
  const landing = document.getElementById('vistaLanding');
  if (landing) landing.style.display = 'block';
  const loginContainer = document.getElementById('loginContainer');
  if (loginContainer) loginContainer.classList.add('hidden');
  const vault = document.getElementById('vaultContainer');
  if (vault) vault.style.display = 'none';
  const btnRegistro = document.getElementById('btnShowRegistro');
  if (btnRegistro) btnRegistro.style.display = 'inline-block';
  const btnLogin = document.getElementById('btnShowLogin');
  if (btnLogin) btnLogin.style.display = 'inline-block';
  // También actualizar QR público si es necesario
  setTimeout(() => mostrarQRReferidoPublico(), 100);
}

// Exponer funciones globales para cerrar sesión y mostrar QR desde cualquier parte
window.cerrarSesion = cerrarSesion;
window.mostrarVistaSegunRol = mostrarVistaSegunRol;
window.mostrarQRIdentidad = mostrarQRIdentidad;
