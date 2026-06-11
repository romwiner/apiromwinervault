// Botón "Ya tengo cuenta" - Mostrar login
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
