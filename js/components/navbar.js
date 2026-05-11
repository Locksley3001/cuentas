/* ============================================================
   navbar.js — Componente Navbar (barra superior)
   ============================================================ */

const Navbar = (() => {

  /* ── Inicializar ─────────────────────────────────────────── */
  function init() {
    _render();
    _bindEvents();
  }

  /* ── Renderizar HTML ─────────────────────────────────────── */
  function _render() {
    const target = document.getElementById('navbar-mount');
    if (!target) return;

    target.innerHTML = `
      <header class="navbar" id="main-navbar">
        <!-- Izquierda -->
        <div class="navbar-left">
          <!-- Botón hamburguesa (solo móvil) -->
          <button class="navbar-menu-btn" id="navbar-menu-btn" title="Menú">
            ☰
          </button>

          <!-- Breadcrumb -->
          <nav class="breadcrumb">
            <span>CUENTAS</span>
            <span class="bc-sep">›</span>
            <span class="bc-current">Dashboard</span>
          </nav>
        </div>

        <!-- Derecha -->
        <div class="navbar-right">
          <!-- Búsqueda -->
          <div class="navbar-search">
            <span class="search-icon">⌕</span>
            <input
              type="text"
              id="navbar-search-input"
              placeholder="Buscar…"
              autocomplete="off"
            />
          </div>

          <!-- Actualizar datos -->
          <button class="navbar-action-btn" id="btn-refresh" title="Actualizar">
            ↻
          </button>

          <!-- Notificaciones -->
          <button class="navbar-action-btn" id="btn-notifications" title="Notificaciones">
            ◎
            <span class="notif-dot"></span>
          </button>

          <!-- Avatar usuario -->
          <div class="user-avatar" id="user-avatar" title="Mi perfil">
            YO
          </div>
        </div>
      </header>
    `;
  }

  /* ── Eventos ─────────────────────────────────────────────── */
  function _bindEvents() {
    /* Menú móvil */
    document.getElementById('navbar-menu-btn')?.addEventListener('click', () => {
      Sidebar.toggleMobile();
    });

    /* Botón refrescar */
    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      const current = Router.getCurrent();
      if (current) {
        // Forzar re-render navegando de nuevo
        const temp = Router.getCurrent();
        window._currentRouteForce = true;
        Router.navigate(temp + '_force_refresh');
        Router.navigate(temp);
      }
      Toast.show('Datos actualizados', 'success');
    });

    /* Notificaciones */
    document.getElementById('btn-notifications')?.addEventListener('click', () => {
      Toast.show('No hay notificaciones nuevas', 'info');
    });

    /* Avatar */
    document.getElementById('user-avatar')?.addEventListener('click', () => {
      Router.navigate('settings');
    });

    /* Búsqueda — Enter para buscar */
    document.getElementById('navbar-search-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) Toast.show(`Búsqueda: "${q}" — próximamente`, 'info');
      }
    });
  }

  /* ── API pública ─────────────────────────────────────────── */
  return { init };
})();

window.Navbar = Navbar;
