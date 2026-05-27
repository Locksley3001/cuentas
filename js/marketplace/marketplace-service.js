import { toNumber } from '../utils/format.js';

export const MARKETPLACE_STATUS = Object.freeze({
  SIMULATED: 'simulado',
  CONFIRMED: 'confirmado',
  PUBLISHED: 'publicado',
  RESERVED: 'reservado',
  SOLD: 'vendido',
  CANCELLED: 'cancelado',
});

export const ACTIVE_MARKETPLACE_STATUSES = new Set([
  MARKETPLACE_STATUS.CONFIRMED,
  MARKETPLACE_STATUS.PUBLISHED,
  MARKETPLACE_STATUS.RESERVED,
]);

const ADVANCED_COST_FIELDS = [
  'shippingCost',
  'adsCost',
  'packagingCost',
  'taxCost',
  'commissionCost',
  'gatewayCost',
  'storageCost',
  'importCost',
  'customsCost',
  'transportCost',
  'otherCost',
];

export function calculateProduct(input = {}) {
  const quantity = Math.max(toNumber(input.quantity) || 1, 1);
  const unitCost = toNumber(input.unitCost);
  const expectedSalePrice = toNumber(input.expectedSalePrice);
  const baseCost = unitCost * quantity;
  const advancedCosts = input.useAdvancedCosts ? sumFields(input, ADVANCED_COST_FIELDS) : 0;
  const totalCost = baseCost + advancedCosts;
  const expectedRevenue = expectedSalePrice * quantity;
  const grossMargin = expectedRevenue - baseCost;
  const netMargin = expectedRevenue - totalCost;
  const expectedRoi = totalCost > 0 ? (netMargin / totalCost) * 100 : 0;
  const suggestedPrice = quantity > 0 ? Math.ceil((totalCost * 1.25) / quantity) : 0;
  const daysInInventory = calculateInventoryDays(input);
  const rotation = calculateRotation(daysInInventory, toNumber(input.unitsSold), quantity);
  const capitalBlocked = ACTIVE_MARKETPLACE_STATUSES.has(input.status)
    ? calculateRemainingCost({ ...input, quantity, totalCost })
    : 0;

  return {
    quantity,
    baseCost,
    advancedCosts,
    totalCost,
    expectedRevenue,
    grossMargin,
    netMargin,
    expectedRoi,
    suggestedPrice,
    utilityPotential: netMargin,
    daysInInventory,
    rotation,
    capitalBlocked,
    marginPct: expectedRevenue > 0 ? (netMargin / expectedRevenue) * 100 : 0,
  };
}

export function normalizeProduct(row = {}) {
  const status = row.status || MARKETPLACE_STATUS.SIMULATED;
  const product = {
    ...row,
    status,
    quantity: Math.max(toNumber(row.quantity) || 1, 1),
    unitsSold: toNumber(row.unitsSold),
    unitCost: toNumber(row.unitCost),
    expectedSalePrice: toNumber(row.expectedSalePrice),
    useAdvancedCosts: !!row.useAdvancedCosts || String(row.useAdvancedCosts) === 'true',
  };
  const metrics = calculateProduct(product);
  return {
    ...product,
    ...metrics,
    remainingUnits: Math.max(product.quantity - product.unitsSold, 0),
    demand: product.demand || 'media',
    risk: product.risk || 'medio',
    type: product.type || 'individual',
  };
}

export function calculateSale(product, sale = {}) {
  const normalized = normalizeProduct(product);
  const quantitySold = Math.min(Math.max(toNumber(sale.quantitySold) || 1, 1), normalized.remainingUnits || normalized.quantity);
  const salePrice = toNumber(sale.salePrice);
  const sellingCosts = toNumber(sale.sellingCosts);
  const unitCostBasis = normalized.quantity ? normalized.totalCost / normalized.quantity : 0;
  const costReleased = unitCostBasis * quantitySold;
  const saleTotal = salePrice * quantitySold;
  const realProfit = saleTotal - costReleased - sellingCosts;
  const roiReal = costReleased > 0 ? (realProfit / costReleased) * 100 : 0;
  const nextUnitsSold = normalized.unitsSold + quantitySold;
  const soldOut = nextUnitsSold >= normalized.quantity;

  return {
    quantitySold,
    salePrice,
    sellingCosts,
    saleTotal,
    costReleased,
    realProfit,
    roiReal,
    nextUnitsSold,
    soldOut,
    nextStatus: soldOut ? MARKETPLACE_STATUS.SOLD : normalized.status,
  };
}

export function buildMarketplaceMetrics(products = []) {
  const normalized = products.map(normalizeProduct);
  const active = normalized.filter(product => ACTIVE_MARKETPLACE_STATUSES.has(product.status));
  const sold = normalized.filter(product => product.status === MARKETPLACE_STATUS.SOLD);
  const simulated = normalized.filter(product => product.status === MARKETPLACE_STATUS.SIMULATED);
  const capitalBlocked = active.reduce((sum, product) => sum + product.capitalBlocked, 0);
  const utilityPotential = active.concat(simulated).reduce((sum, product) => sum + Math.max(product.utilityPotential, 0), 0);
  const utilityReal = normalized.reduce((sum, product) => sum + toNumber(product.realProfit), 0);
  const marginAverage = average(normalized, 'marginPct');
  const roiAverage = average(normalized, 'expectedRoi');
  const slowProducts = active.filter(product => product.rotation === 'lenta');
  const profitableProducts = normalized.filter(product => product.expectedRoi >= 20 || toNumber(product.roiReal) >= 20);

  return {
    products: normalized,
    active,
    sold,
    simulated,
    capitalBlocked,
    utilityPotential,
    utilityReal,
    marginAverage,
    roiAverage,
    rotationAverage: calculateRotationAverage(active),
    slowProducts: slowProducts.length,
    profitableProducts: profitableProducts.length,
    alerts: buildMarketplaceAlerts(active),
  };
}

export function buildMarketplaceFinanceContribution(products = []) {
  const metrics = buildMarketplaceMetrics(products);
  const activeUtilityPotential = metrics.active.reduce((sum, product) => sum + Math.max(product.utilityPotential, 0), 0);
  return {
    capitalBlocked: round(metrics.capitalBlocked),
    inventoryValue: round(metrics.capitalBlocked),
    utilityPotential: round(activeUtilityPotential),
    simulatedUtilityPotential: round(metrics.utilityPotential - activeUtilityPotential),
    utilityReal: round(metrics.utilityReal),
    activeCount: metrics.active.length,
    soldCount: metrics.sold.length,
  };
}

function calculateRemainingCost(product) {
  const quantity = Math.max(toNumber(product.quantity) || 1, 1);
  const unitsSold = Math.min(toNumber(product.unitsSold), quantity);
  const remainingRatio = Math.max(quantity - unitsSold, 0) / quantity;
  return toNumber(product.totalCost) * remainingRatio;
}

function calculateInventoryDays(product) {
  const start = product.confirmedAt || product.purchaseDate || product.createdAt;
  if (!start || !ACTIVE_MARKETPLACE_STATUSES.has(product.status)) return 0;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return 0;
  return Math.max(Math.floor((Date.now() - startDate.getTime()) / 86400000), 0);
}

function calculateRotation(days, unitsSold, quantity) {
  const soldRatio = quantity > 0 ? unitsSold / quantity : 0;
  if (soldRatio >= 0.8 || days <= 15) return 'rapida';
  if (days <= 45 || soldRatio >= 0.35) return 'media';
  return 'lenta';
}

function calculateRotationAverage(products) {
  if (!products.length) return 'sin datos';
  const score = products.reduce((sum, product) => {
    if (product.rotation === 'rapida') return sum + 3;
    if (product.rotation === 'media') return sum + 2;
    return sum + 1;
  }, 0) / products.length;
  if (score >= 2.5) return 'rapida';
  if (score >= 1.7) return 'media';
  return 'lenta';
}

function buildMarketplaceAlerts(active) {
  const alerts = [];
  const lowMargin = active.filter(product => product.marginPct > 0 && product.marginPct < 12);
  const slow = active.filter(product => product.rotation === 'lenta');
  if (lowMargin.length) alerts.push({ type: 'warning', title: 'Margen muy bajo', text: `${lowMargin.length} producto(s) con margen menor a 12%.` });
  if (slow.length) alerts.push({ type: 'warning', title: 'Baja rotacion', text: `${slow.length} producto(s) llevan demasiado tiempo en inventario.` });
  return alerts;
}

function average(rows, key) {
  const values = rows.map(row => toNumber(row[key])).filter(value => value !== 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumFields(row, fields) {
  return fields.reduce((sum, field) => sum + toNumber(row[field]), 0);
}

function round(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}
