/* ============================================================
   app.js - Punto de entrada modular de CUENTAS
   ============================================================ */

import { APP_CONFIG } from './config.js';
import { DB } from './storage/db.js';
import { Storage } from './storage/storage.js';
import './router.js';
import './components/cards.js';
import './components/sidebar.js';
import './components/navbar.js';
import './utils/format.js';
import { DashboardModule } from './modules/dashboard.js';
import { setupGlobalIntegrations } from './modules/integrations.js';
import { HistoryModule, initHistory } from './modules/history.js';
import { initSettings, SettingsModule } from './modules/settings.js';
import { financeStateManager } from './finance/finance-state-manager.js';

const pageContent = () => document.getElementById('page-content');

async function initApp() {
  console.log(`[App] Iniciando ${APP_CONFIG.name} v${APP_CONFIG.version}`);

  try {
    await DB.init();
    await financeStateManager.init();
    await Storage.cleanupDemoData();

    Sidebar.init();
    Navbar.init();
    setupGlobalIntegrations();
    await HistoryModule.consumePendingLogs();
    await SettingsModule.load();
    SettingsModule.applyPreferences();

    await registerRoutes();
    bindGlobalKeys();

    await Router.navigate(Router.resolveInitial(APP_CONFIG.ui.defaultRoute));
    await HistoryModule.log({
      module: 'system',
      action: 'app_ready',
      category: 'startup',
      description: 'Aplicación inicializada correctamente',
      status: 'success',
    });
    console.log('[App] Aplicacion lista');
  } catch (err) {
    console.error('[App] Error critico al iniciar:', err);
    renderFatalError(err);
  }
}

async function registerRoutes() {
  const container = pageContent();

  Router.register('dashboard', () => DashboardModule.render());

  const [
    finance,
    loans,
    crm,
    businessModules,
    marketplace,
  ] = await Promise.all([
    import('./modules/finance.js'),
    import('./modules/loans.js'),
    import('./modules/crm.js'),
    import('./modules/business-modules.js'),
    import('./modules/marketplace.js'),
  ]);

  Router.register('finance', () => finance.initFinance(container));
  Router.register('loans', async () => {
    container.innerHTML = '<div id="loans-container"></div>';
    await loans.initLoans();
  });
  Router.register('marketplace', () => marketplace.initMarketplace(container));
  Router.register('crm', async () => {
    container.innerHTML = '<div id="crm-container"></div>';
    await crm.initCRM();
  });
  Router.register('animals', () => businessModules.initAnimals(container));
  Router.register('vehicles', () => businessModules.initVehicles(container));
  Router.register('trading', () => businessModules.initTrading(container));
  Router.register('software', () => businessModules.initSoftware(container));
  Router.register('patrimony', () => businessModules.initPersonalPatrimony(container));
  Router.register('history', () => initHistory(container));
  Router.register('settings', () => initSettings(container));
}

function bindGlobalKeys() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById('navbar-search-input')?.focus();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      Sidebar.toggle();
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      const route = Router.getCurrent();
      if (route === 'dashboard') DashboardModule.quickAdd();
      if (route === 'finance') document.getElementById('fin-btn-new')?.click();
      if (route === 'loans') document.getElementById('btn-new-loan')?.click();
      if (route === 'marketplace') document.querySelector('[data-action="new-product"]')?.click();
      if (route === 'crm') document.getElementById('btn-new-lead')?.click();
      if (['animals', 'vehicles', 'trading', 'software', 'patrimony'].includes(route)) {
        document.querySelector('[data-action="create"]')?.click();
      }
    }
  });
}

function renderFatalError(err) {
  const root = document.getElementById('app');
  if (!root) return;
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;text-align:center;padding:32px;font-family:'Outfit',sans-serif;color:#f0f4ff;">
      <div style="font-size:3rem;opacity:.3">!</div>
      <h1 style="font-size:1.5rem;font-weight:700;color:#f87171">Error al iniciar CUENTAS</h1>
      <p style="color:#8b94b3;max-width:480px;font-size:.9rem;line-height:1.6">${escapeHtml(err.message || 'Error desconocido')}</p>
      <button onclick="location.reload()" style="background:#38bdf8;color:#000;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;font-size:.875rem;">Reintentar</button>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', initApp);
