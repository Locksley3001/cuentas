/**
 * ============================================================
 * LOANS.JS — Sistema Completo de Préstamos
 * ============================================================
 * Módulo principal para gestión de préstamos con y sin prenda.
 *
 * Responsabilidades:
 *  - CRUD completo de préstamos
 *  - Cálculo automático de cuotas, intereses y fechas
 *  - Sistema de pagos y mora
 *  - Gestión de prendas
 *  - Integración con finance.js y dashboard.js
 *  - Integración con tables.js y modal.js
 *  - Persistencia en IndexedDB (db.js / storage.js)
 *  - Preparado para history.js, crm.js, investments.js, etc.
 *
 * Fase 3 del proyecto /cuentas
 * ============================================================
 */

import { DB } from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { renderTable, refreshTable } from '../components/tables.js';
import { openModal, closeModal, setModalLoading } from '../components/modal.js';
import { registerTransaction, getFinanceSummary } from './finance.js';
import { refreshDashboard, addRecentActivity, updateAlerts } from './dashboard.js';

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

/** Nombre del store en IndexedDB */
const STORE_LOANS    = 'loans';
const STORE_PAYMENTS = 'loan_payments';
const STORE_PLEDGES  = 'loan_pledges';

/** Estados posibles de un préstamo */
const LOAN_STATUS = {
  ACTIVE    : 'activo',
  PAID      : 'pagado',
  OVERDUE   : 'atrasado',
  DEFAULTED : 'incumplido',
  CANCELLED : 'cancelado',
};

/** Tipos de interés */
const INTEREST_TYPE = {
  SIMPLE     : 'simple',       // Interés simple sobre el capital
  MONTHLY    : 'mensual',      // Tasa mensual aplicada sobre saldo
  PERCENTAGE : 'porcentual',   // Porcentaje fijo total sobre el capital
};

/** Frecuencias de pago */
const PAYMENT_FREQ = {
  DAILY    : 'diario',
  WEEKLY   : 'semanal',
  BIWEEKLY : 'quincenal',
  MONTHLY  : 'mensual',
  CUSTOM   : 'personalizado',
};

/** Días por frecuencia (para cálculo de fechas) */
const FREQ_DAYS = {
  [PAYMENT_FREQ.DAILY]    : 1,
  [PAYMENT_FREQ.WEEKLY]   : 7,
  [PAYMENT_FREQ.BIWEEKLY] : 15,
  [PAYMENT_FREQ.MONTHLY]  : 30,
  [PAYMENT_FREQ.CUSTOM]   : null,
};

/** ID del contenedor principal de préstamos */
const CONTAINER_ID = 'loans-container';

// ============================================================
// ESTADO INTERNO DEL MÓDULO
// ============================================================

/** Cache en memoria de préstamos activos */
let _loansCache   = [];
/** Cache de pagos por loanId */
let _paymentsCache = {};
/** Referencia al filtro activo en la tabla */
let _activeFilter = 'all';
/** Término de búsqueda activo */
let _searchTerm   = '';

// ============================================================
// INICIALIZACIÓN DEL MÓDULO
// ============================================================

/**
 * Inicializa el módulo de préstamos.
 * Llama a este método cuando el router navega a /loans.
 */
export async function initLoans() {
  try {
    // Asegurar que los stores existen en IndexedDB
    await _ensureStores();

    // Cargar datos desde IndexedDB
    await _loadCache();

    // Renderizar la vista principal
    _renderView();

    // Verificar moras automáticamente al iniciar
    await _checkOverdue();

    console.log('[Loans] Módulo inicializado correctamente');
  } catch (err) {
    console.error('[Loans] Error al inicializar:', err);
    _showError('No se pudo cargar el módulo de préstamos.');
  }
}

// ============================================================
// GESTIÓN DE INDEXEDDB
// ============================================================

/**
 * Garantiza que los object stores necesarios existen en DB.
 * db.js debe exponer un método ensureStore o similar.
 */
async function _ensureStores() {
  await DB.ensureStore(STORE_LOANS, { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_PAYMENTS, { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_PLEDGES,  { keyPath: 'id', autoIncrement: true });
}

/**
 * Carga todos los préstamos y pagos en la cache en memoria.
 * Minimiza lecturas repetidas a IndexedDB durante la sesión.
 */
async function _loadCache() {
  const loans = (await Storage.getAll(STORE_LOANS)) || [];
  _loansCache = loans.map(_normalizeLoanRecord);
  const payments = (await Storage.getAll(STORE_PAYMENTS)) || [];

  // Indexar pagos por loanId para acceso O(1)
  _paymentsCache = {};
  for (const p of payments) {
    if (!_paymentsCache[p.loanId]) _paymentsCache[p.loanId] = [];
    _paymentsCache[p.loanId].push(p);
  }
}

// ============================================================
// CÁLCULOS FINANCIEROS
// ============================================================

/**
 * Calcula el resumen financiero completo de un préstamo.
 *
 * @param {Object} loan — objeto del préstamo
 * @returns {Object} — totales, cuotas, fechas, saldo
 */
export function calcLoanSummary(loan) {
  const {
    amount,           // Monto principal prestado
    interestRate,     // Tasa de interés (valor numérico)
    interestType,     // Tipo de interés: simple | mensual | porcentual
    installments,     // Número de cuotas
    frequency,        // Frecuencia de pago
    startDate,        // Fecha de inicio (ISO string)
    customDays,       // Días personalizados (si frecuencia = custom)
  } = loan;

  let totalInterest = 0;
  let totalAmount   = 0;
  let installmentAmount = 0;

  // ── Cálculo según tipo de interés ──────────────────────────
  switch (interestType) {
    case INTEREST_TYPE.SIMPLE:
      // Interés simple: I = P × r × t  (t en periodos)
      totalInterest    = amount * (interestRate / 100) * installments;
      totalAmount      = amount + totalInterest;
      installmentAmount = totalAmount / installments;
      break;

    case INTEREST_TYPE.MONTHLY:
      // Tasa mensual: amortización francesa (cuota fija)
      if (interestRate === 0) {
        totalAmount      = amount;
        installmentAmount = amount / installments;
        totalInterest    = 0;
      } else {
        const r = interestRate / 100;
        // Fórmula de cuota fija: C = P × r / (1 - (1+r)^-n)
        installmentAmount = amount * r / (1 - Math.pow(1 + r, -installments));
        totalAmount       = installmentAmount * installments;
        totalInterest     = totalAmount - amount;
      }
      break;

    case INTEREST_TYPE.PERCENTAGE:
      // Porcentaje fijo total sobre el capital
      totalInterest    = amount * (interestRate / 100);
      totalAmount      = amount + totalInterest;
      installmentAmount = totalAmount / installments;
      break;

    default:
      totalAmount      = amount;
      installmentAmount = amount / installments;
  }

  // ── Generación de fechas de cuotas ─────────────────────────
  const daysPerPeriod = frequency === PAYMENT_FREQ.CUSTOM
    ? (customDays || 30)
    : FREQ_DAYS[frequency] || 30;

  const start = new Date(startDate);
  const schedule = [];

  for (let i = 1; i <= installments; i++) {
    const dueDate = new Date(start);
    dueDate.setDate(dueDate.getDate() + daysPerPeriod * i);
    schedule.push({
      number    : i,
      dueDate   : dueDate.toISOString().split('T')[0],
      amount    : _round(installmentAmount),
      principal : _round(amount / installments),
      interest  : _round(totalInterest / installments),
      status    : 'pendiente',
    });
  }

  // ── Fecha de vencimiento final ──────────────────────────────
  const endDate = schedule.length > 0
    ? schedule[schedule.length - 1].dueDate
    : null;

  return {
    totalInterest    : _round(totalInterest),
    totalAmount      : _round(totalAmount),
    installmentAmount: _round(installmentAmount),
    profit           : _round(totalInterest),   // Ganancia esperada
    endDate,
    schedule,
  };
}

/**
 * Calcula el saldo pendiente de un préstamo según los pagos realizados.
 *
 * @param {Object} loan    — objeto del préstamo
 * @param {Array}  payments — lista de pagos del préstamo
 * @returns {Object} — balance con saldo, pagado, mora
 */
export function calcBalance(loan, payments = []) {
  const summary     = calcLoanSummary(loan);
  const totalPaid   = payments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const remaining   = summary.totalAmount - totalPaid;
  const isOverdue   = _isLoanOverdue(loan, payments);

  return {
    totalAmount    : summary.totalAmount,
    totalPaid      : _round(totalPaid),
    remaining      : _round(Math.max(remaining, 0)),
    isOverdue,
    overdueDays    : isOverdue ? _calcOverdueDays(loan, payments) : 0,
    paidPercentage : _round((totalPaid / summary.totalAmount) * 100),
  };
}

function splitLoanPayment(loan, previousPayments = [], amount = 0) {
  const principalTotal = Number(loan.amount) || 0;
  const totalDue = Number(loan.totalAmount || principalTotal + (Number(loan.totalInterest) || 0)) || principalTotal;
  const interestTotal = Math.max(totalDue - principalTotal, 0);
  const principalRatio = totalDue > 0 ? principalTotal / totalDue : 1;

  const previous = previousPayments.reduce((acc, payment) => {
    const paymentAmount = Number(payment.amount) || 0;
    const storedPrincipal = Number(payment.principalAmount);
    const storedInterest = Number(payment.interestAmount);
    if (Number.isFinite(storedPrincipal) || Number.isFinite(storedInterest)) {
      acc.principal += Number.isFinite(storedPrincipal) ? storedPrincipal : Math.max(paymentAmount - storedInterest, 0);
      acc.interest += Number.isFinite(storedInterest) ? storedInterest : Math.max(paymentAmount - storedPrincipal, 0);
      return acc;
    }
    const estimatedPrincipal = Math.min(paymentAmount * principalRatio, Math.max(principalTotal - acc.principal, 0));
    acc.principal += estimatedPrincipal;
    acc.interest += Math.max(paymentAmount - estimatedPrincipal, 0);
    return acc;
  }, { principal: 0, interest: 0 });

  const pendingPrincipal = Math.max(principalTotal - previous.principal, 0);
  const pendingInterest = Math.max(interestTotal - previous.interest, 0);
  let principalAmount = Math.min(amount * principalRatio, pendingPrincipal);
  let interestAmount = Math.min(amount - principalAmount, pendingInterest);
  let remainder = amount - principalAmount - interestAmount;

  if (remainder > 0) {
    const extraPrincipal = Math.min(remainder, Math.max(pendingPrincipal - principalAmount, 0));
    principalAmount += extraPrincipal;
    remainder -= extraPrincipal;
  }

  if (remainder > 0) {
    interestAmount += Math.min(remainder, Math.max(pendingInterest - interestAmount, 0));
  }

  return {
    principalAmount: _round(principalAmount),
    interestAmount: _round(interestAmount),
  };
}

// ============================================================
// CRUD DE PRÉSTAMOS
// ============================================================

/**
 * Crea un nuevo préstamo y lo guarda en IndexedDB.
 * Registra automáticamente en finance.js y dashboard.
 *
 * @param {Object} data — datos del formulario validados
 * @returns {Object} — préstamo creado con id asignado
 */
export async function createLoan(data) {
  // Validar datos mínimos requeridos
  _validateLoanData(data);

  // Calcular resumen financiero
  const summary = calcLoanSummary(data);

  // Construir objeto de préstamo
  const loan = {
    // ─ Identificación ─
    createdAt   : new Date().toISOString(),
    updatedAt   : new Date().toISOString(),

    // ─ Cliente ─
    clientName  : data.clientName.trim(),
    clientPhone : data.clientPhone?.trim() || '',
    clientDoc   : data.clientDoc?.trim()   || '',
    clientAddress: data.clientAddress?.trim() || '',
    observations: data.observations?.trim()  || '',

    // ─ Tipo y condiciones ─
    hasPledge    : !!data.hasPledge,
    type         : data.hasPledge ? 'con_prenda' : 'sin_prenda',

    // ─ Términos financieros ─
    amount       : Number(data.amount),
    interestRate : Number(data.interestRate),
    interestType : data.interestType,
    installments : Number(data.installments),
    frequency    : data.frequency,
    customDays   : data.customDays ? Number(data.customDays) : null,

    // ─ Fechas ─
    startDate    : data.startDate,
    endDate      : summary.endDate,

    // ─ Resumen calculado ─
    totalAmount      : summary.totalAmount,
    totalInterest    : summary.totalInterest,
    installmentAmount: summary.installmentAmount,
    schedule         : summary.schedule,

    // ─ Estado ─
    status       : LOAN_STATUS.ACTIVE,
    statusHistory: [
      { status: LOAN_STATUS.ACTIVE, date: new Date().toISOString(), note: 'Préstamo creado' }
    ],
  };

  // Guardar en IndexedDB
  const id = await Storage.add(STORE_LOANS, loan);
  loan.id = id;

  // Guardar prenda si aplica
  if (data.hasPledge && data.pledge) {
    await _savePledge(id, data.pledge);
  }

  // Actualizar cache
  _loansCache.push(loan);

  // ── Integración con finance.js ──────────────────────────────
  await registerTransaction({
    type        : 'egreso',
    category    : 'prestamo_otorgado',
    amount      : loan.amount,
    description : `Préstamo otorgado a ${loan.clientName}`,
    reference   : `LOAN-${id}`,
    date        : loan.startDate,
    sourceModule: 'loans',
    liquidImpact: -loan.amount,
    investedImpact: loan.amount,
    activePortfolioImpact: loan.amount,
    realProfitImpact: 0,
    cashFlowImpact: 0,
    meta        : { loanId: id, capitalPlacedAmount: loan.amount },
  });

  // ── Integración con dashboard.js ───────────────────────────
  addRecentActivity({
    icon        : '💰',
    title       : 'Préstamo creado',
    description : `${loan.clientName} — ${_formatCurrency(loan.amount)}`,
    date        : new Date().toISOString(),
    type        : 'loan_created',
  });

  // ── Preparado para history.js ───────────────────────────────
  _logAction({
    action      : 'loan_created',
    category    : 'loans',
    amount      : loan.amount,
    description : `Préstamo creado para ${loan.clientName}`,
    meta        : { loanId: id, type: loan.type },
  });

  await refreshDashboard();
  _refreshTable();

  return loan;
}

/**
 * Actualiza un préstamo existente.
 *
 * @param {number} id   — ID del préstamo
 * @param {Object} data — campos a actualizar
 */
export async function updateLoan(id, data) {
  const idx  = _loansCache.findIndex(l => l.id === id);
  if (idx === -1) throw new Error(`Préstamo ${id} no encontrado`);

  const existing = _loansCache[idx];

  // Recalcular si cambian términos financieros
  const needsRecalc = ['amount','interestRate','interestType','installments','frequency','startDate','customDays']
    .some(k => data[k] !== undefined && data[k] !== existing[k]);

  const updated = {
    ...existing,
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (needsRecalc) {
    const summary    = calcLoanSummary(updated);
    updated.endDate          = summary.endDate;
    updated.totalAmount      = summary.totalAmount;
    updated.totalInterest    = summary.totalInterest;
    updated.installmentAmount = summary.installmentAmount;
    updated.schedule         = summary.schedule;
  }

  await Storage.update(STORE_LOANS, updated);
  _loansCache[idx] = updated;

  // Actualizar prenda si viene en data
  if (data.pledge) {
    await _savePledge(id, data.pledge);
  }

  _logAction({
    action      : 'loan_updated',
    category    : 'loans',
    amount      : updated.amount,
    description : `Préstamo actualizado: ${updated.clientName}`,
    meta        : { loanId: id },
  });

  _refreshTable();
  await refreshDashboard();

  return updated;
}

/**
 * Cambia el estado de un préstamo y registra en historial.
 *
 * @param {number} id     — ID del préstamo
 * @param {string} status — Nuevo estado (usa LOAN_STATUS)
 * @param {string} note   — Nota opcional
 */
export async function changeLoanStatus(id, status, note = '') {
  const loan = _getLoanById(id);
  if (!loan) throw new Error(`Préstamo ${id} no encontrado`);

  const statusEntry = { status, date: new Date().toISOString(), note };
  if (!Array.isArray(loan.statusHistory)) loan.statusHistory = [];
  loan.statusHistory.push(statusEntry);
  loan.status    = status;
  loan.updatedAt = new Date().toISOString();

  await Storage.update(STORE_LOANS, loan);
  _updateCacheItem(loan);

  // Integración dashboard: alertas por incumplimiento o mora
  if (status === LOAN_STATUS.OVERDUE || status === LOAN_STATUS.DEFAULTED) {
    updateAlerts({
      type    : 'warning',
      title   : `Préstamo ${status}`,
      message : `${loan.clientName} — ${_formatCurrency(loan.totalAmount)}`,
      loanId  : id,
    });
  }

  _logAction({
    action      : `loan_status_${status}`,
    category    : 'loans',
    amount      : loan.amount,
    description : `Estado cambiado a "${status}" — ${loan.clientName}`,
    meta        : { loanId: id, status, note },
  });

  _refreshTable();
  await refreshDashboard();
}

/**
 * Elimina (cancela) un préstamo. No borra el registro, cambia estado.
 *
 * @param {number} id   — ID del préstamo
 * @param {string} note — Motivo de cancelación
 */
export async function cancelLoan(id, note = '') {
  await changeLoanStatus(id, LOAN_STATUS.CANCELLED, note);
}

export async function deleteLoan(id) {
  const loan = _getLoanById(id);
  if (!loan) throw new Error(`Préstamo ${id} no encontrado`);

  const payments = _paymentsCache[id] || [];
  for (const payment of payments) {
    if (payment.id != null) await Storage.remove(STORE_PAYMENTS, payment.id);
  }

  const pledges = (await Storage.getAll(STORE_PLEDGES)) || [];
  for (const pledge of pledges.filter(p => p.loanId === id)) {
    if (pledge.id != null) await Storage.remove(STORE_PLEDGES, pledge.id);
  }

  await Storage.remove(STORE_LOANS, id);
  _loansCache = _loansCache.filter(l => l.id !== id);
  delete _paymentsCache[id];

  _logAction({
    action      : 'loan_deleted',
    category    : 'loans',
    amount      : loan.amount,
    description : `Préstamo eliminado: ${loan.clientName}`,
    meta        : { loanId: id },
  });

  _refreshTable();
  await refreshDashboard();
}

/**
 * Obtiene un préstamo por su ID (desde cache).
 *
 * @param {number} id
 * @returns {Object|null}
 */
export function getLoanById(id) {
  return _getLoanById(id);
}

/**
 * Obtiene todos los préstamos filtrados y ordenados.
 *
 * @param {Object} options — { status, search, sortBy, sortDir }
 * @returns {Array}
 */
export function getLoans(options = {}) {
  let loans = [..._loansCache];

  // Filtro por estado
  if (options.status && options.status !== 'all') {
    loans = loans.filter(l => l.status === options.status);
  }

  // Búsqueda por nombre o teléfono
  if (options.search) {
    const term = options.search.toLowerCase();
    loans = loans.filter(l =>
      l.clientName.toLowerCase().includes(term) ||
      l.clientPhone.includes(term) ||
      (l.clientDoc && l.clientDoc.includes(term))
    );
  }

  // Ordenamiento
  const sortBy  = options.sortBy  || 'createdAt';
  const sortDir = options.sortDir || 'desc';
  loans.sort((a, b) => {
    let va = a[sortBy], vb = b[sortBy];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1  : -1;
    return 0;
  });

  return loans;
}

// ============================================================
// SISTEMA DE PAGOS
// ============================================================

/**
 * Registra un pago para un préstamo.
 * Actualiza estado automáticamente y conecta con finance.js.
 *
 * @param {number} loanId  — ID del préstamo
 * @param {Object} payData — { amount, date, note, method }
 * @returns {Object} — pago registrado
 */
export async function registerPayment(loanId, payData) {
  const loan = _getLoanById(loanId);
  if (!loan) throw new Error(`Préstamo ${loanId} no encontrado`);

  if (loan.status === LOAN_STATUS.CANCELLED) {
    throw new Error('No se puede registrar pago en un préstamo cancelado');
  }

  // Validar monto
  const amount = Number(payData.amount);
  if (!amount || amount <= 0) throw new Error('El monto del pago debe ser mayor a 0');

  // Calcular saldo antes del pago
  const prevPayments = _paymentsCache[loanId] || [];
  const balance      = calcBalance(loan, prevPayments);
  const { principalAmount, interestAmount } = splitLoanPayment(loan, prevPayments, amount);

  if (amount > balance.remaining + 0.01) {
    throw new Error(`El pago (${_formatCurrency(amount)}) supera el saldo pendiente (${_formatCurrency(balance.remaining)})`);
  }

  // Construir objeto de pago
  const payment = {
    loanId,
    amount,
    date       : payData.date || new Date().toISOString().split('T')[0],
    method     : payData.method || 'efectivo',
    note       : payData.note?.trim() || '',
    principalAmount,
    interestAmount,
    createdAt  : new Date().toISOString(),
    isPartial  : amount < loan.installmentAmount - 0.01,
    isFull     : false,    // Se determina tras el pago
  };

  // Guardar pago en IndexedDB
  const payId  = await Storage.add(STORE_PAYMENTS, payment);
  payment.id   = payId;

  // Actualizar cache de pagos
  if (!_paymentsCache[loanId]) _paymentsCache[loanId] = [];
  _paymentsCache[loanId].push(payment);

  // Recalcular balance tras el pago
  const newBalance = calcBalance(loan, _paymentsCache[loanId]);

  // Determinar si está pagado completamente
  const isPaidOff = newBalance.remaining <= 0.01;
  payment.isFull  = isPaidOff;
  await Storage.update(STORE_PAYMENTS, payment);

  // Actualizar estado del préstamo
  if (isPaidOff) {
    await changeLoanStatus(loanId, LOAN_STATUS.PAID, 'Préstamo pagado completamente');
  } else if (loan.status === LOAN_STATUS.OVERDUE) {
    // Si estaba atrasado y paga algo, vuelve a activo
    await changeLoanStatus(loanId, LOAN_STATUS.ACTIVE, 'Pago recibido — reanudado');
  }

  // ── Integración con finance.js ──────────────────────────────
  await registerTransaction({
    type        : 'ingreso',
    category    : isPaidOff ? 'prestamo_pagado' : 'cuota_recibida',
    amount,
    description : `Pago de ${loan.clientName} — Préstamo #${loanId}${payment.isPartial ? ' (parcial)' : ''}`,
    reference   : `PAY-${payId}-LOAN-${loanId}`,
    date        : payment.date,
    sourceModule: 'loans',
    liquidImpact: amount,
    investedImpact: -principalAmount,
    activePortfolioImpact: -principalAmount,
    realProfitImpact: interestAmount,
    cashFlowImpact: interestAmount,
    meta        : {
      loanId,
      paymentId: payId,
      isPaidOff,
      principalAmount,
      interestAmount,
      capitalReturnAmount: principalAmount,
      realProfitAmount: interestAmount,
    },
  });

  // ── Integración con dashboard ───────────────────────────────
  addRecentActivity({
    icon        : isPaidOff ? '✅' : '💵',
    title       : isPaidOff ? 'Préstamo liquidado' : 'Pago recibido',
    description : `${loan.clientName} — ${_formatCurrency(amount)}`,
    date        : new Date().toISOString(),
    type        : 'payment_received',
  });

  _logAction({
    action      : 'payment_registered',
    category    : 'loans',
    amount,
    description : `Pago registrado para ${loan.clientName}`,
    meta        : { loanId, paymentId: payId, isPaidOff, isPartial: payment.isPartial },
  });

  await refreshDashboard();
  _refreshTable();

  return { payment, balance: newBalance };
}

/**
 * Obtiene el historial de pagos de un préstamo.
 *
 * @param {number} loanId
 * @returns {Array}
 */
export function getPayments(loanId) {
  return [...(_paymentsCache[loanId] || [])].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
}

// ============================================================
// SISTEMA DE PRENDAS
// ============================================================

/**
 * Guarda o actualiza la prenda asociada a un préstamo.
 *
 * @param {number} loanId   — ID del préstamo
 * @param {Object} pledge   — datos de la prenda
 */
async function _savePledge(loanId, pledge) {
  const data = {
    loanId,
    description   : pledge.description?.trim()    || '',
    estimatedValue: Number(pledge.estimatedValue)  || 0,
    physicalState : pledge.physicalState?.trim()   || 'bueno',
    photos        : pledge.photos || [],          // Array de base64 o URLs
    estimatedProfit: pledge.estimatedProfit
      ? Number(pledge.estimatedProfit)
      : null,
    notes         : pledge.notes?.trim()           || '',
    createdAt     : new Date().toISOString(),
    updatedAt     : new Date().toISOString(),
  };

  // Verificar si ya existe una prenda para este préstamo
  const all      = (await Storage.getAll(STORE_PLEDGES)) || [];
  const existing = all.find(p => p.loanId === loanId);

  if (existing) {
    data.id = existing.id;
    await Storage.update(STORE_PLEDGES, data);
  } else {
    await Storage.add(STORE_PLEDGES, data);
  }
}

/**
 * Obtiene la prenda de un préstamo.
 *
 * @param {number} loanId
 * @returns {Object|null}
 */
export async function getPledge(loanId) {
  const all = (await Storage.getAll(STORE_PLEDGES)) || [];
  return all.find(p => p.loanId === loanId) || null;
}

// ============================================================
// VERIFICACIÓN AUTOMÁTICA DE MORA
// ============================================================

/**
 * Revisa todos los préstamos activos y marca como atrasados
 * los que tengan cuotas vencidas sin pago suficiente.
 * Se llama al iniciar el módulo y puede llamarse manualmente.
 */
export async function checkOverdue() {
  return _checkOverdue();
}

async function _checkOverdue() {
  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  const active = _loansCache.filter(l => l.status === LOAN_STATUS.ACTIVE);

  for (const loan of active) {
    if (_isLoanOverdue(loan, _paymentsCache[loan.id] || [])) {
      await changeLoanStatus(loan.id, LOAN_STATUS.OVERDUE, 'Mora detectada automáticamente');
    }
  }
}

/**
 * Determina si un préstamo está en mora.
 *
 * @param {Object} loan
 * @param {Array}  payments
 * @returns {boolean}
 */
function _isLoanOverdue(loan, payments) {
  if (!loan.schedule || loan.schedule.length === 0) return false;

  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

  // Calcular cuánto debería haberse pagado hasta hoy
  let expectedPaid = 0;
  for (const inst of loan.schedule) {
    const due = new Date(inst.dueDate);
    if (due <= today) {
      expectedPaid += inst.amount;
    }
  }

  // Hay mora si lo pagado es menor a lo esperado
  return totalPaid < expectedPaid - 0.01;
}

/**
 * Calcula cuántos días de mora lleva un préstamo.
 *
 * @param {Object} loan
 * @param {Array}  payments
 * @returns {number}
 */
function _calcOverdueDays(loan, payments) {
  if (!loan.schedule) return 0;

  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  let   paid      = totalPaid;

  for (const inst of [...loan.schedule].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))) {
    if (paid >= inst.amount) {
      paid -= inst.amount;
    } else {
      // Esta cuota no está pagada — calcular días desde su vencimiento
      const due  = new Date(inst.dueDate);
      const diff = Math.max(0, Math.floor((today - due) / 86400000));
      return diff;
    }
  }

  return 0;
}

// ============================================================
// ESTADÍSTICAS PARA EL DASHBOARD
// ============================================================

/**
 * Genera estadísticas agregadas del módulo de préstamos.
 * Usadas por dashboard.js para las tarjetas de resumen.
 *
 * @returns {Object}
 */
export function getLoanStats() {
  const all = _loansCache;

  const active    = all.filter(l => l.status === LOAN_STATUS.ACTIVE);
  const overdue   = all.filter(l => l.status === LOAN_STATUS.OVERDUE);
  const paid      = all.filter(l => l.status === LOAN_STATUS.PAID);
  const defaulted = all.filter(l => l.status === LOAN_STATUS.DEFAULTED);

  // Capital en calle (préstamos activos + atrasados)
  const capitalOut = [...active, ...overdue]
    .reduce((acc, l) => {
      const payments = _paymentsCache[l.id] || [];
      const balance  = calcBalance(l, payments);
      return acc + balance.remaining;
    }, 0);

  // Ingresos esperados (intereses pendientes de cobrar)
  const expectedIncome = [...active, ...overdue]
    .reduce((acc, l) => {
      const payments = _paymentsCache[l.id] || [];
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const interest  = l.totalInterest - Math.max(0,
        totalPaid > l.amount ? totalPaid - l.amount : 0);
      return acc + Math.max(0, interest);
    }, 0);

  // Ganancias realizadas (intereses ya cobrados)
  const realizedProfit = paid.reduce((acc, l) => acc + l.totalInterest, 0);

  return {
    totalLoans     : all.length,
    activeCount    : active.length,
    overdueCount   : overdue.length,
    paidCount      : paid.length,
    defaultedCount : defaulted.length,
    capitalOut     : _round(capitalOut),
    expectedIncome : _round(expectedIncome),
    realizedProfit : _round(realizedProfit),
    hasPledgeCount : all.filter(l => l.hasPledge).length,
  };
}

// ============================================================
// RENDERIZADO DE LA VISTA PRINCIPAL
// ============================================================

/**
 * Construye y renderiza la vista completa de préstamos
 * en el contenedor #loans-container del DOM.
 */
function _renderView() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  container.innerHTML = `
    <!-- ── Encabezado ───────────────────────────────────────── -->
    <div class="module-header">
      <div class="module-title">
        <h2>Préstamos</h2>
        <span class="module-subtitle">Gestión completa de préstamos</span>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" id="btn-new-loan">
          <span class="btn-icon">+</span> Nuevo Préstamo
        </button>
      </div>
    </div>

    <!-- ── Tarjetas de estadísticas ─────────────────────────── -->
    <div class="stats-grid" id="loans-stats"></div>

    <!-- ── Filtros y búsqueda ───────────────────────────────── -->
    <div class="table-controls">
      <div class="search-box">
        <input
          type="text"
          id="loan-search"
          class="search-input"
          placeholder="Buscar por nombre, teléfono o documento…"
        />
        <span class="search-icon">🔍</span>
      </div>
      <div class="filter-tabs" id="loan-filters">
        <button class="filter-tab active" data-filter="all">Todos</button>
        <button class="filter-tab" data-filter="${LOAN_STATUS.ACTIVE}">Activos</button>
        <button class="filter-tab" data-filter="${LOAN_STATUS.OVERDUE}">Atrasados</button>
        <button class="filter-tab" data-filter="${LOAN_STATUS.PAID}">Pagados</button>
        <button class="filter-tab" data-filter="${LOAN_STATUS.DEFAULTED}">Incumplidos</button>
        <button class="filter-tab" data-filter="${LOAN_STATUS.CANCELLED}">Cancelados</button>
      </div>
    </div>

    <!-- ── Tabla de préstamos ───────────────────────────────── -->
    <div class="table-wrapper" id="loans-table-wrapper"></div>
  `;

  // Renderizar estadísticas
  _renderStats();

  // Renderizar tabla
  _renderTable();

  // Eventos
  _bindViewEvents();
}

/**
 * Renderiza las tarjetas de estadísticas de préstamos.
 */
function _renderStats() {
  const stats     = getLoanStats();
  const container = document.getElementById('loans-stats');
  if (!container) return;

  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">💰</div>
      <div class="stat-info">
        <span class="stat-value">${stats.activeCount}</span>
        <span class="stat-label">Activos</span>
      </div>
    </div>
    <div class="stat-card stat-warning">
      <div class="stat-icon">⚠️</div>
      <div class="stat-info">
        <span class="stat-value">${stats.overdueCount}</span>
        <span class="stat-label">Atrasados</span>
      </div>
    </div>
    <div class="stat-card stat-success">
      <div class="stat-icon">✅</div>
      <div class="stat-info">
        <span class="stat-value">${stats.paidCount}</span>
        <span class="stat-label">Pagados</span>
      </div>
    </div>
    <div class="stat-card stat-accent">
      <div class="stat-icon">📊</div>
      <div class="stat-info">
        <span class="stat-value">${_formatCurrency(stats.capitalOut)}</span>
        <span class="stat-label">Capital en calle</span>
      </div>
    </div>
    <div class="stat-card stat-blue">
      <div class="stat-icon">💹</div>
      <div class="stat-info">
        <span class="stat-value">${_formatCurrency(stats.expectedIncome)}</span>
        <span class="stat-label">Intereses esperados</span>
      </div>
    </div>
    <div class="stat-card stat-success-alt">
      <div class="stat-icon">🏆</div>
      <div class="stat-info">
        <span class="stat-value">${_formatCurrency(stats.realizedProfit)}</span>
        <span class="stat-label">Ganancias realizadas</span>
      </div>
    </div>
  `;
}

/**
 * Renderiza la tabla principal de préstamos usando tables.js.
 */
function _renderTable() {
  const loans = getLoans({ status: _activeFilter, search: _searchTerm });

  const columns = [
    {
      key     : 'clientName',
      label   : 'Cliente',
      sortable: true,
      render  : (val, row) => `
        <div class="cell-client">
          <span class="client-name">${_esc(val)}</span>
          ${row.clientPhone ? `<span class="client-phone">${_esc(row.clientPhone)}</span>` : ''}
        </div>
      `,
    },
    {
      key     : 'type',
      label   : 'Tipo',
      sortable: true,
      render  : (val, row) => `
        <span class="badge badge-${row.hasPledge ? 'pledge' : 'no-pledge'}">
          ${row.hasPledge ? '🔒 Con prenda' : '📋 Sin prenda'}
        </span>
      `,
    },
    {
      key     : 'amount',
      label   : 'Monto',
      sortable: true,
      align   : 'right',
      render  : val => `<span class="amount">${_formatCurrency(val)}</span>`,
    },
    {
      key     : 'totalAmount',
      label   : 'Total a pagar',
      sortable: true,
      align   : 'right',
      render  : val => `<span class="amount-total">${_formatCurrency(val)}</span>`,
    },
    {
      key     : 'id',
      label   : 'Pagado',
      sortable: false,
      align   : 'right',
      render  : (val, row) => {
        const payments  = _paymentsCache[row.id] || [];
        const balance   = calcBalance(row, payments);
        return `
          <div class="cell-progress">
            <span class="progress-pct">${balance.paidPercentage}%</span>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${balance.paidPercentage}%"></div>
            </div>
          </div>
        `;
      },
    },
    {
      key     : 'endDate',
      label   : 'Vencimiento',
      sortable: true,
      render  : val => val ? `<span class="date">${_formatDate(val)}</span>` : '—',
    },
    {
      key     : 'status',
      label   : 'Estado',
      sortable: true,
      render  : val => `<span class="badge badge-${val}">${_statusLabel(val)}</span>`,
    },
    {
      key    : 'id',
      label  : 'Acciones',
      render : (val, row) => `
        <div class="cell-actions">
          <button class="btn-icon-sm btn-pay"    data-id="${val}" title="Registrar pago">💵</button>
          <button class="btn-icon-sm btn-history" data-id="${val}" title="Ver historial">📋</button>
          <button class="btn-icon-sm btn-edit"    data-id="${val}" title="Editar">✏️</button>
          <button class="btn-icon-sm btn-cancel"  data-id="${val}" title="Cancelar"
            ${row.status === LOAN_STATUS.CANCELLED ? 'disabled' : ''}>🚫</button>
          <button class="btn-icon-sm btn-delete"  data-id="${val}" title="Eliminar préstamo" aria-label="Eliminar préstamo">🗑</button>
        </div>
      `,
    },
  ];

  renderTable({
    containerId : 'loans-table-wrapper',
    columns,
    data        : loans,
    emptyMessage: 'No se encontraron préstamos',
    onRowClick  : null,   // Usamos botones de acción
  });

  // Vincular eventos de los botones de la tabla
  _bindTableActions();
}

/** Refresca solo la tabla sin re-renderizar toda la vista */
function _refreshTable() {
  _renderStats();
  _renderTable();
}

// ============================================================
// MODALES
// ============================================================

/**
 * Abre el modal para crear un nuevo préstamo.
 */
export function openCreateLoanModal() {
  openModal({
    id      : 'modal-loan-create',
    title   : 'Nuevo Préstamo',
    size    : 'large',
    content : _buildLoanFormHTML(null),
    onOpen  : () => {
      _bindLoanFormEvents('modal-loan-create', null);
      _updateLoanCalculator();
    },
    footer  : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-loan">Crear Préstamo</button>
    `,
  });
}

/**
 * Abre el modal para editar un préstamo existente.
 *
 * @param {number} loanId
 */
export async function openEditLoanModal(loanId) {
  const loan = _getLoanById(loanId);
  if (!loan) return;

  const pledge = loan.hasPledge ? await getPledge(loanId) : null;

  openModal({
    id      : 'modal-loan-edit',
    title   : `Editar Préstamo — ${loan.clientName}`,
    size    : 'large',
    content : _buildLoanFormHTML(loan, pledge),
    onOpen  : () => {
      _bindLoanFormEvents('modal-loan-edit', loan);
      _updateLoanCalculator();
    },
    footer  : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-loan">Guardar cambios</button>
    `,
  });
}

/**
 * Abre el modal para registrar un pago.
 *
 * @param {number} loanId
 */
export function openPaymentModal(loanId) {
  const loan = _getLoanById(loanId);
  if (!loan) return;

  const payments = _paymentsCache[loanId] || [];
  const balance  = calcBalance(loan, payments);

  openModal({
    id      : 'modal-loan-payment',
    title   : `Registrar Pago — ${loan.clientName}`,
    size    : 'medium',
    content : _buildPaymentFormHTML(loan, balance),
    onOpen  : () => _bindPaymentFormEvents('modal-loan-payment', loanId, balance),
    footer  : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-success" id="btn-submit-payment">Registrar Pago</button>
    `,
  });
}

/**
 * Abre el modal de historial de pagos de un préstamo.
 *
 * @param {number} loanId
 */
export function openPaymentHistoryModal(loanId) {
  const loan     = _getLoanById(loanId);
  if (!loan) return;

  const payments = getPayments(loanId);
  const balance  = calcBalance(loan, payments);

  openModal({
    id      : 'modal-loan-history',
    title   : `Historial — ${loan.clientName}`,
    size    : 'large',
    content : _buildHistoryHTML(loan, payments, balance),
    footer  : `<button class="btn btn-ghost" data-close-modal>Cerrar</button>`,
  });
}

// ============================================================
// HTML DE FORMULARIOS
// ============================================================

/**
 * Construye el HTML del formulario de préstamo (crear/editar).
 *
 * @param {Object|null} loan   — null para crear, objeto para editar
 * @param {Object|null} pledge — datos de prenda si existe
 * @returns {string} HTML
 */
function _buildLoanFormHTML(loan, pledge) {
  const v = loan || {};

  return `
    <div class="loan-form">

      <!-- ── Sección: Datos del cliente ─────────────────────── -->
      <fieldset class="form-section">
        <legend>👤 Datos del Cliente</legend>
        <div class="form-grid form-grid-2">
          <div class="form-group required">
            <label for="f-clientName">Nombre completo</label>
            <input type="text" id="f-clientName" class="form-control"
              placeholder="Nombre del cliente"
              value="${_esc(v.clientName || '')}" />
          </div>
          <div class="form-group">
            <label for="f-clientPhone">Teléfono</label>
            <input type="tel" id="f-clientPhone" class="form-control"
              placeholder="+57 300 000 0000"
              value="${_esc(v.clientPhone || '')}" />
          </div>
          <div class="form-group">
            <label for="f-clientDoc">Documento (opcional)</label>
            <input type="text" id="f-clientDoc" class="form-control"
              placeholder="CC, NIT, Pasaporte…"
              value="${_esc(v.clientDoc || '')}" />
          </div>
          <div class="form-group">
            <label for="f-clientAddress">Dirección (opcional)</label>
            <input type="text" id="f-clientAddress" class="form-control"
              placeholder="Dirección del cliente"
              value="${_esc(v.clientAddress || '')}" />
          </div>
          <div class="form-group form-full">
            <label for="f-observations">Observaciones</label>
            <textarea id="f-observations" class="form-control" rows="2"
              placeholder="Observaciones adicionales…">${_esc(v.observations || '')}</textarea>
          </div>
        </div>
      </fieldset>

      <!-- ── Sección: Condiciones del préstamo ──────────────── -->
      <fieldset class="form-section">
        <legend>💰 Condiciones del Préstamo</legend>
        <div class="form-grid form-grid-3">
          <div class="form-group required">
            <label for="f-amount">Monto prestado</label>
            <div class="input-group">
              <span class="input-prefix">$</span>
              <input type="number" id="f-amount" class="form-control"
                placeholder="0" min="0" step="1000"
                value="${v.amount || ''}" />
            </div>
          </div>
          <div class="form-group required">
            <label for="f-interestRate">Tasa de interés</label>
            <div class="input-group">
              <input type="number" id="f-interestRate" class="form-control"
                placeholder="0" min="0" step="0.1"
                value="${v.interestRate || ''}" />
              <span class="input-suffix">%</span>
            </div>
          </div>
          <div class="form-group required">
            <label for="f-interestType">Tipo de interés</label>
            <select id="f-interestType" class="form-control">
              <option value="${INTEREST_TYPE.SIMPLE}"
                ${v.interestType === INTEREST_TYPE.SIMPLE ? 'selected' : ''}>
                Interés simple
              </option>
              <option value="${INTEREST_TYPE.MONTHLY}"
                ${v.interestType === INTEREST_TYPE.MONTHLY ? 'selected' : ''}>
                Mensual (amortizable)
              </option>
              <option value="${INTEREST_TYPE.PERCENTAGE}"
                ${v.interestType === INTEREST_TYPE.PERCENTAGE ? 'selected' : ''}>
                Porcentaje fijo
              </option>
            </select>
          </div>
          <div class="form-group required">
            <label for="f-installments">Número de cuotas</label>
            <input type="number" id="f-installments" class="form-control"
              placeholder="1" min="1" step="1"
              value="${v.installments || ''}" />
          </div>
          <div class="form-group required">
            <label for="f-frequency">Frecuencia de pago</label>
            <select id="f-frequency" class="form-control">
              <option value="${PAYMENT_FREQ.DAILY}"    ${v.frequency === PAYMENT_FREQ.DAILY    ? 'selected' : ''}>Diario</option>
              <option value="${PAYMENT_FREQ.WEEKLY}"   ${v.frequency === PAYMENT_FREQ.WEEKLY   ? 'selected' : ''}>Semanal</option>
              <option value="${PAYMENT_FREQ.BIWEEKLY}" ${v.frequency === PAYMENT_FREQ.BIWEEKLY ? 'selected' : ''}>Quincenal</option>
              <option value="${PAYMENT_FREQ.MONTHLY}"  ${v.frequency === PAYMENT_FREQ.MONTHLY  ? 'selected' : ''}>Mensual</option>
              <option value="${PAYMENT_FREQ.CUSTOM}"   ${v.frequency === PAYMENT_FREQ.CUSTOM   ? 'selected' : ''}>Personalizado</option>
            </select>
          </div>
          <div class="form-group" id="group-customDays"
            style="${v.frequency === PAYMENT_FREQ.CUSTOM ? '' : 'display:none'}">
            <label for="f-customDays">Días entre cuotas</label>
            <input type="number" id="f-customDays" class="form-control"
              placeholder="30" min="1"
              value="${v.customDays || ''}" />
          </div>
          <div class="form-group required">
            <label for="f-startDate">Fecha de inicio</label>
            <input type="date" id="f-startDate" class="form-control"
              value="${v.startDate || new Date().toISOString().split('T')[0]}" />
          </div>
        </div>
      </fieldset>

      <!-- ── Sección: Resumen calculado (solo lectura) ───────── -->
      <fieldset class="form-section form-section-calc">
        <legend>📊 Resumen Calculado</legend>
        <div class="calc-grid" id="f-calc-summary">
          <div class="calc-item">
            <span class="calc-label">Total a pagar</span>
            <span class="calc-value" id="calc-total">—</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">Valor de cuota</span>
            <span class="calc-value" id="calc-installment">—</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">Total intereses</span>
            <span class="calc-value" id="calc-interest">—</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">Ganancia estimada</span>
            <span class="calc-value highlight" id="calc-profit">—</span>
          </div>
          <div class="calc-item">
            <span class="calc-label">Fecha vencimiento</span>
            <span class="calc-value" id="calc-endDate">—</span>
          </div>
        </div>
      </fieldset>

      <!-- ── Sección: Prenda (toggle) ──────────────────────── -->
      <fieldset class="form-section">
        <legend>🔒 Prenda</legend>
        <div class="form-group">
          <label class="toggle-label">
            <input type="checkbox" id="f-hasPledge"
              ${v.hasPledge ? 'checked' : ''} />
            <span class="toggle-switch"></span>
            Este préstamo tiene prenda
          </label>
        </div>
        <div id="pledge-fields" style="${v.hasPledge ? 'display:block' : 'display:none'}">
          <div class="form-grid form-grid-2">
            <div class="form-group form-full">
              <label for="f-pledgeDesc">Descripción de la prenda</label>
              <textarea id="f-pledgeDesc" class="form-control" rows="2"
                placeholder="Describe el objeto dado en prenda…">${_esc(pledge?.description || '')}</textarea>
            </div>
            <div class="form-group">
              <label for="f-pledgeValue">Valor estimado</label>
              <div class="input-group">
                <span class="input-prefix">$</span>
                <input type="number" id="f-pledgeValue" class="form-control"
                  placeholder="0" min="0"
                  value="${pledge?.estimatedValue || ''}" />
              </div>
            </div>
            <div class="form-group">
              <label for="f-pledgeState">Estado físico</label>
              <select id="f-pledgeState" class="form-control">
                <option value="excelente" ${pledge?.physicalState === 'excelente' ? 'selected' : ''}>Excelente</option>
                <option value="bueno"     ${(!pledge || pledge.physicalState === 'bueno') ? 'selected' : ''}>Bueno</option>
                <option value="regular"   ${pledge?.physicalState === 'regular' ? 'selected' : ''}>Regular</option>
                <option value="malo"      ${pledge?.physicalState === 'malo' ? 'selected' : ''}>Malo</option>
              </select>
            </div>
            <div class="form-group">
              <label for="f-pledgeProfit">Ganancia estimada si incumple</label>
              <div class="input-group">
                <span class="input-prefix">$</span>
                <input type="number" id="f-pledgeProfit" class="form-control"
                  placeholder="0" min="0"
                  value="${pledge?.estimatedProfit || ''}" />
              </div>
            </div>
            <div class="form-group form-full">
              <label for="f-pledgeNotes">Notas de la prenda</label>
              <input type="text" id="f-pledgeNotes" class="form-control"
                placeholder="Detalles adicionales…"
                value="${_esc(pledge?.notes || '')}" />
            </div>
            <!-- Preparado para fotos en fase futura -->
            <div class="form-group form-full">
              <label>Fotos de la prenda</label>
              <div class="photo-upload-placeholder">
                <span class="photo-icon">📷</span>
                <span>Funcionalidad de fotos disponible próximamente</span>
              </div>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  `;
}

/**
 * Construye el HTML del formulario de pago.
 *
 * @param {Object} loan
 * @param {Object} balance
 * @returns {string} HTML
 */
function _buildPaymentFormHTML(loan, balance) {
  return `
    <div class="payment-form">
      <!-- Resumen del préstamo -->
      <div class="payment-summary-card">
        <div class="ps-item">
          <span class="ps-label">Cliente</span>
          <span class="ps-value">${_esc(loan.clientName)}</span>
        </div>
        <div class="ps-item">
          <span class="ps-label">Cuota regular</span>
          <span class="ps-value">${_formatCurrency(loan.installmentAmount)}</span>
        </div>
        <div class="ps-item">
          <span class="ps-label">Saldo pendiente</span>
          <span class="ps-value highlight">${_formatCurrency(balance.remaining)}</span>
        </div>
        ${balance.isOverdue ? `
        <div class="ps-item ps-warning">
          <span class="ps-label">⚠️ Días de mora</span>
          <span class="ps-value">${balance.overdueDays} días</span>
        </div>
        ` : ''}
      </div>

      <!-- Formulario de pago -->
      <div class="form-grid form-grid-2">
        <div class="form-group required">
          <label for="p-amount">Monto a pagar</label>
          <div class="input-group">
            <span class="input-prefix">$</span>
            <input type="number" id="p-amount" class="form-control"
              placeholder="0" min="1"
              max="${balance.remaining}"
              value="${loan.installmentAmount}" />
          </div>
          <div class="form-hint">
            Pago completo: ${_formatCurrency(loan.installmentAmount)} |
            Saldo: ${_formatCurrency(balance.remaining)}
          </div>
        </div>
        <div class="form-group">
          <label for="p-date">Fecha del pago</label>
          <input type="date" id="p-date" class="form-control"
            value="${new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-group">
          <label for="p-method">Método de pago</label>
          <select id="p-method" class="form-control">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="form-group form-full">
          <label for="p-note">Nota (opcional)</label>
          <input type="text" id="p-note" class="form-control"
            placeholder="Referencia, observación…" />
        </div>
      </div>
    </div>
  `;
}

/**
 * Construye el HTML del historial de pagos de un préstamo.
 *
 * @param {Object} loan
 * @param {Array}  payments
 * @param {Object} balance
 * @returns {string} HTML
 */
function _buildHistoryHTML(loan, payments, balance) {
  const summary = calcLoanSummary(loan);

  // Tabla del cronograma vs pagos realizados
  const scheduleRows = summary.schedule.map((inst, idx) => {
    const paid = payments[idx];
    const status = paid
      ? (paid.amount >= inst.amount - 0.01 ? 'pagado' : 'parcial')
      : (new Date(inst.dueDate) < new Date() ? 'vencido' : 'pendiente');
    return `
      <tr class="row-status-${status}">
        <td>${inst.number}</td>
        <td>${_formatDate(inst.dueDate)}</td>
        <td class="text-right">${_formatCurrency(inst.amount)}</td>
        <td class="text-right">${paid ? _formatCurrency(paid.amount) : '—'}</td>
        <td>${paid ? _formatDate(paid.date) : '—'}</td>
        <td>${paid?.method ? _esc(paid.method) : '—'}</td>
        <td><span class="badge badge-${status}">${_capitalize(status)}</span></td>
      </tr>
    `;
  }).join('');

  return `
    <div class="history-view">

      <!-- Resumen general -->
      <div class="history-summary">
        <div class="hs-item">
          <span class="hs-label">Monto prestado</span>
          <span class="hs-value">${_formatCurrency(loan.amount)}</span>
        </div>
        <div class="hs-item">
          <span class="hs-label">Total a pagar</span>
          <span class="hs-value">${_formatCurrency(summary.totalAmount)}</span>
        </div>
        <div class="hs-item">
          <span class="hs-label">Total pagado</span>
          <span class="hs-value success">${_formatCurrency(balance.totalPaid)}</span>
        </div>
        <div class="hs-item">
          <span class="hs-label">Saldo pendiente</span>
          <span class="hs-value ${balance.remaining > 0 ? 'warning' : 'success'}">
            ${_formatCurrency(balance.remaining)}
          </span>
        </div>
        <div class="hs-item">
          <span class="hs-label">Avance</span>
          <span class="hs-value">${balance.paidPercentage}%</span>
        </div>
        <div class="hs-item">
          <span class="hs-label">Estado</span>
          <span class="badge badge-${loan.status}">${_statusLabel(loan.status)}</span>
        </div>
      </div>

      <!-- Barra de progreso -->
      <div class="progress-track">
        <div class="progress-fill" style="width:${balance.paidPercentage}%"></div>
      </div>

      <!-- Cronograma de cuotas -->
      <h4 class="section-title">Cronograma de Cuotas</h4>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vencimiento</th>
              <th class="text-right">Cuota</th>
              <th class="text-right">Pagado</th>
              <th>Fecha pago</th>
              <th>Método</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>${scheduleRows || '<tr><td colspan="7" class="empty-row">Sin cuotas generadas</td></tr>'}</tbody>
        </table>
      </div>

      <!-- Historial de pagos recibidos -->
      <h4 class="section-title">Pagos Recibidos</h4>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>Fecha</th><th class="text-right">Monto</th><th>Método</th><th>Nota</th></tr>
          </thead>
          <tbody>
            ${payments.length === 0
              ? '<tr><td colspan="5" class="empty-row">Sin pagos registrados</td></tr>'
              : payments.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${_formatDate(p.date)}</td>
                  <td class="text-right">${_formatCurrency(p.amount)}</td>
                  <td>${_esc(p.method)}</td>
                  <td>${_esc(p.note || '—')}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// EVENT BINDING
// ============================================================

/** Eventos globales de la vista de préstamos */
function _bindViewEvents() {
  // Botón nuevo préstamo
  document.getElementById('btn-new-loan')
    ?.addEventListener('click', openCreateLoanModal);

  // Búsqueda
  document.getElementById('loan-search')
    ?.addEventListener('input', e => {
      _searchTerm = e.target.value;
      _renderTable();
    });

  // Filtros de estado
  document.getElementById('loan-filters')
    ?.addEventListener('click', e => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _activeFilter = tab.dataset.filter;
      _renderTable();
    });
}

/** Eventos de los botones de acción en la tabla */
function _bindTableActions() {
  const wrapper = document.getElementById('loans-table-wrapper');
  if (!wrapper || wrapper.dataset.actionsBound === 'true') return;
  wrapper.dataset.actionsBound = 'true';

  wrapper.addEventListener('click', e => {
      const payBtn     = e.target.closest('.btn-pay');
      const historyBtn = e.target.closest('.btn-history');
      const editBtn    = e.target.closest('.btn-edit');
      const cancelBtn  = e.target.closest('.btn-cancel');
      const deleteBtn  = e.target.closest('.btn-delete');

      if (payBtn)     openPaymentModal(Number(payBtn.dataset.id));
      if (historyBtn) openPaymentHistoryModal(Number(historyBtn.dataset.id));
      if (editBtn)    openEditLoanModal(Number(editBtn.dataset.id));
      if (cancelBtn)  _confirmCancel(Number(cancelBtn.dataset.id));
      if (deleteBtn)  _confirmDeleteLoan(Number(deleteBtn.dataset.id));
    });
}

/**
 * Vincula eventos del formulario de préstamo (calculadora en tiempo real).
 *
 * @param {string}      modalId
 * @param {Object|null} loan — null si es nuevo
 */
function _bindLoanFormEvents(modalId, loan) {
  const calcTriggers = ['f-amount','f-interestRate','f-interestType',
                        'f-installments','f-frequency','f-startDate','f-customDays'];

  calcTriggers.forEach(id => {
    document.getElementById(id)?.addEventListener('input', _updateLoanCalculator);
    document.getElementById(id)?.addEventListener('change', _updateLoanCalculator);
  });

  // Toggle de frecuencia personalizada
  document.getElementById('f-frequency')?.addEventListener('change', e => {
    const grp = document.getElementById('group-customDays');
    if (grp) grp.style.display = e.target.value === PAYMENT_FREQ.CUSTOM ? '' : 'none';
  });

  // Toggle de prenda
  document.getElementById('f-hasPledge')?.addEventListener('change', e => {
    const fields = document.getElementById('pledge-fields');
    if (fields) fields.style.display = e.target.checked ? 'block' : 'none';
  });

  // Submit
  document.getElementById('btn-submit-loan')?.addEventListener('click', async () => {
    await _handleLoanSubmit(loan?.id || null);
  });
}

/**
 * Vincula eventos del formulario de pago.
 *
 * @param {string} modalId
 * @param {number} loanId
 * @param {Object} balance
 */
function _bindPaymentFormEvents(modalId, loanId, balance) {
  document.getElementById('btn-submit-payment')?.addEventListener('click', async () => {
    await _handlePaymentSubmit(loanId, balance);
  });
}

// ============================================================
// CALCULADORA EN TIEMPO REAL
// ============================================================

/** Actualiza el resumen calculado en el formulario */
function _updateLoanCalculator() {
  const get = id => document.getElementById(id)?.value;

  const data = {
    amount       : parseFloat(get('f-amount'))       || 0,
    interestRate : parseFloat(get('f-interestRate')) || 0,
    interestType : get('f-interestType')             || INTEREST_TYPE.SIMPLE,
    installments : parseInt(get('f-installments'))   || 1,
    frequency    : get('f-frequency')                || PAYMENT_FREQ.MONTHLY,
    startDate    : get('f-startDate')                || new Date().toISOString().split('T')[0],
    customDays   : parseInt(get('f-customDays'))     || 30,
  };

  if (!data.amount || !data.installments) return;

  const summary = calcLoanSummary(data);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('calc-total',       _formatCurrency(summary.totalAmount));
  set('calc-installment', _formatCurrency(summary.installmentAmount));
  set('calc-interest',    _formatCurrency(summary.totalInterest));
  set('calc-profit',      _formatCurrency(summary.profit));
  set('calc-endDate',     summary.endDate ? _formatDate(summary.endDate) : '—');
}

// ============================================================
// MANEJO DE FORMULARIOS (SUBMIT)
// ============================================================

/**
 * Recoge y valida el formulario de préstamo y llama a create/update.
 *
 * @param {number|null} loanId — null para crear
 */
async function _handleLoanSubmit(loanId) {
  const get = id => document.getElementById(id)?.value?.trim();

  const data = {
    clientName   : get('f-clientName'),
    clientPhone  : get('f-clientPhone'),
    clientDoc    : get('f-clientDoc'),
    clientAddress: get('f-clientAddress'),
    observations : document.getElementById('f-observations')?.value?.trim(),
    amount       : parseFloat(get('f-amount')),
    interestRate : parseFloat(get('f-interestRate')),
    interestType : get('f-interestType'),
    installments : parseInt(get('f-installments')),
    frequency    : get('f-frequency'),
    customDays   : parseInt(get('f-customDays')) || null,
    startDate    : get('f-startDate'),
    hasPledge    : document.getElementById('f-hasPledge')?.checked,
    pledge: {
      description    : document.getElementById('f-pledgeDesc')?.value?.trim(),
      estimatedValue : parseFloat(document.getElementById('f-pledgeValue')?.value) || 0,
      physicalState  : document.getElementById('f-pledgeState')?.value,
      estimatedProfit: parseFloat(document.getElementById('f-pledgeProfit')?.value) || null,
      notes          : document.getElementById('f-pledgeNotes')?.value?.trim(),
      photos         : [],
    },
  };

  // Validación básica visual
  if (!data.clientName) {
    return _showFieldError('f-clientName', 'El nombre del cliente es obligatorio');
  }
  if (!data.amount || data.amount <= 0) {
    return _showFieldError('f-amount', 'El monto debe ser mayor a 0');
  }
  if (!data.installments || data.installments < 1) {
    return _showFieldError('f-installments', 'Ingresa el número de cuotas');
  }

  const btn = document.getElementById('btn-submit-loan');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    if (loanId) {
      await updateLoan(loanId, data);
    } else {
      await createLoan(data);
    }
    closeModal(loanId ? 'modal-loan-edit' : 'modal-loan-create');
    _showToast(loanId ? 'Préstamo actualizado ✅' : 'Préstamo creado exitosamente ✅');
  } catch (err) {
    console.error('[Loans] Error al guardar:', err);
    _showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = loanId ? 'Guardar cambios' : 'Crear Préstamo'; }
  }
}

/**
 * Recoge y valida el formulario de pago y llama a registerPayment.
 *
 * @param {number} loanId
 * @param {Object} balance
 */
async function _handlePaymentSubmit(loanId, balance) {
  const amount = parseFloat(document.getElementById('p-amount')?.value);
  const date   = document.getElementById('p-date')?.value;
  const method = document.getElementById('p-method')?.value;
  const note   = document.getElementById('p-note')?.value?.trim();

  if (!amount || amount <= 0) {
    return _showFieldError('p-amount', 'Ingresa un monto válido');
  }

  const btn = document.getElementById('btn-submit-payment');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }

  try {
    const result = await registerPayment(loanId, { amount, date, method, note });
    closeModal('modal-loan-payment');
    _showToast(result.balance.remaining <= 0.01
      ? '🎉 ¡Préstamo pagado completamente!'
      : `Pago registrado ✅ — Saldo: ${_formatCurrency(result.balance.remaining)}`
    );
  } catch (err) {
    console.error('[Loans] Error al registrar pago:', err);
    _showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Pago'; }
  }
}

/**
 * Confirmación de cancelación de un préstamo.
 *
 * @param {number} loanId
 */
function _confirmCancel(loanId) {
  const loan = _getLoanById(loanId);
  if (!loan) return;

  openModal({
    id      : 'modal-loan-cancel',
    title   : 'Cancelar Préstamo',
    size    : 'small',
    content : `
      <p class="confirm-text">
        ¿Confirmas la cancelación del préstamo de <strong>${_esc(loan.clientName)}</strong>?
      </p>
      <div class="form-group">
        <label for="cancel-note">Motivo (opcional)</label>
        <input type="text" id="cancel-note" class="form-control"
          placeholder="Motivo de cancelación…" />
      </div>
    `,
    footer  : `
      <button class="btn btn-ghost" data-close-modal>No cancelar</button>
      <button class="btn btn-danger" id="btn-confirm-cancel">Sí, cancelar</button>
    `,
    onOpen  : () => {
      document.getElementById('btn-confirm-cancel')
        ?.addEventListener('click', async () => {
          const note = document.getElementById('cancel-note')?.value?.trim();
          await cancelLoan(loanId, note);
          closeModal('modal-loan-cancel');
          _showToast('Préstamo cancelado');
        });
    },
  });
}

function _confirmDeleteLoan(loanId) {
  const loan = _getLoanById(loanId);
  if (!loan) return;

  openModal({
    id      : 'modal-loan-delete',
    title   : 'Eliminar Préstamo',
    size    : 'small',
    content : `
      <p class="confirm-text">
        ¿Eliminar definitivamente el préstamo de <strong>${_esc(loan.clientName)}</strong>?
        Esta acción también borra pagos y prenda asociada.
      </p>
    `,
    footer  : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-danger" id="btn-confirm-delete-loan">Sí, eliminar</button>
    `,
    onOpen  : () => {
      document.getElementById('btn-confirm-delete-loan')
        ?.addEventListener('click', async () => {
          try {
            await deleteLoan(loanId);
            closeModal('modal-loan-delete');
            _showToast('Préstamo eliminado');
          } catch (err) {
            console.error('[Loans] Error al eliminar:', err);
            _showToast(`Error: ${err.message}`, 'error');
          }
        });
    },
  });
}

// ============================================================
// PREPARADO PARA HISTORY.JS
// ============================================================

/**
 * Registra una acción en el historial del sistema.
 * Cuando history.js esté disponible, llamará a su API.
 * Por ahora guarda en localStorage como fallback.
 *
 * @param {Object} entry — { action, category, amount, description, meta }
 */
function _logAction(entry) {
  const log = {
    timestamp  : new Date().toISOString(),
    module     : 'loans',
    user       : 'local',
    action     : entry.action,
    category   : entry.category     || 'loans',
    amount     : entry.amount       || null,
    description: entry.description  || '',
    meta       : entry.meta         || {},
  };

  // Intentar usar history.js si está disponible (carga dinámica futura)
  if (typeof window._historyModule?.log === 'function') {
    window._historyModule.log(log);
    return;
  }

  // Fallback: acumular en sessionStorage hasta que history.js exista
  try {
    const key     = 'loans_pending_history';
    const pending = JSON.parse(sessionStorage.getItem(key) || '[]');
    pending.push(log);
    // Mantener solo los últimos 200 registros para no saturar
    if (pending.length > 200) pending.splice(0, pending.length - 200);
    sessionStorage.setItem(key, JSON.stringify(pending));
  } catch (_) {
    // sessionStorage no disponible — ignorar silenciosamente
  }
}

/**
 * Expone los logs pendientes para que history.js los consuma al inicializarse.
 *
 * @returns {Array}
 */
export function getPendingHistoryLogs() {
  try {
    const key     = 'loans_pending_history';
    const pending = JSON.parse(sessionStorage.getItem(key) || '[]');
    sessionStorage.removeItem(key);
    return pending;
  } catch (_) {
    return [];
  }
}

// ============================================================
// UTILIDADES PRIVADAS
// ============================================================

/** Busca un préstamo en cache por ID */
function _getLoanById(id) {
  return _loansCache.find(l => l.id === id) || null;
}

function _normalizeLoanRecord(loan) {
  const normalized = { ...loan };
  if (normalized.status === 'active') normalized.status = LOAN_STATUS.ACTIVE;
  if (normalized.status === 'completed') normalized.status = LOAN_STATUS.PAID;
  if (!normalized.interestRate && normalized.rate != null) normalized.interestRate = Number(normalized.rate);
  if (!normalized.installments && normalized.term != null) normalized.installments = Number(normalized.term);
  if (!normalized.interestType) normalized.interestType = INTEREST_TYPE.SIMPLE;
  if (!normalized.frequency) normalized.frequency = PAYMENT_FREQ.MONTHLY;
  if (!normalized.startDate) normalized.startDate = new Date().toISOString().split('T')[0];
  if (normalized.hasPledge == null) normalized.hasPledge = normalized.type === 'con_prenda';
  if (!Array.isArray(normalized.statusHistory)) {
    normalized.statusHistory = [
      { status: normalized.status || LOAN_STATUS.ACTIVE, date: normalized.createdAt || new Date().toISOString(), note: 'Registro normalizado' },
    ];
  }

  if (!normalized.totalAmount || !normalized.installmentAmount || !normalized.endDate) {
    const summary = calcLoanSummary(normalized);
    normalized.totalAmount = summary.totalAmount;
    normalized.totalInterest = summary.totalInterest;
    normalized.installmentAmount = summary.installmentAmount;
    normalized.schedule = summary.schedule;
    normalized.endDate = summary.endDate;
  }

  return normalized;
}

/** Actualiza un item en la cache en memoria */
function _updateCacheItem(loan) {
  const idx = _loansCache.findIndex(l => l.id === loan.id);
  if (idx !== -1) _loansCache[idx] = loan;
}

/** Redondea a 2 decimales */
function _round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formatea número como moneda COP */
function _formatCurrency(n) {
  return new Intl.NumberFormat('es-CO', {
    style   : 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/** Formatea fecha ISO a formato local */
function _formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

/** Escapa HTML para evitar XSS */
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Etiqueta legible para estados */
function _statusLabel(status) {
  const labels = {
    [LOAN_STATUS.ACTIVE]   : 'Activo',
    [LOAN_STATUS.PAID]     : 'Pagado',
    [LOAN_STATUS.OVERDUE]  : 'Atrasado',
    [LOAN_STATUS.DEFAULTED]: 'Incumplido',
    [LOAN_STATUS.CANCELLED]: 'Cancelado',
  };
  return labels[status] || status;
}

/** Capitaliza primera letra */
function _capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

/** Valida datos mínimos de un préstamo */
function _validateLoanData(data) {
  if (!data.clientName?.trim()) throw new Error('El nombre del cliente es obligatorio');
  if (!data.amount || data.amount <= 0) throw new Error('El monto debe ser mayor a 0');
  if (!data.installments || data.installments < 1) throw new Error('Indica el número de cuotas');
  if (!data.startDate) throw new Error('La fecha de inicio es obligatoria');
  if (!Object.values(INTEREST_TYPE).includes(data.interestType)) {
    throw new Error('Tipo de interés no válido');
  }
  if (!Object.values(PAYMENT_FREQ).includes(data.frequency)) {
    throw new Error('Frecuencia de pago no válida');
  }
}

/** Muestra un error en un campo del formulario */
function _showFieldError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add('error');
  let err = el.parentNode.querySelector('.field-error');
  if (!err) {
    err = document.createElement('span');
    err.className = 'field-error';
    el.parentNode.appendChild(err);
  }
  err.textContent = message;
  el.focus();
  setTimeout(() => {
    el.classList.remove('error');
    err.remove();
  }, 4000);
}

/** Muestra un toast de notificación */
function _showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/** Muestra un error en el contenedor principal */
function _showError(message) {
  const container = document.getElementById(CONTAINER_ID);
  if (container) {
    container.innerHTML = `
      <div class="module-error">
        <span class="error-icon">⚠️</span>
        <p>${message}</p>
      </div>
    `;
  }
}

// ============================================================
// EXPORTACIONES PÚBLICAS
// ============================================================

export {
  LOAN_STATUS,
  INTEREST_TYPE,
  PAYMENT_FREQ,
};
