import { DB } from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { FINANCIAL_CATEGORIES } from './categories.js';
import { financialMetricsService } from './financial-metrics-service.js';

const STORE_CATEGORIES = 'financial_categories';
const STORE_SNAPSHOTS = 'financial_state_snapshots';
const STORE_ACCOUNTS = 'financial_accounts';

export class FinanceStateManager {
  constructor(metricsService = financialMetricsService) {
    this.metricsService = metricsService;
    this.currentState = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return this.currentState;

    await DB.ensureStore(STORE_CATEGORIES, { keyPath: 'value', autoIncrement: false });
    await DB.ensureStore(STORE_SNAPSHOTS, { keyPath: 'id', autoIncrement: true });
    await DB.ensureStore(STORE_ACCOUNTS, { keyPath: 'id', autoIncrement: true });

    await this.seedCategories();
    this.initialized = true;
    return this.refresh({ persistSnapshot: false });
  }

  async seedCategories() {
    const existing = await Storage.getAll(STORE_CATEGORIES).catch(() => []);
    const existingValues = new Set(existing.map(category => category.value));
    const missing = FINANCIAL_CATEGORIES.filter(category => !existingValues.has(category.value));

    for (const category of missing) {
      await Storage.add(STORE_CATEGORIES, {
        ...category,
        system: true,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  async refresh({ persistSnapshot = false } = {}) {
    this.currentState = await this.metricsService.getMetrics();

    if (persistSnapshot) {
      await Storage.add(STORE_SNAPSHOTS, {
        createdAt: new Date().toISOString(),
        state: this.currentState,
      }).catch(() => {});
    }

    window.dispatchEvent(new CustomEvent('finance:state-ready', {
      detail: { state: this.currentState },
    }));

    return this.currentState;
  }

  async getCurrentState({ force = false } = {}) {
    if (!this.initialized) await this.init();
    if (force || !this.currentState) return this.refresh();
    return this.currentState;
  }

  invalidate(reason = 'external_update') {
    window.dispatchEvent(new CustomEvent('finance:state-invalidated', {
      detail: { reason },
    }));
    this.currentState = null;
  }
}

export const financeStateManager = new FinanceStateManager();
