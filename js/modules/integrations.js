import { Storage } from '../storage/storage.js';
import { showToast } from '../components/modal.js';
import { HistoryModule } from './history.js';
import { Investments } from './investments.js';
import { Assets } from './assets.js';

let initialized = false;

const FINANCE_CATEGORY_LABELS = {
  ventas: 'Ventas',
  servicios: 'Servicios',
  intereses: 'Intereses',
  trading: 'Trading',
  inversiones: 'Inversiones',
  otros_ing: 'Otros ingresos',
  capital_inicial: 'Capital inicial',
  publicidad: 'Publicidad',
  herramientas: 'Herramientas',
  servidores: 'Servidores',
  transporte: 'Transporte',
  alimentacion: 'Alimentación',
  mantenimiento: 'Mantenimiento',
  otros_gas: 'Otros gastos',
};

export function setupGlobalIntegrations() {
  if (initialized) return;
  initialized = true;

  HistoryModule.setupGlobalListeners();

  window.AppEvents = {
    emit: (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, { detail })),
    on: (name, handler) => window.addEventListener(name, handler),
  };

  window.Notifier = Notifier;
  window.Validators = Validators;

  window.addEventListener('finance:update', handleFinanceUpdate);
  window.addEventListener('dashboard:update', handleDashboardUpdate);
  window.addEventListener('history:changed', () => refreshActiveDashboard());
  window.addEventListener('app:navigate', (event) => {
    const route = event.detail?.route;
    if (!route || route === 'dashboard') return;
    HistoryModule.log({
      module: 'system',
      action: 'navigate',
      category: 'navigation',
      description: `Navegación a ${route}`,
      status: 'ok',
    }).catch(() => {});
  });

  console.log('[Integrations] Sistema global conectado.');
}

export function setupInvestmentIntegrations() {
  setupGlobalIntegrations();
}

async function handleFinanceUpdate(event) {
  const { source = 'system', eventType = 'update', data = {} } = event.detail || {};

  await HistoryModule.log({
    module: source,
    action: eventType,
    category: 'finance',
    description: describeExternalFinanceEvent(source, eventType, data),
    amount: pickAmount(data),
    status: data.estado || data.status || 'ok',
    entityId: data.id,
  });

  refreshActiveDashboard();
}

async function handleDashboardUpdate(event) {
  const { source = 'system', stats = {} } = event.detail || {};
  await HistoryModule.log({
    module: source,
    action: 'dashboard_update',
    category: 'sync',
    description: `Estadísticas sincronizadas desde ${source}`,
    status: 'ok',
    data: stats,
  });
  refreshActiveDashboard();
}

function refreshActiveDashboard() {
  if (Router?.getCurrent?.() === 'dashboard' && window.DashboardModule?.render) {
    window.DashboardModule.render();
  }
}

function describeExternalFinanceEvent(source, eventType, data) {
  const name = data.nombre || data.name || data.descripcion || data.description || data.clientName || 'registro';
  const labels = {
    investment: `Inversión registrada: ${name}`,
    expense: `Gasto asociado registrado: ${name}`,
    asset: `Activo registrado: ${name}`,
    asset_update: `Activo actualizado: ${name}`,
    payment: `Pago registrado: ${name}`,
  };
  return labels[eventType] || `${source}: ${eventType}`;
}

function pickAmount(data = {}) {
  const candidates = [data.amount, data.monto, data.valorActual, data.valorCompra, data.capitalInvertido, data.capital, data.dealValue];
  const found = candidates.find(v => Number.isFinite(Number(v)));
  return found === undefined ? null : Number(found);
}

export const Notifier = {
  success(message) { notify(message, 'success'); },
  info(message) { notify(message, 'info'); },
  warning(message) { notify(message, 'warning'); },
  error(message) { notify(message, 'danger'); },
};

function notify(message, type = 'info') {
  const prefs = Storage.Settings?.get ? null : null;
  showToast(message, type);
}

export const Validators = {
  required(value, label = 'Campo') {
    if (value === null || value === undefined || String(value).trim() === '') {
      throw new Error(`${label} es obligatorio`);
    }
    return true;
  },
  positiveNumber(value, label = 'Monto') {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} debe ser mayor a 0`);
    return number;
  },
  date(value, label = 'Fecha') {
    if (!value || Number.isNaN(new Date(value).getTime())) throw new Error(`${label} no es válida`);
    return true;
  },
  email(value, label = 'Correo') {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${label} no tiene un formato válido`);
    return true;
  },
  uniqueBy(rows, key, value, label = 'Registro') {
    if (rows.some(row => String(row[key]).toLowerCase() === String(value).toLowerCase())) {
      throw new Error(`${label} duplicado`);
    }
    return true;
  },
};

export async function getGlobalDashboardData() {
  const [
    transactions,
    financeMovements,
    loans,
    leads,
    investments,
    assets,
    history,
  ] = await Promise.all([
    safeAll('transactions'),
    safeAll('finance_movements'),
    safeAll('loans'),
    safeAll('crm_leads'),
    safeAll('investments'),
    safeAll('assets'),
    safeAll('history'),
  ]);

  const income = sum([...transactions, ...financeMovements].filter(x => x.type === 'income'), 'amount');
  const expense = sum([...transactions, ...financeMovements].filter(x => x.type === 'expense'), 'amount');
  const currentYear = new Date().getFullYear();
  const movements = [...transactions, ...financeMovements]
    .filter(isRealMovement)
    .map(normalizeMovement);
  const yearMovements = movements.filter(m => new Date(m.date).getFullYear() === currentYear);
  const yearlyIncome = sum(yearMovements.filter(x => x.type === 'income'), 'amount');
  const yearlyExpense = sum(yearMovements.filter(x => x.type === 'expense'), 'amount');
  const monthly = buildMonthlyData(yearMovements, currentYear);
  const recentMovements = movements
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);
  const loanActive = sum(loans.filter(x => ['active', 'activo', 'overdue', 'atrasado'].includes(x.status)), 'amount');
  const investmentValue = sum(investments, ['currentValue', 'valorActual', 'capitalInvertido', 'invested']);
  const assetValue = sum(assets, ['value', 'valorActual', 'valorCompra']);

  return {
    income: yearlyIncome,
    expense: yearlyExpense,
    net: yearlyIncome - yearlyExpense,
    allTimeIncome: sum(movements.filter(x => x.type === 'income'), 'amount'),
    allTimeExpense: sum(movements.filter(x => x.type === 'expense'), 'amount'),
    monthly,
    recentMovements,
    capital: investmentValue + assetValue,
    loanActive,
    loans: loans.length,
    leads: leads.length,
    investments: investments.length,
    assets: assets.length,
    history: history.slice(-8).reverse(),
    alerts: buildAlerts({ loans, leads, investments, assets }),
  };
}

function normalizeMovement(row) {
  const amount = Number(row.amount ?? row.monto ?? 0);
  const category = row.category || row.categoria || '';
  return {
    ...row,
    type: row.type === 'ingreso' ? 'income' : row.type === 'egreso' ? 'expense' : row.type,
    category,
    categoryLabel: row.categoryLabel || FINANCE_CATEGORY_LABELS[category] || category,
    amount: Number.isFinite(amount) ? amount : 0,
    date: row.date || row.fecha || row.timestamp || row.createdAt || new Date().toISOString(),
  };
}

function isRealMovement(row) {
  if (!row || row.isDemo || row.demo || row.mock || row.sample || row._demo) return false;
  const movement = normalizeMovement(row);
  const date = new Date(movement.date);
  return ['income', 'expense'].includes(movement.type)
    && Number.isFinite(movement.amount)
    && movement.amount > 0
    && !Number.isNaN(date.getTime());
}

function buildMonthlyData(movements, year) {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  for (const movement of movements) {
    const date = new Date(movement.date);
    if (date.getFullYear() !== year) continue;
    const bucket = months[date.getMonth()];
    bucket[movement.type] += movement.amount;
  }
  return months;
}

export async function getPortfolioDashboardData() {
  const [invStats, assetStats] = await Promise.all([
    Investments.getDashboardData(),
    Assets.getDashboardData(),
  ]);

  const combined = {
    totalCapital: (invStats.totalCapital || 0) + (assetStats.totalValorActual || 0),
    totalInversiones: invStats.totalInversiones || 0,
    totalActivos: assetStats.total || 0,
    inversionesActivas: invStats.activas || 0,
    activosActivos: assetStats.activos || 0,
    roiGlobal: invStats.roi || 0,
    gananciasNetas: invStats.balance || 0,
    patrimonioBruto: assetStats.totalValorActual || 0,
    valorizacionActivos: assetStats.valorizacion || 0,
  };

  return { investments: invStats, assets: assetStats, combined };
}

async function safeAll(storeName) {
  try {
    return await Storage.getAll(storeName);
  } catch (_) {
    return [];
  }
}

function sum(rows, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  return rows.reduce((total, row) => {
    const value = list.map(k => Number(row[k])).find(Number.isFinite) || 0;
    return total + value;
  }, 0);
}

function buildAlerts({ loans, leads, investments, assets }) {
  const alerts = [];
  const overdueLoans = loans.filter(l => ['atrasado', 'overdue'].includes(l.status));
  const pendingTasks = leads.filter(l => l.nextActionDate && l.nextActionDate < new Date().toISOString().slice(0, 10));
  const inactiveInvestments = investments.filter(i => ['cerrada', 'closed', 'pausada'].includes(i.estado || i.status));

  if (overdueLoans.length) alerts.push({ type: 'warning', title: 'Préstamos atrasados', text: `${overdueLoans.length} préstamo(s) requieren seguimiento.` });
  if (pendingTasks.length) alerts.push({ type: 'info', title: 'CRM pendiente', text: `${pendingTasks.length} lead(s) tienen próxima acción vencida.` });
  if (inactiveInvestments.length) alerts.push({ type: 'info', title: 'Inversiones sin actividad', text: `${inactiveInvestments.length} inversión(es) no están activas.` });
  if (!assets.length) alerts.push({ type: 'info', title: 'Inventario vacío', text: 'Registra activos para completar el patrimonio global.' });

  return alerts;
}

export default {
  setupGlobalIntegrations,
  setupInvestmentIntegrations,
  getGlobalDashboardData,
  getPortfolioDashboardData,
  Notifier,
  Validators,
};
