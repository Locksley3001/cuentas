import { DB } from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { Modal, closeModal, showToast } from '../components/modal.js';
import { registerTransaction } from './finance.js';
import { addRecentActivity } from './dashboard.js';
import {
  bindMoneyInputs,
  formatMoney,
  formatNumber,
  formatSignedMoney,
  moneyValue,
  parseMoney,
  toNumber,
} from '../utils/format.js';

const ACTIVE_STATUSES = new Set(['active', 'activo', 'lead', 'reunion', 'propuesta', 'desarrollo', 'soporte']);
const SOLD_STATUSES = new Set(['sold', 'vendido', 'entregado', 'cerrado']);

const BUSINESS_MODULES = {
  animals: {
    store: 'animals',
    route: 'animals',
    title: 'Animales',
    subtitle: 'Ganado, caballos y animales productivos con acuerdos de finca y rentabilidad real.',
    addLabel: 'Registrar animal',
    icon: 'AN',
    empty: 'Sin animales registrados',
    kind: 'animals',
    columns: [
      ['name', 'Animal'],
      ['purpose', 'Proposito'],
      ['farmName', 'Finca'],
      ['purchaseCost', 'Costo'],
      ['status', 'Estado'],
      ['roi', 'ROI'],
    ],
    stats: buildAnimalStats,
    form: animalForm,
    normalize: normalizeAnimal,
    saleForm: animalSaleForm,
    sell: sellAnimal,
  },
  vehicles: {
    store: 'vehicles',
    route: 'vehicles',
    title: 'Vehiculos',
    subtitle: 'Motos, carros, maquinaria y vehiculos separados por negocio o patrimonio personal.',
    addLabel: 'Registrar vehiculo',
    icon: 'VH',
    empty: 'Sin vehiculos registrados',
    kind: 'vehicles',
    columns: [
      ['name', 'Vehiculo'],
      ['purpose', 'Proposito'],
      ['purchaseCost', 'Costo'],
      ['marketValue', 'Valor mercado'],
      ['status', 'Estado'],
      ['potential', 'Valorizacion'],
    ],
    stats: buildVehicleStats,
    form: vehicleForm,
    normalize: normalizeVehicle,
    saleForm: vehicleSaleForm,
    sell: sellVehicle,
  },
  trading: {
    store: 'trading_accounts',
    route: 'trading',
    title: 'Trading',
    subtitle: 'Brokers, capital colocado, PnL realizado/no realizado, riesgo y rendimiento.',
    addLabel: 'Registrar cuenta',
    icon: 'TR',
    empty: 'Sin cuentas de trading',
    kind: 'trading',
    columns: [
      ['broker', 'Broker'],
      ['type', 'Tipo'],
      ['capitalTotal', 'Capital'],
      ['pnlRealized', 'PnL realizado'],
      ['pnlUnrealized', 'PnL no realizado'],
      ['roi', 'ROI'],
    ],
    stats: buildTradingStats,
    form: tradingForm,
    normalize: normalizeTrading,
  },
  software: {
    store: 'software_projects',
    route: 'software',
    title: 'Software',
    subtitle: 'Clientes, proyectos, pagos, costos, utilidad y seguimiento comercial.',
    addLabel: 'Registrar proyecto',
    icon: 'SW',
    empty: 'Sin proyectos de software',
    kind: 'software',
    columns: [
      ['clientName', 'Cliente'],
      ['service', 'Servicio'],
      ['status', 'Estado'],
      ['payments', 'Pagos'],
      ['costs', 'Costos'],
      ['profit', 'Utilidad'],
    ],
    stats: buildSoftwareStats,
    form: softwareForm,
    normalize: normalizeSoftware,
  },
  patrimony: {
    store: 'personal_patrimony',
    route: 'patrimony',
    title: 'Patrimonio personal',
    subtitle: 'Bienes personales separados del capital productivo y del negocio.',
    addLabel: 'Registrar bien',
    icon: 'PP',
    empty: 'Sin patrimonio personal registrado',
    kind: 'patrimony',
    columns: [
      ['name', 'Bien'],
      ['type', 'Tipo'],
      ['purchaseCost', 'Costo'],
      ['status', 'Estado'],
      ['notes', 'Notas'],
    ],
    stats: buildPatrimonyStats,
    form: patrimonyForm,
    normalize: normalizePatrimony,
  },
};

class BusinessModule {
  constructor(config) {
    this.config = config;
    this.rows = [];
    this.container = null;
    this.search = '';
  }

  async init(container) {
    this.container = container;
    await DB.ensureStore(this.config.store, { keyPath: 'id', autoIncrement: true });
    await this.load();
    this.render();
  }

  async load() {
    const rows = await Storage.getAll(this.config.store).catch(() => []);
    this.rows = rows.map(row => this.config.normalize(row));
  }

  render() {
    if (!this.container) return;
    const stats = this.config.stats(this.rows);
    const filtered = this.filteredRows();

    this.container.innerHTML = `
      <div class="business-module module-container" data-business-module="${this.config.route}">
        <div class="module-header">
          <div class="module-title-group">
            <span class="business-kicker">${this.config.icon}</span>
            <h2 class="module-title">${escapeHtml(this.config.title)}</h2>
            <span class="module-subtitle">${escapeHtml(this.config.subtitle)}</span>
          </div>
          <div class="module-actions">
            <button class="btn btn-primary" data-action="create">${escapeHtml(this.config.addLabel)}</button>
          </div>
        </div>

        <div class="stats-grid business-stats-grid">
          ${stats.map(stat => `
            <div class="stat-card">
              <div class="stat-icon">${escapeHtml(stat.icon)}</div>
              <div class="stat-info">
                <span class="stat-label">${escapeHtml(stat.label)}</span>
                <span class="stat-value">${escapeHtml(stat.value)}</span>
                <span class="stat-detail">${escapeHtml(stat.detail || '')}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="table-toolbar">
          <div class="search-wrapper">
            <span class="search-icon">⌕</span>
            <input class="form-input search-input" data-action="search" placeholder="Buscar en ${escapeHtml(this.config.title.toLowerCase())}" value="${escapeHtml(this.search)}">
          </div>
          <span class="business-count">${filtered.length} registros reales</span>
        </div>

        <div class="business-table-shell">
          ${this.renderTable(filtered)}
        </div>
      </div>
    `;

    this.bind();
  }

  renderTable(rows) {
    if (!rows.length) {
      return `<div class="empty-state"><div class="empty-icon">${escapeHtml(this.config.icon)}</div><p>${escapeHtml(this.config.empty)}</p></div>`;
    }

    return `
      <div class="dt-table-wrap">
        <table class="dt-table business-table">
          <thead>
            <tr>
              ${this.config.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${this.config.columns.map(([key]) => `<td>${this.renderCell(row, key)}</td>`).join('')}
                <td class="business-actions">${this.renderActions(row)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderCell(row, key) {
    const value = row[key];
    if (['purchaseCost', 'marketValue', 'potential', 'capitalTotal', 'pnlRealized', 'pnlUnrealized', 'payments', 'costs', 'profit'].includes(key)) {
      return `<span class="amount ${toNumber(value) < 0 ? 'text-danger' : ''}">${formatSignedMoney(value)}</span>`;
    }
    if (key === 'roi') return `<span class="badge ${toNumber(value) >= 0 ? 'badge-success' : 'badge-danger'}">${formatPct(value)}</span>`;
    if (key === 'status') return `<span class="badge ${SOLD_STATUSES.has(String(value).toLowerCase()) ? 'badge-neutral' : 'badge-accent'}">${escapeHtml(labelize(value))}</span>`;
    return escapeHtml(value || '-');
  }

  renderActions(row) {
    const sellButton = this.config.sell && !SOLD_STATUSES.has(String(row.status).toLowerCase())
      ? `<button class="btn btn-ghost btn-sm" data-action="sell" data-id="${row.id}">Vender</button>`
      : '';
    return `
      <button class="btn btn-ghost btn-sm" data-action="view" data-id="${row.id}">Ver</button>
      ${sellButton}
    `;
  }

  filteredRows() {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.rows;
    return this.rows.filter(row => JSON.stringify(row).toLowerCase().includes(query));
  }

  bind() {
    this.container.querySelector('[data-action="create"]')?.addEventListener('click', () => this.openCreate());
    this.container.querySelector('[data-action="search"]')?.addEventListener('input', event => {
      this.search = event.target.value;
      this.render();
    });
    this.container.querySelectorAll('[data-action="view"]').forEach(button => {
      button.addEventListener('click', () => this.openDetails(Number(button.dataset.id)));
    });
    this.container.querySelectorAll('[data-action="sell"]').forEach(button => {
      button.addEventListener('click', () => this.openSale(Number(button.dataset.id)));
    });
  }

  openCreate() {
    Modal.open({
      title: this.config.addLabel,
      size: 'xl',
      content: `<form id="business-form" class="business-form">${this.config.form()}</form>`,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="business-save">Guardar</button>
      `,
    });
    const form = document.getElementById('business-form');
    bindMoneyInputs(form);
    this.bindDerivedCalculations(form);
    document.getElementById('business-save')?.addEventListener('click', () => this.saveFromForm(form));
  }

  bindDerivedCalculations(form) {
    form?.addEventListener('input', () => {
      form.querySelectorAll('[data-derived]').forEach(target => {
        target.textContent = this.calculateDerived(target.dataset.derived, form);
      });
    });
    form?.dispatchEvent(new Event('input'));
  }

  calculateDerived(type, form) {
    if (type === 'animalPurchaseCost') {
      return formatMoney(moneyValue(form, '[name="initialWeight"]') * moneyValue(form, '[name="purchaseKgPrice"]'));
    }
    if (type === 'animalOwnerPct') {
      return `${Math.max(0, 100 - moneyValue(form, '[name="farmOwnerPct"]')).toFixed(1)}%`;
    }
    return '-';
  }

  async saveFromForm(form) {
    try {
      const values = readForm(form);
      const record = this.config.normalize({ ...values, status: values.status || 'active' });
      const id = await Storage.add(this.config.store, record);
      record.id = id;
      await this.registerCreateImpact(record);
      closeModal();
      showToast(`${this.config.title}: registro guardado`, 'success');
      await this.load();
      this.render();
    } catch (error) {
      console.error(`[${this.config.route}] Error guardando`, error);
      showToast(error.message || 'No se pudo guardar el registro', 'danger');
    }
  }

  async registerCreateImpact(record) {
    const impact = getCreateImpact(this.config.kind, record);
    if (!impact) return;
    if (Array.isArray(impact.batch)) {
      for (const entry of impact.batch) {
        await this.registerSingleImpact(record, entry);
      }
      await logBusinessActivity(this.config.route, 'create', record, impact.batch.reduce((sum, item) => sum + toNumber(item.amount), 0));
      return;
    }
    await this.registerSingleImpact(record, impact);
    await logBusinessActivity(this.config.route, 'create', record, impact.amount);
  }

  async registerSingleImpact(record, impact) {
    await registerTransaction({
      type: impact.type,
      category: impact.category,
      amount: impact.amount,
      description: impact.description,
      reference: `${this.config.route.toUpperCase()}-${record.id}`,
      date: record.purchaseDate || record.date || record.createdAt || new Date().toISOString().slice(0, 10),
      sourceModule: this.config.route,
      ...impact.impacts,
      meta: { recordId: record.id, module: this.config.route, ...impact.meta },
    });
  }

  openSale(id) {
    const row = this.rows.find(item => Number(item.id) === Number(id));
    if (!row || !this.config.saleForm) return;
    Modal.open({
      title: `Venta - ${row.name || row.brandModel || row.broker}`,
      size: 'lg',
      content: `<form id="business-sale-form" class="business-form">${this.config.saleForm(row)}</form>`,
      footer: `
        <button class="btn btn-ghost" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="business-sale-save">Registrar venta</button>
      `,
    });
    const form = document.getElementById('business-sale-form');
    bindMoneyInputs(form);
    form?.addEventListener('input', () => updateSalePreview(this.config.kind, row, form));
    form?.dispatchEvent(new Event('input'));
    document.getElementById('business-sale-save')?.addEventListener('click', () => this.sellFromForm(row, form));
  }

  async sellFromForm(row, form) {
    try {
      const values = readForm(form);
      const result = this.config.sell(row, values);
      const updated = { ...row, ...result.record, status: 'sold', soldAt: new Date().toISOString() };
      await Storage.update(this.config.store, updated);
      await registerTransaction({
        type: 'ingreso',
        category: 'devolucion_capital',
        amount: Math.max(result.ownerProceeds, 0),
        description: result.description,
        reference: `${this.config.route.toUpperCase()}-SALE-${row.id}`,
        date: values.saleDate || new Date().toISOString().slice(0, 10),
        sourceModule: this.config.route,
        liquidImpact: result.ownerProceeds,
        investedImpact: result.investedImpact ?? -result.costBasis,
        commercialAssetImpact: result.commercialAssetImpact ?? -result.costBasis,
        personalAssetImpact: result.personalAssetImpact ?? 0,
        realProfitImpact: result.realProfit,
        cashFlowImpact: result.realProfit,
        meta: { recordId: row.id, module: this.config.route, ...result.meta },
      });
      await logBusinessActivity(this.config.route, 'sale', updated, result.ownerProceeds);
      closeModal();
      showToast('Venta registrada con impacto financiero real', 'success');
      await this.load();
      this.render();
    } catch (error) {
      console.error(`[${this.config.route}] Error registrando venta`, error);
      showToast(error.message || 'No se pudo registrar la venta', 'danger');
    }
  }

  openDetails(id) {
    const row = this.rows.find(item => Number(item.id) === Number(id));
    if (!row) return;
    Modal.open({
      title: row.name || row.brandModel || row.broker || row.clientName || this.config.title,
      size: 'lg',
      content: renderDetails(row),
      footer: `<button class="btn btn-primary" data-close-modal>Cerrar</button>`,
    });
  }
}

function animalForm() {
  return `
    <div class="form-row">
      ${selectField('animalType', 'Tipo de animal', ['vaca','toro','novillo','caballo','ganado','otro'])}
      ${inputField('name', 'Nombre del animal')}
      ${inputField('breed', 'Raza')}
    </div>
    <div class="form-row">
      ${selectField('purpose', 'Proposito', ['engorde','leche','reproduccion','concurso','venta','otro'])}
      ${inputField('farmName', 'Nombre de la finca', 'No aplica')}
      ${inputField('purchaseDate', 'Fecha compra', '', 'date')}
    </div>
    <div class="form-row">
      ${moneyField('initialWeight', 'Peso inicial kg')}
      ${moneyField('purchaseKgPrice', 'Precio kg compra')}
      ${readonlyMetric('Costo compra', 'animalPurchaseCost')}
    </div>
    <div class="form-row">
      ${moneyField('farmOwnerPct', 'Porcentaje dueno finca')}
      ${readonlyMetric('Porcentaje propietario', 'animalOwnerPct')}
      ${moneyField('maintenanceTotal', 'Gastos mantenimiento')}
    </div>
    <div class="form-row">
      ${moneyField('feeding', 'Alimentacion')}
      ${moneyField('vaccines', 'Vacunas')}
      ${moneyField('medicines', 'Medicamentos')}
    </div>
    <div class="form-row">
      ${moneyField('transport', 'Transporte')}
      ${moneyField('veterinary', 'Veterinario')}
      ${inputField('notes', 'Observaciones')}
    </div>
    ${textareaField('farmAgreement', 'Acuerdo con dueno finca')}
  `;
}

function animalSaleForm(row) {
  return `
    <div class="form-row">
      ${inputField('saleDate', 'Fecha venta', new Date().toISOString().slice(0, 10), 'date')}
      ${moneyField('finalWeight', 'Peso final kg')}
      ${moneyField('saleKgPrice', 'Precio kg venta')}
    </div>
    <div class="business-sale-preview" id="sale-preview"></div>
  `;
}

function vehicleForm() {
  return `
    <div class="form-row">
      ${selectField('vehicleType', 'Tipo vehiculo', ['moto','carro','camion','maquinaria','otro'])}
      ${inputField('brand', 'Marca')}
      ${inputField('model', 'Modelo')}
    </div>
    <div class="form-row">
      ${inputField('plate', 'Placa')}
      ${inputField('year', 'Ano', '', 'number')}
      ${selectField('purpose', 'Proposito', ['reventa','uso_negocio','patrimonio','alquiler'])}
    </div>
    <div class="form-row">
      ${moneyField('purchaseCost', 'Costo compra')}
      ${moneyField('marketValue', 'Valor mercado')}
      ${selectField('status', 'Estado', ['active','mantenimiento','sold'])}
    </div>
    <div class="form-row">
      ${moneyField('repairCosts', 'Gastos reparacion')}
      ${moneyField('paperworkCosts', 'Gastos papeles')}
      ${moneyField('taxes', 'Impuestos')}
      ${moneyField('maintenance', 'Mantenimiento')}
    </div>
    ${textareaField('notes', 'Notas')}
  `;
}

function vehicleSaleForm(row) {
  return `
    <div class="form-row">
      ${inputField('saleDate', 'Fecha venta', new Date().toISOString().slice(0, 10), 'date')}
      ${moneyField('salePrice', 'Precio venta')}
    </div>
    <div class="business-sale-preview" id="sale-preview"></div>
  `;
}

function tradingForm() {
  return `
    <div class="form-row">
      ${inputField('broker', 'Broker')}
      ${selectField('type', 'Tipo', ['crypto','forex','binarias','acciones','futuros'])}
      ${selectField('risk', 'Riesgo', ['bajo','medio','alto'])}
    </div>
    <div class="form-row">
      ${moneyField('capitalBroker', 'Capital broker')}
      ${moneyField('capitalInvested', 'Capital invertido')}
      ${moneyField('gains', 'Ganancias')}
      ${moneyField('losses', 'Perdidas')}
    </div>
    <div class="form-row">
      ${moneyField('pnlRealized', 'PnL realizado')}
      ${moneyField('pnlUnrealized', 'PnL no realizado')}
      ${inputField('winrate', 'Winrate %', '', 'number')}
      ${inputField('drawdown', 'Drawdown %', '', 'number')}
    </div>
    <div class="form-row">
      ${inputField('profitFactor', 'Profit factor', '', 'number')}
      ${inputField('strategy', 'Estrategia')}
    </div>
    ${textareaField('notes', 'Notas')}
  `;
}

function softwareForm() {
  return `
    <div class="form-row">
      ${inputField('clientName', 'Cliente')}
      ${selectField('service', 'Servicio', ['pagina_web','app','bot_ia','automatizacion','software_empresarial','diseno','branding','publicidad'])}
      ${selectField('status', 'Estado', ['lead','reunion','propuesta','desarrollo','entregado','soporte','cancelado'])}
    </div>
    <div class="form-row">
      ${moneyField('payments', 'Pagos recibidos')}
      ${moneyField('costs', 'Costos proyecto')}
      ${inputField('date', 'Fecha', new Date().toISOString().slice(0, 10), 'date')}
    </div>
    ${textareaField('notes', 'Seguimiento / notas')}
  `;
}

function patrimonyForm() {
  return `
    <div class="form-row">
      ${inputField('name', 'Bien personal')}
      ${selectField('type', 'Tipo', ['casa','moto_personal','computador','reloj','equipo','otro'])}
      ${inputField('purchaseDate', 'Fecha compra', '', 'date')}
    </div>
    <div class="form-row">
      ${moneyField('purchaseCost', 'Costo compra')}
      ${selectField('status', 'Estado', ['active','vendido','inactivo'])}
    </div>
    ${textareaField('notes', 'Notas')}
  `;
}

function normalizeAnimal(row) {
  const purchaseCost = toNumber(row.purchaseCost) || toNumber(row.initialWeight) * toNumber(row.purchaseKgPrice);
  const costs = sumFields(row, ['maintenanceTotal','feeding','vaccines','medicines','transport','veterinary']);
  const totalInvestment = purchaseCost + costs;
  const saleTotal = toNumber(row.saleTotal);
  const ownerProfit = toNumber(row.ownerProfit);
  return {
    ...row,
    name: row.name || row.animalType || 'Animal',
    farmName: row.farmName || 'No aplica',
    purchaseCost,
    totalInvestment,
    status: row.status || 'active',
    roi: totalInvestment ? (ownerProfit / totalInvestment) * 100 : 0,
    saleTotal,
  };
}

function normalizeVehicle(row) {
  const purchaseCost = toNumber(row.purchaseCost);
  const totalInvestment = purchaseCost + sumFields(row, ['repairCosts','paperworkCosts','taxes','maintenance']);
  const marketValue = toNumber(row.marketValue);
  const potential = marketValue ? marketValue - totalInvestment : 0;
  return {
    ...row,
    name: [row.brand, row.model, row.plate].filter(Boolean).join(' ') || row.vehicleType || 'Vehiculo',
    brandModel: [row.brand, row.model].filter(Boolean).join(' '),
    purchaseCost,
    totalInvestment,
    marketValue,
    potential,
    status: row.status || 'active',
  };
}

function normalizeTrading(row) {
  const capitalTotal = toNumber(row.capitalBroker) + toNumber(row.capitalInvested);
  const pnlRealized = toNumber(row.pnlRealized) || toNumber(row.gains) - toNumber(row.losses);
  return {
    ...row,
    capitalTotal,
    pnlRealized,
    pnlUnrealized: toNumber(row.pnlUnrealized),
    roi: capitalTotal ? (pnlRealized / capitalTotal) * 100 : 0,
    status: row.status || 'active',
  };
}

function normalizeSoftware(row) {
  const payments = toNumber(row.payments);
  const costs = toNumber(row.costs);
  return {
    ...row,
    payments,
    costs,
    profit: payments - costs,
    status: row.status || 'lead',
  };
}

function normalizePatrimony(row) {
  return {
    ...row,
    purchaseCost: toNumber(row.purchaseCost),
    status: row.status || 'active',
  };
}

function getCreateImpact(kind, record) {
  if (kind === 'animals') {
    return capitalizedPurchaseImpact(record.totalInvestment, 'compra_inventario', `Compra animal: ${record.name}`, {
      commercialAssetImpact: record.totalInvestment,
    });
  }
  if (kind === 'vehicles') {
    const personal = record.purpose === 'patrimonio';
    return capitalizedPurchaseImpact(record.totalInvestment, personal ? 'compra_patrimonial' : 'compra_inventario', `Compra vehiculo: ${record.name}`, {
      investedImpact: personal ? 0 : record.totalInvestment,
      commercialAssetImpact: personal ? 0 : record.totalInvestment,
      personalAssetImpact: personal ? record.totalInvestment : 0,
    });
  }
  if (kind === 'trading') {
    const transactions = [];
    const capital = record.capitalTotal;
    const pnl = record.pnlRealized;
    if (capital > 0) {
      transactions.push(capitalizedPurchaseImpact(capital, 'capital_colocado', `Capital colocado en broker: ${record.broker}`, {
        investedImpact: capital,
        commercialAssetImpact: 0,
      }));
    }
    if (pnl !== 0) {
      transactions.push({
        type: pnl >= 0 ? 'ingreso' : 'egreso',
        category: pnl >= 0 ? 'utilidad_trading' : 'gasto_operativo',
        amount: Math.abs(pnl),
        description: `PnL realizado trading: ${record.broker}`,
        impacts: {
          liquidImpact: pnl,
          investedImpact: 0,
          realProfitImpact: pnl,
          cashFlowImpact: pnl,
        },
      });
    }
    return transactions.length === 1 ? transactions[0] : { batch: transactions };
  }
  if (kind === 'software') {
    const transactions = [];
    if (record.payments > 0) {
      transactions.push({
        type: 'ingreso',
        category: 'servicios',
        amount: record.payments,
        description: `Ingreso software: ${record.clientName}`,
        impacts: {
          liquidImpact: record.payments,
          realProfitImpact: record.payments,
          cashFlowImpact: record.payments,
        },
      });
    }
    if (record.costs > 0) {
      transactions.push({
        type: 'egreso',
        category: 'gasto_operativo',
        amount: record.costs,
        description: `Costo proyecto software: ${record.clientName}`,
        impacts: {
          liquidImpact: -record.costs,
          realProfitImpact: -record.costs,
          cashFlowImpact: -record.costs,
        },
      });
    }
    return transactions.length === 1 ? transactions[0] : { batch: transactions };
  }
  if (kind === 'patrimony') {
    return capitalizedPurchaseImpact(record.purchaseCost, 'compra_patrimonial', `Compra patrimonial: ${record.name}`, {
      investedImpact: 0,
      personalAssetImpact: record.purchaseCost,
      commercialAssetImpact: 0,
    });
  }
  return null;
}

function capitalizedPurchaseImpact(amount, category, description, overrides = {}) {
  const value = toNumber(amount);
  if (!value) return null;
  return {
    type: 'egreso',
    category,
    amount: value,
    description,
    impacts: {
      liquidImpact: -value,
      investedImpact: value,
      commercialAssetImpact: value,
      realProfitImpact: 0,
      cashFlowImpact: 0,
      ...overrides,
    },
  };
}

function sellAnimal(row, values) {
  const finalWeight = toNumber(values.finalWeight);
  const saleKgPrice = toNumber(values.saleKgPrice);
  const saleTotal = finalWeight * saleKgPrice;
  if (saleTotal <= 0) throw new Error('El precio total de venta debe ser mayor a cero.');
  const costBasis = row.totalInvestment;
  const grossProfit = saleTotal - costBasis;
  const farmPct = toNumber(row.farmOwnerPct);
  const ownerPct = Math.max(0, 100 - farmPct);
  const farmProfit = Math.max(grossProfit, 0) * (farmPct / 100);
  const ownerProfit = grossProfit >= 0 ? grossProfit * (ownerPct / 100) : grossProfit;
  const ownerProceeds = costBasis + ownerProfit;
  return {
    ownerProceeds,
    costBasis,
    realProfit: ownerProfit,
    description: `Venta animal: ${row.name}`,
    record: { ...values, saleTotal, grossProfit, farmProfit, ownerProfit, ownerPct },
    meta: { saleTotal, grossProfit, farmProfit, ownerProfit, ownerPct },
  };
}

function sellVehicle(row, values) {
  const salePrice = toNumber(values.salePrice);
  if (salePrice <= 0) throw new Error('El precio de venta debe ser mayor a cero.');
  const costBasis = row.totalInvestment;
  const realProfit = salePrice - costBasis;
  const personal = row.purpose === 'patrimonio';
  return {
    ownerProceeds: salePrice,
    costBasis,
    realProfit,
    commercialAssetImpact: personal ? 0 : -costBasis,
    personalAssetImpact: personal ? -costBasis : 0,
    investedImpact: personal ? 0 : -costBasis,
    description: `Venta vehiculo: ${row.name}`,
    record: { ...values, salePrice, realProfit },
    meta: { salePrice, realProfit },
  };
}

function updateSalePreview(kind, row, form) {
  const preview = form.querySelector('#sale-preview');
  if (!preview) return;
  let result;
  try {
    result = kind === 'animals'
      ? sellAnimal(row, readForm(form))
      : sellVehicle(row, readForm(form));
  } catch (_) {
    preview.innerHTML = '<div class="empty-state"><p>Completa los datos de venta para calcular utilidad y ROI.</p></div>';
    return;
  }
  preview.innerHTML = `
    <div class="sale-preview-grid">
      ${previewMetric('Precio venta', result.meta.saleTotal ?? result.meta.salePrice)}
      ${previewMetric('Costo base', result.costBasis)}
      ${previewMetric('Utilidad real', result.realProfit)}
      ${result.meta.farmProfit != null ? previewMetric('Ganancia finca', result.meta.farmProfit) : ''}
      ${result.meta.ownerProfit != null ? previewMetric('Ganancia propietario', result.meta.ownerProfit) : ''}
      ${previewMetric('ROI', result.costBasis ? (result.realProfit / result.costBasis) * 100 : 0, true)}
    </div>
  `;
}

function previewMetric(label, value, percent = false) {
  return `
    <div class="sale-preview-item">
      <span>${escapeHtml(label)}</span>
      <strong>${percent ? formatPct(value) : formatSignedMoney(value)}</strong>
    </div>
  `;
}

async function logBusinessActivity(module, action, record, amount) {
  await Storage.History.log(`business_${action}`, {
    module,
    category: 'business',
    description: `${labelize(module)}: ${record.name || record.broker || record.clientName || 'registro'}`,
    amount,
    status: record.status || 'ok',
    entityId: record.id,
  }).catch(() => {});
  addRecentActivity({
    module,
    category: 'business',
    description: `${labelize(module)} actualizado`,
    amount,
    status: 'ok',
  });
  window.dispatchEvent(new CustomEvent('finance:update', {
    detail: { source: module, eventType: action, data: record },
  }));
}

function buildAnimalStats(rows) {
  const active = rows.filter(row => !SOLD_STATUSES.has(row.status));
  const invested = sum(active, 'totalInvestment');
  const soldProfit = sum(rows, 'ownerProfit');
  return commonStats(rows, active, invested, soldProfit);
}

function buildVehicleStats(rows) {
  const active = rows.filter(row => !SOLD_STATUSES.has(row.status));
  return [
    stat('Registros', rows.length, 'unidades', '#'),
    stat('Capital base', formatMoney(sum(active, 'totalInvestment')), 'sin inflar por mercado', '$'),
    stat('Valorizacion potencial', formatSignedMoney(sum(active, 'potential')), 'solo potencial', '%'),
    stat('Patrimonio personal', formatMoney(sum(active.filter(row => row.purpose === 'patrimonio'), 'totalInvestment')), 'separado del negocio', 'P'),
  ];
}

function buildTradingStats(rows) {
  const capital = sum(rows, 'capitalTotal');
  const pnl = sum(rows, 'pnlRealized');
  const unrealized = sum(rows, 'pnlUnrealized');
  const avgWinrate = average(rows, 'winrate');
  const avgDrawdown = average(rows, 'drawdown');
  const avgProfitFactor = average(rows, 'profitFactor');
  const monthlyYield = capital ? (pnl / capital) * 100 : 0;
  return [
    stat('Brokers', rows.length, 'cuentas', '#'),
    stat('Capital brokers', formatMoney(capital), 'capital colocado', '$'),
    stat('PnL realizado', formatSignedMoney(pnl), 'utilidad real', 'R'),
    stat('PnL no realizado', formatSignedMoney(unrealized), 'potencial separado', 'U'),
    stat('Winrate', formatPct(avgWinrate), 'promedio', 'W'),
    stat('Drawdown', formatPct(avgDrawdown), 'riesgo promedio', 'D'),
    stat('Profit factor', avgProfitFactor.toFixed(2), 'promedio', 'F'),
    stat('Rendimiento mensual', formatPct(monthlyYield), 'sobre capital brokers', 'M'),
  ];
}

function buildSoftwareStats(rows) {
  return [
    stat('Proyectos', rows.length, 'registros', '#'),
    stat('Ingresos reales', formatMoney(sum(rows, 'payments')), 'pagos recibidos', '+'),
    stat('Costos reales', formatMoney(sum(rows, 'costs')), 'costos proyecto', '-'),
    stat('Utilidad', formatSignedMoney(sum(rows, 'profit')), 'margen real', '='),
  ];
}

function buildPatrimonyStats(rows) {
  const active = rows.filter(row => ACTIVE_STATUSES.has(String(row.status).toLowerCase()) || row.status === 'active');
  return [
    stat('Bienes', rows.length, 'personales', '#'),
    stat('Patrimonio', formatMoney(sum(active, 'purchaseCost')), 'no productivo', 'P'),
    stat('Capital negocio', formatMoney(0), 'no se mezcla', 'B'),
    stat('Registros activos', active.length, 'vigentes', 'A'),
  ];
}

function commonStats(rows, active, invested, realizedProfit) {
  return [
    stat('Registros', rows.length, 'totales', '#'),
    stat('Activos', active.length, 'en produccion', 'A'),
    stat('Capital invertido', formatMoney(invested), 'costo base', '$'),
    stat('Utilidad realizada', formatSignedMoney(realizedProfit), 'ventas cerradas', '+'),
  ];
}

function stat(label, value, detail, icon) {
  return { label, value: String(value), detail, icon };
}

function readForm(form) {
  const values = {};
  form.querySelectorAll('[name]').forEach(input => {
    values[input.name] = input.dataset.money != null ? parseMoney(input.value) : input.value.trim();
  });
  return values;
}

function renderDetails(row) {
  return `
    <div class="business-detail-grid">
      ${Object.entries(row)
        .filter(([key]) => !['createdAt','updatedAt'].includes(key))
        .map(([key, value]) => `
          <div class="business-detail-item">
            <span>${escapeHtml(labelize(key))}</span>
            <strong>${escapeHtml(renderDetailValue(value))}</strong>
          </div>
        `).join('')}
    </div>
  `;
}

function renderDetailValue(value) {
  if (typeof value === 'number') return formatNumber(value);
  if (value == null || value === '') return '-';
  return String(value);
}

function inputField(name, label, value = '', type = 'text') {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <input class="form-input" name="${name}" type="${type}" value="${escapeHtml(value)}">
    </div>
  `;
}

function moneyField(name, label, value = '') {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <input class="form-input" name="${name}" type="text" data-money value="${value ? formatNumber(value) : ''}">
    </div>
  `;
}

function textareaField(name, label) {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <textarea class="form-textarea" name="${name}" rows="3"></textarea>
    </div>
  `;
}

function selectField(name, label, options) {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <select class="form-select" name="${name}">
        ${options.map(option => `<option value="${option}">${escapeHtml(labelize(option))}</option>`).join('')}
      </select>
    </div>
  `;
}

function readonlyMetric(label, derived) {
  return `
    <div class="form-group">
      <label class="form-label">${escapeHtml(label)}</label>
      <div class="form-static business-derived" data-derived="${derived}">-</div>
    </div>
  `;
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + toNumber(row[key]), 0);
}

function sumFields(row, keys) {
  return keys.reduce((acc, key) => acc + toNumber(row[key]), 0);
}

function average(rows, key) {
  const values = rows.map(row => toNumber(row[key])).filter(value => value !== 0);
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function formatPct(value) {
  return `${(toNumber(value)).toFixed(1)}%`;
}

function labelize(value) {
  return String(value ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const modules = Object.fromEntries(
  Object.entries(BUSINESS_MODULES).map(([key, config]) => [key, new BusinessModule(config)])
);

export const AnimalsModule = modules.animals;
export const VehiclesModule = modules.vehicles;
export const TradingModule = modules.trading;
export const SoftwareModule = modules.software;
export const PersonalPatrimonyModule = modules.patrimony;

export const initAnimals = (container) => AnimalsModule.init(container);
export const initVehicles = (container) => VehiclesModule.init(container);
export const initTrading = (container) => TradingModule.init(container);
export const initSoftware = (container) => SoftwareModule.init(container);
export const initPersonalPatrimony = (container) => PersonalPatrimonyModule.init(container);
