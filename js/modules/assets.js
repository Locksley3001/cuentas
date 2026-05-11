/**
 * ============================================================
 * assets.js — Módulo de Activos
 * ============================================================
 * Sistema completo de gestión de activos para el proyecto
 * /cuentas. Cubre activos financieros, físicos y digitales.
 *
 * CATEGORÍAS:
 *   Financieros: efectivo, criptomonedas, inversiones
 *   Físicos:     motos, carros, vacas, caballos, relojes,
 *                propiedades, prendas
 *   Digitales:   software, páginas web, bots IA, dominios, licencias
 *
 * Dependencias:
 *   - /JS/storage/db.js        → operaciones IndexedDB
 *   - /JS/storage/storage.js   → capa de abstracción storage
 *   - /JS/components/modal.js  → sistema de modales
 *   - /JS/components/tables.js → tablas dinámicas
 *   - /JS/modules/finance.js   → integración financiera
 *   - /JS/modules/dashboard.js → actualización dashboard
 *
 * Preparado para integración futura con:
 *   - /JS/modules/history.js   → historial de acciones
 *   - /JS/modules/settings.js  → configuración global
 * ============================================================
 */

import { DB } from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { Modal } from '../components/modal.js';
import { Tables } from '../components/tables.js';

// ─────────────────────────────────────────────────────────────
// CONSTANTES Y CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

/** Nombre del store en IndexedDB */
const STORE_ASSETS = 'assets';
const STORE_ASSET_HISTORY = 'asset_value_history'; // historial de cambios de valor

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS Y TIPOS DE ACTIVOS
// ─────────────────────────────────────────────────────────────

/**
 * Estructura de categorías y tipos de activos.
 * Cada tipo define icono, color, si tiene depreciación y
 * si genera rendimientos.
 */
export const ASSET_CATEGORIES = {
  FINANCIERO: {
    label: 'Financiero',
    icon: '💳',
    color: '#00d4aa',
    types: {
      efectivo: { label: 'Efectivo', icon: '💵', deprecia: false, liquido: true },
      criptomonedas: { label: 'Criptomonedas', icon: '₿', deprecia: false, liquido: true },
      inversiones: { label: 'Inversiones', icon: '📈', deprecia: false, liquido: false },
    },
  },
  FISICO: {
    label: 'Físico',
    icon: '🏗️',
    color: '#ff9800',
    types: {
      motos: { label: 'Motos', icon: '🏍️', deprecia: true, liquido: false },
      carros: { label: 'Carros', icon: '🚗', deprecia: true, liquido: false },
      vacas: { label: 'Vacas', icon: '🐄', deprecia: false, liquido: false },
      caballos: { label: 'Caballos', icon: '🐎', deprecia: false, liquido: false },
      relojes: { label: 'Relojes', icon: '⌚', deprecia: false, liquido: false },
      propiedades: { label: 'Propiedades', icon: '🏠', deprecia: false, liquido: false },
      prendas: { label: 'Prendas', icon: '💎', deprecia: true, liquido: false },
    },
  },
  DIGITAL: {
    label: 'Digital',
    icon: '🌐',
    color: '#2196f3',
    types: {
      software: { label: 'Software', icon: '💻', deprecia: true, liquido: false },
      paginas_web: { label: 'Páginas Web', icon: '🌐', deprecia: false, liquido: false },
      bots_ia: { label: 'Bots IA', icon: '🤖', deprecia: false, liquido: false },
      dominios: { label: 'Dominios', icon: '🔗', deprecia: false, liquido: false },
      licencias: { label: 'Licencias', icon: '📄', deprecia: true, liquido: false },
    },
  },
};

/** Mapa plano tipo → config (para lookup rápido) */
const ALL_TYPES = {};
Object.entries(ASSET_CATEGORIES).forEach(([catKey, cat]) => {
  Object.entries(cat.types).forEach(([typeKey, typeCfg]) => {
    ALL_TYPES[typeKey] = {
      ...typeCfg,
      category: catKey,
      categoryLabel: cat.label,
      categoryColor: cat.color,
    };
  });
});

/** Estados de un activo */
export const ASSET_STATUS = {
  ACTIVO: 'activo',
  VENDIDO: 'vendido',
  DETERIORADO: 'deteriorado',
  ARRENDADO: 'arrendado',
  INACTIVO: 'inactivo',
};

const ASSET_STATUS_CONFIG = {
  activo: { label: 'Activo', badge: 'badge-success', color: '#4caf50' },
  vendido: { label: 'Vendido', badge: 'badge-info', color: '#2196f3' },
  deteriorado: { label: 'Deteriorado', badge: 'badge-danger', color: '#f44336' },
  arrendado: { label: 'Arrendado', badge: 'badge-warning', color: '#ff9800' },
  inactivo: { label: 'Inactivo', badge: 'badge-neutral', color: '#78909c' },
};

// ─────────────────────────────────────────────────────────────
// CLASE PRINCIPAL: AssetsModule
// ─────────────────────────────────────────────────────────────

export class AssetsModule {
  constructor() {
    /** Contenedor raíz del módulo */
    this.container = null;

    /** Caché local de activos */
    this._cache = [];

    /** Vista actual: 'table' | 'grid' */
    this._viewMode = 'table';

    /** Filtros activos */
    this._filters = {
      category: 'all',
      type: 'all',
      status: 'all',
      search: '',
      sortBy: 'fecha_desc',
    };

    /** Callbacks de integración */
    this._onFinanceUpdate = null;
    this._onDashboardUpdate = null;

    /** ID del activo en edición */
    this._editingId = null;
    this._eventsBound = false;
  }

  // ─────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────

  /**
   * Inicializa el módulo.
   * @param {HTMLElement} container
   * @param {Object} callbacks - { onFinanceUpdate, onDashboardUpdate }
   */
  async init(container, callbacks = {}) {
    this.container = container;
    this._onFinanceUpdate = callbacks.onFinanceUpdate || null;
    this._onDashboardUpdate = callbacks.onDashboardUpdate || null;

    await this._ensureStores();
    await this._loadCache();
    this._render();
    this._bindEvents();

    console.log('[Assets] Módulo inicializado correctamente.');
  }

  /**
   * Asegura la existencia de los object stores en IndexedDB.
   */
  async _ensureStores() {
    try {
      await DB.ensureStore(STORE_ASSETS, { keyPath: 'id', autoIncrement: true });
      await DB.ensureStore(STORE_ASSET_HISTORY, { keyPath: 'id', autoIncrement: true });
    } catch (err) {
      console.warn('[Assets] No se pudieron verificar stores:', err);
    }
  }

  /**
   * Carga todos los activos desde IndexedDB al caché local.
   */
  async _loadCache() {
    try {
      this._cache = await Storage.getAll(STORE_ASSETS) || [];
    } catch (err) {
      console.error('[Assets] Error cargando activos:', err);
      this._cache = [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDERIZADO PRINCIPAL
  // ─────────────────────────────────────────────────────────

  /**
   * Renderiza la vista completa del módulo.
   */
  _render() {
    if (!this.container) return;

    const stats = this._calcStats();

    this.container.innerHTML = `
      <div class="assets-module module-container">

        <!-- ENCABEZADO -->
        <div class="module-header">
          <div class="module-title-group">
            <h2 class="module-title">
              <span class="module-icon">🏦</span>
              Activos
            </h2>
            <p class="module-subtitle">Inventario y valorización de todos tus activos</p>
          </div>
          <div class="module-actions">
            <div class="view-toggle">
              <button class="btn-view-mode ${this._viewMode === 'table' ? 'active' : ''}" data-view="table" title="Vista tabla">☰</button>
              <button class="btn-view-mode ${this._viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="Vista tarjetas">⊞</button>
            </div>
            <button class="btn btn-primary" id="btnAddAsset">
              <span class="btn-icon">+</span>
              Nuevo Activo
            </button>
          </div>
        </div>

        <!-- ESTADÍSTICAS GLOBALES -->
        <div class="stats-grid" id="assetStats">
          ${this._renderStatsCards(stats)}
        </div>

        <!-- RESUMEN POR CATEGORÍA -->
        <div class="category-summary" id="categorySummary">
          ${this._renderCategorySummary(stats)}
        </div>

        <!-- FILTROS -->
        <div class="filter-bar" id="assetFilters">
          <div class="filter-search">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="assetSearch"
              class="filter-input"
              placeholder="Buscar activo..."
              value="${this._filters.search}"
            />
          </div>
          <div class="filter-selects">
            <select id="filterCategory" class="filter-select">
              <option value="all">Todas las categorías</option>
              ${Object.entries(ASSET_CATEGORIES).map(([key, cat]) =>
                `<option value="${key}" ${this._filters.category === key ? 'selected' : ''}>
                  ${cat.icon} ${cat.label}
                </option>`
              ).join('')}
            </select>
            <select id="filterAssetType" class="filter-select">
              <option value="all">Todos los tipos</option>
              ${this._buildTypeOptions()}
            </select>
            <select id="filterAssetStatus" class="filter-select">
              <option value="all">Todos los estados</option>
              ${Object.entries(ASSET_STATUS_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${this._filters.status === val ? 'selected' : ''}>${cfg.label}</option>`
              ).join('')}
            </select>
            <select id="sortAssets" class="filter-select">
              <option value="fecha_desc">Más recientes</option>
              <option value="fecha_asc">Más antiguos</option>
              <option value="valor_desc">Mayor valor</option>
              <option value="valorizacion_desc">Mayor valorización</option>
              <option value="nombre_asc">A - Z</option>
            </select>
          </div>
        </div>

        <!-- CONTENIDO PRINCIPAL -->
        <div class="asset-content" id="assetContent">
          ${this._viewMode === 'grid' ? this._renderGrid() : this._renderTable()}
        </div>

      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // ESTADÍSTICAS
  // ─────────────────────────────────────────────────────────

  /**
   * Calcula estadísticas globales del inventario.
   * @returns {Object} stats
   */
  _calcStats() {
    const activos = this._cache.filter(a => a.estado === 'activo');
    const totalValorCompra = this._cache.reduce((s, a) => s + (a.valorCompra || 0), 0);
    const totalValorActual = this._cache.reduce((s, a) => s + (a.valorActual || a.valorCompra || 0), 0);
    const valorizacion = totalValorActual - totalValorCompra;
    const porcentajeValorizacion = totalValorCompra > 0
      ? ((valorizacion / totalValorCompra) * 100)
      : 0;

    // Estadísticas por categoría
    const porCategoria = {};
    Object.keys(ASSET_CATEGORIES).forEach(cat => {
      const items = this._cache.filter(a => ALL_TYPES[a.tipo]?.category === cat);
      porCategoria[cat] = {
        count: items.length,
        valorActual: items.reduce((s, a) => s + (a.valorActual || a.valorCompra || 0), 0),
      };
    });

    return {
      total: this._cache.length,
      activos: activos.length,
      totalValorCompra,
      totalValorActual,
      valorizacion,
      porcentajeValorizacion,
      porCategoria,
    };
  }

  /**
   * Calcula la depreciación aproximada de un activo.
   * Usa tasa anual si está definida, sino fórmula simple.
   * @param {Object} asset
   * @returns {number} monto depreciado
   */
  _calcDepreciation(asset) {
    const typeCfg = ALL_TYPES[asset.tipo];
    if (!typeCfg?.deprecia) return 0;

    const tasaAnual = asset.tasaDepreciacion || 0.15; // 15% por defecto
    const fechaCompra = new Date(asset.fechaCompra);
    const hoy = new Date();
    const years = Math.max(0, (hoy - fechaCompra) / (1000 * 60 * 60 * 24 * 365));
    const depreciacion = (asset.valorCompra || 0) * tasaAnual * years;
    return Math.min(depreciacion, asset.valorCompra || 0); // no supera el valor de compra
  }

  /**
   * Renderiza tarjetas de métricas principales.
   */
  _renderStatsCards(stats) {
    const fmt = (n) => this._formatCurrency(n);
    const valPos = stats.valorizacion >= 0;

    return `
      <div class="stat-card stat-card--total">
        <div class="stat-icon">📦</div>
        <div class="stat-info">
          <span class="stat-label">Total Activos</span>
          <span class="stat-value">${stats.total}</span>
          <span class="stat-detail">${stats.activos} activos</span>
        </div>
      </div>
      <div class="stat-card stat-card--buy">
        <div class="stat-icon">🏷️</div>
        <div class="stat-info">
          <span class="stat-label">Valor de Compra</span>
          <span class="stat-value">${fmt(stats.totalValorCompra)}</span>
          <span class="stat-detail">Costo total invertido</span>
        </div>
      </div>
      <div class="stat-card stat-card--current">
        <div class="stat-icon">💰</div>
        <div class="stat-info">
          <span class="stat-label">Valor Actual</span>
          <span class="stat-value">${fmt(stats.totalValorActual)}</span>
          <span class="stat-detail">Patrimonio neto</span>
        </div>
      </div>
      <div class="stat-card stat-card--change ${valPos ? 'positive' : 'negative'}">
        <div class="stat-icon">${valPos ? '📈' : '📉'}</div>
        <div class="stat-info">
          <span class="stat-label">Valorización</span>
          <span class="stat-value">${valPos ? '+' : ''}${fmt(stats.valorizacion)}</span>
          <span class="stat-detail">${valPos ? '+' : ''}${stats.porcentajeValorizacion.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza mini-resumen por categoría.
   */
  _renderCategorySummary(stats) {
    return Object.entries(ASSET_CATEGORIES).map(([key, cat]) => {
      const data = stats.porCategoria[key] || { count: 0, valorActual: 0 };
      return `
        <div class="category-card" data-category="${key}">
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-label">${cat.label}</span>
          <span class="cat-count">${data.count}</span>
          <span class="cat-value">${this._formatCurrency(data.valorActual)}</span>
        </div>
      `;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────
  // TABLA Y GRID
  // ─────────────────────────────────────────────────────────

  /**
   * Aplica filtros y retorna activos filtrados/ordenados.
   */
  _getFiltered() {
    let data = [...this._cache];

    // Búsqueda por texto
    if (this._filters.search) {
      const q = this._filters.search.toLowerCase();
      data = data.filter(a =>
        (a.nombre || '').toLowerCase().includes(q) ||
        (a.tipo || '').toLowerCase().includes(q) ||
        (a.observaciones || '').toLowerCase().includes(q)
      );
    }

    // Filtro por categoría
    if (this._filters.category !== 'all') {
      data = data.filter(a => ALL_TYPES[a.tipo]?.category === this._filters.category);
    }

    // Filtro por tipo
    if (this._filters.type !== 'all') {
      data = data.filter(a => a.tipo === this._filters.type);
    }

    // Filtro por estado
    if (this._filters.status !== 'all') {
      data = data.filter(a => a.estado === this._filters.status);
    }

    // Ordenamiento
    const [sortField, sortDir] = (this._filters.sortBy || 'fecha_desc').split('_');
    data.sort((a, b) => {
      let va, vb;
      if (sortField === 'fecha') {
        va = new Date(a.fechaCompra || 0).getTime();
        vb = new Date(b.fechaCompra || 0).getTime();
      } else if (sortField === 'valor') {
        va = a.valorActual || a.valorCompra || 0;
        vb = b.valorActual || b.valorCompra || 0;
      } else if (sortField === 'valorizacion') {
        va = (a.valorActual || a.valorCompra || 0) - (a.valorCompra || 0);
        vb = (b.valorActual || b.valorCompra || 0) - (b.valorCompra || 0);
      } else if (sortField === 'nombre') {
        va = (a.nombre || '').toLowerCase();
        vb = (b.nombre || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'desc' ? vb - va : va - vb;
    });

    return data;
  }

  /**
   * Renderiza la tabla de activos.
   */
  _renderTable() {
    const data = this._getFiltered();

    if (data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🏦</div>
          <h3 class="empty-title">Sin activos registrados</h3>
          <p class="empty-desc">Registra tus activos para llevar un control de tu patrimonio.</p>
          <button class="btn btn-primary" id="btnAddAssetEmpty">+ Nuevo Activo</button>
        </div>
      `;
    }

    const rows = data.map(a => this._renderTableRow(a)).join('');

    return `
      <div class="table-responsive">
        <table class="data-table assets-table" id="assetsTable">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Nombre</th>
              <th>Valor Compra</th>
              <th>Valor Actual</th>
              <th>Valorización</th>
              <th>Depreciación</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="assetsBody">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renderiza una fila de la tabla de activos.
   */
  _renderTableRow(asset) {
    const typeCfg = ALL_TYPES[asset.tipo] || { label: asset.tipo, icon: '📦', category: 'FISICO', categoryColor: '#78909c', categoryLabel: 'Físico' };
    const catCfg = ASSET_CATEGORIES[typeCfg.category] || ASSET_CATEGORIES.FISICO;
    const statusCfg = ASSET_STATUS_CONFIG[asset.estado] || ASSET_STATUS_CONFIG.activo;

    const valorActual = asset.valorActual || asset.valorCompra || 0;
    const valorizacion = valorActual - (asset.valorCompra || 0);
    const pctValorizacion = (asset.valorCompra || 0) > 0
      ? ((valorizacion / asset.valorCompra) * 100)
      : 0;
    const depreciacion = this._calcDepreciation(asset);

    return `
      <tr class="asset-row" data-id="${asset.id}" data-status="${asset.estado}">
        <td>
          <span class="cat-badge" style="color:${catCfg.color}">
            ${catCfg.icon} ${typeCfg.categoryLabel}
          </span>
        </td>
        <td>
          <span class="type-badge">
            ${typeCfg.icon} ${typeCfg.label}
          </span>
        </td>
        <td class="td-name">
          <strong>${this._esc(asset.nombre)}</strong>
          ${asset.observaciones ? `<small class="obs-preview">${this._esc(asset.observaciones.substring(0, 35))}${asset.observaciones.length > 35 ? '...' : ''}</small>` : ''}
        </td>
        <td>${this._formatCurrency(asset.valorCompra || 0)}</td>
        <td><strong>${this._formatCurrency(valorActual)}</strong></td>
        <td class="${valorizacion >= 0 ? 'text-success' : 'text-danger'}">
          ${valorizacion >= 0 ? '+' : ''}${this._formatCurrency(valorizacion)}
          <small>(${pctValorizacion >= 0 ? '+' : ''}${pctValorizacion.toFixed(1)}%)</small>
        </td>
        <td class="text-danger">
          ${depreciacion > 0 ? `−${this._formatCurrency(depreciacion)}` : '—'}
        </td>
        <td>
          <span class="badge ${statusCfg.badge}">${statusCfg.label}</span>
        </td>
        <td>${this._formatDate(asset.fechaCompra)}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon-sm btn-view" title="Ver detalles" data-id="${asset.id}">👁</button>
            <button class="btn-icon-sm btn-edit" title="Editar" data-id="${asset.id}">✏️</button>
            <button class="btn-icon-sm btn-update-value" title="Actualizar valor" data-id="${asset.id}">💹</button>
            <button class="btn-icon-sm btn-history" title="Historial de valor" data-id="${asset.id}">📜</button>
            <button class="btn-icon-sm btn-delete" title="Eliminar" data-id="${asset.id}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }

  /**
   * Renderiza la vista en grid (tarjetas).
   */
  _renderGrid() {
    const data = this._getFiltered();

    if (data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🏦</div>
          <h3 class="empty-title">Sin activos registrados</h3>
          <p class="empty-desc">Registra tus activos para llevar un control de tu patrimonio.</p>
          <button class="btn btn-primary" id="btnAddAssetEmpty">+ Nuevo Activo</button>
        </div>
      `;
    }

    return `
      <div class="assets-grid">
        ${data.map(a => this._renderGridCard(a)).join('')}
      </div>
    `;
  }

  /**
   * Renderiza una tarjeta de activo para la vista grid.
   */
  _renderGridCard(asset) {
    const typeCfg = ALL_TYPES[asset.tipo] || { label: asset.tipo, icon: '📦', categoryColor: '#78909c' };
    const statusCfg = ASSET_STATUS_CONFIG[asset.estado] || ASSET_STATUS_CONFIG.activo;
    const valorActual = asset.valorActual || asset.valorCompra || 0;
    const valorizacion = valorActual - (asset.valorCompra || 0);
    const pct = (asset.valorCompra || 0) > 0 ? ((valorizacion / asset.valorCompra) * 100) : 0;

    return `
      <div class="asset-card" data-id="${asset.id}" style="--cat-color: ${typeCfg.categoryColor}">
        <div class="asset-card__header">
          <span class="asset-card__icon">${typeCfg.icon}</span>
          <span class="badge ${statusCfg.badge}">${statusCfg.label}</span>
        </div>
        <h3 class="asset-card__name">${this._esc(asset.nombre)}</h3>
        <p class="asset-card__type">${typeCfg.label}</p>
        <div class="asset-card__values">
          <div class="asset-card__value-row">
            <span class="asset-card__label">Valor actual</span>
            <span class="asset-card__amount">${this._formatCurrency(valorActual)}</span>
          </div>
          <div class="asset-card__value-row">
            <span class="asset-card__label">Valorización</span>
            <span class="asset-card__change ${valorizacion >= 0 ? 'positive' : 'negative'}">
              ${valorizacion >= 0 ? '+' : ''}${pct.toFixed(1)}%
            </span>
          </div>
        </div>
        <div class="asset-card__actions">
          <button class="btn-icon-sm btn-view" data-id="${asset.id}" title="Detalles">👁</button>
          <button class="btn-icon-sm btn-edit" data-id="${asset.id}" title="Editar">✏️</button>
          <button class="btn-icon-sm btn-update-value" data-id="${asset.id}" title="Actualizar valor">💹</button>
          <button class="btn-icon-sm btn-delete" data-id="${asset.id}" title="Eliminar">🗑</button>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // EVENTOS
  // ─────────────────────────────────────────────────────────

  /**
   * Vincula todos los eventos del módulo con delegación.
   */
  _bindEvents() {
    if (!this.container) return;
    if (this._eventsBound) return;
    this._eventsBound = true;

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Toggle de vista
      if (btn.classList.contains('btn-view-mode')) {
        this._viewMode = btn.dataset.view;
        this.container.querySelectorAll('.btn-view-mode').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const content = this.container.querySelector('#assetContent');
        if (content) content.innerHTML = this._viewMode === 'grid' ? this._renderGrid() : this._renderTable();
        return;
      }

      // Botones de añadir
      if (btn.id === 'btnAddAsset' || btn.id === 'btnAddAssetEmpty') {
        this._openModalCreate();
        return;
      }

      // Acciones sobre un activo
      const target = btn.closest('[data-id]');
      if (!target) return;
      const id = parseInt(target.dataset.id, 10);

      if (btn.classList.contains('btn-view')) this._openModalDetail(id);
      else if (btn.classList.contains('btn-edit')) this._openModalEdit(id);
      else if (btn.classList.contains('btn-update-value')) this._openModalUpdateValue(id);
      else if (btn.classList.contains('btn-history')) this._openModalHistory(id);
      else if (btn.classList.contains('btn-delete')) this._confirmDelete(id);
    });

    // Filtros de texto
    this.container.addEventListener('input', (e) => {
      if (e.target.id === 'assetSearch') {
        this._filters.search = e.target.value;
        this._refreshContent();
      }
    });

    // Filtros select
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'filterCategory') {
        this._filters.category = e.target.value;
        // Resetear filtro de tipo al cambiar categoría
        this._filters.type = 'all';
        const typeSelect = this.container.querySelector('#filterAssetType');
        if (typeSelect) typeSelect.innerHTML = '<option value="all">Todos los tipos</option>' + this._buildTypeOptions(this._filters.category !== 'all' ? this._filters.category : null);
        this._refreshContent();
      }
      if (e.target.id === 'filterAssetType') {
        this._filters.type = e.target.value;
        this._refreshContent();
      }
      if (e.target.id === 'filterAssetStatus') {
        this._filters.status = e.target.value;
        this._refreshContent();
      }
      if (e.target.id === 'sortAssets') {
        this._filters.sortBy = e.target.value;
        this._refreshContent();
      }

      // Click en tarjeta de categoría
      if (e.target.closest('.category-card')) {
        const cat = e.target.closest('.category-card').dataset.category;
        this._filters.category = cat;
        this._refreshContent();
      }
    });

    // Clic en tarjeta de categoría (summary)
    this.container.addEventListener('click', (e) => {
      const catCard = e.target.closest('.category-card');
      if (catCard) {
        const cat = catCard.dataset.category;
        this._filters.category = this._filters.category === cat ? 'all' : cat;
        this._refreshContent();
      }
    });
  }

  /**
   * Refresca el contenido sin re-renderizar el módulo completo.
   */
  _refreshContent() {
    const content = this.container.querySelector('#assetContent');
    if (content) content.innerHTML = this._viewMode === 'grid' ? this._renderGrid() : this._renderTable();

    const statsEl = this.container.querySelector('#assetStats');
    if (statsEl) statsEl.innerHTML = this._renderStatsCards(this._calcStats());
  }

  // ─────────────────────────────────────────────────────────
  // MODALES
  // ─────────────────────────────────────────────────────────

  /** Abre modal para crear activo. */
  _openModalCreate() {
    this._editingId = null;
    const modal = Modal.open({
      title: '🏦 Nuevo Activo',
      size: 'lg',
      content: this._buildFormHTML(null),
      onConfirm: () => this._handleFormSubmit(),
      confirmText: 'Registrar Activo',
      cancelText: 'Cancelar',
    });
    this._bindFormTypeChange(modal);
  }

  /** Abre modal para editar activo. */
  async _openModalEdit(id) {
    const asset = await this._getById(id);
    if (!asset) return;
    this._editingId = id;

    const modal = Modal.open({
      title: '✏️ Editar Activo',
      size: 'lg',
      content: this._buildFormHTML(asset),
      onConfirm: () => this._handleFormSubmit(),
      confirmText: 'Guardar Cambios',
      cancelText: 'Cancelar',
    });
    this._bindFormTypeChange(modal);
  }

  /** Abre modal de detalle de un activo. */
  async _openModalDetail(id) {
    const asset = await this._getById(id);
    if (!asset) return;

    const typeCfg = ALL_TYPES[asset.tipo] || { label: asset.tipo, icon: '📦', categoryColor: '#78909c', categoryLabel: '—' };
    const catCfg = ASSET_CATEGORIES[typeCfg.category] || ASSET_CATEGORIES.FISICO;
    const statusCfg = ASSET_STATUS_CONFIG[asset.estado] || ASSET_STATUS_CONFIG.activo;
    const valorActual = asset.valorActual || asset.valorCompra || 0;
    const valorizacion = valorActual - (asset.valorCompra || 0);
    const pct = (asset.valorCompra || 0) > 0 ? ((valorizacion / asset.valorCompra) * 100) : 0;
    const depreciacion = this._calcDepreciation(asset);
    const history = await this._getValueHistory(id);

    const histHTML = history.length > 0
      ? `<div class="history-list">
          ${history.slice(-5).reverse().map(h => `
            <div class="history-item">
              <span class="history-date">${this._formatDate(h.fecha)}</span>
              <span class="history-val">${this._formatCurrency(h.valorAnterior)} → ${this._formatCurrency(h.valorNuevo)}</span>
              ${h.nota ? `<small class="history-note">${this._esc(h.nota)}</small>` : ''}
            </div>
          `).join('')}
        </div>`
      : '<p class="detail-empty">Sin cambios de valor registrados.</p>';

    Modal.open({
      title: `${typeCfg.icon} ${this._esc(asset.nombre)}`,
      size: 'xl',
      content: `
        <div class="asset-detail">
          <div class="inv-detail-badges">
            <span class="badge ${statusCfg.badge}">${statusCfg.label}</span>
            <span class="type-badge" style="color:${catCfg.color}">${catCfg.icon} ${typeCfg.categoryLabel}</span>
            <span class="type-badge">${typeCfg.icon} ${typeCfg.label}</span>
          </div>

          <div class="inv-detail-grid">
            <div class="detail-item">
              <span class="detail-label">Valor de Compra</span>
              <span class="detail-value">${this._formatCurrency(asset.valorCompra || 0)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Valor Actual</span>
              <span class="detail-value">${this._formatCurrency(valorActual)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Valorización</span>
              <span class="detail-value ${valorizacion >= 0 ? 'text-success' : 'text-danger'}">
                ${valorizacion >= 0 ? '+' : ''}${this._formatCurrency(valorizacion)}
                (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)
              </span>
            </div>
            ${depreciacion > 0 ? `
              <div class="detail-item">
                <span class="detail-label">Depreciación Estimada</span>
                <span class="detail-value text-danger">−${this._formatCurrency(depreciacion)}</span>
              </div>
            ` : ''}
            <div class="detail-item">
              <span class="detail-label">Fecha de Compra</span>
              <span class="detail-value">${this._formatDate(asset.fechaCompra)}</span>
            </div>
            ${asset.tasaDepreciacion ? `
              <div class="detail-item">
                <span class="detail-label">Tasa Depreciación Anual</span>
                <span class="detail-value">${(asset.tasaDepreciacion * 100).toFixed(0)}%</span>
              </div>
            ` : ''}
          </div>

          ${asset.observaciones ? `
            <div class="detail-obs">
              <span class="detail-label">Observaciones</span>
              <p class="detail-obs-text">${this._esc(asset.observaciones)}</p>
            </div>
          ` : ''}

          <div class="detail-expenses-section">
            <h4 class="detail-section-title">📜 Historial de Valor (últimos 5)</h4>
            ${histHTML}
          </div>
        </div>
      `,
      showConfirm: false,
      cancelText: 'Cerrar',
    });
  }

  /** Abre modal para actualizar el valor de mercado de un activo. */
  async _openModalUpdateValue(id) {
    const asset = await this._getById(id);
    if (!asset) return;

    Modal.open({
      title: `💹 Actualizar Valor — ${this._esc(asset.nombre)}`,
      size: 'md',
      content: `
        <div class="form-group">
          <label class="form-label">Valor Anterior</label>
          <p class="form-static">${this._formatCurrency(asset.valorActual || asset.valorCompra || 0)}</p>
        </div>
        <div class="form-group">
          <label class="form-label">Nuevo Valor de Mercado *</label>
          <input
            type="number"
            id="newValue"
            class="form-control"
            placeholder="0.00"
            min="0"
            step="0.01"
            value="${asset.valorActual || asset.valorCompra || ''}"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de Actualización *</label>
          <input
            type="date"
            id="updateValueDate"
            class="form-control"
            value="${new Date().toISOString().split('T')[0]}"
            required
          />
        </div>
        <div class="form-group">
          <label class="form-label">Nota (opcional)</label>
          <input type="text" id="updateValueNote" class="form-control" placeholder="Ej: tasación, precio de mercado..." />
        </div>
      `,
      onConfirm: () => this._handleUpdateValue(id),
      confirmText: 'Actualizar Valor',
      cancelText: 'Cancelar',
    });
  }

  /** Abre modal del historial de valorización de un activo. */
  async _openModalHistory(id) {
    const asset = await this._getById(id);
    const history = await this._getValueHistory(id);

    const rows = history.length > 0
      ? history.reverse().map(h => `
          <tr>
            <td>${this._formatDate(h.fecha)}</td>
            <td>${this._formatCurrency(h.valorAnterior)}</td>
            <td>${this._formatCurrency(h.valorNuevo)}</td>
            <td class="${h.valorNuevo >= h.valorAnterior ? 'text-success' : 'text-danger'}">
              ${h.valorNuevo >= h.valorAnterior ? '+' : ''}${this._formatCurrency(h.valorNuevo - h.valorAnterior)}
            </td>
            <td>${this._esc(h.nota || '—')}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="5" class="text-center">Sin historial de cambios.</td></tr>`;

    Modal.open({
      title: `📜 Historial — ${this._esc(asset?.nombre || '')}`,
      size: 'lg',
      content: `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Valor Anterior</th>
                <th>Valor Nuevo</th>
                <th>Cambio</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
      showConfirm: false,
      cancelText: 'Cerrar',
    });
  }

  // ─────────────────────────────────────────────────────────
  // FORMULARIO
  // ─────────────────────────────────────────────────────────

  /**
   * Construye el HTML del formulario de activo.
   * @param {Object|null} asset
   */
  _buildFormHTML(asset) {
    const v = asset || {};
    const today = new Date().toISOString().split('T')[0];
    const typeCfg = v.tipo ? ALL_TYPES[v.tipo] : null;
    const showDepreciacion = typeCfg?.deprecia ?? false;

    return `
      <form id="assetForm" class="form-grid" novalidate>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">Nombre del Activo *</label>
            <input
              type="text"
              id="assetNombre"
              class="form-control"
              placeholder="Ej: Honda CB500 2023"
              value="${this._esc(v.nombre || '')}"
              required
            />
          </div>
          <div class="form-group form-group--half">
            <label class="form-label">Estado *</label>
            <select id="assetEstado" class="form-control form-select" required>
              <option value="">Seleccionar...</option>
              ${Object.entries(ASSET_STATUS_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${v.estado === val ? 'selected' : ''}>${cfg.label}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">Categoría *</label>
            <select id="assetCategoria" class="form-control form-select" required>
              <option value="">Seleccionar categoría...</option>
              ${Object.entries(ASSET_CATEGORIES).map(([key, cat]) =>
                `<option value="${key}" ${typeCfg?.category === key ? 'selected' : ''}>${cat.icon} ${cat.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group form-group--half">
            <label class="form-label">Tipo de Activo *</label>
            <select id="assetTipo" class="form-control form-select" required>
              <option value="">Seleccionar tipo...</option>
              ${this._buildTypeOptions(typeCfg?.category || null, v.tipo || null)}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--third">
            <label class="form-label">Valor de Compra *</label>
            <input
              type="number"
              id="assetValorCompra"
              class="form-control"
              placeholder="0.00"
              min="0"
              step="0.01"
              value="${v.valorCompra || ''}"
              required
            />
          </div>
          <div class="form-group form-group--third">
            <label class="form-label">Valor Actual de Mercado</label>
            <input
              type="number"
              id="assetValorActual"
              class="form-control"
              placeholder="0.00 (dejar en blanco = compra)"
              min="0"
              step="0.01"
              value="${v.valorActual || ''}"
            />
          </div>
          <div class="form-group form-group--third">
            <label class="form-label">Fecha de Compra *</label>
            <input
              type="date"
              id="assetFechaCompra"
              class="form-control"
              value="${v.fechaCompra || today}"
              required
            />
          </div>
        </div>

        <!-- Sección depreciación (visible solo si el tipo deprecia) -->
        <div class="form-row" id="depreciacionRow" style="${showDepreciacion ? '' : 'display:none'}">
          <div class="form-group form-group--half">
            <label class="form-label">Tasa de Depreciación Anual (%)</label>
            <input
              type="number"
              id="assetDepreciacion"
              class="form-control"
              placeholder="15 (= 15% anual)"
              min="0"
              max="100"
              step="0.1"
              value="${v.tasaDepreciacion ? (v.tasaDepreciacion * 100) : ''}"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Observaciones</label>
          <textarea
            id="assetObservaciones"
            class="form-control form-textarea"
            placeholder="Detalles, condición, ubicación, número de serie..."
            rows="3"
          >${this._esc(v.observaciones || '')}</textarea>
        </div>

        <div id="assetFormError" class="form-error hidden"></div>
      </form>
    `;
  }

  /**
   * Vincula el evento de cambio de categoría en el formulario
   * para actualizar dinámicamente los tipos disponibles.
   */
  _bindFormTypeChange(root = document) {
    // Usar MutationObserver para esperar a que el modal renderice
    const tryBind = () => {
      const catSelect = root.querySelector('#assetCategoria');
      const typeSelect = root.querySelector('#assetTipo');
      const depRow = root.querySelector('#depreciacionRow');

      if (!catSelect || !typeSelect) {
        setTimeout(tryBind, 50);
        return;
      }

      catSelect.addEventListener('change', () => {
        const cat = catSelect.value;
        typeSelect.innerHTML = cat
          ? `<option value="">Seleccionar tipo...</option>${this._buildTypeOptions(cat)}`
          : '<option value="">Selecciona categoría primero</option>';
      });

      typeSelect.addEventListener('change', () => {
        const typeCfg = ALL_TYPES[typeSelect.value];
        if (depRow) depRow.style.display = typeCfg?.deprecia ? '' : 'none';
      });
    };
    setTimeout(tryBind, 80);
  }

  /**
   * Genera opciones HTML para el selector de tipos.
   * @param {string|null} filterCategory - Filtrar por categoría
   * @param {string|null} selectedType   - Tipo preseleccionado
   * @returns {string}
   */
  _buildTypeOptions(filterCategory = null, selectedType = null) {
    let html = '';
    Object.entries(ASSET_CATEGORIES).forEach(([catKey, cat]) => {
      if (filterCategory && filterCategory !== catKey) return;
      Object.entries(cat.types).forEach(([typeKey, typeCfg]) => {
        html += `<option value="${typeKey}" ${selectedType === typeKey ? 'selected' : ''}>${typeCfg.icon} ${typeCfg.label}</option>`;
      });
    });
    return html;
  }

  // ─────────────────────────────────────────────────────────
  // CRUD — ACTIVOS
  // ─────────────────────────────────────────────────────────

  /**
   * Maneja el envío del formulario de creación/edición de activo.
   */
  async _handleFormSubmit() {
    const errEl = document.getElementById('assetFormError');
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); } };
    const hideErr = () => errEl?.classList.add('hidden');

    const nombre = document.getElementById('assetNombre')?.value.trim();
    const estado = document.getElementById('assetEstado')?.value;
    const tipo = document.getElementById('assetTipo')?.value;
    const valorCompra = parseFloat(document.getElementById('assetValorCompra')?.value || 0);
    const valorActualRaw = parseFloat(document.getElementById('assetValorActual')?.value || 0);
    const valorActual = valorActualRaw > 0 ? valorActualRaw : valorCompra;
    const fechaCompra = document.getElementById('assetFechaCompra')?.value;
    const depreciacionPct = parseFloat(document.getElementById('assetDepreciacion')?.value || 0);
    const observaciones = document.getElementById('assetObservaciones')?.value.trim();

    if (!nombre) return showErr('El nombre es obligatorio.');
    if (!tipo) return showErr('Selecciona el tipo de activo.');
    if (!valorCompra || valorCompra <= 0) return showErr('El valor de compra debe ser mayor a 0.');
    if (!fechaCompra) return showErr('La fecha de compra es obligatoria.');
    if (!estado) return showErr('Selecciona el estado del activo.');
    hideErr();

    const assetData = {
      nombre,
      tipo,
      estado,
      valorCompra,
      valorActual,
      fechaCompra,
      tasaDepreciacion: depreciacionPct > 0 ? (depreciacionPct / 100) : null,
      observaciones,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (this._editingId) {
        const existing = await this._getById(this._editingId);
        assetData.id = this._editingId;
        assetData.createdAt = existing?.createdAt || new Date().toISOString();
        await Storage.update(STORE_ASSETS, assetData);
        this._logHistory('asset_updated', assetData);
      } else {
        assetData.createdAt = new Date().toISOString();
        const id = await Storage.add(STORE_ASSETS, assetData);
        assetData.id = id;
        this._logHistory('asset_created', assetData);
      }

      Modal.close();
      await this._loadCache();
      this._render();
      this._bindEvents();

      // Notificar integraciones
      this._notifyFinance('asset', assetData);
      this._notifyDashboard();

      this._showToast(
        this._editingId ? 'Activo actualizado ✓' : 'Activo registrado ✓',
        'success'
      );
    } catch (err) {
      console.error('[Assets] Error guardando activo:', err);
      showErr('Error al guardar. Intenta de nuevo.');
    }
  }

  /**
   * Maneja la actualización del valor de un activo.
   * Guarda el cambio en el historial de valorización.
   * @param {number} id
   */
  async _handleUpdateValue(id) {
    const nuevoValor = parseFloat(document.getElementById('newValue')?.value || 0);
    const fecha = document.getElementById('updateValueDate')?.value;
    const nota = document.getElementById('updateValueNote')?.value.trim();

    if (!nuevoValor || nuevoValor < 0) return this._showToast('El valor debe ser válido.', 'error');
    if (!fecha) return this._showToast('La fecha es obligatoria.', 'error');

    try {
      const asset = await this._getById(id);
      if (!asset) return;

      // Guardar en historial de valor
      const histEntry = {
        assetId: id,
        valorAnterior: asset.valorActual || asset.valorCompra || 0,
        valorNuevo: nuevoValor,
        fecha,
        nota,
        createdAt: new Date().toISOString(),
      };
      await Storage.add(STORE_ASSET_HISTORY, histEntry);

      // Actualizar valor actual del activo
      asset.valorActual = nuevoValor;
      asset.updatedAt = new Date().toISOString();
      await Storage.update(STORE_ASSETS, asset);

      this._logHistory('asset_value_updated', { id, valorAnterior: histEntry.valorAnterior, valorNuevo: nuevoValor });

      Modal.close();
      await this._loadCache();
      this._render();
      this._bindEvents();
      this._notifyFinance('asset_update', asset);
      this._notifyDashboard();

      this._showToast('Valor actualizado ✓', 'success');
    } catch (err) {
      console.error('[Assets] Error actualizando valor:', err);
      this._showToast('Error al actualizar el valor.', 'error');
    }
  }

  /**
   * Solicita confirmación y elimina un activo.
   * @param {number} id
   */
  async _confirmDelete(id) {
    const asset = await this._getById(id);
    if (!asset) return;

    Modal.confirm({
      title: '🗑 Eliminar Activo',
      message: `¿Eliminar el activo "<strong>${this._esc(asset.nombre)}</strong>"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await Storage.delete(STORE_ASSETS, id);
          // Eliminar historial de valor
          const hist = await this._getValueHistory(id);
          for (const h of hist) await Storage.delete(STORE_ASSET_HISTORY, h.id);

          this._logHistory('asset_deleted', { id, nombre: asset.nombre });

          await this._loadCache();
          this._render();
          this._bindEvents();
          this._notifyDashboard();
          this._showToast('Activo eliminado.', 'info');
        } catch (err) {
          console.error('[Assets] Error eliminando activo:', err);
          this._showToast('Error al eliminar.', 'error');
        }
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // ACCESO A DATOS
  // ─────────────────────────────────────────────────────────

  /** Obtiene un activo por ID. */
  async _getById(id) {
    try {
      return await Storage.getById(STORE_ASSETS, id);
    } catch {
      return this._cache.find(a => a.id === id) || null;
    }
  }

  /** Obtiene el historial de valorización de un activo. */
  async _getValueHistory(assetId) {
    try {
      const all = await Storage.getAll(STORE_ASSET_HISTORY) || [];
      return all.filter(h => h.assetId === assetId).sort(
        (a, b) => new Date(a.fecha) - new Date(b.fecha)
      );
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTEGRACIÓN CON FINANCE.JS
  // ─────────────────────────────────────────────────────────

  /**
   * Notifica al módulo de finanzas.
   * Afecta: capital total, balances, patrimonio neto.
   */
  _notifyFinance(eventType, data) {
    if (typeof this._onFinanceUpdate === 'function') {
      this._onFinanceUpdate({ source: 'assets', eventType, data });
      return;
    }
    window.dispatchEvent(new CustomEvent('finance:update', {
      detail: { source: 'assets', eventType, data },
    }));
  }

  // ─────────────────────────────────────────────────────────
  // INTEGRACIÓN CON DASHBOARD.JS
  // ─────────────────────────────────────────────────────────

  /**
   * Notifica al dashboard para actualizar tarjetas.
   */
  _notifyDashboard() {
    const stats = this._calcStats();
    if (typeof this._onDashboardUpdate === 'function') {
      this._onDashboardUpdate({ source: 'assets', stats });
      return;
    }
    window.dispatchEvent(new CustomEvent('dashboard:update', {
      detail: { source: 'assets', stats },
    }));
  }

  /**
   * Método público: retorna datos para el dashboard.
   * @returns {Object}
   */
  async getDashboardData() {
    await this._loadCache();
    return this._calcStats();
  }

  /**
   * Método público: retorna valor total de activos activos.
   * Usado por finance.js para calcular patrimonio neto.
   * @returns {number}
   */
  async getTotalActiveValue() {
    await this._loadCache();
    return this._cache
      .filter(a => a.estado === 'activo')
      .reduce((s, a) => s + (a.valorActual || a.valorCompra || 0), 0);
  }

  // ─────────────────────────────────────────────────────────
  // HISTORIAL (PREPARADO PARA history.js FUTURO)
  // ─────────────────────────────────────────────────────────

  /**
   * Registra una acción en el historial futuro.
   * @param {string} action
   * @param {Object} data
   */
  _logHistory(action, data) {
    const entry = {
      module: 'assets',
      action,
      data,
      timestamp: new Date().toISOString(),
    };

    if (typeof window._historyModule?.log === 'function') {
      window._historyModule.log(entry);
      return;
    }

    Storage.add('history', entry).catch(() => {
      // Store history aún no existe — falla silenciosamente
    });

  }

  // ─────────────────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────────────────

  _formatCurrency(n) {
    if (isNaN(n)) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }

  _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _showToast(message, type = 'info') {
    if (window.AppToast) {
      window.AppToast.show(message, type);
      return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: #fff; padding: 12px 20px; border-radius: 8px;
      font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

// ─────────────────────────────────────────────────────────────
// INSTANCIA SINGLETON EXPORTADA
// ─────────────────────────────────────────────────────────────

/** Instancia global del módulo (singleton) */
export const Assets = new AssetsModule();

/**
 * Función de conveniencia para inicializar el módulo desde router.js o app.js.
 *
 * Uso:
 *   import { initAssets } from './modules/assets.js';
 *   await initAssets(document.getElementById('main-content'));
 *
 * @param {HTMLElement} container
 * @param {Object} callbacks
 */
export async function initAssets(container, callbacks = {}) {
  await Assets.init(container, callbacks);
}

