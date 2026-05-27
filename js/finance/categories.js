/*
 * Central financial taxonomy.
 *
 * This file is intentionally data-first: legacy income/expense categories keep
 * working, while new patrimonial concepts can be adopted module by module.
 */

export const FINANCIAL_CONCEPTS = Object.freeze({
  LIQUID_CAPITAL: 'liquid_capital',
  INVESTED_CAPITAL: 'invested_capital',
  EQUITY: 'equity',
  PERSONAL_ASSET: 'personal_asset',
  COMMERCIAL_ASSET: 'commercial_asset',
  REAL_PROFIT: 'real_profit',
  CASH_FLOW: 'cash_flow',
  ACTIVE_PORTFOLIO: 'active_portfolio',
  PROJECTED_RETURN: 'projected_return',
  LIABILITY: 'liability',
  RESERVE: 'reserve',
  LEGACY_INCOME: 'legacy_income',
  LEGACY_EXPENSE: 'legacy_expense',
});

export const CAPITAL_BUCKETS = Object.freeze({
  LIQUID: 'liquid',
  INVESTED: 'invested',
  EQUITY: 'equity',
  COMMERCIAL_ASSET: 'commercial_asset',
  PERSONAL_ASSET: 'personal_asset',
  LIABILITY: 'liability',
  RESERVE: 'reserve',
  OPERATING: 'operating',
});

export const FINANCIAL_CATEGORIES = Object.freeze([
  {
    value: 'capital_inicial',
    label: 'Capital inicial',
    icon: '$',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.LIQUID_CAPITAL,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'reinversion',
    label: 'Reinversion',
    icon: 'R',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.INVESTED_CAPITAL,
    bucket: CAPITAL_BUCKETS.INVESTED,
    liquidImpact: 0,
    investedImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'interes_ganado',
    label: 'Interes ganado',
    icon: '%',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.REAL_PROFIT,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    realProfitImpact: 1,
    cashFlowImpact: 1,
  },
  {
    value: 'utilidad_trading',
    label: 'Utilidad trading',
    icon: '^',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.REAL_PROFIT,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    realProfitImpact: 1,
    cashFlowImpact: 1,
  },
  {
    value: 'utilidad_inversion',
    label: 'Utilidad inversion',
    icon: '+',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.REAL_PROFIT,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    realProfitImpact: 1,
    cashFlowImpact: 1,
  },
  {
    value: 'capital_colocado',
    label: 'Capital colocado',
    icon: 'C',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.INVESTED_CAPITAL,
    bucket: CAPITAL_BUCKETS.INVESTED,
    liquidImpact: -1,
    investedImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'prestamo_otorgado',
    label: 'Prestamo otorgado',
    icon: 'P',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.ACTIVE_PORTFOLIO,
    bucket: CAPITAL_BUCKETS.INVESTED,
    liquidImpact: -1,
    investedImpact: 1,
    activePortfolioImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'devolucion_capital',
    label: 'Devolucion capital',
    icon: '<',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.LIQUID_CAPITAL,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    investedImpact: -1,
    activePortfolioImpact: -1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'cuota_recibida',
    label: 'Cuota recibida',
    icon: '<',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.ACTIVE_PORTFOLIO,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    investedImpact: -1,
    activePortfolioImpact: -1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'prestamo_pagado',
    label: 'Prestamo pagado',
    icon: '<',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.ACTIVE_PORTFOLIO,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    investedImpact: -1,
    activePortfolioImpact: -1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'compra_patrimonial',
    label: 'Compra patrimonial',
    icon: 'E',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.PERSONAL_ASSET,
    bucket: CAPITAL_BUCKETS.PERSONAL_ASSET,
    liquidImpact: -1,
    personalAssetImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'compra_inventario',
    label: 'Compra inventario',
    icon: 'I',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.COMMERCIAL_ASSET,
    bucket: CAPITAL_BUCKETS.COMMERCIAL_ASSET,
    liquidImpact: -1,
    commercialAssetImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'gasto_operativo',
    label: 'Gasto operativo',
    icon: '-',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.CASH_FLOW,
    bucket: CAPITAL_BUCKETS.OPERATING,
    liquidImpact: -1,
    realProfitImpact: -1,
    cashFlowImpact: -1,
  },
  {
    value: 'reserva',
    label: 'Reserva',
    icon: '=',
    legacyType: 'expense',
    concept: FINANCIAL_CONCEPTS.RESERVE,
    bucket: CAPITAL_BUCKETS.RESERVE,
    liquidImpact: -1,
    reserveImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },
  {
    value: 'liquidez',
    label: 'Liquidez',
    icon: '~',
    legacyType: 'income',
    concept: FINANCIAL_CONCEPTS.LIQUID_CAPITAL,
    bucket: CAPITAL_BUCKETS.LIQUID,
    liquidImpact: 1,
    realProfitImpact: 0,
    cashFlowImpact: 0,
  },

  // Legacy income categories.
  { value: 'ventas', label: 'Ventas', icon: '+', legacyType: 'income', concept: FINANCIAL_CONCEPTS.REAL_PROFIT, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 1, cashFlowImpact: 1 },
  { value: 'servicios', label: 'Servicios', icon: '+', legacyType: 'income', concept: FINANCIAL_CONCEPTS.REAL_PROFIT, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 1, cashFlowImpact: 1 },
  { value: 'intereses', label: 'Intereses', icon: '%', legacyType: 'income', concept: FINANCIAL_CONCEPTS.REAL_PROFIT, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 1, cashFlowImpact: 1 },
  { value: 'trading', label: 'Trading', icon: '^', legacyType: 'income', concept: FINANCIAL_CONCEPTS.REAL_PROFIT, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 1, cashFlowImpact: 1 },
  { value: 'inversiones', label: 'Inversiones', icon: '+', legacyType: 'income', concept: FINANCIAL_CONCEPTS.REAL_PROFIT, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 1, cashFlowImpact: 1 },
  { value: 'otros_ing', label: 'Otros ingresos', icon: '+', legacyType: 'income', concept: FINANCIAL_CONCEPTS.LEGACY_INCOME, bucket: CAPITAL_BUCKETS.LIQUID, liquidImpact: 1, realProfitImpact: 0, cashFlowImpact: 1 },

  // Legacy expense categories.
  { value: 'publicidad', label: 'Publicidad', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'herramientas', label: 'Herramientas', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'servidores', label: 'Servidores', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'transporte', label: 'Transporte', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'alimentacion', label: 'Alimentacion', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'mantenimiento', label: 'Mantenimiento', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
  { value: 'otros_gas', label: 'Otros gastos', icon: '-', legacyType: 'expense', concept: FINANCIAL_CONCEPTS.CASH_FLOW, bucket: CAPITAL_BUCKETS.OPERATING, liquidImpact: -1, realProfitImpact: -1, cashFlowImpact: -1 },
]);

export const FINANCIAL_CATEGORY_MAP = new Map(
  FINANCIAL_CATEGORIES.map(category => [category.value, Object.freeze(category)])
);

export const LEGACY_INCOME_CATEGORIES = FINANCIAL_CATEGORIES
  .filter(category => category.legacyType === 'income')
  .map(toLegacyOption);

export const LEGACY_EXPENSE_CATEGORIES = FINANCIAL_CATEGORIES
  .filter(category => category.legacyType === 'expense')
  .map(toLegacyOption);

export function getFinanceCategory(value) {
  return FINANCIAL_CATEGORY_MAP.get(value) || null;
}

export function getFinanceCategoryLabel(value) {
  return getFinanceCategory(value)?.label || value || 'Sin categoria';
}

export function getFinanceCategoryDisplayName(value) {
  return getFinanceCategoryLabel(value);
}

export function getFinanceCategoryIcon(value) {
  return getFinanceCategory(value)?.icon || '.';
}

export function getDefaultLegacyCategory(type) {
  return type === 'expense' ? 'otros_gas' : 'otros_ing';
}

export function normalizeLegacyType(type) {
  if (type === 'ingreso') return 'income';
  if (type === 'egreso') return 'expense';
  return type || 'income';
}

export function classifyFinancialMovement(row = {}) {
  const type = normalizeLegacyType(row.type);
  const categoryValue = row.category || row.categoria || getDefaultLegacyCategory(type);
  const category = getFinanceCategory(categoryValue) || getFinanceCategory(getDefaultLegacyCategory(type));
  const amount = toNumber(row.amount ?? row.monto);
  const sign = type === 'expense' ? -1 : 1;
  const meta = row.meta || {};

  const realProfitAmount = toNumber(meta.realProfitAmount ?? meta.interestAmount);
  const capitalReturnAmount = toNumber(meta.capitalReturnAmount ?? meta.principalAmount);
  const explicitRealProfitImpact = Number(row.realProfitImpact);
  const realProfitImpact = Number.isFinite(explicitRealProfitImpact)
    ? explicitRealProfitImpact
    : realProfitAmount || amount * (category.realProfitImpact || 0);
  const liquidImpact = pickExplicit(row.liquidImpact, amount * (category.liquidImpact ?? sign));
  const investedImpact = pickExplicit(row.investedImpact, amount * (category.investedImpact || 0));
  const personalAssetImpact = pickExplicit(row.personalAssetImpact, amount * (category.personalAssetImpact || 0));
  const commercialAssetImpact = pickExplicit(row.commercialAssetImpact, amount * (category.commercialAssetImpact || 0));
  const reserveImpact = pickExplicit(row.reserveImpact, amount * (category.reserveImpact || 0));
  const activePortfolioImpact = pickExplicit(row.activePortfolioImpact, amount * (category.activePortfolioImpact || 0));
  const cashFlowImpact = pickExplicit(row.cashFlowImpact, amount * (category.cashFlowImpact ?? sign));
  const isCapitalMovement = realProfitImpact === 0 && (
    liquidImpact !== 0 ||
    investedImpact !== 0 ||
    activePortfolioImpact !== 0 ||
    personalAssetImpact !== 0 ||
    commercialAssetImpact !== 0 ||
    reserveImpact !== 0
  );

  return {
    ...row,
    type,
    category: categoryValue,
    categoryLabel: row.categoryLabel || category.label,
    financeConcept: row.financeConcept || category.concept,
    capitalBucket: row.capitalBucket || category.bucket,
    amount,
    liquidImpact,
    investedImpact,
    activePortfolioImpact,
    personalAssetImpact,
    commercialAssetImpact,
    reserveImpact,
    realProfitImpact,
    realIncomeImpact: Math.max(realProfitImpact, 0),
    realExpenseImpact: Math.abs(Math.min(realProfitImpact, 0)),
    capitalReturnAmount,
    cashFlowImpact,
    isCapitalMovement,
    isInternalMovement: isCapitalMovement && (investedImpact !== 0 || activePortfolioImpact !== 0 || reserveImpact !== 0),
    impactSummary: buildImpactSummary({
      liquidImpact,
      investedImpact,
      activePortfolioImpact,
      personalAssetImpact,
      commercialAssetImpact,
      reserveImpact,
      realProfitImpact,
      cashFlowImpact,
    }),
  };
}

export function buildImpactSummary(impacts = {}) {
  const rows = [
    impactRow('Liquidez', impacts.liquidImpact),
    impactRow('Capital invertido', impacts.investedImpact),
    impactRow('Cartera activa', impacts.activePortfolioImpact),
    impactRow('Patrimonio personal', impacts.personalAssetImpact),
    impactRow('Activos comerciales', impacts.commercialAssetImpact),
    impactRow('Reservas', impacts.reserveImpact),
    impactRow('Utilidad real', impacts.realProfitImpact),
    impactRow('Flujo operativo', impacts.cashFlowImpact),
  ].filter(Boolean);

  return {
    rows,
    text: rows.map(row => `${row.direction} ${row.label}`).join(' · '),
  };
}

function toLegacyOption(category) {
  return {
    value: category.value,
    label: `${category.icon} ${category.label}`,
    icon: category.icon,
    concept: category.concept,
    bucket: category.bucket,
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pickExplicit(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function impactRow(label, value) {
  const amount = toNumber(value);
  if (!amount) return null;
  return {
    label,
    amount,
    direction: amount > 0 ? '↑' : '↓',
    tone: amount > 0 ? 'positive' : 'negative',
  };
}
