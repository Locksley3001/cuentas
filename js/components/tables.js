/**
 * ============================================================
 * tables.js — Sistema de Tablas Dinámicas Reutilizables
 * /JS/components/tables.js
 *
 * Propósito:
 *   Motor de renderizado de tablas para toda la aplicación.
 *   Incluye búsqueda, filtros, paginación, ordenamiento,
 *   acciones por fila y estados visuales premium.
 *
 * Uso:
 *   const tabla = new DataTable('#mi-contenedor', config);
 *   tabla.setData(rows);
 *
 * Reutilizable en:
 *   - finanzas (movimientos)
 *   - préstamos
 *   - clientes (CRM)
 *   - inversiones
 *   - activos
 *   - historial
 * ============================================================
 */

// ─── Estilos de tablas (inyectados una sola vez) ──────────────────────────────
const TABLE_STYLES = `
  /* ── Wrapper general ── */
  .dt-wrapper {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    overflow: hidden;
  }

  /* ── Toolbar superior ── */
  .dt-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-wrap: wrap;
  }
  .dt-toolbar-left,
  .dt-toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* ── Buscador ── */
  .dt-search-wrap {
    position: relative;
  }
  .dt-search-icon {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: #555;
    font-size: 0.85rem;
    pointer-events: none;
  }
  .dt-search {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 9px;
    color: #e0e0f0;
    font-size: 0.855rem;
    padding: 0.55rem 0.9rem 0.55rem 2.1rem;
    outline: none;
    width: 220px;
    transition: border-color 0.18s, box-shadow 0.18s;
  }
  .dt-search:focus {
    border-color: rgba(108,99,255,0.55);
    box-shadow: 0 0 0 3px rgba(108,99,255,0.1);
    width: 260px;
  }
  .dt-search::placeholder { color: rgba(255,255,255,0.2); }

  /* ── Filtros select ── */
  .dt-filter {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 9px;
    color: #aaa;
    font-size: 0.855rem;
    padding: 0.55rem 0.9rem;
    outline: none;
    cursor: pointer;
    transition: border-color 0.18s;
  }
  .dt-filter:focus { border-color: rgba(108,99,255,0.55); }
  .dt-filter option { background: #1a1a2e; }

  /* ── Botón de acción en toolbar ── */
  .dt-btn {
    padding: 0.55rem 1rem;
    border-radius: 9px;
    border: 1px solid transparent;
    font-size: 0.855rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .dt-btn-primary {
    background: linear-gradient(135deg, #6c63ff, #4ecdc4);
    color: #fff;
  }
  .dt-btn-primary:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .dt-btn-secondary {
    background: rgba(255,255,255,0.05);
    color: #aaa;
    border-color: rgba(255,255,255,0.1);
  }
  .dt-btn-secondary:hover { background: rgba(255,255,255,0.1); color: #e0e0e0; }

  /* ── Contador ── */
  .dt-count {
    font-size: 0.8rem;
    color: #555;
    white-space: nowrap;
  }
  .dt-count strong { color: #888; }

  /* ── Tabla ── */
  .dt-table-wrap {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .dt-table-wrap::-webkit-scrollbar { height: 4px; }
  .dt-table-wrap::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 4px;
  }
  .dt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  /* ── Cabecera ── */
  .dt-table thead tr {
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .dt-table th {
    padding: 0.85rem 1rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #666;
    white-space: nowrap;
    user-select: none;
  }
  .dt-table th.sortable {
    cursor: pointer;
    transition: color 0.18s;
  }
  .dt-table th.sortable:hover { color: #aaa; }
  .dt-table th.sort-asc,
  .dt-table th.sort-desc { color: #6c63ff; }
  .dt-sort-icon { margin-left: 0.3rem; font-size: 0.7rem; opacity: 0.6; }
  .dt-table th.sort-asc .dt-sort-icon,
  .dt-table th.sort-desc .dt-sort-icon { opacity: 1; }

  /* ── Filas ── */
  .dt-table tbody tr {
    border-bottom: 1px solid rgba(255,255,255,0.04);
    transition: background 0.15s;
  }
  .dt-table tbody tr:last-child { border-bottom: none; }
  .dt-table tbody tr:hover {
    background: rgba(255,255,255,0.03);
  }
  .dt-table tbody tr.row-selected {
    background: rgba(108,99,255,0.08);
  }
  .dt-table td {
    padding: 0.85rem 1rem;
    color: #c8c8d8;
    vertical-align: middle;
  }

  /* ── Estados de fila ── */
  .dt-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.22rem 0.65rem;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    gap: 0.3rem;
  }
  .badge-success  { background: rgba(78,205,196,0.15); color: #4ecdc4; }
  .badge-danger   { background: rgba(255,80,80,0.15);  color: #ff6b6b; }
  .badge-warning  { background: rgba(255,193,7,0.15);  color: #ffc107; }
  .badge-info     { background: rgba(108,99,255,0.15); color: #a09dff; }
  .badge-neutral  { background: rgba(255,255,255,0.07); color: #888; }

  /* ── Celda de monto ── */
  .dt-amount { font-weight: 600; font-variant-numeric: tabular-nums; }
  .dt-amount.positive { color: #4ecdc4; }
  .dt-amount.negative { color: #ff6b6b; }

  /* ── Acciones por fila ── */
  .dt-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .dt-action-btn {
    background: var(--bg-tertiary, rgba(255,255,255,0.05));
    border: 1px solid var(--border, rgba(255,255,255,0.07));
    border-radius: 7px;
    color: var(--text-secondary, #777);
    cursor: pointer;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.82rem;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .dt-action-btn:hover {
    background: var(--bg-card-hover, rgba(255,255,255,0.1));
    color: var(--text-primary, #ddd);
    border-color: var(--border-accent, rgba(56,189,248,0.3));
    transform: translateY(-1px);
  }
  .dt-action-btn.btn-edit:hover  { background: rgba(108,99,255,0.2); color: #a09dff; }
  .dt-action-btn.btn-delete {
    background: var(--danger-soft, rgba(255,80,80,0.12));
    color: #fca5a5;
    border-color: rgba(248,113,113,0.32);
  }
  .dt-action-btn.btn-delete:hover {
    background: rgba(255,80,80,0.2);
    color: #fecaca;
    border-color: rgba(248,113,113,0.72);
    box-shadow: 0 0 0 3px var(--danger-soft, rgba(255,80,80,0.12));
  }
  .dt-action-btn.btn-view:hover  { background: rgba(78,205,196,0.2); color: #4ecdc4; }

  /* ── Estado vacío ── */
  .dt-empty {
    text-align: center;
    padding: 3.5rem 1rem;
    color: #555;
  }
  .dt-empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5; }
  .dt-empty-title { font-size: 0.95rem; color: #666; margin-bottom: 0.35rem; }
  .dt-empty-sub   { font-size: 0.8rem;  color: #444; }

  /* ── Estado de carga ── */
  .dt-loading {
    text-align: center;
    padding: 3rem 1rem;
    color: #555;
  }
  .dt-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(108,99,255,0.2);
    border-top-color: #6c63ff;
    border-radius: 50%;
    animation: dt-spin 0.7s linear infinite;
    margin: 0 auto 0.75rem;
  }
  @keyframes dt-spin { to { transform: rotate(360deg); } }

  /* ── Paginación ── */
  .dt-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.9rem 1.2rem;
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-wrap: wrap;
  }
  .dt-page-info {
    font-size: 0.8rem;
    color: #555;
  }
  .dt-page-info strong { color: #888; }
  .dt-page-controls {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .dt-page-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px;
    color: #888;
    cursor: pointer;
    min-width: 32px;
    height: 32px;
    padding: 0 0.55rem;
    font-size: 0.82rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .dt-page-btn:hover:not(:disabled) {
    background: rgba(108,99,255,0.2);
    color: #a09dff;
    border-color: rgba(108,99,255,0.3);
  }
  .dt-page-btn.active {
    background: rgba(108,99,255,0.25);
    color: #a09dff;
    border-color: rgba(108,99,255,0.4);
    font-weight: 600;
  }
  .dt-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .dt-per-page {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 7px;
    color: #888;
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
    cursor: pointer;
    outline: none;
  }
  .dt-per-page option { background: #1a1a2e; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .dt-toolbar { gap: 0.5rem; }
    .dt-search  { width: 160px; }
    .dt-search:focus { width: 180px; }
    .dt-table th,
    .dt-table td { padding: 0.7rem 0.75rem; }
    .dt-pagination { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
  }
  @media (max-width: 480px) {
    .dt-toolbar-left,
    .dt-toolbar-right { width: 100%; }
    .dt-search { width: 100%; }
    .dt-search:focus { width: 100%; }
    .dt-filter { width: 100%; }
  }
`;

// ─── Inyectar estilos ─────────────────────────────────────────────────────────
(function injectTableStyles() {
  if (document.getElementById('table-styles')) return;
  const style = document.createElement('style');
  style.id = 'table-styles';
  style.textContent = TABLE_STYLES;
  document.head.appendChild(style);
})();

// ─── Utilidades ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deepGet(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASE PRINCIPAL — DataTable
// ═══════════════════════════════════════════════════════════════════════════════
export class DataTable {
  /**
   * @param {string|HTMLElement} selector  — Selector CSS o elemento contenedor
   * @param {Object}             config    — Configuración de la tabla
   *
   * CONFIG:
   * {
   *   columns: [
   *     {
   *       key: 'amount',          // campo del objeto de datos
   *       label: 'Monto',         // cabecera
   *       sortable: true,         // ¿ordenable?
   *       render: (val, row) => { // renderizado personalizado (opcional)
   *         return `<span>${val}</span>`;
   *       },
   *       align: 'right',         // 'left'|'center'|'right'
   *       width: '120px',         // ancho fijo (opcional)
   *     },
   *     ...
   *   ],
   *   actions: [
   *     { icon: '✏️', label: 'Editar', className: 'btn-edit', onClick: (row) => {} },
   *     { icon: '🗑️', label: 'Eliminar', className: 'btn-delete', onClick: (row) => {} },
   *   ],
   *   searchKeys: ['name', 'description'],   // campos en los que busca
   *   filters: [
   *     {
   *       key: 'category',
   *       label: 'Categoría',
   *       options: [{ value: '', label: 'Todas' }, ...],
   *     }
   *   ],
   *   toolbarButtons: [
   *     { label: '+ Nuevo', className: 'dt-btn-primary', onClick: () => {} },
   *   ],
   *   perPage: 10,
   *   emptyIcon: '📋',
   *   emptyTitle: 'Sin registros',
   *   emptySubtitle: '',
   *   onRowClick: (row) => {},    // click en toda la fila
   * }
   */
  constructor(selector, config = {}) {
    // Resolver contenedor
    this._container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!this._container) {
      console.error(`[DataTable] Contenedor no encontrado: ${selector}`);
      return;
    }

    // ── Config con defaults ──
    this._cfg = {
      columns:        config.columns        || [],
      actions:        config.actions        || [],
      searchKeys:     config.searchKeys     || [],
      filters:        config.filters        || [],
      toolbarButtons: config.toolbarButtons || [],
      perPage:        config.perPage        || 10,
      emptyIcon:      config.emptyIcon      || '📋',
      emptyTitle:     config.emptyTitle     || 'Sin registros',
      emptySubtitle:  config.emptySubtitle  || 'No se encontraron datos',
      onRowClick:     config.onRowClick     || null,
    };

    // ── Estado interno ──
    this._allData      = [];   // todos los registros
    this._filteredData = [];   // registros después de search/filter
    this._currentPage  = 1;
    this._perPage      = this._cfg.perPage;
    this._sortKey      = null;
    this._sortDir      = 'asc';  // 'asc' | 'desc'
    this._searchTerm   = '';
    this._filterValues = {};     // { filterKey: value }
    this._loading      = false;

    // Inicializar valores de filtros
    this._cfg.filters.forEach(f => { this._filterValues[f.key] = ''; });

    // ── Renderizar estructura base ──
    this._render();
  }

  // ─── RENDER BASE ─────────────────────────────────────────────────────────
  _render() {
    this._container.innerHTML = '';
    this._container.className += ' dt-wrapper';

    this._el = {};
    this._el.toolbar = this._createToolbar();
    this._el.tableWrap = document.createElement('div');
    this._el.pagination = this._createPagination();

    this._el.tableWrap.className = 'dt-table-wrap';
    this._el.table = document.createElement('table');
    this._el.table.className = 'dt-table';
    this._el.thead = this._createThead();
    this._el.tbody = document.createElement('tbody');
    this._el.table.appendChild(this._el.thead);
    this._el.table.appendChild(this._el.tbody);
    this._el.tableWrap.appendChild(this._el.table);

    this._container.appendChild(this._el.toolbar);
    this._container.appendChild(this._el.tableWrap);
    this._container.appendChild(this._el.pagination);
  }

  // ─── TOOLBAR ─────────────────────────────────────────────────────────────
  _createToolbar() {
    const bar = document.createElement('div');
    bar.className = 'dt-toolbar';

    // ── Izquierda: búsqueda + filtros ──
    const left = document.createElement('div');
    left.className = 'dt-toolbar-left';

    // Búsqueda
    if (this._cfg.searchKeys.length > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'dt-search-wrap';
      wrap.innerHTML = `<span class="dt-search-icon">🔍</span>`;
      const input = document.createElement('input');
      input.type        = 'text';
      input.className   = 'dt-search';
      input.placeholder = 'Buscar...';
      input.setAttribute('aria-label', 'Buscar registros');
      input.addEventListener('input', (e) => {
        this._searchTerm  = e.target.value.toLowerCase();
        this._currentPage = 1;
        this._applyFiltersAndRender();
      });
      wrap.appendChild(input);
      this._el.searchInput = input;
      left.appendChild(wrap);
    }

    // Filtros
    this._cfg.filters.forEach(f => {
      const sel = document.createElement('select');
      sel.className = 'dt-filter';
      sel.setAttribute('aria-label', f.label || 'Filtro');
      f.options.forEach(opt => {
        const o = document.createElement('option');
        o.value       = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      sel.addEventListener('change', (e) => {
        this._filterValues[f.key] = e.target.value;
        this._currentPage = 1;
        this._applyFiltersAndRender();
      });
      this._el[`filter_${f.key}`] = sel;
      left.appendChild(sel);
    });

    // ── Derecha: contador + botones ──
    const right = document.createElement('div');
    right.className = 'dt-toolbar-right';

    // Contador
    const count = document.createElement('span');
    count.className = 'dt-count';
    count.innerHTML = '<strong>0</strong> registros';
    this._el.count = count;
    right.appendChild(count);

    // Botones custom
    this._cfg.toolbarButtons.forEach(btnCfg => {
      const btn = document.createElement('button');
      btn.className   = `dt-btn ${btnCfg.className || 'dt-btn-secondary'}`;
      btn.innerHTML   = btnCfg.label || 'Acción';
      if (btnCfg.icon) btn.innerHTML = `${btnCfg.icon} ${btn.innerHTML}`;
      btn.addEventListener('click', () => {
        if (typeof btnCfg.onClick === 'function') btnCfg.onClick();
      });
      right.appendChild(btn);
    });

    bar.appendChild(left);
    bar.appendChild(right);
    return bar;
  }

  // ─── THEAD ───────────────────────────────────────────────────────────────
  _createThead() {
    const thead = document.createElement('thead');
    const tr    = document.createElement('tr');

    this._cfg.columns.forEach(col => {
      const th = document.createElement('th');
      if (col.sortable) {
        th.className = 'sortable';
        th.dataset.key = col.key;
        th.addEventListener('click', () => this._handleSort(col.key, th));
      }
      if (col.align) th.style.textAlign = col.align;
      if (col.width) th.style.width     = col.width;

      th.innerHTML = `${escapeHtml(col.label)}<span class="dt-sort-icon">↕</span>`;
      tr.appendChild(th);
    });

    // Columna de acciones
    if (this._cfg.actions.length > 0) {
      const th = document.createElement('th');
      th.style.textAlign = 'center';
      th.style.width = `${this._cfg.actions.length * 38 + 16}px`;
      th.textContent = 'Acciones';
      tr.appendChild(th);
    }

    thead.appendChild(tr);
    this._el.thead = thead;
    return thead;
  }

  // ─── PAGINACIÓN ──────────────────────────────────────────────────────────
  _createPagination() {
    const pg = document.createElement('div');
    pg.className = 'dt-pagination';

    // Info
    const info = document.createElement('div');
    info.className = 'dt-page-info';
    this._el.pageInfo = info;

    // Controls
    const controls = document.createElement('div');
    controls.className = 'dt-page-controls';

    // Per-page selector
    const perPageSel = document.createElement('select');
    perPageSel.className = 'dt-per-page';
    [5, 10, 25, 50, 100].forEach(n => {
      const o = document.createElement('option');
      o.value       = n;
      o.textContent = `${n} / pág`;
      if (n === this._perPage) o.selected = true;
      perPageSel.appendChild(o);
    });
    perPageSel.addEventListener('change', (e) => {
      this._perPage    = parseInt(e.target.value);
      this._currentPage = 1;
      this._renderBody();
      this._renderPagination();
    });
    this._el.perPageSel = perPageSel;
    controls.appendChild(perPageSel);

    this._el.pageControls = controls;

    pg.appendChild(info);
    pg.appendChild(controls);
    return pg;
  }

  // ─── SORT ─────────────────────────────────────────────────────────────────
  _handleSort(key, thEl) {
    if (this._sortKey === key) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this._sortKey = key;
      this._sortDir = 'asc';
    }

    // Actualizar clases
    this._el.thead.querySelectorAll('th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      const icon = th.querySelector('.dt-sort-icon');
      if (icon) icon.textContent = '↕';
    });
    thEl.classList.add(this._sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    const icon = thEl.querySelector('.dt-sort-icon');
    if (icon) icon.textContent = this._sortDir === 'asc' ? '↑' : '↓';

    this._applyFiltersAndRender();
  }

  // ─── FILTRO + BÚSQUEDA ───────────────────────────────────────────────────
  _applyFiltersAndRender() {
    let data = [...this._allData];

    // Búsqueda
    if (this._searchTerm && this._cfg.searchKeys.length > 0) {
      data = data.filter(row =>
        this._cfg.searchKeys.some(key => {
          const val = deepGet(row, key);
          return val !== null && val !== undefined
            && String(val).toLowerCase().includes(this._searchTerm);
        })
      );
    }

    // Filtros
    Object.entries(this._filterValues).forEach(([key, val]) => {
      if (val === '' || val === null || val === undefined) return;
      data = data.filter(row => {
        const rowVal = deepGet(row, key);
        return String(rowVal) === String(val);
      });
    });

    // Ordenamiento
    if (this._sortKey) {
      data.sort((a, b) => {
        const av = deepGet(a, this._sortKey);
        const bv = deepGet(b, this._sortKey);
        if (av === bv) return 0;
        const cmp = av > bv ? 1 : -1;
        return this._sortDir === 'asc' ? cmp : -cmp;
      });
    }

    this._filteredData = data;
    this._renderBody();
    this._renderPagination();
    this._updateCount();
  }

  // ─── RENDER BODY ─────────────────────────────────────────────────────────
  _renderBody() {
    const tbody = this._el.tbody;
    tbody.innerHTML = '';

    if (this._loading) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this._cfg.columns.length + (this._cfg.actions.length > 0 ? 1 : 0);
      td.innerHTML = `
        <div class="dt-loading">
          <div class="dt-spinner"></div>
          <div style="font-size:0.85rem; color:#555;">Cargando datos...</div>
        </div>
      `;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    // Paginación
    const start = (this._currentPage - 1) * this._perPage;
    const end   = start + this._perPage;
    const pageData = this._filteredData.slice(start, end);

    if (pageData.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this._cfg.columns.length + (this._cfg.actions.length > 0 ? 1 : 0);
      td.innerHTML = `
        <div class="dt-empty">
          <div class="dt-empty-icon">${this._cfg.emptyIcon}</div>
          <div class="dt-empty-title">${this._cfg.emptyTitle}</div>
          <div class="dt-empty-sub">${this._cfg.emptySubtitle}</div>
        </div>
      `;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    // Renderizar filas
    pageData.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.id = row.id || '';

      // Celda por columna
      this._cfg.columns.forEach(col => {
        const td = document.createElement('td');
        if (col.align) td.style.textAlign = col.align;

        const rawVal = deepGet(row, col.key);

        if (typeof col.render === 'function') {
          td.innerHTML = col.render(rawVal, row);
        } else {
          td.textContent = rawVal !== null && rawVal !== undefined ? rawVal : '—';
        }

        tr.appendChild(td);
      });

      // Celda de acciones
      if (this._cfg.actions.length > 0) {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        const div = document.createElement('div');
        div.className = 'dt-actions';

        this._cfg.actions.forEach(action => {
          if (action.condition && !action.condition(row)) return;
          const btn = document.createElement('button');
          btn.className = `dt-action-btn ${action.className || ''}`;
          btn.title     = action.label || '';
          btn.innerHTML = action.icon  || '•';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof action.onClick === 'function') action.onClick(row, tr);
          });
          div.appendChild(btn);
        });

        td.appendChild(div);
        tr.appendChild(td);
      }

      // Click en fila
      if (typeof this._cfg.onRowClick === 'function') {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => this._cfg.onRowClick(row, tr));
      }

      tbody.appendChild(tr);
    });
  }

  // ─── RENDER PAGINATION ───────────────────────────────────────────────────
  _renderPagination() {
    const total     = this._filteredData.length;
    const totalPages = Math.max(1, Math.ceil(total / this._perPage));
    const start      = Math.min((this._currentPage - 1) * this._perPage + 1, total);
    const end        = Math.min(start + this._perPage - 1, total);

    // Info
    this._el.pageInfo.innerHTML = total === 0
      ? 'Sin resultados'
      : `Mostrando <strong>${start}–${end}</strong> de <strong>${total}</strong>`;

    // Limpiar controles previos (excepto el per-page select)
    const controls = this._el.pageControls;
    Array.from(controls.children).forEach(child => {
      if (child !== this._el.perPageSel) child.remove();
    });

    // Botón anterior
    const prev = this._makePageBtn('‹', this._currentPage > 1, () => {
      this._currentPage--;
      this._renderBody();
      this._renderPagination();
    });
    controls.insertBefore(prev, this._el.perPageSel);

    // Páginas numéricas (máx 7 visibles)
    const pages = this._getPageNumbers(this._currentPage, totalPages);
    pages.forEach(p => {
      if (p === '...') {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '…';
        ellipsis.style.cssText = 'color:#444; padding:0 0.25rem;';
        controls.insertBefore(ellipsis, this._el.perPageSel);
      } else {
        const btn = this._makePageBtn(p, true, () => {
          this._currentPage = p;
          this._renderBody();
          this._renderPagination();
        });
        if (p === this._currentPage) btn.classList.add('active');
        controls.insertBefore(btn, this._el.perPageSel);
      }
    });

    // Botón siguiente
    const next = this._makePageBtn('›', this._currentPage < totalPages, () => {
      this._currentPage++;
      this._renderBody();
      this._renderPagination();
    });
    controls.insertBefore(next, this._el.perPageSel);
  }

  _makePageBtn(label, enabled, onClick) {
    const btn = document.createElement('button');
    btn.className        = 'dt-page-btn';
    btn.textContent      = label;
    btn.disabled         = !enabled;
    if (enabled) btn.addEventListener('click', onClick);
    return btn;
  }

  _getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total-4, total-3, total-2, total-1, total];
    return [1, '...', current-1, current, current+1, '...', total];
  }

  // ─── ACTUALIZAR CONTADOR ─────────────────────────────────────────────────
  _updateCount() {
    const total    = this._allData.length;
    const filtered = this._filteredData.length;
    if (filtered < total) {
      this._el.count.innerHTML = `<strong>${filtered}</strong> de <strong>${total}</strong> registros`;
    } else {
      this._el.count.innerHTML = `<strong>${total}</strong> registro${total !== 1 ? 's' : ''}`;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Carga los datos en la tabla.
   * @param {Array} data — Array de objetos
   */
  setData(data = []) {
    this._allData      = data;
    this._currentPage  = 1;
    this._applyFiltersAndRender();
  }

  /**
   * Agrega un registro y re-renderiza.
   * @param {Object} row
   */
  addRow(row) {
    this._allData.unshift(row);
    this._applyFiltersAndRender();
  }

  /**
   * Actualiza un registro por ID.
   * @param {string|number} id
   * @param {Object}        updatedRow
   */
  updateRow(id, updatedRow) {
    const idx = this._allData.findIndex(r => r.id === id);
    if (idx !== -1) {
      this._allData[idx] = { ...this._allData[idx], ...updatedRow };
      this._applyFiltersAndRender();
    }
  }

  /**
   * Elimina un registro por ID.
   * @param {string|number} id
   */
  removeRow(id) {
    this._allData = this._allData.filter(r => r.id !== id);
    // Ajustar página si quedó vacía
    const totalPages = Math.ceil(this._filteredData.length / this._perPage);
    if (this._currentPage > totalPages) this._currentPage = Math.max(1, totalPages);
    this._applyFiltersAndRender();
  }

  /** Muestra el spinner de carga */
  showLoading() {
    this._loading = true;
    this._renderBody();
  }

  /** Oculta el spinner de carga */
  hideLoading() {
    this._loading = false;
    this._renderBody();
  }

  /** Limpia la búsqueda y filtros */
  clearSearch() {
    this._searchTerm = '';
    if (this._el.searchInput) this._el.searchInput.value = '';
    Object.keys(this._filterValues).forEach(k => { this._filterValues[k] = ''; });
    this._currentPage = 1;
    this._applyFiltersAndRender();
  }

  /** @returns {Array} Los datos actualmente filtrados */
  getFilteredData() {
    return [...this._filteredData];
  }

  /** @returns {Array} Todos los datos cargados */
  getAllData() {
    return [...this._allData];
  }

  /** Destruye la tabla y limpia el contenedor */
  destroy() {
    this._container.innerHTML = '';
    this._container.classList.remove('dt-wrapper');
  }
}

// ─── HELPERS PARA RENDERIZADO DE CELDAS ──────────────────────────────────────

/**
 * Renderiza un badge de estado.
 * @param {string} text
 * @param {'success'|'danger'|'warning'|'info'|'neutral'} type
 * @returns {string} HTML
 */
export function renderBadge(text, type = 'neutral') {
  return `<span class="dt-badge badge-${type}">${escapeHtml(text)}</span>`;
}

/**
 * Renderiza un monto con color según positivo/negativo.
 * @param {number} amount
 * @param {string} [currency] — símbolo de moneda
 * @returns {string} HTML
 */
export function renderAmount(amount, currency = '$') {
  const num    = parseFloat(amount) || 0;
  const cls    = num >= 0 ? 'positive' : 'negative';
  const sign   = num >= 0 ? '+' : '';
  const formatted = Math.abs(num).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `<span class="dt-amount ${cls}">${sign}${currency}${formatted}</span>`;
}

/**
 * Renderiza una fecha formateada.
 * @param {string|number|Date} date
 * @returns {string}
 */
export function renderDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d)) return String(date);
  return d.toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * Renderiza una fecha-hora formateada.
 * @param {string|number|Date} date
 * @returns {string}
 */
export function renderDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d)) return String(date);
  return d.toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Trunca texto largo.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function renderTruncated(text, maxLength = 40) {
  if (!text) return '—';
  const str = String(text);
  if (str.length <= maxLength) return escapeHtml(str);
  return `<span title="${escapeHtml(str)}">${escapeHtml(str.slice(0, maxLength))}…</span>`;
}

export function renderTable(config = {}) {
  const columns = config.columns || [];
  const rows = config.rows || config.data || [];
  const emptyMessage = config.emptyMessage || config.emptyMsg || 'Sin registros';

  const html = rows.length ? `
    <div class="table-responsive">
      <table class="data-table ${config.className || ''}" id="${config.id || ''}">
        <thead>
          <tr>${columns.map(col => `<th>${escapeHtml(col.label || '')}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr data-id="${row.id ?? ''}">
              ${columns.map(col => {
                const raw = col.key === 'actions' ? row.actions : row[col.key];
                const value = col.render ? col.render(raw, row) : (raw ?? '...');
                return `<td class="${col.align ? `text-${col.align}` : ''}" data-label="${escapeHtml(col.label || '')}">${value}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `
    <div class="empty-state">
      <div class="empty-icon">○</div>
      <h3>${escapeHtml(emptyMessage)}</h3>
    </div>
  `;

  if (config.containerId) {
    const container = document.getElementById(config.containerId);
    if (container) container.innerHTML = html;
  }

  return html;
}

export function refreshTable(config = {}) {
  return renderTable(config);
}

export const Tables = { render: renderTable, renderTable, refreshTable };
window.DataTable = DataTable;
window.TablesModule = Tables;

export default DataTable;
