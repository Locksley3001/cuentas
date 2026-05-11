/* ============================================================
   config.js — Configuración global de la aplicación
   ============================================================ */

const APP_CONFIG = {
  /* ── Metadatos de la app ─────────────────────────────────── */
  name:        'CUENTAS',
  version:     '1.0.0',
  description: 'ERP Personal — Gestión Financiera Inteligente',

  /* ── Configuración de almacenamiento ─────────────────────── */
  db: {
    name:    'cuentasDB',
    version: 10,
    /* Stores que se crearán en IndexedDB */
    stores: {
      transactions: { keyPath: 'id', autoIncrement: true },
      finance_movements: { keyPath: 'id', autoIncrement: true },
      loans:        { keyPath: 'id', autoIncrement: true },
      loan_payments:{ keyPath: 'id', autoIncrement: true },
      loan_pledges: { keyPath: 'id', autoIncrement: true },
      clients:      { keyPath: 'id', autoIncrement: true },
      crm_leads:    { keyPath: 'id', autoIncrement: true },
      crm_followups:{ keyPath: 'id', autoIncrement: true },
      crm_meetings: { keyPath: 'id', autoIncrement: true },
      crm_notes:    { keyPath: 'id', autoIncrement: true },
      crm_tasks:    { keyPath: 'id', autoIncrement: true },
      investments:  { keyPath: 'id', autoIncrement: true },
      investment_expenses: { keyPath: 'id', autoIncrement: true },
      investment_operations: { keyPath: 'id', autoIncrement: true },
      assets:       { keyPath: 'id', autoIncrement: true },
      asset_history:{ keyPath: 'id', autoIncrement: true },
      asset_value_history:{ keyPath: 'id', autoIncrement: true },
      businesses:   { keyPath: 'id', autoIncrement: true },
      history:      { keyPath: 'id', autoIncrement: true },
      settings:     { keyPath: 'key' },
    },
  },

  /* ── Moneda y formato ────────────────────────────────────── */
  currency: {
    code:    'COP',
    symbol:  '$',
    locale:  'es-CO',
    decimals: 0,
  },

  /* ── Rutas registradas de la SPA ─────────────────────────── */
  routes: {
    dashboard:   { label: 'Dashboard',       icon: '⬡',  module: 'dashboard'   },
    finance:     { label: 'Finanzas',         icon: '◈',  module: 'finance'     },
    loans:       { label: 'Préstamos',        icon: '⟳',  module: 'loans'       },
    crm:         { label: 'Clientes (CRM)',   icon: '◉',  module: 'crm'         },
    investments: { label: 'Inversiones',      icon: '△',  module: 'investments' },
    assets:      { label: 'Activos',          icon: '◻',  module: 'assets'      },
    history:     { label: 'Historial',        icon: '≡',  module: 'history'     },
    settings:    { label: 'Configuración',    icon: '⚙',  module: 'settings'    },
  },

  /* ── Categorías de transacciones ─────────────────────────── */
  transactionCategories: {
    income:  ['Salario', 'Inversión', 'Préstamo cobrado', 'Arriendo', 'Dividendos', 'Otro ingreso'],
    expense: ['Alimentación', 'Transporte', 'Salud', 'Educación', 'Entretenimiento', 'Servicios', 'Deuda', 'Otro gasto'],
  },

  /* ── Meses en español ────────────────────────────────────── */
  months: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],

  /* ── Estado inicial de la UI ─────────────────────────────── */
  ui: {
    sidebarCollapsed: false,
    defaultRoute: 'dashboard',
    toastDuration: 3500,
  },
};

/* Exportar para uso en otros módulos */
window.APP_CONFIG = APP_CONFIG;
export { APP_CONFIG };
