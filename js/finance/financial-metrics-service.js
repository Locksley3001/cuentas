import { Storage } from '../storage/storage.js';
import { financeEngine } from './finance-engine.js';

export class FinancialMetricsService {
  constructor(engine = financeEngine) {
    this.engine = engine;
  }

  async collectDatasets() {
    const [
      transactions,
      financeMovements,
      loans,
      loanPayments,
      investments,
      assets,
      animals,
      vehicles,
      tradingAccounts,
      softwareProjects,
      personalPatrimony,
      liabilities,
    ] = await Promise.all([
      safeAll('transactions'),
      safeAll('finance_movements'),
      safeAll('loans'),
      safeAll('loan_payments'),
      safeAll('investments'),
      safeAll('assets'),
      safeAll('animals'),
      safeAll('vehicles'),
      safeAll('trading_accounts'),
      safeAll('software_projects'),
      safeAll('personal_patrimony'),
      safeAll('liabilities'),
    ]);

    return {
      transactions,
      financeMovements,
      loans,
      loanPayments,
      investments,
      assets,
      animals,
      vehicles,
      tradingAccounts,
      softwareProjects,
      personalPatrimony,
      liabilities,
    };
  }

  async getMetrics() {
    const datasets = await this.collectDatasets();
    return this.engine.buildState(datasets);
  }
}

export const financialMetricsService = new FinancialMetricsService();

async function safeAll(storeName) {
  try {
    return await Storage.getAll(storeName);
  } catch (_) {
    return [];
  }
}
