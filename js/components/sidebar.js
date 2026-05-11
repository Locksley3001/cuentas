/* ============================================================
   sidebar.js — Componente Sidebar
   Renderiza y gestiona la navegación lateral
   ============================================================ */

const Sidebar = (() => {

  /* ── Configuración de secciones del menú ─────────────────── */
  const NAV_SECTIONS = [
    {
      label: 'Principal',
      items: [
        { route: 'dashboard', label: 'Dashboard',    icon: '⬡', badge: null },
      ],
    },
    {
      label: 'Finanzas',
      items: [
        { route: 'finance',     label: 'Finanzas',      icon: '◈', badge: null },
        { route: 'loans',       label: 'Préstamos',     icon: '⟳', badge: '3'  },
        { route: 'investments', label: 'Inversiones',   icon: '△', badge: null },
        { route: 'assets',      label: 'Activos',       icon: '◻', badge: null },
      ],
    },
    {
      label: 'Gestión',
      items: [
        { route: 'crm',     label: 'Clientes (CRM)', icon: '◉', badge: null },
        { route: 'history', label: 'Historial',      icon: '≡', badge: null },
      ],
    },
    {
      label: 'Sistema',
      items: [
        { route: 'settings', label: 'Configuración', icon: '⚙', badge: null },
      ],
    },
  ];

  /* ── Estado ──────────────────────────────────────────────── */
  let _collapsed   = false;
  let _mobileOpen  = false;
  let _sidebarEl   = null;
  let _overlayEl   = null;

  /* ── Inicializar ─────────────────────────────────────────── */
  function init() {
    _render();
    _bindEvents();
    /* Restaurar estado colapsado guardado */
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') collapse(true);
  }

  /* ── Renderizar HTML del sidebar ─────────────────────────── */
  function _render() {
    const target = document.getElementById('sidebar-mount');
    if (!target) return;

    const sectionsHTML = NAV_SECTIONS.map(section => `
      <div class="nav-section">
        <div class="nav-section-label">${section.label}</div>
        ${section.items.map(item => `
          <div class="nav-item" data-route="${item.route}" title="${item.label}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
            ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('');

    target.innerHTML = `
      <aside class="sidebar" id="main-sidebar" aria-hidden="true">
        <!-- Marca -->
        <div class="sidebar-brand">
          <div class="brand-logo">C</div>
          <div>
            <div class="brand-name">CUENTAS</div>
            <div class="brand-version">v${APP_CONFIG.version}</div>
          </div>
        </div>

        <!-- Navegación -->
        <nav class="sidebar-nav">
          ${sectionsHTML}
        </nav>

        <!-- Pie del sidebar -->
        <div class="sidebar-footer">
          <button class="sidebar-collapse-btn" id="collapse-btn" title="Colapsar sidebar">
            <span class="collapse-icon">◀</span>
            <span>Colapsar</span>
          </button>
        </div>
      </aside>

      <!-- Overlay para móvil -->
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
    `;

    _sidebarEl = document.getElementById('main-sidebar');
    _overlayEl = document.getElementById('sidebar-overlay');
    if (_sidebarEl) {
      _sidebarEl.setAttribute('aria-hidden', window.innerWidth <= 768 ? 'true' : 'false');
    }
  }

  /* ── Eventos ─────────────────────────────────────────────── */
  function _bindEvents() {
    const mount = document.getElementById('sidebar-mount');
    if (!mount) return;

    /* Clic en ítems de nav */
    mount.addEventListener('click', (e) => {
      const navItem = e.target.closest('.nav-item');
      if (navItem && navItem.dataset.route) {
        Router.navigate(navItem.dataset.route);
        /* En móvil, cerrar sidebar al navegar */
        if (_mobileOpen) closeMobile();
      }

      /* Botón colapsar */
      if (e.target.closest('#collapse-btn')) {
        if (window.matchMedia('(max-width: 768px)').matches) {
          closeMobile();
          return;
        }
        toggle();
      }
    });

    /* Overlay: cerrar sidebar en móvil */
    if (_overlayEl) {
      _overlayEl.addEventListener('click', closeMobile);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _mobileOpen) closeMobile();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && _mobileOpen) closeMobile();
    });
  }

  /* ── Colapsar / expandir ─────────────────────────────────── */
  function toggle() {
    _collapsed ? expand() : collapse();
  }

  function collapse(silent = false) {
    _collapsed = true;
    if (_sidebarEl) _sidebarEl.classList.add('collapsed');

    /* Ajustar app-content y navbar */
    const content = document.querySelector('.app-content');
    const navbar  = document.querySelector('.navbar');
    if (content) content.classList.add('sidebar-collapsed');
    if (navbar)  navbar.classList.add('sidebar-collapsed');

    if (!silent) localStorage.setItem('sidebar_collapsed', 'true');
  }

  function expand() {
    _collapsed = false;
    if (_sidebarEl) _sidebarEl.classList.remove('collapsed');

    const content = document.querySelector('.app-content');
    const navbar  = document.querySelector('.navbar');
    if (content) content.classList.remove('sidebar-collapsed');
    if (navbar)  navbar.classList.remove('sidebar-collapsed');

    localStorage.setItem('sidebar_collapsed', 'false');
  }

  /* ── Móvil: abrir / cerrar ───────────────────────────────── */
  function openMobile() {
    _mobileOpen = true;
    if (_sidebarEl) {
      _sidebarEl.classList.add('mobile-open');
      _sidebarEl.setAttribute('aria-hidden', 'false');
    }
    if (_overlayEl)  _overlayEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobile() {
    _mobileOpen = false;
    if (_sidebarEl) {
      _sidebarEl.classList.remove('mobile-open');
      _sidebarEl.setAttribute('aria-hidden', 'true');
    }
    if (_overlayEl)  _overlayEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  function toggleMobile() {
    _mobileOpen ? closeMobile() : openMobile();
  }

  /* ── Actualizar badge de un ítem ─────────────────────────── */
  function setBadge(route, value) {
    const item = document.querySelector(`.nav-item[data-route="${route}"] .nav-badge`);
    if (item) {
      item.textContent = value;
      item.style.display = value ? '' : 'none';
    }
  }

  /* ── API pública ─────────────────────────────────────────── */
  return { init, toggle, collapse, expand, openMobile, closeMobile, toggleMobile, setBadge };
})();

window.Sidebar = Sidebar;
