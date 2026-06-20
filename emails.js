// ============================================
// 📧 SISTEMA DE EMAILS REAL - RESEND
// ============================================
const { Resend } = require('resend');

// ============================================
// 🔧 CONFIGURACIÓN
// ============================================
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'ApiRomwiner Vault';
const EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'no-reply@resend.dev';
const APP_URL = process.env.APP_URL || 'https://apiromwinervault.com';

let resend = null;
let emailsHabilitados = false;

if (RESEND_API_KEY && RESEND_API_KEY.startsWith('re_')) {
  resend = new Resend(RESEND_API_KEY);
  emailsHabilitados = true;
  console.log('📧 Sistema de emails inicializado con Resend');
  console.log(`📬 Emails desde: ${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`);
} else {
  console.warn('⚠️ RESEND_API_KEY no configurada. Emails deshabilitados.');
}

// ============================================
// 🎨 PLANTILLA HTML BASE
// ============================================
function plantillaBase(titulo, contenido, botonTexto = null, botonUrl = null) {
  const botonHTML = botonTexto && botonUrl ? `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${botonUrl}" style="background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%); color: #000; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
        ${botonTexto}
      </a>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
    <div style="background: linear-gradient(135deg, #d4af37 0%, #f4d03f 100%); padding: 32px 24px; text-align: center;">
      <h1 style="margin: 0; color: #000; font-size: 28px;">🔐 ApiRomwiner Vault</h1>
      <p style="margin: 8px 0 0 0; color: #000; font-size: 14px; opacity: 0.8;">Bóveda Segura con Identidad Universal</p>
    </div>
    <div style="padding: 32px 24px; color: #e0e0e0;">
      <h2 style="color: #d4af37; margin-top: 0;">${titulo}</h2>
      ${contenido}
      ${botonHTML}
    </div>
    <div style="background-color: #0a0a0a; padding: 24px; text-align: center; border-top: 1px solid #333;">
      <p style="margin: 0; color: #888; font-size: 12px;">© 2026 ApiRomwiner Vault</p>
      <p style="margin: 8px 0 0 0; color: #666; font-size: 11px;">🌐 ${APP_URL.replace('https://', '')}</p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================
// 📤 FUNCIÓN PRINCIPAL DE ENVÍO
// ============================================
async function enviarEmail({ para, asunto, html }) {
  if (!emailsHabilitados) {
    console.log(`📧 [SIMULADO] Email a ${para}: ${asunto}`);
    return { success: false, simulado: true };
  }
  
  try {
    const resultado = await resend.emails.send({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM_ADDRESS}>`,
      to: para,
      subject: asunto,
      html: html
    });
    
    console.log(`✅ Email enviado a ${para}: ${asunto}`);
    return { success: true, id: resultado.data?.id };
  } catch (error) {
    console.error(`❌ Error enviando email a ${para}:`, error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// 📧 EMAILS ESPECÍFICOS
// ============================================

// 1️⃣ BIENVENIDA
async function enviarBienvenida(email, username) {
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 👋
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      Bienvenido a <strong>ApiRomwiner Vault</strong>, tu bóveda segura con identidad universal.
    </p>
    <h3 style="color: #d4af37; margin-top: 24px;">🎯 ¿Qué puedes hacer?</h3>
    <ul style="line-height: 1.8; color: #ccc;">
      <li>🔐 Guardar archivos cifrados con Zero-Knowledge</li>
      <li>💰 Vender tus archivos en el marketplace</li>
      <li>🤝 Ganar comisiones con nuestro sistema de afiliados</li>
      <li>🌍 Conectar con la comunidad en el Feed Social</li>
      <li>🎮 Ganar XP y subir de nivel</li>
    </ul>
    <p style="font-size: 16px; line-height: 1.6; margin-top: 24px;">
      ¡Que disfrutes la experiencia! 🚀<br>
      <strong>El equipo de ApiRomwiner Vault</strong>
    </p>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: '🎉 ¡Bienvenido a ApiRomwiner Vault!',
    html: plantillaBase('¡Bienvenido! 🎉', contenido, 'Explorar la plataforma', APP_URL)
  });
}

// 2️⃣ VERIFICACIÓN DE EMAIL
async function enviarVerificacionEmail(email, username, token) {
  const link = `${APP_URL}/verificar-email?token=${token}`;
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 👋
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      Para completar tu registro, verifica tu email haciendo clic en el botón de abajo.
    </p>
    <div style="background-color: #2a2a2a; border-left: 4px solid #d4af37; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #ccc; font-size: 14px;">⏰ Este enlace expira en 24 horas.</p>
    </div>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: '🔐 Verifica tu email - ApiRomwiner Vault',
    html: plantillaBase('Verifica tu email 🔐', contenido, 'Verificar mi email', link)
  });
}

// 3️⃣ RECUPERAR CONTRASEÑA
async function enviarRecuperarPassword(email, username, token) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 👋
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      Recibimos una solicitud para restablecer tu contraseña.
    </p>
    <div style="background-color: #3a2a2a; border-left: 4px solid #e74c3c; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #ffcccc; font-size: 14px;">
        ⚠️ Si no solicitaste esto, ignora este email.
      </p>
    </div>
    <p style="font-size: 14px; color: #999;">Este enlace expira en 1 hora.</p>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: '🔑 Restablecer tu contraseña',
    html: plantillaBase('Restablecer contraseña 🔑', contenido, 'Restablecer contraseña', link)
  });
}

// 4️⃣ NOTIFICACIÓN DE VENTA
async function enviarNotificacionVenta(email, username, tituloArchivo, precio) {
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Felicidades <strong style="color: #d4af37;">${username}</strong>! 🎉
    </p>
    <p style="font-size: 16px; line-height: 1.6;">Has realizado una venta:</p>
    <div style="background-color: #1a3a1a; border: 1px solid #2ecc71; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="color: #2ecc71; margin-top: 0;">💰 Detalles de la venta</h3>
      <p style="margin: 8px 0; color: #ccc;"><strong>Archivo:</strong> ${tituloArchivo}</p>
      <p style="margin: 8px 0; color: #ccc;"><strong>Monto:</strong> <span style="color: #2ecc71; font-size: 20px; font-weight: bold;">$${precio}</span></p>
    </div>
    <p style="font-size: 16px; line-height: 1.6;">El monto ha sido acreditado a tu wallet.</p>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: `💰 ¡Nueva venta! $${precio}`,
    html: plantillaBase('¡Vendiste un archivo! 💰', contenido, 'Ver mis ventas', `${APP_URL}/ventas`)
  });
}

// 5️⃣ NOTIFICACIÓN DE COMPRA
async function enviarNotificacionCompra(email, username, tituloArchivo, precio) {
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 🛒
    </p>
    <p style="font-size: 16px; line-height: 1.6;">Tu compra se completó exitosamente:</p>
    <div style="background-color: #1a2a3a; border: 1px solid #3498db; padding: 20px; margin: 24px 0; border-radius: 8px;">
      <h3 style="color: #3498db; margin-top: 0;">🛍️ Detalles</h3>
      <p style="margin: 8px 0; color: #ccc;"><strong>Archivo:</strong> ${tituloArchivo}</p>
      <p style="margin: 8px 0; color: #ccc;"><strong>Total:</strong> <span style="color: #3498db; font-size: 20px; font-weight: bold;">$${precio}</span></p>
    </div>
    <p style="font-size: 16px; line-height: 1.6;">El archivo ya está en tu bóveda.</p>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: `🛒 Compra confirmada - ${tituloArchivo}`,
    html: plantillaBase('Compra confirmada 🛒', contenido, 'Ver mis compras', `${APP_URL}/compras`)
  });
}

// 6️⃣ ALERTA DE SEGURIDAD
async function enviarAlertaSeguridad(email, username, ubicacion, dispositivo) {
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 🛡️
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      Detectamos un nuevo inicio de sesión en tu cuenta:
    </p>
    <div style="background-color: #2a2a2a; padding: 20px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #d4af37;">
      <p style="margin: 8px 0; color: #ccc;"><strong>📍 Ubicación:</strong> ${ubicacion}</p>
      <p style="margin: 8px 0; color: #ccc;"><strong>💻 Dispositivo:</strong> ${dispositivo}</p>
      <p style="margin: 8px 0; color: #ccc;"><strong>🕐 Hora:</strong> ${new Date().toLocaleString('es-ES')}</p>
    </div>
    <div style="background-color: #3a2a2a; border-left: 4px solid #e74c3c; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #ffcccc; font-size: 14px;">
        ⚠️ Si no fuiste tú, cambia tu contraseña inmediatamente.
      </p>
    </div>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: '🛡️ Nuevo inicio de sesión detectado',
    html: plantillaBase('Nuevo inicio de sesión 🛡️', contenido, 'Cambiar contraseña', `${APP_URL}/configuracion`)
  });
}

// 7️⃣ NUEVO SEGUIDOR
async function enviarNotificacionNuevoSeguidor(email, username, seguidorUsername) {
  const contenido = `
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Hola <strong style="color: #d4af37;">${username}</strong>! 👥
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      <strong style="color: #2ecc71;">${seguidorUsername}</strong> comenzó a seguirte en ApiRomwiner Vault.
    </p>
    <p style="font-size: 16px; line-height: 1.6;">
      ¡Aprovecha para conectar y compartir contenido!
    </p>
  `;
  
  return await enviarEmail({
    para: email,
    asunto: `👥 ${seguidorUsername} te está siguiendo`,
    html: plantillaBase('Nuevo seguidor 👥', contenido, 'Ver mi perfil', `${APP_URL}/perfil`)
  });
}

// ============================================
// 🚀 EXPORTAR FUNCIONES
// ============================================
module.exports = {
  enviarEmail,
  enviarBienvenida,
  enviarVerificacionEmail,
  enviarRecuperarPassword,
  enviarNotificacionVenta,
  enviarNotificacionCompra,
  enviarAlertaSeguridad,
  enviarNotificacionNuevoSeguidor,
  emailsHabilitados: () => emailsHabilitados
};
