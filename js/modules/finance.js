/**
 * ============================================================
 * finance.js — Módulo Financiero Completo
 * /JS/modules/finance.js
 *
 * Propósito:
 *   Gestión integral de ingresos y gastos con CRUD completo,
 *   flujo de caja, balance, estadísticas, filtros por fecha
 *   y preparación para conectar con history.js.
 *
 * Conexiones:
 *   ← db.js      (IndexedDB)
 *   ← storage.js (capa de abstracción)
 *   ← modal.js   (modales reutilizables)
 *   ← tables.js  (tabla de movimientos)
 *   → history.js (registro de auditoría — futuro)
 * ============================================================
 */

import { DataTable, renderBadge, renderAmount, renderDate } from '../components/tables.js';
import {
  showModal,
  closeModal,
  showConfirm,
  showToast,
  buildFormHTML,
  getModalFormData,
  validateModalForm,
  modalSystem,
} from '../components/modal.js';

// ─── Import de storage (usa IndexedDB via db.js) ──────────────────────────────
// Se importa dinámicamente para no romper si storage.js usa rutas distintas
import * as Storage from '../storage/storage.js';
import {
  LEGACY_INCOME_CATEGORIES,
  LEGACY_EXPENSE_CATEGORIES,
  getDefaultLegacyCategory,
  getFinanceCategory,
  getFinanceCategoryDisplayName,
  getFinanceCategoryIcon,
  normalizeLegacyType,
  classifyFinancialMovement,
} from '../finance/categories.js';
import { financeStateManager } from '../finance/finance-state-manager.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES DE CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

/** Clave de la store en IndexedDB */
const STORE_KEY = 'finance_movements';

/** Categorias centralizadas: legacy + nueva arquitectura patrimonial. */
const INCOME_CATEGORIES = LEGACY_INCOME_CATEGORIES;
const EXPENSE_CATEGORIES = LEGACY_EXPENSE_CATEGORIES;

/** Todas las categorías unidas */
const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
const CATEGORY_MAP = new Map(ALL_CATEGORIES.map(c => [c.value, c]));

/** Meses en español */
const MONTHS_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ═══════════════════════════════════════════════════════════════════════════════
// ESTILOS DEL MÓDULO
// ═══════════════════════════════════════════════════════════════════════════════
const FINANCE_STYLES = `
  /* ── Layout del módulo ── */
  .finance-module {
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Cabecera de módulo ── */
  .finance-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .finance-title {
    font-size: 1.4rem;
    font-weight: 700;
    color: #e8e8f0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .finance-subtitle {
    font-size: 0.82rem;
    color: #555;
    margin-top: 0.15rem;
  }
  .finance-header-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  /* ── Cards estadísticas ── */
  .finance-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
  }
  .finance-capital-overview {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .finance-concept-card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    padding: 0.9rem 1rem;
    min-width: 0;
  }
  .finance-concept-label {
    color: var(--text-secondary, #8b94b3);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 0.35rem;
  }
  .finance-concept-value {
    color: #e8e8f0;
    font-size: 0.98rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .finance-concept-value.positive { color: #4ecdc4; }
  .finance-concept-value.warning { color: #ffc857; }
  .finance-concept-value.negative { color: #ff6b6b; }
  .stat-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    padding: 1.2rem 1.3rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    transition: border-color 0.2s, transform 0.2s;
  }
  .stat-card:hover {
    border-color: rgba(255,255,255,0.12);
    transform: translateY(-2px);
  }
  .stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    flex-shrink: 0;
  }
  .stat-icon.green  { background: rgba(78,205,196,0.15); }
  .stat-icon.red    { background: rgba(255,80,80,0.15); }
  .stat-icon.blue   { background: rgba(108,99,255,0.15); }
  .stat-icon.yellow { background: rgba(255,193,7,0.15); }
  .stat-info { flex: 1; min-width: 0; }
  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #555;
    margin-bottom: 0.4rem;
  }
  .stat-value {
    font-size: 1.3rem;
    font-weight: 700;
    color: #e0e0f0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stat-value.positive { color: #4ecdc4; }
  .stat-value.negative { color: #ff6b6b; }
  .stat-change {
    font-size: 0.75rem;
    color: #555;
    margin-top: 0.2rem;
  }
  .stat-change.up   { color: #4ecdc4; }
  .stat-change.down { color: #ff6b6b; }

  /* ── Panel de filtros de fecha ── */
  .finance-filters {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 1rem 1.2rem;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
  }
  .finance-filters label {
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #555;
  }
  .finance-date-input {
    width: auto !important;
    min-width: 150px;
    flex: 0 0 auto;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px;
    color: #bbb;
    font-size: 0.855rem;
    padding: 0.45rem 0.75rem;
    outline: none;
    transition: border-color 0.18s;
    cursor: pointer;
  }
  .finance-date-input:focus { border-color: rgba(108,99,255,0.55); }
  .finance-period-btn {
    padding: 0.42rem 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.09);
    background: rgba(255,255,255,0.04);
    color: #888;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .finance-period-btn:hover,
  .finance-period-btn.active {
    background: rgba(108,99,255,0.2);
    color: #a09dff;
    border-color: rgba(108,99,255,0.35);
  }
  .finance-filter-sep {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,0.07);
  }
  .finance-date-group {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    flex: 0 0 auto;
  }

  /* ── Grid de 2 columnas ── */
  .finance-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  /* ── Panel de resumen por categoría ── */
  .finance-panel {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    overflow: hidden;
  }
  .finance-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.2rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .finance-panel-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #c0c0d0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .finance-panel-body { padding: 0.6rem 0; }

  /* ── Ítem de categoría ── */
  .cat-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.7rem 1.2rem;
    transition: background 0.15s;
    cursor: default;
  }
  .cat-item:hover { background: rgba(255,255,255,0.025); }
  .cat-item-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: rgba(255,255,255,0.05);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
  }
  .cat-item-info { flex: 1; min-width: 0; }
  .cat-item-name {
    font-size: 0.855rem;
    color: #bbb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cat-item-bar-wrap {
    height: 3px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px;
    margin-top: 0.3rem;
    overflow: hidden;
  }
  .cat-item-bar {
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .cat-item-amount {
    font-size: 0.875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── Gráfico de barras simple ── */
  .finance-chart {
    padding: 1rem 1.2rem 1.1rem;
    overflow: visible;
  }
  .chart-bars {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    height: 168px;
    padding: 0 0.35rem;
    position: relative;
    overflow: visible;
  }
  .chart-bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    gap: 0.25rem;
    min-width: 38px;
    padding-bottom: 30px;
    position: relative !important;
  }
  .chart-bar {
    width: min(62%, 28px);
    border-radius: 5px 5px 0 0;
    min-height: 4px;
    transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: default;
    position: relative;
    box-shadow: 0 6px 18px rgba(0,0,0,0.26);
  }
  .chart-bar:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #2a2a45;
    color: #ddd;
    font-size: 0.72rem;
    padding: 0.25rem 0.5rem;
    border-radius: 5px;
    white-space: nowrap;
    pointer-events: none;
    border: 1px solid rgba(255,255,255,0.1);
  }
  .chart-bar.income-bar  { background: linear-gradient(to top, #3d9a95, #4ecdc4); }
  .chart-bar.expense-bar { background: linear-gradient(to top, #c04040, #ff6b6b); }
  .chart-label {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    font-size: 0.68rem;
    line-height: 1;
    color: var(--text-secondary, #8b94b3);
    text-align: center;
    white-space: nowrap;
    position: absolute;
    bottom: 2px;
    left: 0;
    right: 0;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .chart-legend {
    display: flex;
    gap: 1.2rem;
    justify-content: center;
    align-items: center;
    margin-bottom: 0.95rem;
    font-size: 0.78rem;
    color: var(--text-secondary, #8b94b3);
  }
  .chart-legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.35rem;
    vertical-align: middle;
  }

  /* ── Sección tabla ── */
  .finance-table-section {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Pestañas de tipo ── */
  .finance-tabs {
    display: flex;
    gap: 0.4rem;
    padding: 0.9rem 1.2rem 0;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.07);
    border-bottom: none;
    border-radius: 14px 14px 0 0;
  }
  .finance-tab {
    padding: 0.55rem 1.1rem;
    border-radius: 8px 8px 0 0;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #555;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s;
  }
  .finance-tab:hover { color: #999; }
  .finance-tab.active {
    color: #a09dff;
    border-bottom-color: #6c63ff;
    background: rgba(108,99,255,0.08);
  }
  .finance-table-wrap {
    border-radius: 0 0 14px 14px;
    border-top: none !important;
  }

  /* ── Flujo de caja mini ── */
  .cashflow-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.65rem 1.2rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 0.855rem;
    color: #bbb;
    gap: 0.5rem;
  }
  .cashflow-row:last-child { border-bottom: none; }
  .cashflow-label { color: #777; }
  .cashflow-val { font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ── Responsive ── */
  @media (max-width: 1024px) {
    .finance-stats { grid-template-columns: repeat(2, 1fr); }
    .finance-capital-overview { grid-template-columns: repeat(3, 1fr); }
    .finance-grid-2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .finance-stats { grid-template-columns: 1fr 1fr; }
    .finance-capital-overview { grid-template-columns: repeat(2, 1fr); }
    .finance-title { font-size: 1.15rem; }
    .stat-value    { font-size: 1.1rem; }
    .finance-tabs  { overflow-x: auto; padding: 0.7rem 0.75rem 0; }
    .chart-bars { gap: 0.5rem; height: 150px; padding-inline: 0; }
    .chart-bar-wrap { min-width: 30px; padding-bottom: 28px; }
    .chart-label { font-size: 0.62rem; }
    .finance-date-group { width: 100%; align-items: stretch; flex-direction: column; gap: 0.4rem; }
    .finance-date-input { width: 100% !important; flex-basis: 100%; }
  }
  @media (max-width: 420px) {
    .finance-stats { grid-template-columns: 1fr; }
  }
`;

// ─── Inyectar estilos ─────────────────────────────────────────────────────────
(function injectFinanceStyles() {
  if (document.getElementById('finance-styles')) return;
  const s = document.createElement('style');
  s.id = 'finance-styles';
  s.textContent = FINANCE_STYLES;
  document.head.appendChild(s);
})();

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

/** Genera un ID único */
function genId() {
  return `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Formatea un número como moneda */
function formatCurrency(amount, currency = '$') {
  const num = parseFloat(amount) || 0;
  return `${currency}${Math.abs(num).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Formatea con decimales */
function formatCurrencyFull(amount, currency = '$') {
  const num = parseFloat(amount) || 0;
  return `${currency}${Math.abs(num).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Obtiene etiqueta de categoría */
function getCatLabel(value) {
  return getFinanceCategoryDisplayName(value);
}

/** Obtiene ícono de categoría */
function getCatIcon(value) {
  return getFinanceCategoryIcon(value);
}

function getCatDisplayName(value) {
  return getFinanceCategoryDisplayName(value);
}

function getUniqueCategoryOptions() {
  return Array.from(CATEGORY_MAP.values()).map(c => ({ value: c.value, label: c.label }));
}

function getMovementNatureLabel(row) {
  if (row.realIncomeImpact > 0) return 'Ingreso real';
  if (row.realExpenseImpact > 0) return 'Gasto real';
  if (row.isInternalMovement) return 'Movimiento interno';
  if (row.isCapitalMovement) return 'Capital';
  return row.type === 'income' ? 'Ingreso' : 'Gasto';
}

function getMovementNatureTone(row) {
  if (row.realIncomeImpact > 0) return 'success';
  if (row.realExpenseImpact > 0) return 'danger';
  if (row.isInternalMovement) return 'info';
  if (row.isCapitalMovement) return 'warning';
  return row.type === 'income' ? 'success' : 'danger';
}

function renderImpactSummary(row) {
  const impacts = row.impactSummary?.rows || [];
  if (!impacts.length) return '<span style="color:#555;">—</span>';
  return `
    <div style="display:flex;flex-wrap:wrap;gap:0.25rem;">
      ${impacts.slice(0, 4).map(item => `
        <span class="dt-badge badge-${item.tone === 'positive' ? 'success' : 'danger'}" title="${item.label}">
          ${item.direction} ${item.label}
        </span>
      `).join('')}
    </div>
  `;
}

/** Inicio y fin del periodo seleccionado */
function getPeriodRange(period) {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth();
  const d     = now.getDate();
  let from, to;

  switch (period) {
    case 'today':
      from = new Date(y, m, d, 0, 0, 0, 0);
      to   = new Date(y, m, d, 23, 59, 59, 999);
      break;
    case 'week': {
      const dow = now.getDay();
      from = new Date(y, m, d - dow, 0, 0, 0, 0);
      to   = new Date(y, m, d - dow + 6, 23, 59, 59, 999);
      break;
    }
    case 'month':
      from = new Date(y, m, 1, 0, 0, 0, 0);
      to   = new Date(y, m + 1, 0, 23, 59, 59, 999);
      break;
    case 'quarter': {
      const q = Math.floor(m / 3);
      from = new Date(y, q * 3, 1, 0, 0, 0, 0);
      to   = new Date(y, q * 3 + 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'year':
      from = new Date(y, 0, 1, 0, 0, 0, 0);
      to   = new Date(y, 11, 31, 23, 59, 59, 999);
      break;
    default:
      from = null;
      to   = null;
  }
  return { from, to };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPA DE DATOS — FinanceStorage
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Wrapper sobre storage.js para operaciones de movimientos financieros.
 * Preparado para conectar con history.js en futuras fases.
 */
const FinanceStorage = {

  /**
   * Obtiene todos los movimientos.
   * @returns {Promise<Array>}
   */
  async getAll() {
    try {
      const data = await Storage.getAll(STORE_KEY);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('[Finance] Error obteniendo movimientos:', e);
      return [];
    }
  },

  /**
   * Obtiene un movimiento por ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    try {
      return await Storage.getById(STORE_KEY, id);
    } catch (e) {
      console.error('[Finance] Error obteniendo movimiento:', e);
      return null;
    }
  },

  /**
   * Crea un nuevo movimiento.
   * Registra en historial para history.js (futuro).
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async create(data) {
    const type = normalizeLegacyType(data.type);
    const category = data.category || getDefaultLegacyCategory(type);
    const categoryDef = getFinanceCategory(category) || getFinanceCategory(getDefaultLegacyCategory(type));
    const movement = {
      id:          genId(),
      timestamp:   new Date().toISOString(),  // ← para history.js
      createdAt:   Date.now(),
      updatedAt:   Date.now(),
      // Campos del movimiento:
      type,       // 'income' | 'expense'
      category,
      amount:      parseFloat(data.amount) || 0,
      description: data.description || '',
      date:        data.date || new Date().toISOString().split('T')[0],
      reference:   data.reference || '',
      categoryLabel: getCatDisplayName(category),
      financeConcept: data.financeConcept || categoryDef?.concept || null,
      capitalBucket: data.capitalBucket || categoryDef?.bucket || null,
      liquidImpact: data.liquidImpact,
      investedImpact: data.investedImpact,
      realProfitImpact: data.realProfitImpact,
      cashFlowImpact: data.cashFlowImpact,
      sourceModule: data.sourceModule || data.source || 'finance',
      meta:        data.meta || {},
      tags:        data.tags || [],
      // Metadatos para history.js:
      _historyAction: 'create',
      _historyModule: 'finance',
    };
    const classifiedMovement = classifyFinancialMovement(movement);

    try {
      await Storage.save(STORE_KEY, classifiedMovement);
      // Preparación: cuando exista history.js se llamará aquí
      FinanceStorage._logHistory('CREATE', classifiedMovement);
      financeStateManager.invalidate('finance:movement_created');
      return classifiedMovement;
    } catch (e) {
      console.error('[Finance] Error creando movimiento:', e);
      throw e;
    }
  },

  /**
   * Actualiza un movimiento existente.
   * @param {string} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    const existing = await FinanceStorage.getById(id);
    if (!existing) throw new Error(`Movimiento ${id} no encontrado`);

    const updated = {
      ...existing,
      ...data,
      id,
      updatedAt:      Date.now(),
      _historyAction: 'update',
    };

    try {
      await Storage.save(STORE_KEY, updated);
      FinanceStorage._logHistory('UPDATE', updated);
      financeStateManager.invalidate('finance:movement_updated');
      return updated;
    } catch (e) {
      console.error('[Finance] Error actualizando movimiento:', e);
      throw e;
    }
  },

  /**
   * Elimina un movimiento.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    try {
      const existing = await FinanceStorage.getById(id);
      await Storage.remove(STORE_KEY, id);
      if (existing) FinanceStorage._logHistory('DELETE', existing);
      financeStateManager.invalidate('finance:movement_deleted');
    } catch (e) {
      console.error('[Finance] Error eliminando movimiento:', e);
      throw e;
    }
  },

  /**
   * Prepara el log de historial.
   * Se conectará a history.js cuando exista.
   * @param {string} action  - 'CREATE'|'UPDATE'|'DELETE'
   * @param {Object} movement
   * @private
   */
  _logHistory(action, movement) {
    // ── Estructura lista para history.js ──
    const historyEntry = {
      timestamp:   new Date().toISOString(),
      module:      'finance',
      action,
      entityId:    movement.id,
      category:    movement.category,
      categoryLabel: getCatDisplayName(movement.category),
      amount:      movement.amount,
      type:        movement.type,
      description: movement.description,
      financeConcept: movement.financeConcept,
      capitalBucket: movement.capitalBucket,
      impactSummary: movement.impactSummary,
      impacts: {
        liquidity: movement.liquidImpact || 0,
        investedCapital: movement.investedImpact || 0,
        activePortfolio: movement.activePortfolioImpact || 0,
        personalAssets: movement.personalAssetImpact || 0,
        commercialAssets: movement.commercialAssetImpact || 0,
        reserves: movement.reserveImpact || 0,
        realProfit: movement.realProfitImpact || 0,
      },
    };

    if (typeof window._historyModule?.log === 'function') {
      window._historyModule.log(historyEntry);
    } else {
      Storage.add('history', historyEntry).catch(() => {});
    }

    // TODO (Fase 3): importar history.js y llamar:
    // HistoryModule.log(historyEntry);
    console.debug('[Finance→History]', historyEntry);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLASE PRINCIPAL — FinanceModule
// ═══════════════════════════════════════════════════════════════════════════════
class FinanceModule {
  constructor() {
    this._movements     = [];   // todos los movimientos en memoria
    this._filtered      = [];   // movimientos del periodo activo
    this._table         = null; // instancia de DataTable
    this._activeTab     = 'all';     // 'all'|'income'|'expense'
    this._activePeriod  = 'month';   // periodo de filtro activo
    this._dateFrom      = null;      // filtro fecha desde
    this._dateTo        = null;      // filtro fecha hasta
    this._container     = null;
    this._financialState = null;
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  /**
   * Inicializa el módulo en el contenedor dado.
   * Llamado por router.js cuando se navega a /finance.
   * @param {HTMLElement|string} container
   */
  async init(container) {
    this._container = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!this._container) {
      console.error('[Finance] Contenedor no encontrado');
      return;
    }

    // Mostrar skeleton mientras carga
    this._renderSkeleton();

    // Cargar datos de IndexedDB
    await this._loadData();

    // Renderizar interfaz completa
    this._renderUI();
  }

  // ─── CARGA DE DATOS ───────────────────────────────────────────────────────
  async _loadData() {
    try {
      this._movements = (await FinanceStorage.getAll()).map(m => classifyFinancialMovement({
        ...m,
        categoryLabel: m.categoryLabel || getCatDisplayName(m.category),
      }));
      // Ordenar por fecha descendente
      this._movements.sort((a, b) =>
        new Date(b.date + 'T' + (b.timestamp?.slice(11) || '00:00:00'))
        - new Date(a.date + 'T' + (a.timestamp?.slice(11) || '00:00:00'))
      );
      this._financialState = await financeStateManager.getCurrentState({ force: true });
    } catch (e) {
      console.error('[Finance] Error cargando datos:', e);
      this._movements = [];
      this._financialState = null;
    }
    this._applyDateFilter();
  }

  // ─── FILTRO DE FECHA ──────────────────────────────────────────────────────
  _applyDateFilter() {
    if (this._dateFrom || this._dateTo) {
      const from = this._dateFrom ? new Date(this._dateFrom) : null;
      const to   = this._dateTo   ? new Date(this._dateTo + 'T23:59:59') : null;

      this._filtered = this._movements.filter(m => {
        const d = new Date(m.date);
        if (from && d < from) return false;
        if (to   && d > to  ) return false;
        return true;
      });
    } else if (this._activePeriod !== 'all') {
      const { from, to } = getPeriodRange(this._activePeriod);
      if (from && to) {
        this._filtered = this._movements.filter(m => {
          const d = new Date(m.date);
          return d >= from && d <= to;
        });
      } else {
        this._filtered = [...this._movements];
      }
    } else {
      this._filtered = [...this._movements];
    }
  }

  // ─── SKELETON ─────────────────────────────────────────────────────────────
  _renderSkeleton() {
    this._container.innerHTML = `
      <div class="finance-module">
        <div style="text-align:center;padding:3rem;color:#444;">
          <div style="font-size:2rem;margin-bottom:0.75rem;">💼</div>
          <div style="font-size:0.9rem;">Cargando módulo financiero...</div>
        </div>
      </div>
    `;
  }

  // ─── RENDER UI COMPLETA ───────────────────────────────────────────────────
  _renderUI() {
    this._container.innerHTML = `
      <div class="finance-module" id="finance-root">

        <!-- Header -->
        <div class="finance-header">
          <div>
            <div class="finance-title">💼 Finanzas</div>
            <div class="finance-subtitle">Control de ingresos y gastos</div>
          </div>
          <div class="finance-header-actions">
            <button class="dt-btn dt-btn-secondary" id="fin-btn-export">📤 Exportar</button>
            <button class="dt-btn dt-btn-primary"   id="fin-btn-new">+ Nuevo movimiento</button>
          </div>
        </div>

        <!-- Filtros de período -->
        <div class="finance-filters" id="finance-filters">
          <label>Período:</label>
          <button class="finance-period-btn ${this._activePeriod==='today'?'active':''}"   data-period="today">Hoy</button>
          <button class="finance-period-btn ${this._activePeriod==='week'?'active':''}"    data-period="week">Semana</button>
          <button class="finance-period-btn ${this._activePeriod==='month'?'active':''}"   data-period="month">Mes</button>
          <button class="finance-period-btn ${this._activePeriod==='quarter'?'active':''}" data-period="quarter">Trimestre</button>
          <button class="finance-period-btn ${this._activePeriod==='year'?'active':''}"    data-period="year">Año</button>
          <button class="finance-period-btn ${this._activePeriod==='all'?'active':''}"     data-period="all">Todo</button>
          <div class="finance-filter-sep"></div>
          <div class="finance-date-group">
            <label>Desde:</label>
            <input type="date" class="finance-date-input" id="fin-date-from" value="${this._dateFrom || ''}">
          </div>
          <div class="finance-date-group">
            <label>Hasta:</label>
            <input type="date" class="finance-date-input" id="fin-date-to"   value="${this._dateTo   || ''}">
          </div>
        </div>

        <!-- Stats cards -->
        <div class="finance-stats" id="finance-stats"></div>
        <div class="finance-capital-overview" id="finance-capital-overview"></div>

        <!-- Grid: gráficos + resumen -->
        <div class="finance-grid-2">
          <!-- Gráfico mensual -->
          <div class="finance-panel" id="finance-chart-panel">
            <div class="finance-panel-header">
              <div class="finance-panel-title">📊 Flujo mensual</div>
            </div>
            <div id="finance-chart" class="finance-chart"></div>
          </div>
          <!-- Flujo de caja -->
          <div class="finance-panel" id="finance-cashflow-panel">
            <div class="finance-panel-header">
              <div class="finance-panel-title">💧 Flujo de caja</div>
            </div>
            <div id="finance-cashflow"></div>
          </div>
        </div>

        <!-- Grid: ingresos por categoría + gastos por categoría -->
        <div class="finance-grid-2">
          <div class="finance-panel">
            <div class="finance-panel-header">
              <div class="finance-panel-title">📈 Ingresos por categoría</div>
            </div>
            <div class="finance-panel-body" id="finance-income-cats"></div>
          </div>
          <div class="finance-panel">
            <div class="finance-panel-header">
              <div class="finance-panel-title">📉 Gastos por categoría</div>
            </div>
            <div class="finance-panel-body" id="finance-expense-cats"></div>
          </div>
        </div>

        <!-- Tabla de movimientos -->
        <div class="finance-table-section">
          <div class="finance-tabs" id="finance-tabs">
            <button class="finance-tab ${this._activeTab==='all'?'active':''}"     data-tab="all">Todos</button>
            <button class="finance-tab ${this._activeTab==='income'?'active':''}"  data-tab="income">Ingresos</button>
            <button class="finance-tab ${this._activeTab==='expense'?'active':''}" data-tab="expense">Gastos</button>
          </div>
          <div id="finance-table" class="finance-table-wrap"></div>
        </div>

      </div>
    `;

    // Conectar eventos
    this._bindEvents();

    // Renderizar secciones de datos
    this._renderStats();
    this._renderCapitalOverview();
    this._renderChart();
    this._renderCashflow();
    this._renderCategories();
    this._renderTable();
  }

  // ─── BIND EVENTS ─────────────────────────────────────────────────────────
  _bindEvents() {
    // Botón nuevo
    document.getElementById('fin-btn-new')?.addEventListener('click', () => {
      this._openFormModal();
    });

    // Botón exportar
    document.getElementById('fin-btn-export')?.addEventListener('click', () => {
      this._exportCSV();
    });

    // Filtros de período
    document.getElementById('finance-filters')?.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activePeriod = btn.dataset.period;
        this._dateFrom = null;
        this._dateTo   = null;
        // Limpiar inputs de fecha
        const fromInput = document.getElementById('fin-date-from');
        const toInput   = document.getElementById('fin-date-to');
        if (fromInput) fromInput.value = '';
        if (toInput)   toInput.value   = '';
        // Actualizar botones activos
        document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._applyDateFilter();
        this._refreshAll();
      });
    });

    // Filtros de fecha manual
    document.getElementById('fin-date-from')?.addEventListener('change', (e) => {
      this._dateFrom = e.target.value || null;
      this._clearPeriodActive();
      this._applyDateFilter();
      this._refreshAll();
    });
    document.getElementById('fin-date-to')?.addEventListener('change', (e) => {
      this._dateTo = e.target.value || null;
      this._clearPeriodActive();
      this._applyDateFilter();
      this._refreshAll();
    });

    // Tabs
    document.getElementById('finance-tabs')?.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        this._activeTab = tab.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._updateTableData();
      });
    });
  }

  _clearPeriodActive() {
    document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
    this._activePeriod = 'custom';
  }

  // ─── REFRESH COMPLETO ─────────────────────────────────────────────────────
  _refreshAll() {
    this._renderStats();
    this._renderCapitalOverview();
    this._renderChart();
    this._renderCashflow();
    this._renderCategories();
    this._updateTableData();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ESTADÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  _getStats(data = this._filtered) {
    const income  = data.reduce((s, m) => s + (m.realIncomeImpact || 0), 0);
    const expense = data.reduce((s, m) => s + (m.realExpenseImpact || 0), 0);
    const capitalMovements = data
      .filter(m => m.isCapitalMovement)
      .reduce((s, m) => s + m.amount, 0);
    const balance = income - expense;
    const count   = data.length;
    return { income, expense, balance, count, capitalMovements };
  }

  _renderStats() {
    const el = document.getElementById('finance-stats');
    if (!el) return;

    const { income, expense, balance, count, capitalMovements } = this._getStats();

    const cards = [
      {
        icon: '💰',
        iconCls: 'green',
        label: 'Ingresos reales',
        value: formatCurrency(income),
        valueCls: 'positive',
        sub: 'utilidad cobrada',
      },
      {
        icon: '📉',
        iconCls: 'red',
        label: 'Gastos reales',
        value: formatCurrency(expense),
        valueCls: 'negative',
        sub: 'salidas operativas',
      },
      {
        icon: '⚖️',
        iconCls: 'blue',
        label: 'Utilidad neta',
        value: formatCurrency(Math.abs(balance)),
        valueCls: balance >= 0 ? 'positive' : 'negative',
        sub: balance >= 0 ? '▲ Superávit' : '▼ Déficit',
      },
      {
        icon: '📋',
        iconCls: 'yellow',
        label: 'Capital movido',
        value: formatCurrency(capitalMovements),
        valueCls: '',
        sub: `${count} registros`,
      },
    ];

    el.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-icon ${c.iconCls}">${c.icon}</div>
        <div class="stat-info">
          <div class="stat-label">${c.label}</div>
          <div class="stat-value ${c.valueCls}">${c.value}</div>
          <div class="stat-change">${c.sub}</div>
        </div>
      </div>
    `).join('');
  }

  _renderCapitalOverview() {
    const el = document.getElementById('finance-capital-overview');
    if (!el) return;

    const metrics = this._financialState?.metrics || {};
    const cards = [
      { label: 'Capital liquido', value: metrics.liquidCapital, cls: metrics.liquidCapital >= 0 ? 'positive' : 'negative' },
      { label: 'Capital invertido', value: metrics.investedCapital, cls: 'warning' },
      { label: 'Patrimonio', value: metrics.patrimonio, cls: metrics.patrimonio >= 0 ? 'positive' : 'negative' },
      { label: 'Utilidad real', value: metrics.realProfit, cls: metrics.realProfit >= 0 ? 'positive' : 'negative' },
      { label: 'Cartera activa', value: metrics.activePortfolio, cls: 'warning' },
      { label: 'Retorno proyectado', value: metrics.projectedReturn, cls: 'positive' },
    ];

    el.innerHTML = cards.map(card => `
      <div class="finance-concept-card">
        <div class="finance-concept-label">${card.label}</div>
        <div class="finance-concept-value ${card.cls}">${formatCurrency(Math.abs(card.value || 0))}</div>
      </div>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRÁFICO MENSUAL
  // ═══════════════════════════════════════════════════════════════════════════
  _renderChart() {
    const el = document.getElementById('finance-chart');
    if (!el) return;

    // Agrupar últimos 6 meses
    const now      = new Date();
    const months   = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ y: d.getFullYear(), m: d.getMonth(), label: MONTHS_ES[d.getMonth()].slice(0, 3) });
    }

    const grouped = months.map(({ y, m, label }) => {
      const movs = this._movements.filter(mv => {
        const d = new Date(mv.date);
        return d.getFullYear() === y && d.getMonth() === m;
      });
      return {
        label,
        income: movs.reduce((s, mv) => s + (mv.realIncomeImpact || 0), 0),
        expense: movs.reduce((s, mv) => s + (mv.realExpenseImpact || 0), 0),
      };
    });

    const maxVal = Math.max(...grouped.map(g => Math.max(g.income, g.expense)), 1);

    const barsHTML = grouped.map(g => {
      const incH = Math.round((g.income  / maxVal) * 96);
      const expH = Math.round((g.expense / maxVal) * 96);
      return `
        <div class="chart-bar-wrap" style="position:relative;">
          <div class="chart-bar income-bar"
            style="height:${incH}px;"
            data-tooltip="Ing real: ${formatCurrency(g.income)}">
          </div>
          <div class="chart-bar expense-bar"
            style="height:${expH}px;margin-top:2px;"
            data-tooltip="Gas real: ${formatCurrency(g.expense)}">
          </div>
          <span class="chart-label">${g.label}</span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="chart-legend">
        <span><span class="chart-legend-dot" style="background:#4ecdc4;"></span>Ingresos reales</span>
        <span><span class="chart-legend-dot" style="background:#ff6b6b;"></span>Gastos reales</span>
      </div>
      <div class="chart-bars">${barsHTML}</div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLUJO DE CAJA
  // ═══════════════════════════════════════════════════════════════════════════
  _renderCashflow() {
    const el = document.getElementById('finance-cashflow');
    if (!el) return;

    const { income, expense, balance } = this._getStats();
    const margin = income > 0 ? ((income - expense) / income * 100) : 0;

    const rows = [
      { label: '💰 Ingresos reales', val: formatCurrencyFull(income), cls: 'positive' },
      { label: '📉 Gastos reales',   val: `– ${formatCurrencyFull(expense)}`, cls: 'negative' },
      { label: '⚖️ Utilidad neta',     val: (balance >= 0 ? '+ ' : '– ') + formatCurrencyFull(Math.abs(balance)),
        cls: balance >= 0 ? 'positive' : 'negative' },
      { label: '📊 Rentabilidad sobre ingresos', val: `${margin.toFixed(1)}%`,
        cls: margin >= 0 ? 'positive' : 'negative' },
      { label: '🔢 Total movimientos', val: String(this._filtered.length), cls: '' },
    ];

    el.innerHTML = rows.map(r => `
      <div class="cashflow-row">
        <span class="cashflow-label">${r.label}</span>
        <span class="cashflow-val" style="color:${
          r.cls === 'positive' ? '#4ecdc4' :
          r.cls === 'negative' ? '#ff6b6b' : '#bbb'
        };">${r.val}</span>
      </div>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORÍAS
  // ═══════════════════════════════════════════════════════════════════════════
  _renderCategories() {
    this._renderCategoryPanel('finance-income-cats',  'income',  INCOME_CATEGORIES,  '#4ecdc4');
    this._renderCategoryPanel('finance-expense-cats', 'expense', EXPENSE_CATEGORIES, '#ff6b6b');
  }

  _renderCategoryPanel(elId, type, cats, color) {
    const el = document.getElementById(elId);
    if (!el) return;

    const valueKey = type === 'income' ? 'realIncomeImpact' : 'realExpenseImpact';
    const movs = this._filtered.filter(m => (m[valueKey] || 0) > 0);
    const total = movs.reduce((s, m) => s + (m[valueKey] || 0), 0);

    // Sumar por categoría
    const catTotals = cats.map(cat => ({
      ...cat,
      total: movs.filter(m => m.category === cat.value).reduce((s, m) => s + (m[valueKey] || 0), 0),
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

    if (catTotals.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:2rem;color:#444;font-size:0.85rem;">
          Sin registros en el período
        </div>
      `;
      return;
    }

    el.innerHTML = catTotals.map(c => {
      const pct = total > 0 ? Math.round((c.total / total) * 100) : 0;
      return `
        <div class="cat-item">
          <div class="cat-item-icon">${c.icon}</div>
          <div class="cat-item-info">
            <div class="cat-item-name">${getCatDisplayName(c.value)}</div>
            <div class="cat-item-bar-wrap">
              <div class="cat-item-bar" style="width:${pct}%;background:${color};opacity:0.7;"></div>
            </div>
          </div>
          <div class="cat-item-amount" style="color:${color};">
            ${formatCurrency(c.total)}
            <div style="font-size:0.7rem;color:#444;font-weight:400;">${pct}%</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLA
  // ═══════════════════════════════════════════════════════════════════════════
  _renderTable() {
    const tableEl = document.getElementById('finance-table');
    if (!tableEl) return;

    // Limpiar tabla anterior
    if (this._table) this._table.destroy();

    this._table = new DataTable('#finance-table', {
      columns: [
        {
          key: 'date',
          label: 'Fecha',
          sortable: true,
          width: '110px',
          render: (val) => renderDate(val),
        },
        {
          key: 'type',
          label: 'Tipo',
          width: '90px',
          render: (val, row) => renderBadge(
            getMovementNatureLabel(row),
            getMovementNatureTone(row)
          ),
        },
        {
          key: 'category',
          label: 'Categoría',
          sortable: true,
          render: (val) => {
            const icon = getCatIcon(val);
            const label = getCatDisplayName(val);
            return `<span style="display:flex;align-items:center;gap:0.4rem;">
              <span>${icon}</span><span style="color:#bbb;">${label}</span>
            </span>`;
          },
        },
        {
          key: 'description',
          label: 'Descripción',
          render: (val) => `<span style="color:#999;">${val || '—'}</span>`,
        },
        {
          key: 'impactSummary',
          label: 'Impacto',
          render: (val, row) => renderImpactSummary(row),
        },
        {
          key: 'amount',
          label: 'Monto',
          sortable: true,
          align: 'right',
          render: (val, row) => renderAmount(
            row.type === 'income' ? val : -val
          ),
        },
      ],
      actions: [
        {
          icon: '✏️',
          label: 'Editar',
          className: 'btn-edit',
          onClick: (row) => this._openFormModal(row),
        },
        {
          icon: '🗑️',
          label: 'Eliminar',
          className: 'btn-delete',
          onClick: (row) => this._confirmDelete(row),
        },
      ],
      searchKeys:  ['description', 'category', 'categoryLabel', 'reference'],
      filters: [
        {
          key: 'type',
          label: 'Tipo',
          options: [
            { value: '',        label: 'Todos los tipos' },
            { value: 'income',  label: '💰 Ingresos' },
            { value: 'expense', label: '📉 Gastos' },
          ],
        },
        {
          key: 'category',
          label: 'Categoría',
          options: [
            { value: '', label: 'Todas las categorías' },
            ...getUniqueCategoryOptions(),
          ],
        },
      ],
      toolbarButtons: [],
      perPage:       15,
      emptyIcon:     '💸',
      emptyTitle:    'Sin movimientos',
      emptySubtitle: 'Registra tu primer ingreso o gasto',
    });

    // Cargar datos según tab activo
    this._updateTableData();
  }

  _updateTableData() {
    if (!this._table) return;

    let data = this._filtered;
    if (this._activeTab === 'income')  data = data.filter(m => m.type === 'income');
    if (this._activeTab === 'expense') data = data.filter(m => m.type === 'expense');

    this._table.setData(data);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL DE FORMULARIO — CRUD
  // ═══════════════════════════════════════════════════════════════════════════
  _openFormModal(existing = null, defaultType = null) {
    const isEdit = !!existing;
    const type   = existing?.type || defaultType || 'income';

    // Opciones de categoría según tipo seleccionado
    const getCatOptions = (t) => [
      { value: '', label: '— Seleccionar —' },
      ...(t === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
        .map(c => ({ value: c.value, label: c.label })),
    ];

    const formFields = [
      {
        id: 'mov-type',
        label: 'Tipo de movimiento',
        type: 'select',
        required: true,
        value: existing?.type || type,
        options: [
          { value: 'income',  label: '💰 Ingreso' },
          { value: 'expense', label: '📉 Gasto' },
        ],
      },
      {
        id: 'mov-category',
        label: 'Categoría',
        type: 'select',
        required: true,
        value: existing?.category || '',
        options: getCatOptions(existing?.type || type),
      },
      {
        id: 'mov-amount',
        label: 'Monto',
        type: 'number',
        placeholder: '0.00',
        required: true,
        value: existing?.amount || '',
        col: 'half',
      },
      {
        id: 'mov-date',
        label: 'Fecha',
        type: 'date',
        required: true,
        value: existing?.date || new Date().toISOString().split('T')[0],
        col: 'half',
      },
      {
        id: 'mov-description',
        label: 'Descripción',
        type: 'text',
        placeholder: 'Descripción del movimiento...',
        value: existing?.description || '',
      },
      {
        id: 'mov-reference',
        label: 'Referencia / Factura',
        type: 'text',
        placeholder: 'Número de referencia (opcional)',
        value: existing?.reference || '',
      },
    ];

    showModal({
      title: isEdit ? 'Editar movimiento' : 'Nuevo movimiento',
      icon:  isEdit ? '✏️' : '➕',
      size:  'md',
      content: buildFormHTML(formFields),
      buttons: [
        { label: 'Cancelar', type: 'secondary', close: true },
        {
          label: isEdit ? 'Guardar cambios' : 'Registrar',
          type: 'primary',
          close: false,
          action: async () => {
            if (!validateModalForm()) return false;
            return await this._saveMovement(existing?.id || null);
          },
        },
      ],
      onOpen: (container) => {
        // Cuando cambia el tipo, actualizar opciones de categoría
        const typeSelect = container.querySelector('#mov-type');
        const catSelect  = container.querySelector('#mov-category');
        if (typeSelect && catSelect) {
          typeSelect.addEventListener('change', () => {
            const t    = typeSelect.value;
            const opts = getCatOptions(t);
            catSelect.innerHTML = opts
              .map(o => `<option value="${o.value}">${o.label}</option>`)
              .join('');
          });
        }
      },
    });
  }

  // ─── GUARDAR (crear o actualizar) ─────────────────────────────────────────
  async _saveMovement(existingId = null) {
    const data = getModalFormData();

    // Validación extra: monto positivo
    const amount = parseFloat(data['mov-amount']);
    if (isNaN(amount) || amount <= 0) {
      modalSystem.showAlert('El monto debe ser mayor a 0', 'danger');
      return false;
    }

    const movementData = {
      type:        data['mov-type'],
      category:    data['mov-category'],
      categoryLabel: getCatDisplayName(data['mov-category']),
      amount,
      date:        data['mov-date'],
      description: data['mov-description'],
      reference:   data['mov-reference'],
    };

    try {
      modalSystem.setLoading(true, 'Guardando...');

      let saved;
      if (existingId) {
        saved = await FinanceStorage.update(existingId, movementData);
        // Actualizar en memoria
        const idx = this._movements.findIndex(m => m.id === existingId);
        if (idx !== -1) this._movements[idx] = saved;
        showToast('Movimiento actualizado correctamente', 'success');
      } else {
        saved = await FinanceStorage.create(movementData);
        // Agregar en memoria (al inicio)
        this._movements.unshift(saved);
        showToast('Movimiento registrado correctamente', 'success');
      }

      closeModal();
      this._applyDateFilter();
      this._financialState = await financeStateManager.getCurrentState({ force: true });
      this._refreshAll();

    } catch (e) {
      console.error('[Finance] Error guardando:', e);
      modalSystem.setLoading(false);
      modalSystem.showAlert('Error al guardar el movimiento', 'danger');
      return false;
    }
  }

  // ─── CONFIRMAR ELIMINACIÓN ────────────────────────────────────────────────
  _confirmDelete(row) {
    const typeLabel = row.type === 'income' ? 'ingreso' : 'gasto';
    showConfirm({
      title:       'Eliminar movimiento',
      message:     `¿Estás seguro de eliminar este ${typeLabel} de <strong>${formatCurrency(row.amount)}</strong>?<br>Esta acción no se puede deshacer.`,
      type:        'danger',
      confirmText: 'Eliminar',
      cancelText:  'Cancelar',
      onConfirm:   async () => {
        try {
          await FinanceStorage.delete(row.id);
          // Quitar de memoria
          this._movements = this._movements.filter(m => m.id !== row.id);
          this._table?.removeRow(row.id);
          this._applyDateFilter();
          this._financialState = await financeStateManager.getCurrentState({ force: true });
          this._refreshAll();
          showToast('Movimiento eliminado', 'warning');
        } catch (e) {
          console.error('[Finance] Error eliminando:', e);
          showToast('Error al eliminar el movimiento', 'danger');
        }
      },
    });
  }

  // ─── EXPORTAR CSV ─────────────────────────────────────────────────────────
  _exportCSV() {
    const data = this._table ? this._table.getFilteredData() : this._filtered;
    if (data.length === 0) {
      showToast('No hay datos para exportar', 'warning');
      return;
    }

    const headers = ['Fecha','Tipo','Categoría','Descripción','Referencia','Monto'];
    const rows = data.map(m => [
      m.date,
      m.type === 'income' ? 'Ingreso' : 'Gasto',
      getCatLabel(m.category),
      `"${(m.description || '').replace(/"/g, '""')}"`,
      m.reference || '',
      m.amount,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `finanzas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`${data.length} registros exportados`, 'success');
  }

  // ─── API PÚBLICA ──────────────────────────────────────────────────────────

  /** Recarga datos desde IndexedDB y refresca la UI */
  async refresh() {
    await this._loadData();
    this._financialState = await financeStateManager.getCurrentState({ force: true });
    this._refreshAll();
  }

  /** @returns {Object} Resumen financiero del período activo */
  getSummary() {
    return this._getStats();
  }

  /** @returns {Array} Movimientos del período activo */
  getMovements() {
    return [...this._filtered];
  }

  /** Destruye el módulo */
  destroy() {
    if (this._table) this._table.destroy();
    if (this._container) this._container.innerHTML = '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCIA SINGLETON Y FUNCIÓN DE INICIO (para router.js)
// ═══════════════════════════════════════════════════════════════════════════════

/** Instancia singleton del módulo financiero */
export const financeModule = new FinanceModule();

/**
 * Función de entrada para router.js.
 * Se llama cuando el usuario navega a /finance.
 *
 * Ejemplo en router.js:
 *   import { initFinance } from './modules/finance.js';
 *   routes['/finance'] = (container) => initFinance(container);
 *
 * @param {HTMLElement|string} container
 */
export async function initFinance(container) {
  await financeModule.init(container);
}

export async function registerTransaction(data) {
  const type = normalizeLegacyType(data.type || 'income');
  const category = data.category || getDefaultLegacyCategory(type);
  return FinanceStorage.create({
    type,
    amount: Number(data.amount || 0),
    category,
    description: data.description || data.desc || data.note || 'Movimiento',
    date: data.date || new Date().toISOString().split('T')[0],
    reference: data.reference || data.source || '',
    sourceModule: data.sourceModule || data.source || 'integration',
    financeConcept: data.financeConcept,
    capitalBucket: data.capitalBucket,
    liquidImpact: data.liquidImpact,
    investedImpact: data.investedImpact,
    realProfitImpact: data.realProfitImpact,
    cashFlowImpact: data.cashFlowImpact,
    meta: data.meta || {},
    tags: data.tags || [],
  });
}

export function getFinanceSummary() {
  return financeModule.getSummary();
}

export default financeModule;
