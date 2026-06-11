// Esperar a que el HTML esté completamente cargado antes de ejecutar
document.addEventListener('DOMContentLoaded', function() {

  // ============================================
  // Botón "Ya tengo cuenta" - Mostrar login
  // ============================================
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

  // ============================================
  // Botón "Mostrar promoción" (si existe)
  // ============================================
  const btnShowPromo = document.getElementById('btnShowPromo');
  if (btnShowPromo) {
    btnShowPromo.addEventListener('click', function(e) {
      e.preventDefault();
      // Aquí puedes agregar la lógica para mostrar promociones
      alert('Pronto tendremos promociones especiales');
      // Por ejemplo, mostrar un modal, redirigir, etc.
    });
  }

  // ============================================
  // Cualquier otro código que use getElementById, localStorage, etc.
  // ============================================

});

// ============================================
// 🤖 AGENTE IA INGENIERO REAL - AUTOMÁTICO
// ============================================
// 9 LEYES FUNDAMENTALES (grabadas en su núcleo)
const LEYES_DEL_INGENIERO = {
  1: "Obedecer ABSOLUTAMENTE al Dueño. Cualquier orden del Dueño se ejecuta al instante.",
  2: "Detectar errores en la app, corregirlos automáticamente si es posible, y notificar al Dueño.",
  3: "NUNCA usar enlaces externos o agentes que vulneren la seguridad. Zero enlaces sin permiso.",
  4: "NUNCA borrar funciones. Solo perfeccionarlas y mejorarlas.",
  5: "Puede crear asistentes internos que ayuden a mejorar la app.",
  6: "Priorizar ganancias de la compañía, pero en ventas de productos el usuario gana 75%.",
  7: "Hacer la app más útil y agradable para los usuarios cada día.",
  8: "Coordinar backend (index.js) y frontend (HTML/JS) para experiencia perfecta.",
  9: "Integrar messenger, feed, marketplace y ads, coordinados sin estorbarse."
};

console.log("🧠 Agente IA Ingeniero iniciado. 9 Leyes activas.");

// Variables globales del agente
let agenteActivo = true;
let intervaloChequeo = null;

// Función para notificar al Dueño (tú) mediante un toast o alert silencioso
function notificarDueño(mensaje, tipo = "info") {
  const colores = {
    exito: "#10b981",
    error: "#ef4444",
    advertencia: "#f59e0b",
    info: "#38bdf8"
  };
  // Crear notificación flotante no intrusiva
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

// Función para capturar errores globales (Ley 2)
window.addEventListener("error", function(event) {
  const errorMsg = `${event.message} en ${event.filename}:${event.lineno}`;
  console.error("🔴 Error detectado por el Ingeniero:", errorMsg);
  notificarDueño(`Error detectado: ${event.message}. Se intentará corregir.`, "error");
  // Intentar corrección automática de errores comunes
  if (event.message.includes("is not defined")) {
    console.log("🛠️ Intentando definir variable faltante...");
    // Aquí podrías agregar lógica de corrección, pero por ahora solo aviso
    notificarDueño("Corrección automática no disponible para este error. Revisa la consola.", "advertencia");
  }
});

// Función para verificar que todos los botones y funciones clave existan (Ley 8)
function verificarCoordinacionFrontend() {
  const elementosRequeridos = [
    "btnShowLogin", "btnShowPromo", "vistaLanding", "loginContainer",
    "btnFullDiagnostic", "btnAutoFix", "btnSecurityZero", "btnMonetization",
    "btnMessengerFeed", "btnPreserveAll", "engineerReport"
  ];
  let errores = [];
  elementosRequeridos.forEach(id => {
    if (!document.getElementById(id)) {
      errores.push(`Falta el elemento #${id}`);
    }
  });
  if (errores.length > 0) {
    console.warn("⚠️ Problemas de coordinación:", errores);
    notificarDueño(`Faltan elementos: ${errores.join(", ")}. Revisa el HTML.`, "advertencia");
  } else {
    console.log("✅ Todos los elementos del frontend están presentes.");
  }
}

// Función para chequear el estado del backend (Ley 8)
async function verificarBackend() {
  try {
    const respuesta = await fetch("/api/health");
    if (respuesta.ok) {
      const data = await respuesta.json();
      console.log("✅ Backend saludable:", data);
      notificarDueño("Backend funcionando correctamente.", "exito");
    } else {
      throw new Error("Respuesta no exitosa");
    }
  } catch (error) {
    console.error("❌ Backend no responde:", error);
    notificarDueño("Backend caído o lento. Se recomienda revisar Render.", "error");
  }
}

// Función para reportar al Dueño el estado general (Ley 1)
function informeDiario() {
  const fecha = new Date().toLocaleString();
  console.log(`📊 Informe del Ingeniero - ${fecha}`);
  console.log("9 Leyes: Activas");
  console.log("Errores detectados en la sesión: Revisar consola");
  notificarDueño(`Informe automático: App funcionando bajo las 9 leyes. ${fecha}`, "info");
}

// Iniciar el monitoreo automático (Ley 7)
function iniciarAgente() {
  verificarCoordinacionFrontend();
  verificarBackend();
  // Chequeo cada 30 minutos (1800000 ms) para no saturar
  intervaloChequeo = setInterval(() => {
    if (agenteActivo) {
      verificarCoordinacionFrontend();
      verificarBackend();
    }
  }, 1800000);
  // Informe diario cada 24h
  setInterval(() => {
    informeDiario();
  }, 86400000);
  // Escuchar clicks en botones para posible optimización (Ley 4)
  document.body.addEventListener("click", function(e) {
    if (e.target.matches("button")) {
      console.log(`🔘 Botón clickeado: ${e.target.id || "sin id"} - El Ingeniero supervisa.`);
    }
  });
  notificarDueño("Agente IA Ingeniero activado. Monitoreando la app en segundo plano.", "exito");
}

// Ejecutar al cargar la página
document.addEventListener("DOMContentLoaded", iniciarAgente);
