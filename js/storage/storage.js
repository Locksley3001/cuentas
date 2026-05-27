/* ============================================================
   storage.js — Capa de almacenamiento con lógica de negocio
   Abstrae DB.js y expone métodos por entidad
   ============================================================ */

import { DB } from './db.js';
import { getFinanceCategoryLabel } from '../finance/categories.js';

const Storage = (() => {

  /* ════════════════════════════════════════════════════════════
     TRANSACCIONES
     ════════════════════════════════════════════════════════════ */
  const Transactions = {
    add:    (data) => DB.add('transactions', data),
    update: (data) => DB.update('transactions', data),
    delete: (id)   => DB.remove('transactions', id),
    getAll: ()     => DB.getAll('transactions'),
    getById:(id)   => DB.getById('transactions', id),
    getByType: (type) => DB.getByIndex('transactions', 'type', type),

    /** Resumen financiero: totales de ingresos y gastos */
    async getSummary() {
      const all = await getAllFinancialMovements();
      return all.reduce((acc, tx) => {
        const amount = Number(tx.amount) || 0;
        if (tx.type === 'income')  acc.income  += amount;
        if (tx.type === 'expense') acc.expense += amount;
        acc.total = acc.income - acc.expense;
        return acc;
      }, { income: 0, expense: 0, total: 0 });
    },

    /** Últimas N transacciones */
    async getRecent(n = 10) {
      const all = await getAllFinancialMovements();
      return all
        .sort((a, b) => new Date(b.date || b.timestamp || b.createdAt) - new Date(a.date || a.timestamp || a.createdAt))
        .slice(0, n);
    },

    /** Datos agrupados por mes para gráficos */
    async getMonthlyData(year = new Date().getFullYear()) {
      const all = await getAllFinancialMovements();
      const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
      all.forEach(tx => {
        const d = new Date(tx.date);
        if (Number.isNaN(d.getTime())) return;
        if (d.getFullYear() === year) {
          const m = d.getMonth();
          const amount = Number(tx.amount) || 0;
          if (tx.type === 'income')  months[m].income  += amount;
          if (tx.type === 'expense') months[m].expense += amount;
        }
      });
      return months;
    },
  };

  /* ════════════════════════════════════════════════════════════
     PRÉSTAMOS
     ════════════════════════════════════════════════════════════ */
  const Loans = {
    add:       (data) => DB.add('loans', data),
    update:    (data) => DB.update('loans', data),
    delete:    (id)   => DB.remove('loans', id),
    getAll:    ()     => DB.getAll('loans'),
    getById:   (id)   => DB.getById('loans', id),
    getActive: ()     => DB.getByIndex('loans', 'status', 'active'),

    async getSummary() {
      const all = await DB.getAll('loans');
      return all.reduce((acc, l) => {
        const amount = Number(l.amount) || 0;
        acc.total += amount;
        if (['active', 'activo', 'overdue', 'atrasado'].includes(l.status)) {
          acc.active += amount;
          acc.activeCount += 1;
        }
        return acc;
      }, { total: 0, active: 0, count: all.length, activeCount: 0 });
    },
  };

  /* ════════════════════════════════════════════════════════════
     CLIENTES (CRM)
     ════════════════════════════════════════════════════════════ */
  const Clients = {
    add:     (data) => DB.add('clients', data),
    update:  (data) => DB.update('clients', data),
    delete:  (id)   => DB.remove('clients', id),
    getAll:  ()     => DB.getAll('clients'),
    getById: (id)   => DB.getById('clients', id),

    async search(query) {
      const all = await DB.getAll('clients');
      const q = query.toLowerCase();
      return all.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    },
  };

  /* ════════════════════════════════════════════════════════════
     INVERSIONES
     ════════════════════════════════════════════════════════════ */
  const Investments = {
    add:     (data) => DB.add('investments', data),
    update:  (data) => DB.update('investments', data),
    delete:  (id)   => DB.remove('investments', id),
    getAll:  ()     => DB.getAll('investments'),
    getById: (id)   => DB.getById('investments', id),

    async getPortfolioValue() {
      const all = await DB.getAll('investments');
      return all.reduce((acc, inv) => {
        const invested = Number(inv.invested ?? inv.capitalInvertido ?? inv.montoInicial ?? 0);
        const current = Number(inv.currentValue ?? inv.valorActual ?? inv.valorFinal ?? invested);
        acc.invested += Number.isFinite(invested) ? invested : 0;
        acc.current  += Number.isFinite(current) ? current : 0;
        return acc;
      }, { invested: 0, current: 0 });
    },
  };

  /* ════════════════════════════════════════════════════════════
     ACTIVOS
     ════════════════════════════════════════════════════════════ */
  const Assets = {
    add:     (data) => DB.add('assets', data),
    update:  (data) => DB.update('assets', data),
    delete:  (id)   => DB.remove('assets', id),
    getAll:  ()     => DB.getAll('assets'),
    getById: (id)   => DB.getById('assets', id),

    async getTotalValue() {
      const all = await DB.getAll('assets');
      return all.reduce((acc, a) => {
        const value = Number(a.valorActual ?? a.value ?? a.valorCompra ?? 0);
        return acc + (Number.isFinite(value) ? value : 0);
      }, 0);
    },
  };

  const Business = {
    Animals: crudStore('animals'),
    Vehicles: crudStore('vehicles'),
    Trading: crudStore('trading_accounts'),
    Software: crudStore('software_projects'),
    Patrimony: crudStore('personal_patrimony'),
  };

  const Marketplace = {
    Products: crudStore('marketplace_products'),
    Categories: crudStore('marketplace_categories'),
    Suppliers: crudStore('marketplace_suppliers'),
    Sales: crudStore('marketplace_sales'),
  };

  /* ════════════════════════════════════════════════════════════
     HISTORIAL (log de actividad)
     ════════════════════════════════════════════════════════════ */
  const History = {
    log: (action, data = {}) => DB.add('history', normalizeHistoryEntry(action, data)),
    getAll:   () => DB.getAll('history'),
    getRecent: async (n = 20) => {
      const all = await DB.getAll('history');
      return all
        .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date))
        .slice(0, n);
    },
    clear: () => DB.clear('history'),
  };

  /* ------------------------------------------------------------
     CONFIGURACION
     ------------------------------------------------------------ */
  const Settings = {
    async get(key) {
      const result = await DB.getById('settings', key);
      return result ? result.value : null;
    },
    async set(key, value) {
      return DB.update('settings', { key, value });
    },
    async getAll() {
      return DB.getAll('settings');
    },
  };

  /* ------------------------------------------------------------
     MOVIMIENTOS REALES Y LIMPIEZA DE DATOS HEREDADOS
     ------------------------------------------------------------ */
  async function getAllFinancialMovements() {
    const [transactions, financeMovements] = await Promise.all([
      DB.getAll('transactions').catch(() => []),
      DB.getAll('finance_movements').catch(() => []),
    ]);

    return [...transactions, ...financeMovements]
      .filter(isRealFinancialMovement)
      .map(normalizeFinancialMovement);
  }

  function normalizeFinancialMovement(row) {
    const amount = Number(row.amount ?? row.monto ?? 0);
    const category = row.category || row.categoria || '';
    return {
      ...row,
      type: row.type === 'income' || row.type === 'ingreso' ? 'income' : row.type === 'expense' || row.type === 'egreso' ? 'expense' : row.type,
      category,
      categoryLabel: row.categoryLabel || getFinanceCategoryLabel(category),
      amount: Number.isFinite(amount) ? amount : 0,
      date: row.date || row.fecha || row.timestamp || row.createdAt || new Date().toISOString(),
    };
  }

  function isRealFinancialMovement(row) {
    if (!row || row.isDemo || row.demo || row.mock || row.sample || row._demo) return false;
    const type = row.type === 'ingreso' ? 'income' : row.type === 'egreso' ? 'expense' : row.type;
    const amount = Number(row.amount ?? row.monto);
    return ['income', 'expense'].includes(type) && Number.isFinite(amount) && amount > 0;
  }

  function crudStore(storeName) {
    return {
      add: (data) => DB.add(storeName, data),
      update: (data) => DB.update(storeName, data),
      delete: (id) => DB.remove(storeName, id),
      getAll: () => DB.getAll(storeName),
      getById: (id) => DB.getById(storeName, id),
    };
  }

  async function seedDemoData() {
    console.info('[Storage] seedDemoData desactivado: el ERP usa solo datos reales.');
    return false;
  }

  async function cleanupDemoData() {
    const demoMatchers = {
      transactions: isLegacyDemoTransaction,
      clients: isLegacyDemoClient,
      investments: isLegacyDemoInvestment,
      assets: isLegacyDemoAsset,
      loans: isLegacyDemoLoan,
      history: isLegacyDemoHistory,
    };

    const removed = {};
    for (const [storeName, matcher] of Object.entries(demoMatchers)) {
      const rows = await DB.getAll(storeName).catch(() => []);
      const demoRows = rows.filter(matcher);
      for (const row of demoRows) {
        if (row.id != null) await DB.remove(storeName, row.id);
      }
      if (demoRows.length) removed[storeName] = demoRows.length;
    }

    if (Object.keys(removed).length > 0) {
      await History.log('demo_data_cleaned', {
        module: 'settings',
        category: 'maintenance',
        description: 'Datos demo heredados eliminados de IndexedDB',
        status: 'success',
        removed,
      });
      console.info('[Storage] Datos demo heredados eliminados:', removed);
    }

    return removed;
  }

  function hasDemoFlag(row) {
    return !!(row?.isDemo || row?.demo || row?.mock || row?.sample || row?._demo);
  }

  function isLegacyDemoTransaction(row) {
    if (hasDemoFlag(row)) return true;
    const desc = String(row.description || '').toLowerCase();
    const cat = String(row.category || '').toLowerCase();
    return /^(salario|renta inversi.n|renta inversion|gastos fijos|mercado)\b/.test(desc)
      && /^(salario|inversi.n|inversion|servicios|alimentaci.n|alimentacion)$/.test(cat);
  }

  function isLegacyDemoClient(row) {
    if (hasDemoFlag(row)) return true;
    const name = String(row.name || '');
    return /^(Carlos Mendoza|Mar.a Torres|Andr.s G.mez|Laura Jim.nez)$/i.test(name)
      && /@(email\.com)$/.test(String(row.email || ''));
  }

  function isLegacyDemoInvestment(row) {
    if (hasDemoFlag(row)) return true;
    return /^(CDT Bancolombia|Finca Ra.z|Acciones ETF)$/i.test(String(row.name || ''))
      && row.rate != null
      && (row.invested != null || row.currentValue != null);
  }

  function isLegacyDemoAsset(row) {
    if (hasDemoFlag(row)) return true;
    return /^(Laptop MacBook Pro|Veh.culo Toyota)$/i.test(String(row.name || ''))
      && row.value != null
      && row.purchaseDate != null;
  }

  function isLegacyDemoLoan(row) {
    if (hasDemoFlag(row)) return true;
    return /^(Carlos Mendoza|Mar.a Torres|Laura Jim.nez)$/i.test(String(row.clientName || ''))
      && row.rate != null
      && row.term != null
      && row.paidMonths != null;
  }

  function isLegacyDemoHistory(row) {
    if (hasDemoFlag(row)) return true;
    const description = String(row.description || row.text || '').toLowerCase();
    return description.includes('base de datos inicializada')
      || description.includes('datos demo')
      || row.action === 'demo_data_seeded';
  }

  function normalizeHistoryEntry(action, data = {}) {
    const timestamp = data.timestamp || data.date || new Date().toISOString();
    return {
      timestamp,
      date: timestamp,
      module: data.module || data.modulo || data.source || 'system',
      action: data.action || action || 'activity',
      category: data.category || data.type || 'general',
      categoryLabel: data.categoryLabel || getFinanceCategoryLabel(data.category) || null,
      description: data.description || data.text || data.desc || action || 'Actividad registrada',
      amount: Number.isFinite(Number(data.amount)) ? Number(data.amount) : null,
      status: data.status || data.estado || null,
      entityId: data.entityId || data.id || null,
      data,
    };
  }

  async function exportData() {
    const stores = DB.getStoreNames();
    const data = {};
    for (const storeName of stores) {
      data[storeName] = await DB.getAll(storeName);
    }
    return {
      app: APP_CONFIG.name,
      version: APP_CONFIG.version,
      dbVersion: APP_CONFIG.db.version,
      exportedAt: new Date().toISOString(),
      stores,
      data,
    };
  }

  async function importData(payload, { mode = 'merge' } = {}) {
    if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
      throw new Error('El archivo no tiene un formato de backup válido.');
    }

    const knownStores = DB.getStoreNames();
    const incomingStores = Object.keys(payload.data).filter(storeName => knownStores.includes(storeName));
    if (incomingStores.length === 0) {
      throw new Error('El backup no contiene stores compatibles con esta versión.');
    }

    for (const storeName of incomingStores) {
      const rows = payload.data[storeName];
      if (!Array.isArray(rows)) continue;
      if (mode === 'replace') await DB.replaceAll(storeName, rows);
      else await DB.bulkPut(storeName, rows);
    }

    await History.log('backup_imported', {
      module: 'settings',
      category: 'backup',
      description: `Backup importado en modo ${mode}`,
      status: 'success',
      stores: incomingStores,
    });

    return { importedStores: incomingStores, mode };
  }

  async function resetLocalData() {
    await DB.clearAll();
    await History.log('local_database_cleared', {
      module: 'settings',
      category: 'maintenance',
      description: 'Base local limpiada por el usuario',
      status: 'warning',
    });
    return true;
  }

  /* ── API pública ─────────────────────────────────────────── */
  return {
    Transactions,
    Loans,
    Clients,
    Investments,
    Assets,
    Business,
    Marketplace,
    History,
    Settings,
    seedDemoData,
    cleanupDemoData,
    exportData,
    importData,
    resetLocalData,
    normalizeHistoryEntry,
  };
})();

window.Storage = Storage;
const add = (storeName, data) => DB.add(storeName, data);
const save = (storeName, data) => data?.id ? DB.update(storeName, data) : DB.add(storeName, data);
const update = (storeName, data) => DB.update(storeName, data);
const remove = (storeName, id) => DB.remove(storeName, id);
const getById = (storeName, id) => DB.getById(storeName, id);
const getAll = (storeName) => DB.getAll(storeName);
const clear = (storeName) => DB.clear(storeName);
const exportData = Storage.exportData;
const importData = Storage.importData;
const resetLocalData = Storage.resetLocalData;
const cleanupDemoData = Storage.cleanupDemoData;
const deleteRecord = remove;

Object.assign(Storage, {
  add,
  save,
  update,
  remove,
  delete: deleteRecord,
  getById,
  getAll,
  clear,
  exportData,
  importData,
  resetLocalData,
  cleanupDemoData,
});

export {
  Storage,
  add,
  save,
  update,
  remove,
  deleteRecord as delete,
  getById,
  getAll,
  clear,
  exportData,
  importData,
  resetLocalData,
  cleanupDemoData,
};
