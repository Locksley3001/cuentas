/* ============================================================
   router.js — Sistema de enrutamiento SPA (Single Page App)
   Gestiona la navegación entre módulos sin recarga
   ============================================================ */

const Router = (() => {
  let _currentRoute = null;
  let _routes       = {};
  let _onNavigate   = null; // Callback al navegar

  /* ── Registrar una ruta con su manejador ─────────────────── */
  function register(name, handler) {
    _routes[name] = handler;
  }

  /* ── Navegar a una ruta ──────────────────────────────────── */
  async function navigate(route, params = {}) {
    const routeConfig = APP_CONFIG.routes[route];
    if (!routeConfig) {
      console.warn(`[Router] Ruta desconocida: "${route}"`);
      return;
    }

    /* Evitar re-renderizar la misma ruta */
    if (_currentRoute === route) return;

    console.log(`[Router] Navegando a: ${route}`);
    _currentRoute = route;
    if (location.hash !== `#/${route}`) history.pushState({ route }, '', `#/${route}`);

    /* Actualizar UI de navegación */
    _updateNavUI(route);

    /* Ejecutar handler si existe, si no mostrar placeholder */
    if (_routes[route]) {
      try {
        await _routes[route](params);
      } catch (err) {
        console.error(`[Router] Error en módulo "${route}":`, err);
        _renderError(route, err);
      }
    } else {
      _renderMissingRoute(route, routeConfig);
    }

    /* Callback externo */
    if (_onNavigate) _onNavigate(route, routeConfig);
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { route, config: routeConfig } }));

    /* Actualizar breadcrumb */
    _updateBreadcrumb(routeConfig.label);

    /* Scroll al inicio */
    const pageArea = document.querySelector('.page-area');
    if (pageArea) pageArea.scrollTop = 0;
  }

  /* ── Ruta actual ─────────────────────────────────────────── */
  function getCurrent() {
    return _currentRoute;
  }

  /* ── Callback al navegar ─────────────────────────────────── */
  function onNavigate(fn) {
    _onNavigate = fn;
  }

  /* ── Actualizar estilos activos del nav ──────────────────── */
  function _updateNavUI(route) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const isActive = item.dataset.route === route;
      item.classList.toggle('active', isActive);
    });
  }

  /* ── Actualizar breadcrumb ───────────────────────────────── */
  function _updateBreadcrumb(label) {
    const el = document.querySelector('.bc-current');
    if (el) el.textContent = label;
  }

  /* ── Renderizar placeholder para módulos futuros ─────────── */
  function _renderMissingRoute(route, config) {
    const container = document.getElementById('page-content');
    if (!container) return;

    const icons = {
      finance:     '◈', loans: '⟳', crm: '◉',
      animals: 'AN', vehicles: 'VH', trading: 'TR', software: 'SW', patrimony: 'PP', marketplace: 'MK',
      investments: '△', assets: '◻', history: '≡', settings: '⚙',
    };

    const descriptions = {
      finance:     'Gestión completa de ingresos, gastos y flujo de caja.',
      loans:       'Control de préstamos otorgados, cuotas y mora.',
      crm:         'Directorio de clientes, contactos y seguimiento.',
      animals:     'Control financiero de animales productivos.',
      vehicles:    'Vehiculos de negocio y patrimonio.',
      trading:     'Capital en brokers y PnL.',
      software:    'Proyectos, clientes, pagos y utilidad.',
      patrimony:   'Bienes personales separados del negocio.',
      marketplace: 'Simulador de oportunidades, inventario y reventa.',
      investments: 'Portafolio de inversiones, rentabilidad y análisis.',
      assets:      'Inventario de activos físicos y digitales.',
      history:     'Registro cronológico de todas las operaciones.',
      settings:    'Configuración de la aplicación y preferencias.',
    };

    container.innerHTML = `
      <div class="module-page">
        <div class="module-coming-soon">
          <div class="cs-icon">${icons[route] || '◌'}</div>
          <div class="cs-badge">Ruta sin registrar</div>
          <h2>${config.label}</h2>
          <p>${descriptions[route] || 'No hay un controlador activo para esta ruta.'}</p>
          <button class="btn btn-ghost" onclick="Router.navigate('dashboard')">
            ← Volver al Dashboard
          </button>
        </div>
      </div>
    `;
  }

  /* ── Renderizar error ────────────────────────────────────── */
  function _renderError(route, err) {
    const container = document.getElementById('page-content');
    if (!container) return;
    container.innerHTML = `
      <div class="module-page">
        <div class="module-coming-soon">
          <div class="cs-icon">⚠</div>
          <div class="cs-badge" style="background:var(--danger-soft);color:var(--danger);border-color:rgba(248,113,113,0.3)">Error</div>
          <h2>Error al cargar módulo</h2>
          <p>${err.message}</p>
          <button class="btn btn-ghost" onclick="Router.navigate('dashboard')">← Volver al Dashboard</button>
        </div>
      </div>
    `;
  }

  /* ── API pública ─────────────────────────────────────────── */
  function resolveInitial(defaultRoute = APP_CONFIG.ui.defaultRoute) {
    return location.hash.replace(/^#\/?/, '') || defaultRoute;
  }

  window.addEventListener('popstate', () => navigate(resolveInitial()));
  window.addEventListener('hashchange', () => {
    const route = resolveInitial();
    if (route !== _currentRoute) navigate(route);
  });

  return { register, navigate, getCurrent, onNavigate, resolveInitial };
})();

window.Router = Router;
