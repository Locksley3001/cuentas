import {
  classifyFinancialMovement,
  FINANCIAL_CONCEPTS,
} from './categories.js';

const ACTIVE_LOAN_STATUSES = new Set(['active', 'activo', 'overdue', 'atrasado']);
const PAID_LOAN_STATUSES = new Set(['paid', 'pagado', 'completed']);
const ACTIVE_INVESTMENT_STATUSES = new Set(['activa', 'active', 'pausada']);
const PERSONAL_ASSET_TYPES = new Set(['efectivo', 'carros', 'motos', 'propiedades', 'software', 'paginas_web', 'bots_ia', 'dominios', 'licencias']);
const COMMERCIAL_ASSET_TYPES = new Set(['vacas', 'caballos', 'relojes', 'prendas', 'inversiones', 'criptomonedas']);

export class FinanceEngine {
  normalizeMovement(row) {
    return classifyFinancialMovement(row);
  }

  buildState(datasets = {}) {
    const movements = [
      ...(datasets.transactions || []),
      ...(datasets.financeMovements || []),
    ].filter(isRealMovement).map(row => this.normalizeMovement(row));

    const loans = datasets.loans || [];
    const loanPayments = datasets.loanPayments || [];
    const investments = datasets.investments || [];
    const assets = datasets.assets || [];
    const liabilities = datasets.liabilities || [];

    const movementMetrics = aggregateMovements(movements);
    const loanMetrics = aggregateLoans(loans, loanPayments);
    const investmentMetrics = aggregateInvestments(investments);
    const assetMetrics = aggregateAssets(assets);
    const liabilityMetrics = aggregateLiabilities(liabilities);

    const liquidCapital = movementMetrics.liquidCapital;
    const investedCapital = loanMetrics.activePortfolio
      + investmentMetrics.activeCapital
      + assetMetrics.commercialAssets;
    const reserves = movementMetrics.reserves;
    const liabilitiesTotal = liabilityMetrics.total;
    const patrimonio = liquidCapital
      + investedCapital
      + assetMetrics.personalAssets
      + reserves
      - liabilitiesTotal;

    return {
      generatedAt: new Date().toISOString(),
      concepts: FINANCIAL_CONCEPTS,
      legacy: {
        income: movementMetrics.legacyIncome,
        expense: movementMetrics.legacyExpense,
        balance: movementMetrics.legacyIncome - movementMetrics.legacyExpense,
        movements: movements.length,
      },
      metrics: {
        liquidCapital: round(liquidCapital),
        investedCapital: round(investedCapital),
        patrimonio: round(patrimonio),
        personalAssets: round(assetMetrics.personalAssets),
        commercialAssets: round(assetMetrics.commercialAssets),
        realProfit: round(movementMetrics.realProfit + loanMetrics.realizedInterest + investmentMetrics.realizedProfit),
        cashFlow: round(movementMetrics.cashFlow),
        activePortfolio: round(loanMetrics.activePortfolio),
        projectedReturn: round(loanMetrics.projectedReturn + investmentMetrics.projectedReturn),
        liabilities: round(liabilitiesTotal),
        reserves: round(reserves),
      },
      breakdown: {
        movements: movementMetrics,
        loans: loanMetrics,
        investments: investmentMetrics,
        assets: assetMetrics,
        liabilities: liabilityMetrics,
      },
      sourceCounts: {
        movements: movements.length,
        loans: loans.length,
        loanPayments: loanPayments.length,
        investments: investments.length,
        assets: assets.length,
        liabilities: liabilities.length,
      },
    };
  }
}

export const financeEngine = new FinanceEngine();

function aggregateMovements(movements) {
  return movements.reduce((acc, movement) => {
    acc.legacyIncome += movement.type === 'income' ? movement.amount : 0;
    acc.legacyExpense += movement.type === 'expense' ? movement.amount : 0;
    acc.liquidCapital += movement.liquidImpact || 0;
    acc.investedCapital += movement.investedImpact || 0;
    acc.personalAssets += movement.personalAssetImpact || 0;
    acc.commercialAssets += movement.commercialAssetImpact || 0;
    acc.reserves += movement.reserveImpact || 0;
    acc.realProfit += movement.realProfitImpact || 0;
    acc.cashFlow += movement.cashFlowImpact || 0;

    const bucket = movement.capitalBucket || 'unknown';
    acc.byBucket[bucket] = (acc.byBucket[bucket] || 0) + movement.amount;
    const concept = movement.financeConcept || 'unknown';
    acc.byConcept[concept] = (acc.byConcept[concept] || 0) + movement.amount;
    return acc;
  }, {
    legacyIncome: 0,
    legacyExpense: 0,
    liquidCapital: 0,
    investedCapital: 0,
    personalAssets: 0,
    commercialAssets: 0,
    reserves: 0,
    realProfit: 0,
    cashFlow: 0,
    byBucket: {},
    byConcept: {},
  });
}

function aggregateLoans(loans, payments) {
  const paymentsByLoan = groupBy(payments, payment => String(payment.loanId));

  return loans.reduce((acc, loan) => {
    const amount = number(loan.amount);
    const totalInterest = number(loan.totalInterest);
    const totalAmount = number(loan.totalAmount || amount + totalInterest);
    const loanPayments = paymentsByLoan[String(loan.id)] || [];
    const totalPaid = sum(loanPayments, 'amount');
    const remainingTotal = Math.max(totalAmount - totalPaid, 0);
    const principalOutstanding = Math.max(amount - Math.min(totalPaid, amount), 0);
    const realizedInterest = Math.max(totalPaid - amount, 0);
    const projectedReturn = Math.max(totalInterest - realizedInterest, 0);

    if (ACTIVE_LOAN_STATUSES.has(loan.status)) {
      acc.activePortfolio += principalOutstanding || Math.min(remainingTotal, amount);
      acc.projectedReturn += projectedReturn;
      acc.activeCount += 1;
    }

    if (PAID_LOAN_STATUSES.has(loan.status)) {
      acc.paidCount += 1;
    }

    acc.realizedInterest += realizedInterest;
    acc.totalPrincipal += amount;
    acc.totalPaid += totalPaid;
    return acc;
  }, {
    totalPrincipal: 0,
    activePortfolio: 0,
    projectedReturn: 0,
    realizedInterest: 0,
    totalPaid: 0,
    activeCount: 0,
    paidCount: 0,
  });
}

function aggregateInvestments(investments) {
  return investments.reduce((acc, investment) => {
    const capital = number(investment.capitalInvertido ?? investment.invested ?? investment.montoInicial);
    const current = number(investment.valorActual ?? investment.currentValue ?? capital);
    const grossProfit = number(investment.ganancias);
    const expenses = number(investment.totalGastos);
    const netProfit = grossProfit - expenses;
    const status = investment.estado || investment.status;

    acc.totalCapital += capital;
    acc.currentValue += current;
    acc.netProfit += netProfit;

    if (ACTIVE_INVESTMENT_STATUSES.has(status)) {
      acc.activeCapital += current || capital;
      acc.projectedReturn += Math.max((current + netProfit) - capital, 0);
      acc.activeCount += 1;
    } else {
      acc.realizedProfit += netProfit;
    }

    return acc;
  }, {
    totalCapital: 0,
    currentValue: 0,
    activeCapital: 0,
    projectedReturn: 0,
    realizedProfit: 0,
    netProfit: 0,
    activeCount: 0,
  });
}

function aggregateAssets(assets) {
  return assets.reduce((acc, asset) => {
    const value = number(asset.valorActual ?? asset.value ?? asset.valorCompra);
    const type = asset.tipo || asset.type;
    const purpose = asset.financialPurpose || inferAssetPurpose(type);

    acc.totalValue += value;
    if (purpose === 'commercial') acc.commercialAssets += value;
    else acc.personalAssets += value;
    return acc;
  }, {
    totalValue: 0,
    personalAssets: 0,
    commercialAssets: 0,
  });
}

function aggregateLiabilities(liabilities) {
  return {
    total: liabilities.reduce((acc, liability) => acc + number(liability.balance ?? liability.amount), 0),
  };
}

function inferAssetPurpose(type) {
  if (COMMERCIAL_ASSET_TYPES.has(type)) return 'commercial';
  if (PERSONAL_ASSET_TYPES.has(type)) return 'personal';
  return 'personal';
}

function isRealMovement(row) {
  if (!row || row.isDemo || row.demo || row.mock || row.sample || row._demo) return false;
  const movement = classifyFinancialMovement(row);
  const date = new Date(movement.date || movement.fecha || movement.timestamp || movement.createdAt || Date.now());
  return ['income', 'expense'].includes(movement.type)
    && Number.isFinite(movement.amount)
    && movement.amount > 0
    && !Number.isNaN(date.getTime());
}

function groupBy(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row);
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + number(row[key]), 0);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
