import { financeStateManager } from './finance-state-manager.js';

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pct(part, base) {
  const denominator = Math.abs(n(base));
  if (!denominator) return 0;
  return (n(part) / denominator) * 100;
}

function lastRows(rows = [], count = 12) {
  return Array.isArray(rows) ? rows.slice(-count) : [];
}

export class FinancialReportsService {
  async getReports(state = null) {
    const financialState = state || await financeStateManager.getCurrentState({ force: true });
    const metrics = financialState.metrics || {};
    const composition = financialState.composition || {};
    const monthly = lastRows(financialState.monthly, 12);

    return {
      generatedAt: new Date().toISOString(),
      financial: this.buildFinancialReport(metrics, monthly),
      patrimonial: this.buildPatrimonialReport(metrics, composition, monthly),
      investments: this.buildInvestmentReport(metrics, composition, monthly),
      growth: this.buildGrowthReport(metrics, monthly),
      profitability: this.buildProfitabilityReport(metrics, monthly),
    };
  }

  buildFinancialReport(metrics, monthly) {
    return {
      realIncome: n(metrics.realIncome),
      realExpense: n(metrics.realExpense),
      realProfit: n(metrics.realProfit),
      cashFlow: n(metrics.cashFlow),
      liquidityAvailable: n(metrics.liquidityAvailable),
      monthlyProfit: n(metrics.monthlyProfit),
      monthly,
    };
  }

  buildPatrimonialReport(metrics, composition, monthly) {
    return {
      patrimonio: n(metrics.patrimonio),
      liquidCapital: n(metrics.liquidCapital),
      investedCapital: n(metrics.investedCapital),
      liabilities: n(metrics.liabilities),
      reserves: n(metrics.reserves),
      growthRate: n(metrics.patrimonioGrowth),
      compositionRows: composition.rows || [],
      evolution: monthly.map(row => ({
        key: row.key,
        patrimonio: n(row.patrimonio),
        capitalBase: n(row.capitalBase),
        realProfit: n(row.realProfit),
      })),
    };
  }

  buildInvestmentReport(metrics, composition, monthly) {
    return {
      investedCapital: n(metrics.investedCapital),
      productiveCapital: n(metrics.productiveCapital),
      activePortfolio: n(metrics.activePortfolio),
      projectedReturn: n(metrics.projectedReturn),
      capitalInvestedPct: n(metrics.capitalInvestedPct),
      portfolioReturn: n(metrics.portfolioReturn),
      distribution: composition.rows || [],
      monthlyYield: n(metrics.monthlyYield),
      monthlyYieldRate: n(metrics.monthlyYieldRate),
      monthly,
    };
  }

  buildGrowthReport(metrics, monthly) {
    const first = monthly.find(row => n(row.patrimonio) || n(row.capitalBase));
    const last = monthly.slice().reverse().find(row => n(row.patrimonio) || n(row.capitalBase));
    return {
      patrimonioGrowth: n(metrics.patrimonioGrowth),
      capitalGrowth: n(metrics.capitalGrowth),
      patrimonioDelta: first && last ? n(last.patrimonio) - n(first.patrimonio) : 0,
      capitalDelta: first && last ? n(last.capitalBase) - n(first.capitalBase) : 0,
      evolution: monthly.map(row => ({
        key: row.key,
        patrimonio: n(row.patrimonio),
        capitalBase: n(row.capitalBase),
        realProfit: n(row.realProfit),
        yieldRate: n(row.yieldRate),
      })),
    };
  }

  buildProfitabilityReport(metrics, monthly) {
    return {
      roi: n(metrics.roi),
      realProfitability: pct(metrics.realProfit, metrics.productiveCapital || metrics.investedCapital),
      portfolioReturn: n(metrics.portfolioReturn),
      monthlyYieldRate: n(metrics.monthlyYieldRate),
      realProfit: n(metrics.realProfit),
      productiveCapital: n(metrics.productiveCapital),
      monthly: monthly.map(row => ({
        key: row.key,
        realIncome: n(row.realIncome),
        realExpense: n(row.realExpense),
        realProfit: n(row.realProfit),
        yieldRate: n(row.yieldRate),
      })),
    };
  }
}

export const financialReportsService = new FinancialReportsService();
