// ============================================
// 🤖 AGENTE IA INGENIERO REAL + SESIÓN + LOGIN
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

// Esta función muestra la vista correcta según el rol del usuario (tier)
function mostrarVistaSegunRol(usuario) {
  // Ocultar todas las vistas posibles
  const vistas = ['vistaLanding', 'vistaFreemium', 'vistaNormal', 'vistaEmpresarial', 'vistaAdmin', 'digitalIdentityPanel'];
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.add('hidden');
    }
  });
  
  // Determinar la vista según el tier (personal = freemium, business = normal, enterprise = empresarial)
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
  } else {
    // Si no existe la vista, crear un contenedor genérico
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
  }
  
  // Actualizar elementos de perfil si existen
  const displayName = document.getElementById('displayName');
  if (displayName) displayName.textContent = usuario.username || usuario.email;
  const displayEmail = document.getElementById('displayEmail');
  if (displayEmail) displayEmail.textContent = usuario.email;
  const identityStatus = document.getElementById('identityStatus');
  if (identityStatus) identityStatus.innerHTML = `<span style="color:#fbbf24;">${usuario.isAdmin ? '👑 ADMIN' : (usuario.tier || 'freemium').toUpperCase()}</span>`;
}

// ============================================
// LOGIN USANDO TUS ELEMENTOS EXISTENTES
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  iniciarAgente();
  
  // Configurar el botón de login (btnLogin)
  const btnLogin = document.getElementById('btnLogin');
  if (btnLogin) {
    // Reemplazar el botón para evitar eventos duplicados
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
      // Si hay identidad guardada del sistema antiguo (opcional)
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
    // Validar token con el backend
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
  // Mostrar botones de registro/login si existen
  const btnRegistro = document.getElementById('btnShowRegistro');
  if (btnRegistro) btnRegistro.style.display = 'inline-block';
  const btnLogin = document.getElementById('btnShowLogin');
  if (btnLogin) btnLogin.style.display = 'inline-block';
}

// Exponer funciones globales para cerrar sesión desde cualquier parte
window.cerrarSesion = cerrarSesion;
window.mostrarVistaSegunRol = mostrarVistaSegunRol;
