/**
 * ============================================================
 * investments.js — Módulo de Inversiones
 * ============================================================
 * Sistema completo de gestión de inversiones para el proyecto
 * /cuentas. Maneja trading, cripto, ganado, caballos, software,
 * negocios, motos, carros, relojes y más.
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
const STORE_INVESTMENTS = 'investments';
const STORE_INV_EXPENSES = 'investment_expenses';
const STORE_INV_OPERATIONS = 'investment_operations'; // trading/cripto

/** Tipos de inversión disponibles */
export const INVESTMENT_TYPES = {
  TRADING: 'trading',
  CRYPTO: 'criptomonedas',
  GANADO: 'ganado',
  CABALLOS: 'caballos',
  REVENTA: 'reventa',
  SOFTWARE: 'software',
  NEGOCIOS: 'negocios',
  MOTOS: 'motos',
  CARROS: 'carros',
  RELOJES: 'relojes',
  OTROS: 'otros',
};

/** Etiquetas de visualización por tipo */
const TYPE_LABELS = {
  trading: { label: 'Trading', icon: '📈', color: '#00d4aa' },
  criptomonedas: { label: 'Criptomonedas', icon: '₿', color: '#f7931a' },
  ganado: { label: 'Ganado', icon: '🐄', color: '#8bc34a' },
  caballos: { label: 'Caballos', icon: '🐎', color: '#795548' },
  reventa: { label: 'Reventa', icon: '🔄', color: '#9c27b0' },
  software: { label: 'Software', icon: '💻', color: '#2196f3' },
  negocios: { label: 'Negocios', icon: '🏢', color: '#ff9800' },
  motos: { label: 'Motos', icon: '🏍️', color: '#f44336' },
  carros: { label: 'Carros', icon: '🚗', color: '#607d8b' },
  relojes: { label: 'Relojes', icon: '⌚', color: '#e91e63' },
  otros: { label: 'Otros', icon: '📦', color: '#78909c' },
};

/** Niveles de riesgo */
export const RISK_LEVELS = {
  BAJO: 'bajo',
  MEDIO: 'medio',
  ALTO: 'alto',
  MUY_ALTO: 'muy_alto',
};

const RISK_CONFIG = {
  bajo: { label: 'Bajo', color: '#4caf50', badge: 'badge-success' },
  medio: { label: 'Medio', color: '#ff9800', badge: 'badge-warning' },
  alto: { label: 'Alto', color: '#f44336', badge: 'badge-danger' },
  muy_alto: { label: 'Muy Alto', color: '#9c27b0', badge: 'badge-purple' },
};

/** Estados de inversión */
export const INVESTMENT_STATUS = {
  ACTIVA: 'activa',
  PAUSADA: 'pausada',
  VENDIDA: 'vendida',
  PERDIDA: 'pérdida',
  FINALIZADA: 'finalizada',
};

const STATUS_CONFIG = {
  activa: { label: 'Activa', color: '#4caf50', badge: 'badge-success' },
  pausada: { label: 'Pausada', color: '#ff9800', badge: 'badge-warning' },
  vendida: { label: 'Vendida', color: '#2196f3', badge: 'badge-info' },
  'pérdida': { label: 'Pérdida', color: '#f44336', badge: 'badge-danger' },
  finalizada: { label: 'Finalizada', color: '#78909c', badge: 'badge-neutral' },
};

/** Categorías de gasto asociado */
const EXPENSE_CATEGORIES = [
  'mantenimiento',
  'transporte',
  'alimentación',
  'comisiones',
  'impuestos',
  'herramientas',
  'otros',
];

// ─────────────────────────────────────────────────────────────
// CLASE PRINCIPAL: InvestmentsModule
// ─────────────────────────────────────────────────────────────

export class InvestmentsModule {
  constructor() {
    /** Referencia al contenedor principal del módulo */
    this.container = null;

    /** Caché local de inversiones (evita consultas repetidas a IDB) */
    this._cache = [];

    /** Estado de filtros activos */
    this._filters = {
      type: 'all',
      status: 'all',
      risk: 'all',
      search: '',
      sortBy: 'fecha',
      sortDir: 'desc',
    };

    /** Referencias a callbacks de integración */
    this._onFinanceUpdate = null;
    this._onDashboardUpdate = null;

    /** ID de la inversión actualmente en edición */
    this._editingId = null;
    this._eventsBound = false;
  }

  // ─────────────────────────────────────────────────────────
  // INICIALIZACIÓN
  // ─────────────────────────────────────────────────────────

  /**
   * Inicializa el módulo: carga datos, renderiza vista.
   * @param {HTMLElement} container - Elemento raíz donde renderizar.
   * @param {Object} callbacks - { onFinanceUpdate, onDashboardUpdate }
   */
  async init(container, callbacks = {}) {
    this.container = container;
    this._onFinanceUpdate = callbacks.onFinanceUpdate || null;
    this._onDashboardUpdate = callbacks.onDashboardUpdate || null;

    // Asegurar que los stores existen en IndexedDB
    await this._ensureStores();

    // Cargar datos iniciales
    await this._loadCache();

    // Renderizar interfaz
    this._render();

    // Vincular eventos globales del módulo
    this._bindEvents();

    console.log('[Investments] Módulo inicializado correctamente.');
  }

  /**
   * Asegura que los object stores necesarios existen en IndexedDB.
   */
  async _ensureStores() {
    try {
      await DB.ensureStore(STORE_INVESTMENTS, { keyPath: 'id', autoIncrement: true });
      await DB.ensureStore(STORE_INV_EXPENSES, { keyPath: 'id', autoIncrement: true });
      await DB.ensureStore(STORE_INV_OPERATIONS, { keyPath: 'id', autoIncrement: true });
    } catch (err) {
      console.warn('[Investments] No se pudieron verificar stores:', err);
    }
  }

  /**
   * Carga todas las inversiones desde IndexedDB al caché local.
   */
  async _loadCache() {
    try {
      this._cache = await Storage.getAll(STORE_INVESTMENTS) || [];
    } catch (err) {
      console.error('[Investments] Error cargando inversiones:', err);
      this._cache = [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // RENDERIZADO PRINCIPAL
  // ─────────────────────────────────────────────────────────

  /**
   * Renderiza la vista completa del módulo de inversiones.
   */
  _render() {
    if (!this.container) return;

    const stats = this._calcStats();

    this.container.innerHTML = `
      <div class="investments-module module-container">

        <!-- ENCABEZADO -->
        <div class="module-header">
          <div class="module-title-group">
            <h2 class="module-title">
              <span class="module-icon">📈</span>
              Inversiones
            </h2>
            <p class="module-subtitle">Gestión completa de portafolio de inversiones</p>
          </div>
          <div class="module-actions">
            <button class="btn btn-primary btn-add-investment" id="btnAddInvestment">
              <span class="btn-icon">+</span>
              Nueva Inversión
            </button>
          </div>
        </div>

        <!-- TARJETAS RESUMEN -->
        <div class="stats-grid" id="investmentStats">
          ${this._renderStatsCards(stats)}
        </div>

        <!-- FILTROS Y BÚSQUEDA -->
        <div class="filter-bar" id="investmentFilters">
          <div class="filter-search">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              id="investmentSearch"
              class="filter-input"
              placeholder="Buscar inversión..."
              value="${this._filters.search}"
            />
          </div>
          <div class="filter-selects">
            <select id="filterType" class="filter-select">
              <option value="all">Todos los tipos</option>
              ${Object.entries(TYPE_LABELS).map(([val, cfg]) =>
                `<option value="${val}" ${this._filters.type === val ? 'selected' : ''}>
                  ${cfg.icon} ${cfg.label}
                </option>`
              ).join('')}
            </select>
            <select id="filterStatus" class="filter-select">
              <option value="all">Todos los estados</option>
              ${Object.entries(STATUS_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${this._filters.status === val ? 'selected' : ''}>
                  ${cfg.label}
                </option>`
              ).join('')}
            </select>
            <select id="filterRisk" class="filter-select">
              <option value="all">Todo el riesgo</option>
              ${Object.entries(RISK_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${this._filters.risk === val ? 'selected' : ''}>
                  ${cfg.label}
                </option>`
              ).join('')}
            </select>
            <select id="sortInvestments" class="filter-select">
              <option value="fecha_desc">Más recientes</option>
              <option value="fecha_asc">Más antiguas</option>
              <option value="capital_desc">Mayor capital</option>
              <option value="roi_desc">Mayor ROI</option>
              <option value="nombre_asc">A - Z</option>
            </select>
          </div>
        </div>

        <!-- TABLA DE INVERSIONES -->
        <div class="table-wrapper" id="investmentTableWrapper">
          ${this._renderTable()}
        </div>

      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // TARJETAS DE ESTADÍSTICAS
  // ─────────────────────────────────────────────────────────

  /**
   * Calcula estadísticas globales del portafolio.
   * @returns {Object} stats
   */
  _calcStats() {
    const active = this._cache.filter(i => i.estado === 'activa');
    const totalCapital = this._cache.reduce((s, i) => s + (i.capitalInvertido || 0), 0);
    const totalGanancias = this._cache.reduce((s, i) => s + (i.ganancias || 0), 0);
    const totalGastos = this._cache.reduce((s, i) => s + (i.totalGastos || 0), 0);
    const totalValorActual = this._cache.reduce((s, i) => s + (i.valorActual || i.capitalInvertido || 0), 0);
    const balance = totalValorActual + totalGanancias - totalCapital - totalGastos;
    const roi = totalCapital > 0 ? ((balance / totalCapital) * 100) : 0;
    const positivas = this._cache.filter(i => (i.ganancias || 0) > 0).length;

    return {
      totalInversiones: this._cache.length,
      activas: active.length,
      totalCapital,
      totalGanancias,
      totalGastos,
      balance,
      roi,
      positivas,
    };
  }

  /**
   * Renderiza las tarjetas de métricas principales.
   */
  _renderStatsCards(stats) {
    const fmt = (n) => this._formatCurrency(n);
    const roiPositivo = stats.roi >= 0;

    return `
      <div class="stat-card stat-card--capital">
        <div class="stat-icon">💰</div>
        <div class="stat-info">
          <span class="stat-label">Capital Total</span>
          <span class="stat-value">${fmt(stats.totalCapital)}</span>
          <span class="stat-detail">${stats.totalInversiones} inversión(es)</span>
        </div>
      </div>
      <div class="stat-card stat-card--active">
        <div class="stat-icon">⚡</div>
        <div class="stat-info">
          <span class="stat-label">Activas</span>
          <span class="stat-value">${stats.activas}</span>
          <span class="stat-detail">de ${stats.totalInversiones} total</span>
        </div>
      </div>
      <div class="stat-card stat-card--gains ${stats.totalGanancias >= 0 ? 'positive' : 'negative'}">
        <div class="stat-icon">${stats.totalGanancias >= 0 ? '📈' : '📉'}</div>
        <div class="stat-info">
          <span class="stat-label">Ganancias</span>
          <span class="stat-value">${fmt(stats.totalGanancias)}</span>
          <span class="stat-detail">${stats.positivas} inversión(es) positivas</span>
        </div>
      </div>
      <div class="stat-card stat-card--roi ${roiPositivo ? 'positive' : 'negative'}">
        <div class="stat-icon">🎯</div>
        <div class="stat-info">
          <span class="stat-label">ROI Global</span>
          <span class="stat-value">${roiPositivo ? '+' : ''}${stats.roi.toFixed(2)}%</span>
          <span class="stat-detail">Balance: ${fmt(stats.balance)}</span>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // TABLA DINÁMICA
  // ─────────────────────────────────────────────────────────

  /**
   * Aplica filtros y retorna inversiones filtradas/ordenadas.
   */
  _getFiltered() {
    let data = [...this._cache];

    // Filtro por búsqueda
    if (this._filters.search) {
      const q = this._filters.search.toLowerCase();
      data = data.filter(i =>
        (i.nombre || '').toLowerCase().includes(q) ||
        (i.tipo || '').toLowerCase().includes(q) ||
        (i.observaciones || '').toLowerCase().includes(q)
      );
    }

    // Filtro por tipo
    if (this._filters.type !== 'all') {
      data = data.filter(i => i.tipo === this._filters.type);
    }

    // Filtro por estado
    if (this._filters.status !== 'all') {
      data = data.filter(i => i.estado === this._filters.status);
    }

    // Filtro por riesgo
    if (this._filters.risk !== 'all') {
      data = data.filter(i => i.riesgo === this._filters.risk);
    }

    // Ordenamiento
    const [sortField, sortDir] = (this._filters.sortBy || 'fecha_desc').split('_');
    data.sort((a, b) => {
      let va, vb;
      if (sortField === 'fecha') {
        va = new Date(a.fechaInversion || 0).getTime();
        vb = new Date(b.fechaInversion || 0).getTime();
      } else if (sortField === 'capital') {
        va = a.capitalInvertido || 0;
        vb = b.capitalInvertido || 0;
      } else if (sortField === 'roi') {
        va = this._calcROI(a);
        vb = this._calcROI(b);
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
   * Calcula el ROI de una inversión individual.
   */
  _calcROI(inv) {
    const capital = inv.capitalInvertido || 0;
    if (capital === 0) return 0;
    const ganancia = (inv.ganancias || 0) - (inv.totalGastos || 0);
    return (ganancia / capital) * 100;
  }

  /**
   * Renderiza la tabla de inversiones usando tables.js existente.
   * Si Tables no está disponible, genera HTML directo.
   */
  _renderTable() {
    const data = this._getFiltered();

    if (data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📊</div>
          <h3 class="empty-title">Sin inversiones registradas</h3>
          <p class="empty-desc">Agrega tu primera inversión para comenzar a trackear tu portafolio.</p>
          <button class="btn btn-primary btn-add-investment">+ Nueva Inversión</button>
        </div>
      `;
    }

    const rows = data.map(inv => this._renderRow(inv)).join('');

    return `
      <div class="table-responsive">
        <table class="data-table investments-table" id="investmentsTable">
          <thead>
            <tr>
              <th class="th-type">Tipo</th>
              <th class="th-name">Nombre</th>
              <th class="th-capital">Capital</th>
              <th class="th-value">Valor Actual</th>
              <th class="th-gains">Ganancia/Pérdida</th>
              <th class="th-roi">ROI</th>
              <th class="th-risk">Riesgo</th>
              <th class="th-status">Estado</th>
              <th class="th-date">Fecha</th>
              <th class="th-actions">Acciones</th>
            </tr>
          </thead>
          <tbody id="investmentsBody">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renderiza una fila de la tabla para una inversión.
   */
  _renderRow(inv) {
    const typeCfg = TYPE_LABELS[inv.tipo] || TYPE_LABELS.otros;
    const statusCfg = STATUS_CONFIG[inv.estado] || STATUS_CONFIG.activa;
    const riskCfg = RISK_CONFIG[inv.riesgo] || RISK_CONFIG.medio;
    const roi = this._calcROI(inv);
    const gananciaNet = (inv.ganancias || 0) - (inv.totalGastos || 0);
    const valorActual = inv.valorActual || inv.capitalInvertido || 0;

    return `
      <tr class="inv-row" data-id="${inv.id}" data-status="${inv.estado}">
        <td class="td-type">
          <span class="type-badge" style="color:${typeCfg.color}">
            ${typeCfg.icon} ${typeCfg.label}
          </span>
        </td>
        <td class="td-name">
          <strong class="inv-name">${this._esc(inv.nombre)}</strong>
          ${inv.observaciones ? `<small class="inv-obs">${this._esc(inv.observaciones.substring(0, 40))}${inv.observaciones.length > 40 ? '...' : ''}</small>` : ''}
        </td>
        <td class="td-capital">${this._formatCurrency(inv.capitalInvertido || 0)}</td>
        <td class="td-value">${this._formatCurrency(valorActual)}</td>
        <td class="td-gains ${gananciaNet >= 0 ? 'text-success' : 'text-danger'}">
          ${gananciaNet >= 0 ? '+' : ''}${this._formatCurrency(gananciaNet)}
        </td>
        <td class="td-roi ${roi >= 0 ? 'text-success' : 'text-danger'}">
          ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%
        </td>
        <td class="td-risk">
          <span class="badge ${riskCfg.badge}">${riskCfg.label}</span>
        </td>
        <td class="td-status">
          <span class="badge ${statusCfg.badge}">${statusCfg.label}</span>
        </td>
        <td class="td-date">${this._formatDate(inv.fechaInversion)}</td>
        <td class="td-actions">
          <div class="action-btns">
            <button class="btn-icon-sm btn-view" title="Ver detalles" data-id="${inv.id}">👁</button>
            <button class="btn-icon-sm btn-edit" title="Editar" data-id="${inv.id}">✏️</button>
            <button class="btn-icon-sm btn-expense" title="Agregar gasto" data-id="${inv.id}">💸</button>
            <button class="btn-icon-sm btn-delete" title="Eliminar" data-id="${inv.id}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // EVENTOS
  // ─────────────────────────────────────────────────────────

  /**
   * Vincula todos los eventos del módulo usando delegación de eventos.
   */
  _bindEvents() {
    if (!this.container) return;
    if (this._eventsBound) return;
    this._eventsBound = true;

    // Delegación de eventos en el contenedor principal
    this.container.addEventListener('click', (e) => {
      const target = e.target.closest('[data-id]');
      const btn = e.target.closest('button');

      // Botón nueva inversión
      if (btn && (btn.classList.contains('btn-add-investment') || btn.id === 'btnAddInvestment')) {
        this._openModalCreate();
        return;
      }

      if (!target) return;
      const id = parseInt(target.dataset.id, 10);

      if (btn?.classList.contains('btn-view')) this._openModalDetail(id);
      else if (btn?.classList.contains('btn-edit')) this._openModalEdit(id);
      else if (btn?.classList.contains('btn-expense')) this._openModalExpense(id);
      else if (btn?.classList.contains('btn-delete')) this._confirmDelete(id);
    });

    // Búsqueda en tiempo real
    this.container.addEventListener('input', (e) => {
      if (e.target.id === 'investmentSearch') {
        this._filters.search = e.target.value;
        this._refreshTable();
      }
    });

    // Filtros select
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'filterType') {
        this._filters.type = e.target.value;
        this._refreshTable();
      }
      if (e.target.id === 'filterStatus') {
        this._filters.status = e.target.value;
        this._refreshTable();
      }
      if (e.target.id === 'filterRisk') {
        this._filters.risk = e.target.value;
        this._refreshTable();
      }
      if (e.target.id === 'sortInvestments') {
        this._filters.sortBy = e.target.value;
        this._refreshTable();
      }
    });
  }

  /**
   * Refresca solo la tabla y las estadísticas sin re-renderizar todo.
   */
  _refreshTable() {
    const wrapper = this.container.querySelector('#investmentTableWrapper');
    if (wrapper) wrapper.innerHTML = this._renderTable();

    const statsEl = this.container.querySelector('#investmentStats');
    if (statsEl) statsEl.innerHTML = this._renderStatsCards(this._calcStats());
  }

  // ─────────────────────────────────────────────────────────
  // MODALES
  // ─────────────────────────────────────────────────────────

  /**
   * Abre el modal para crear una nueva inversión.
   */
  _openModalCreate() {
    this._editingId = null;
    Modal.open({
      title: '📈 Nueva Inversión',
      size: 'lg',
      content: this._buildFormHTML(null),
      onConfirm: () => this._handleFormSubmit(),
      confirmText: 'Registrar Inversión',
      cancelText: 'Cancelar',
    });
  }

  /**
   * Abre el modal para editar una inversión existente.
   * @param {number} id
   */
  async _openModalEdit(id) {
    const inv = await this._getById(id);
    if (!inv) return;
    this._editingId = id;

    Modal.open({
      title: '✏️ Editar Inversión',
      size: 'lg',
      content: this._buildFormHTML(inv),
      onConfirm: () => this._handleFormSubmit(),
      confirmText: 'Guardar Cambios',
      cancelText: 'Cancelar',
    });
  }

  /**
   * Abre el modal de detalle completo de una inversión.
   * @param {number} id
   */
  async _openModalDetail(id) {
    const inv = await this._getById(id);
    if (!inv) return;

    const expenses = await this._getExpenses(id);
    const roi = this._calcROI(inv);
    const typeCfg = TYPE_LABELS[inv.tipo] || TYPE_LABELS.otros;
    const statusCfg = STATUS_CONFIG[inv.estado] || STATUS_CONFIG.activa;
    const riskCfg = RISK_CONFIG[inv.riesgo] || RISK_CONFIG.medio;
    const gananciaNet = (inv.ganancias || 0) - (inv.totalGastos || 0);

    const expensesHTML = expenses.length > 0
      ? expenses.map(ex => `
          <div class="detail-expense-row">
            <span class="detail-expense-cat">${ex.categoria}</span>
            <span class="detail-expense-desc">${this._esc(ex.descripcion || '')}</span>
            <span class="detail-expense-amount">${this._formatCurrency(ex.monto)}</span>
            <small class="detail-expense-date">${this._formatDate(ex.fecha)}</small>
          </div>
        `).join('')
      : '<p class="detail-empty-expenses">Sin gastos registrados.</p>';

    Modal.open({
      title: `${typeCfg.icon} ${this._esc(inv.nombre)}`,
      size: 'xl',
      content: `
        <div class="inv-detail">
          <div class="inv-detail-badges">
            <span class="badge ${statusCfg.badge}">${statusCfg.label}</span>
            <span class="badge ${riskCfg.badge}">Riesgo ${riskCfg.label}</span>
            <span class="type-badge" style="color:${typeCfg.color}">${typeCfg.icon} ${typeCfg.label}</span>
          </div>

          <div class="inv-detail-grid">
            <div class="detail-item">
              <span class="detail-label">Capital Invertido</span>
              <span class="detail-value">${this._formatCurrency(inv.capitalInvertido || 0)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Valor Actual</span>
              <span class="detail-value">${this._formatCurrency(inv.valorActual || inv.capitalInvertido || 0)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Ganancias Brutas</span>
              <span class="detail-value ${(inv.ganancias || 0) >= 0 ? 'text-success' : 'text-danger'}">
                ${this._formatCurrency(inv.ganancias || 0)}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Total Gastos</span>
              <span class="detail-value text-danger">${this._formatCurrency(inv.totalGastos || 0)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Ganancia Neta</span>
              <span class="detail-value ${gananciaNet >= 0 ? 'text-success' : 'text-danger'}">
                ${gananciaNet >= 0 ? '+' : ''}${this._formatCurrency(gananciaNet)}
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">ROI</span>
              <span class="detail-value ${roi >= 0 ? 'text-success' : 'text-danger'}">
                ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%
              </span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Rentabilidad</span>
              <span class="detail-value">${inv.rentabilidad || 'N/A'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fecha Inversión</span>
              <span class="detail-value">${this._formatDate(inv.fechaInversion)}</span>
            </div>
          </div>

          ${inv.observaciones ? `
            <div class="detail-obs">
              <span class="detail-label">Observaciones</span>
              <p class="detail-obs-text">${this._esc(inv.observaciones)}</p>
            </div>
          ` : ''}

          <div class="detail-expenses-section">
            <h4 class="detail-section-title">💸 Gastos Asociados</h4>
            ${expensesHTML}
          </div>
        </div>
      `,
      showConfirm: false,
      cancelText: 'Cerrar',
    });
  }

  /**
   * Abre el modal para agregar un gasto a una inversión.
   * @param {number} id - ID de la inversión
   */
  async _openModalExpense(id) {
    const inv = await this._getById(id);
    if (!inv) return;

    Modal.open({
      title: `💸 Agregar Gasto — ${this._esc(inv.nombre)}`,
      size: 'md',
      content: `
        <div class="form-group">
          <label class="form-label">Categoría *</label>
          <select id="expCat" class="form-control form-select" required>
            <option value="">Seleccionar...</option>
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" id="expDesc" class="form-control" placeholder="Descripción del gasto..." />
        </div>
        <div class="form-group">
          <label class="form-label">Monto *</label>
          <input type="number" id="expMonto" class="form-control" placeholder="0.00" min="0" step="0.01" required />
        </div>
        <div class="form-group">
          <label class="form-label">Fecha *</label>
          <input type="date" id="expFecha" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
        </div>
      `,
      onConfirm: () => this._handleExpenseSubmit(id),
      confirmText: 'Agregar Gasto',
      cancelText: 'Cancelar',
    });
  }

  // ─────────────────────────────────────────────────────────
  // FORMULARIOS
  // ─────────────────────────────────────────────────────────

  /**
   * Construye el HTML del formulario de creación/edición.
   * @param {Object|null} inv - Datos de la inversión (null = nueva)
   */
  _buildFormHTML(inv) {
    const v = inv || {};
    const today = new Date().toISOString().split('T')[0];

    return `
      <form id="invForm" class="form-grid" novalidate>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">Nombre de la Inversión *</label>
            <input
              type="text"
              id="invNombre"
              class="form-control"
              placeholder="Ej: BTC largo plazo"
              value="${this._esc(v.nombre || '')}"
              required
            />
          </div>
          <div class="form-group form-group--half">
            <label class="form-label">Tipo de Inversión *</label>
            <select id="invTipo" class="form-control form-select" required>
              <option value="">Seleccionar tipo...</option>
              ${Object.entries(TYPE_LABELS).map(([val, cfg]) =>
                `<option value="${val}" ${v.tipo === val ? 'selected' : ''}>
                  ${cfg.icon} ${cfg.label}
                </option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--third">
            <label class="form-label">Capital Invertido *</label>
            <input
              type="number"
              id="invCapital"
              class="form-control"
              placeholder="0.00"
              min="0"
              step="0.01"
              value="${v.capitalInvertido || ''}"
              required
            />
          </div>
          <div class="form-group form-group--third">
            <label class="form-label">Valor Actual</label>
            <input
              type="number"
              id="invValorActual"
              class="form-control"
              placeholder="0.00"
              min="0"
              step="0.01"
              value="${v.valorActual || ''}"
            />
          </div>
          <div class="form-group form-group--third">
            <label class="form-label">Fecha de Inversión *</label>
            <input
              type="date"
              id="invFecha"
              class="form-control"
              value="${v.fechaInversion || today}"
              required
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">Ganancias / Pérdidas</label>
            <input
              type="number"
              id="invGanancias"
              class="form-control"
              placeholder="0.00 (negativo = pérdida)"
              step="0.01"
              value="${v.ganancias !== undefined ? v.ganancias : ''}"
            />
          </div>
          <div class="form-group form-group--half">
            <label class="form-label">Rentabilidad / Notas financieras</label>
            <input
              type="text"
              id="invRentabilidad"
              class="form-control"
              placeholder="Ej: 5% mensual, dividendos trimestrales..."
              value="${this._esc(v.rentabilidad || '')}"
            />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label class="form-label">Nivel de Riesgo *</label>
            <select id="invRiesgo" class="form-control form-select" required>
              <option value="">Seleccionar...</option>
              ${Object.entries(RISK_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${v.riesgo === val ? 'selected' : ''}>${cfg.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group form-group--half">
            <label class="form-label">Estado *</label>
            <select id="invEstado" class="form-control form-select" required>
              <option value="">Seleccionar...</option>
              ${Object.entries(STATUS_CONFIG).map(([val, cfg]) =>
                `<option value="${val}" ${v.estado === val ? 'selected' : ''}>${cfg.label}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Observaciones</label>
          <textarea
            id="invObservaciones"
            class="form-control form-textarea"
            placeholder="Notas, estrategia, condiciones de salida..."
            rows="3"
          >${this._esc(v.observaciones || '')}</textarea>
        </div>

        <div id="invFormError" class="form-error hidden"></div>
      </form>
    `;
  }

  // ─────────────────────────────────────────────────────────
  // CRUD — INVERSIONES
  // ─────────────────────────────────────────────────────────

  /**
   * Maneja el envío del formulario de creación/edición.
   * Valida, guarda y actualiza integraciones.
   */
  async _handleFormSubmit() {
    const errEl = document.getElementById('invFormError');
    const hide = () => errEl?.classList.add('hidden');
    const show = (msg) => {
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    };

    // Leer campos
    const nombre = document.getElementById('invNombre')?.value.trim();
    const tipo = document.getElementById('invTipo')?.value;
    const capital = parseFloat(document.getElementById('invCapital')?.value || 0);
    const valorActual = parseFloat(document.getElementById('invValorActual')?.value || 0) || null;
    const fecha = document.getElementById('invFecha')?.value;
    const ganancias = parseFloat(document.getElementById('invGanancias')?.value || 0) || 0;
    const rentabilidad = document.getElementById('invRentabilidad')?.value.trim();
    const riesgo = document.getElementById('invRiesgo')?.value;
    const estado = document.getElementById('invEstado')?.value;
    const observaciones = document.getElementById('invObservaciones')?.value.trim();

    // Validaciones
    if (!nombre) return show('El nombre es obligatorio.');
    if (!tipo) return show('Selecciona el tipo de inversión.');
    if (!capital || capital <= 0) return show('El capital debe ser mayor a 0.');
    if (!fecha) return show('La fecha es obligatoria.');
    if (!riesgo) return show('Selecciona el nivel de riesgo.');
    if (!estado) return show('Selecciona el estado.');
    hide();

    const invData = {
      nombre,
      tipo,
      capitalInvertido: capital,
      valorActual: valorActual || capital,
      fechaInversion: fecha,
      ganancias,
      rentabilidad,
      riesgo,
      estado,
      observaciones,
      totalGastos: 0, // se actualiza al agregar gastos
      updatedAt: new Date().toISOString(),
    };

    try {
      if (this._editingId) {
        // Actualizar existente
        const existing = await this._getById(this._editingId);
        invData.id = this._editingId;
        invData.createdAt = existing?.createdAt || new Date().toISOString();
        invData.totalGastos = existing?.totalGastos || 0; // preservar gastos
        await Storage.update(STORE_INVESTMENTS, invData);
        this._logHistory('investment_updated', invData);
      } else {
        // Crear nueva
        invData.createdAt = new Date().toISOString();
        const id = await Storage.add(STORE_INVESTMENTS, invData);
        invData.id = id;
        this._logHistory('investment_created', invData);
      }

      // Cerrar modal
      Modal.close();

      // Recargar caché y re-renderizar
      await this._loadCache();
      this._render();
      this._bindEvents();

      // Notificar a finance y dashboard
      this._notifyFinance('investment', invData);
      this._notifyDashboard();

      this._showToast(
        this._editingId ? 'Inversión actualizada ✓' : 'Inversión registrada ✓',
        'success'
      );
    } catch (err) {
      console.error('[Investments] Error guardando inversión:', err);
      show('Error al guardar. Intenta de nuevo.');
    }
  }

  /**
   * Maneja el envío del formulario de gastos.
   * @param {number} invId
   */
  async _handleExpenseSubmit(invId) {
    const errEl = document.getElementById('invFormError');

    const cat = document.getElementById('expCat')?.value;
    const desc = document.getElementById('expDesc')?.value.trim();
    const monto = parseFloat(document.getElementById('expMonto')?.value || 0);
    const fecha = document.getElementById('expFecha')?.value;

    if (!cat) return this._showToast('Selecciona una categoría.', 'error');
    if (!monto || monto <= 0) return this._showToast('El monto debe ser mayor a 0.', 'error');
    if (!fecha) return this._showToast('La fecha es obligatoria.', 'error');

    const expense = {
      inversionId: invId,
      categoria: cat,
      descripcion: desc,
      monto,
      fecha,
      createdAt: new Date().toISOString(),
    };

    try {
      await Storage.add(STORE_INV_EXPENSES, expense);

      // Actualizar el total de gastos en la inversión
      const inv = await this._getById(invId);
      if (inv) {
        inv.totalGastos = (inv.totalGastos || 0) + monto;
        inv.updatedAt = new Date().toISOString();
        await Storage.update(STORE_INVESTMENTS, inv);
      }

      Modal.close();

      // Registrar en historial futuro
      this._logHistory('expense_added', { invId, ...expense });

      // Notificar al sistema financiero (gasto)
      this._notifyFinance('expense', expense);

      await this._loadCache();
      this._render();
      this._bindEvents();

      this._showToast('Gasto registrado ✓', 'success');
    } catch (err) {
      console.error('[Investments] Error guardando gasto:', err);
      this._showToast('Error al guardar el gasto.', 'error');
    }
  }

  /**
   * Solicita confirmación y elimina una inversión.
   * @param {number} id
   */
  async _confirmDelete(id) {
    const inv = await this._getById(id);
    if (!inv) return;

    Modal.confirm({
      title: '🗑 Eliminar Inversión',
      message: `¿Eliminar la inversión "<strong>${this._esc(inv.nombre)}</strong>"? Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          await Storage.delete(STORE_INVESTMENTS, id);
          // También eliminar gastos asociados
          const expenses = await this._getExpenses(id);
          for (const exp of expenses) {
            await Storage.delete(STORE_INV_EXPENSES, exp.id);
          }

          this._logHistory('investment_deleted', { id, nombre: inv.nombre });

          await this._loadCache();
          this._render();
          this._bindEvents();
          this._notifyDashboard();
          this._showToast('Inversión eliminada.', 'info');
        } catch (err) {
          console.error('[Investments] Error eliminando:', err);
          this._showToast('Error al eliminar.', 'error');
        }
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // ACCESO A DATOS
  // ─────────────────────────────────────────────────────────

  /**
   * Obtiene una inversión por ID desde IndexedDB.
   * @param {number} id
   * @returns {Object|null}
   */
  async _getById(id) {
    try {
      return await Storage.getById(STORE_INVESTMENTS, id);
    } catch {
      return this._cache.find(i => i.id === id) || null;
    }
  }

  /**
   * Obtiene todos los gastos de una inversión.
   * @param {number} invId
   * @returns {Array}
   */
  async _getExpenses(invId) {
    try {
      const all = await Storage.getAll(STORE_INV_EXPENSES) || [];
      return all.filter(e => e.inversionId === invId);
    } catch {
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────
  // INTEGRACIÓN CON FINANCE.JS
  // ─────────────────────────────────────────────────────────

  /**
   * Notifica al módulo de finanzas sobre un cambio.
   * Afecta: flujo de caja, capital total, gastos, ganancias, balances.
   *
   * @param {string} eventType - 'investment' | 'expense'
   * @param {Object} data
   */
  _notifyFinance(eventType, data) {
    if (typeof this._onFinanceUpdate === 'function') {
      this._onFinanceUpdate({ source: 'investments', eventType, data });
      return;
    }

    // Fallback: disparar evento global si finance.js escucha
    window.dispatchEvent(new CustomEvent('finance:update', {
      detail: { source: 'investments', eventType, data },
    }));
  }

  // ─────────────────────────────────────────────────────────
  // INTEGRACIÓN CON DASHBOARD.JS
  // ─────────────────────────────────────────────────────────

  /**
   * Notifica al dashboard para actualizar tarjetas de resumen.
   * Provee: capital invertido, activos, rentabilidad, alertas.
   */
  _notifyDashboard() {
    const stats = this._calcStats();

    if (typeof this._onDashboardUpdate === 'function') {
      this._onDashboardUpdate({ source: 'investments', stats });
      return;
    }

    // Fallback: evento global
    window.dispatchEvent(new CustomEvent('dashboard:update', {
      detail: { source: 'investments', stats },
    }));
  }

  /**
   * Método público: retorna estadísticas para el dashboard.
   * Llamado externamente por dashboard.js.
   * @returns {Object}
   */
  async getDashboardData() {
    await this._loadCache();
    return this._calcStats();
  }

  /**
   * Método público: retorna inversiones activas (para activity feed del dashboard).
   * @returns {Array}
   */
  async getActiveInvestments() {
    await this._loadCache();
    return this._cache.filter(i => i.estado === 'activa');
  }

  // ─────────────────────────────────────────────────────────
  // HISTORIAL (PREPARADO PARA history.js FUTURO)
  // ─────────────────────────────────────────────────────────

  /**
   * Registra una acción en el historial.
   * Cuando history.js esté disponible, se conectará aquí.
   *
   * @param {string} action - Nombre de la acción
   * @param {Object} data   - Datos relevantes
   */
  _logHistory(action, data) {
    const entry = {
      module: 'investments',
      action,
      data,
      timestamp: new Date().toISOString(),
    };

    if (typeof window._historyModule?.log === 'function') {
      window._historyModule.log(entry);
      return;
    }

    // Guardar en IDB si el store existe (history.js lo creará)
    Storage.add('history', entry).catch(() => {
      // Store aún no existe — silencioso
    });

    // Emitir evento para que history.js escuche cuando esté disponible
  }

  // ─────────────────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────────────────

  /**
   * Formatea un número como moneda.
   * @param {number} n
   * @returns {string}
   */
  _formatCurrency(n) {
    if (isNaN(n)) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  }

  /**
   * Formatea una fecha ISO a formato legible.
   * @param {string} dateStr
   * @returns {string}
   */
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

  /**
   * Escapa HTML para prevenir XSS.
   * @param {string} str
   * @returns {string}
   */
  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Muestra una notificación toast temporal.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  _showToast(message, type = 'info') {
    // Intentar usar el sistema de toasts del proyecto si existe
    if (window.AppToast) {
      window.AppToast.show(message, type);
      return;
    }

    // Fallback: toast simple
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
      color: #fff; padding: 12px 20px; border-radius: 8px;
      font-size: 14px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      animation: slideInRight 0.3s ease;
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
export const Investments = new InvestmentsModule();

/**
 * Función de conveniencia para inicializar el módulo desde router.js o app.js.
 *
 * Uso:
 *   import { initInvestments } from './modules/investments.js';
 *   await initInvestments(document.getElementById('main-content'));
 *
 * @param {HTMLElement} container
 * @param {Object} callbacks
 */
export async function initInvestments(container, callbacks = {}) {
  await Investments.init(container, callbacks);
}
