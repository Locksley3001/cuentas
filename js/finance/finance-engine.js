import {
  classifyFinancialMovement,
  FINANCIAL_CONCEPTS,
} from './categories.js';
import { buildMarketplaceFinanceContribution } from '../marketplace/marketplace-service.js';

const ACTIVE_LOAN_STATUSES = new Set(['active', 'activo', 'overdue', 'atrasado']);
const PAID_LOAN_STATUSES = new Set(['paid', 'pagado', 'completed']);
const ACTIVE_INVESTMENT_STATUSES = new Set(['activa', 'active', 'pausada']);
const PERSONAL_ASSET_TYPES = new Set(['efectivo', 'carros', 'motos', 'propiedades', 'software', 'paginas_web', 'bots_ia', 'dominios', 'licencias']);
const COMMERCIAL_ASSET_TYPES = new Set(['vacas', 'caballos', 'relojes', 'prendas', 'inversiones', 'criptomonedas']);
const MONTHS_BACK = 12;

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
    const businessMetrics = aggregateBusinessModules(datasets);
    const marketplaceMetrics = buildMarketplaceFinanceContribution(datasets.marketplaceProducts || []);
    const liabilities = datasets.liabilities || [];

    const movementMetrics = aggregateMovements(movements);
    const loanMetrics = aggregateLoans(loans, loanPayments);
    const investmentMetrics = aggregateInvestments(investments);
    const assetMetrics = aggregateAssets(assets);
    const liabilityMetrics = aggregateLiabilities(liabilities);

    const liquidCapital = movementMetrics.liquidCapital;
    const investedCapital = loanMetrics.activePortfolio
      + investmentMetrics.activeCapital
      + assetMetrics.commercialAssets
      + businessMetrics.productiveCapital
      + marketplaceMetrics.capitalBlocked;
    const reserves = movementMetrics.reserves;
    const liabilitiesTotal = liabilityMetrics.total;
    const patrimonio = liquidCapital
      + investedCapital
      + assetMetrics.personalAssets
      + businessMetrics.personalAssets
      + reserves
      - liabilitiesTotal;
    const loanRealIncome = Math.max(loanMetrics.realIncome, movementMetrics.loanPaymentRealIncome);
    const realIncome = movementMetrics.realIncome + loanRealIncome + investmentMetrics.realIncome;
    const realExpense = movementMetrics.realExpense + investmentMetrics.realExpense;
    const realProfit = realIncome - realExpense;
    const productiveCapital = investedCapital + reserves;
    const totalCapitalBase = Math.max(liquidCapital + investedCapital + reserves, 0);
    const capitalInvestedPct = totalCapitalBase > 0 ? (investedCapital / totalCapitalBase) * 100 : 0;
    const roi = productiveCapital > 0 ? (realProfit / productiveCapital) * 100 : 0;
    const portfolioReturn = loanMetrics.totalPrincipal > 0 ? (loanMetrics.realizedInterest / loanMetrics.totalPrincipal) * 100 : 0;
    const monthly = buildMonthlyAnalytics({ movements, loans, loanPayments, patrimonio });
    const latestMonth = monthly[monthly.length - 1] || {};
    const previousMonth = monthly[monthly.length - 2] || {};
    const latestPatrimonio = latestMonth.patrimonio || patrimonio;
    const previousPatrimonio = previousMonth.patrimonio || 0;
    const latestCapitalBase = latestMonth.capitalBase || totalCapitalBase;
    const previousCapitalBase = previousMonth.capitalBase || 0;
    const patrimonioGrowth = previousPatrimonio
      ? ((latestPatrimonio - previousPatrimonio) / Math.abs(previousPatrimonio)) * 100
      : 0;
    const capitalGrowth = previousCapitalBase
      ? ((latestCapitalBase - previousCapitalBase) / Math.abs(previousCapitalBase)) * 100
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      concepts: FINANCIAL_CONCEPTS,
      legacy: {
        income: round(realIncome),
        expense: round(realExpense),
        balance: round(realIncome - realExpense),
        grossIncome: movementMetrics.legacyIncome,
        grossExpense: movementMetrics.legacyExpense,
        movements: movements.length,
      },
      metrics: {
        liquidCapital: round(liquidCapital),
        investedCapital: round(investedCapital),
        patrimonio: round(patrimonio),
        personalAssets: round(assetMetrics.personalAssets + businessMetrics.personalAssets),
        commercialAssets: round(assetMetrics.commercialAssets + businessMetrics.commercialAssets + marketplaceMetrics.inventoryValue),
        realIncome: round(realIncome),
        realExpense: round(realExpense),
        realProfit: round(realProfit),
        cashFlow: round(movementMetrics.cashFlow),
        activePortfolio: round(loanMetrics.activePortfolio),
        projectedReturn: round(loanMetrics.projectedReturn + investmentMetrics.projectedReturn + businessMetrics.projectedReturn + marketplaceMetrics.utilityPotential),
        liabilities: round(liabilitiesTotal),
        reserves: round(reserves),
        roi: round(roi),
        monthlyYield: round(latestMonth.realProfit || 0),
        monthlyYieldRate: round(latestMonth.yieldRate || 0),
        patrimonioGrowth: round(patrimonioGrowth),
        capitalGrowth: round(capitalGrowth),
        productiveCapital: round(productiveCapital),
        liquidityAvailable: round(liquidCapital),
        capitalInvestedPct: round(capitalInvestedPct),
        portfolioReturn: round(portfolioReturn),
        monthlyProfit: round(latestMonth.realProfit || 0),
      },
      composition: buildComposition({
        liquidCapital,
        investedCapital,
        activePortfolio: loanMetrics.activePortfolio,
        investments: investmentMetrics.activeCapital,
        animals: businessMetrics.animals,
        vehicles: businessMetrics.vehiclesBusiness,
        trading: businessMetrics.trading,
        software: businessMetrics.software,
        marketplace: marketplaceMetrics.capitalBlocked,
        personalAssets: assetMetrics.personalAssets,
        personalPatrimony: businessMetrics.personalAssets,
        commercialAssets: assetMetrics.commercialAssets,
        reserves,
        liabilities: liabilitiesTotal,
      }),
      monthly,
      breakdown: {
        movements: movementMetrics,
        loans: loanMetrics,
        investments: investmentMetrics,
        assets: assetMetrics,
        business: businessMetrics,
        marketplace: marketplaceMetrics,
        liabilities: liabilityMetrics,
      },
      sourceCounts: {
        movements: movements.length,
        loans: loans.length,
        loanPayments: loanPayments.length,
        investments: investments.length,
        assets: assets.length,
        animals: (datasets.animals || []).length,
        vehicles: (datasets.vehicles || []).length,
        tradingAccounts: (datasets.tradingAccounts || []).length,
        softwareProjects: (datasets.softwareProjects || []).length,
        personalPatrimony: (datasets.personalPatrimony || []).length,
        marketplaceProducts: (datasets.marketplaceProducts || []).length,
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
    acc.activePortfolioMovement += movement.activePortfolioImpact || 0;
    acc.personalAssets += movement.personalAssetImpact || 0;
    acc.commercialAssets += movement.commercialAssetImpact || 0;
    acc.reserves += movement.reserveImpact || 0;
    const profitImpact = isLoanPaymentMovement(movement) ? 0 : (movement.realProfitImpact || 0);
    const loanPaymentProfit = isLoanPaymentMovement(movement) ? Math.max(movement.realProfitImpact || 0, 0) : 0;
    acc.loanPaymentRealIncome += loanPaymentProfit;
    acc.realProfit += profitImpact;
    if (profitImpact > 0) acc.realIncome += profitImpact;
    if (profitImpact < 0) acc.realExpense += Math.abs(profitImpact);
    if (profitImpact === 0 && ((movement.liquidImpact || 0) || (movement.investedImpact || 0) || (movement.reserveImpact || 0))) {
      acc.capitalMovements += movement.amount;
    }
    if (profitImpact === 0 && (movement.investedImpact || movement.reserveImpact || movement.personalAssetImpact || movement.commercialAssetImpact)) {
      acc.internalMovements += movement.amount;
    }
    acc.cashFlow += movement.cashFlowImpact || 0;

    const bucket = movement.capitalBucket || 'unknown';
    acc.byBucket[bucket] = (acc.byBucket[bucket] || 0) + movement.amount;
    const concept = movement.financeConcept || 'unknown';
    acc.byConcept[concept] = (acc.byConcept[concept] || 0) + movement.amount;
    return acc;
  }, {
    legacyIncome: 0,
    legacyExpense: 0,
    realIncome: 0,
    realExpense: 0,
    loanPaymentRealIncome: 0,
    liquidCapital: 0,
    investedCapital: 0,
    activePortfolioMovement: 0,
    personalAssets: 0,
    commercialAssets: 0,
    reserves: 0,
    realProfit: 0,
    capitalMovements: 0,
    internalMovements: 0,
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
    const split = summarizeLoanPayments(loan, loanPayments);
    const totalPaid = split.totalPaid;
    const remainingTotal = Math.max(totalAmount - totalPaid, 0);
    const principalOutstanding = Math.max(amount - split.principalPaid, 0);
    const realizedInterest = split.interestPaid;
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
    acc.realIncome += realizedInterest;
    acc.totalPrincipal += amount;
    acc.totalPaid += totalPaid;
    return acc;
  }, {
    totalPrincipal: 0,
    activePortfolio: 0,
    projectedReturn: 0,
    realizedInterest: 0,
    realIncome: 0,
    totalPaid: 0,
    activeCount: 0,
    paidCount: 0,
  });
}

function summarizeLoanPayments(loan, payments = []) {
  const principalTotal = number(loan.amount);
  const totalDue = number(loan.totalAmount || principalTotal + number(loan.totalInterest)) || principalTotal;
  const principalRatio = totalDue > 0 ? principalTotal / totalDue : 1;

  return [...payments]
    .sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt))
    .reduce((acc, payment) => {
      const paymentAmount = number(payment.amount);
      const storedPrincipal = Number(payment.principalAmount);
      const storedInterest = Number(payment.interestAmount);

      if (Number.isFinite(storedPrincipal) || Number.isFinite(storedInterest)) {
        const principal = Number.isFinite(storedPrincipal)
          ? storedPrincipal
          : Math.max(paymentAmount - storedInterest, 0);
        const interest = Number.isFinite(storedInterest)
          ? storedInterest
          : Math.max(paymentAmount - principal, 0);
        acc.principalPaid += principal;
        acc.interestPaid += interest;
        acc.totalPaid += paymentAmount;
        return acc;
      }

      const pendingPrincipal = Math.max(principalTotal - acc.principalPaid, 0);
      const principal = Math.min(paymentAmount * principalRatio, pendingPrincipal);
      acc.principalPaid += principal;
      acc.interestPaid += Math.max(paymentAmount - principal, 0);
      acc.totalPaid += paymentAmount;
      return acc;
    }, { totalPaid: 0, principalPaid: 0, interestPaid: 0 });
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
      if (netProfit > 0) acc.realIncome += netProfit;
      if (netProfit < 0) acc.realExpense += Math.abs(netProfit);
    }

    return acc;
  }, {
    totalCapital: 0,
    currentValue: 0,
    activeCapital: 0,
    projectedReturn: 0,
    realizedProfit: 0,
    realIncome: 0,
    realExpense: 0,
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

function aggregateBusinessModules(datasets = {}) {
  const animals = (datasets.animals || []).reduce((acc, row) => {
    if (isClosedBusinessRow(row)) {
      acc.realizedProfit += number(row.ownerProfit);
      return acc;
    }
    acc.capital += number(row.totalInvestment ?? row.purchaseCost);
    return acc;
  }, { capital: 0, realizedProfit: 0 });

  const vehicles = (datasets.vehicles || []).reduce((acc, row) => {
    if (isClosedBusinessRow(row)) return acc;
    const capital = number(row.totalInvestment ?? row.purchaseCost);
    const potential = number(row.marketValue) ? number(row.marketValue) - capital : 0;
    if (row.purpose === 'patrimonio') acc.personal += capital;
    else acc.business += capital;
    acc.potential += potential;
    return acc;
  }, { business: 0, personal: 0, potential: 0 });

  const trading = (datasets.tradingAccounts || []).reduce((acc, row) => {
    acc.capital += number(row.capitalTotal ?? (number(row.capitalBroker) + number(row.capitalInvested)));
    acc.projectedReturn += number(row.pnlUnrealized);
    acc.realizedPnl += number(row.pnlRealized);
    return acc;
  }, { capital: 0, projectedReturn: 0, realizedPnl: 0 });

  const software = (datasets.softwareProjects || []).reduce((acc, row) => {
    if (['desarrollo', 'soporte', 'propuesta'].includes(row.status)) {
      acc.activePipeline += Math.max(number(row.costs) - number(row.payments), 0);
    }
    acc.payments += number(row.payments);
    acc.costs += number(row.costs);
    return acc;
  }, { activePipeline: 0, payments: 0, costs: 0 });

  const personalPatrimony = (datasets.personalPatrimony || []).reduce((acc, row) => {
    if (!isClosedBusinessRow(row)) acc += number(row.purchaseCost);
    return acc;
  }, 0);

  const productiveCapital = animals.capital + vehicles.business + trading.capital + software.activePipeline;
  const personalAssets = vehicles.personal + personalPatrimony;

  return {
    animals: round(animals.capital),
    vehiclesBusiness: round(vehicles.business),
    vehiclesPersonal: round(vehicles.personal),
    trading: round(trading.capital),
    software: round(software.activePipeline),
    personalPatrimony: round(personalPatrimony),
    productiveCapital: round(productiveCapital),
    commercialAssets: round(animals.capital + vehicles.business),
    personalAssets: round(personalAssets),
    projectedReturn: round(trading.projectedReturn + Math.max(vehicles.potential, 0)),
    realizedPnl: round(trading.realizedPnl),
    softwareProfit: round(software.payments - software.costs),
  };
}

function aggregateLiabilities(liabilities) {
  return {
    total: liabilities.reduce((acc, liability) => acc + number(liability.balance ?? liability.amount), 0),
  };
}

function buildMonthlyAnalytics({ movements, loans, loanPayments }) {
  const months = getRecentMonthKeys(MONTHS_BACK);
  const buckets = Object.fromEntries(months.map(month => [month.key, {
    key: month.key,
    label: month.label,
    realIncome: 0,
    realExpense: 0,
    realProfit: 0,
    capitalIn: 0,
    capitalOut: 0,
    loanPrincipalReturned: 0,
    loanInterest: 0,
    patrimonio: 0,
    capitalBase: 0,
    yieldRate: 0,
  }]));

  const explicitLoanPayments = new Set();

  for (const movement of movements) {
    const key = toMonthKey(movement.date || movement.fecha || movement.timestamp || movement.createdAt);
    const bucket = buckets[key];
    if (!bucket) continue;

    const profitImpact = movement.realProfitImpact || 0;
    const loanPayment = isLoanPaymentMovement(movement);
    const countedProfitImpact = loanPayment ? 0 : profitImpact;
    if (loanPayment) {
      const explicitKey = `${movement.meta?.loanId || movement.loanId || ''}|${key}`;
      explicitLoanPayments.add(explicitKey);
      const principal = number(movement.meta?.principalAmount ?? movement.capitalReturnAmount ?? Math.max((movement.amount || 0) - Math.max(profitImpact, 0), 0));
      const interest = Math.max(profitImpact, 0);
      bucket.loanPrincipalReturned += principal;
      bucket.loanInterest += interest;
      bucket.realIncome += interest;
      bucket.capitalIn += principal;
      continue;
    }
    if (countedProfitImpact > 0) bucket.realIncome += countedProfitImpact;
    if (countedProfitImpact < 0) bucket.realExpense += Math.abs(countedProfitImpact);
    if ((movement.liquidImpact || 0) > 0 && countedProfitImpact === 0) bucket.capitalIn += movement.liquidImpact;
    if ((movement.liquidImpact || 0) < 0 && countedProfitImpact === 0) bucket.capitalOut += Math.abs(movement.liquidImpact);
  }

  const loanById = new Map(loans.map(loan => [String(loan.id), loan]));
  const paidByLoan = {};
  for (const payment of [...loanPayments].sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt))) {
    const key = toMonthKey(payment.date || payment.createdAt);
    const bucket = buckets[key];
    const loan = loanById.get(String(payment.loanId));
    if (!bucket || !loan) continue;
    if (explicitLoanPayments.has(`${payment.loanId || ''}|${key}`)) continue;

    const previous = paidByLoan[payment.loanId] || { principal: 0, interest: 0 };
    const amount = number(payment.amount);
    const storedPrincipal = Number(payment.principalAmount);
    const storedInterest = Number(payment.interestAmount);
    const totalDue = number(loan.totalAmount || number(loan.amount) + number(loan.totalInterest)) || number(loan.amount);
    const principalRatio = totalDue > 0 ? number(loan.amount) / totalDue : 1;
    const principalPending = Math.max(number(loan.amount) - previous.principal, 0);
    const principal = Number.isFinite(storedPrincipal)
      ? storedPrincipal
      : Math.min(amount * principalRatio, principalPending);
    const interest = Number.isFinite(storedInterest)
      ? storedInterest
      : Math.max(amount - principal, 0);
    paidByLoan[payment.loanId] = {
      principal: previous.principal + principal,
      interest: previous.interest + interest,
    };

    bucket.loanPrincipalReturned += principal;
    bucket.loanInterest += interest;
    bucket.realIncome += interest;
    bucket.capitalIn += principal;
  }

  let runningProfit = 0;
  let runningCapital = 0;
  return months.map(month => {
    const bucket = buckets[month.key];
    bucket.realProfit = bucket.realIncome - bucket.realExpense;
    runningProfit += bucket.realProfit;
    runningCapital += bucket.capitalIn - bucket.capitalOut;
    bucket.capitalBase = runningCapital;
    bucket.patrimonio = runningCapital + runningProfit;
    bucket.yieldRate = runningCapital > 0 ? (bucket.realProfit / runningCapital) * 100 : 0;
    return {
      ...bucket,
      realIncome: round(bucket.realIncome),
      realExpense: round(bucket.realExpense),
      realProfit: round(bucket.realProfit),
      capitalIn: round(bucket.capitalIn),
      capitalOut: round(bucket.capitalOut),
      loanPrincipalReturned: round(bucket.loanPrincipalReturned),
      loanInterest: round(bucket.loanInterest),
      patrimonio: round(bucket.patrimonio),
      capitalBase: round(bucket.capitalBase),
      yieldRate: round(bucket.yieldRate),
    };
  });
}

function buildComposition(values) {
  const positiveRows = [
    { key: 'liquid', label: 'Liquidez disponible', value: values.liquidCapital, color: 'accent' },
    { key: 'activePortfolio', label: 'Cartera activa', value: values.activePortfolio, color: 'warning' },
    { key: 'animals', label: 'Animales', value: values.animals, color: 'success' },
    { key: 'vehicles', label: 'Vehiculos negocio', value: values.vehicles, color: 'accent-2' },
    { key: 'trading', label: 'Trading', value: values.trading, color: 'accent' },
    { key: 'software', label: 'Software', value: values.software, color: 'success' },
    { key: 'marketplace', label: 'Marketplace', value: values.marketplace, color: 'accent' },
    { key: 'investments', label: 'Inversiones', value: values.investments, color: 'success' },
    { key: 'commercialAssets', label: 'Activos comerciales', value: values.commercialAssets, color: 'accent-2' },
    { key: 'personalAssets', label: 'Patrimonio personal', value: values.personalAssets, color: 'success' },
    { key: 'personalPatrimony', label: 'Bienes personales', value: values.personalPatrimony, color: 'warning' },
    { key: 'reserves', label: 'Reservas', value: values.reserves, color: 'warning' },
  ].filter(row => row.value > 0);

  const total = positiveRows.reduce((sumValue, row) => sumValue + row.value, 0) || 1;
  return {
    total: round(total),
    rows: positiveRows.map(row => ({
      ...row,
      value: round(row.value),
      pct: round((row.value / total) * 100),
    })),
    liabilities: round(values.liabilities || 0),
  };
}

function getRecentMonthKeys(count) {
  const now = new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-CO', { month: 'short' }),
    });
  }
  return months;
}

function toMonthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function isLoanPaymentMovement(movement) {
  return movement.sourceModule === 'loans'
    && ['cuota_recibida', 'prestamo_pagado'].includes(movement.category);
}

function isClosedBusinessRow(row = {}) {
  return ['sold', 'vendido', 'cerrado', 'entregado', 'cancelado', 'inactivo'].includes(String(row.status || row.estado || '').toLowerCase());
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
