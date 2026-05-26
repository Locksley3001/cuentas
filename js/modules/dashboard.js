/* ============================================================
   dashboard.js - Dashboard financiero con datos reales
   ============================================================ */

import { getGlobalDashboardData } from './integrations.js';

const DashboardModule = (() => {
  const { symbol, locale, code } = APP_CONFIG.currency;

  function fmt(n) {
    const value = Number(n) || 0;
    return symbol + new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  }

  function fmtSigned(n) {
    const value = Number(n) || 0;
    return `${value < 0 ? '-' : ''}${fmt(value)}`;
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatMonthKey(key) {
    if (!key || !String(key).includes('-')) return '-';
    const [, month] = String(key).split('-');
    const index = Math.max(0, Math.min(11, Number(month) - 1));
    return APP_CONFIG.months[index] || key;
  }

  async function render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = _skeletonHTML();

    const [portfolio, assetValue, loanSummary, globalData] = await Promise.all([
      Storage.Investments.getPortfolioValue(),
      Storage.Assets.getTotalValue(),
      Storage.Loans.getSummary(),
      getGlobalDashboardData(),
    ]);

    const financialState = globalData.financialState || {};
    const fm = globalData.financialMetrics || {};
    const monthly = normalizeMonthly(globalData.monthly || financialState.monthly || []);
    const recentMovements = globalData.recentMovements || [];
    const alerts = globalData.alerts || [];
    const history = globalData.history || [];
    const income = Number(globalData.income) || 0;
    const expense = Number(globalData.expense) || 0;
    const profit = income - expense;
    const patrimonio = Number(fm.patrimonio ?? globalData.patrimonio ?? 0);
    const liquidCapital = Number(fm.liquidCapital ?? globalData.liquidCapital ?? 0);
    const investedCapital = Number(fm.investedCapital ?? globalData.investedCapital ?? 0);
    const realProfit = Number(fm.realProfit ?? globalData.realProfit ?? profit);
    const activePortfolio = Number(fm.activePortfolio ?? globalData.activePortfolio ?? loanSummary.active);
    const projectedReturn = Number(fm.projectedReturn ?? globalData.projectedReturn ?? 0);
    const productiveCapital = Number(fm.productiveCapital ?? 0);
    const liquidityAvailable = Number(fm.liquidityAvailable ?? liquidCapital);
    const roi = Number(fm.roi ?? 0);
    const monthlyYieldRate = Number(fm.monthlyYieldRate ?? 0);
    const patrimonioGrowth = Number(fm.patrimonioGrowth ?? 0);
    const capitalInvestedPct = Number(fm.capitalInvestedPct ?? 0);
    const portfolioReturn = Number(fm.portfolioReturn ?? 0);
    const capitalGrowth = Number(fm.capitalGrowth ?? 0);
    const composition = financialState.composition || {};
    const investmentValue = Number(portfolio.current) || 0;
    const capital = investmentValue + (Number(assetValue) || 0);

    container.innerHTML = `
      <div class="module-page animate-fade">
        <div class="page-header flex justify-between items-center">
          <div>
            <h1 class="page-title">Dashboard <span style="color:var(--accent)">Financiero</span></h1>
            <p class="page-subtitle">Resumen actualizado · ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div class="header-actions">
            <button class="btn btn-ghost btn-sm" onclick="DashboardModule.exportSummary()">Exportar</button>
            <button class="btn btn-ghost btn-sm" onclick="DashboardModule.recalculate()">Recalcular</button>
            <button class="btn btn-danger btn-sm" onclick="DashboardModule.cleanupDemoData()">Limpiar demo</button>
            <button class="btn btn-primary btn-sm" onclick="DashboardModule.quickAdd()">+ Transacción</button>
          </div>
        </div>

        <div class="metrics-grid">
          ${Cards.metric({ label: 'Patrimonio', value: fmtSigned(patrimonio), delta: '', deltaType: patrimonio >= 0 ? 'up' : 'down', icon: '◆', type: 'capital', sub: 'Liquidez + negocios + patrimonio personal - pasivos' })}
          ${Cards.metric({ label: 'Capital liquido', value: fmtSigned(liquidCapital), delta: '', deltaType: liquidCapital >= 0 ? 'up' : 'down', icon: '▲', type: 'income', sub: 'Disponible estimado' })}
          ${Cards.metric({ label: 'Capital invertido', value: fmt(investedCapital), delta: '', deltaType: 'neutral', icon: '●', type: 'profit', sub: 'Cartera + animales + vehiculos + trading + software' })}
          ${Cards.metric({ label: 'Utilidad real', value: fmtSigned(realProfit), delta: '', deltaType: realProfit >= 0 ? 'up' : 'down', icon: '▼', type: 'expense', sub: 'Ganancias reales sin devolucion de capital' })}
        </div>

        <div class="quick-stats">
          ${Cards.quickStat({ label: 'Cartera activa', value: fmt(activePortfolio), color: 'warning' })}
          ${Cards.quickStat({ label: 'Retorno proyectado', value: fmt(projectedReturn), color: 'accent' })}
          ${Cards.quickStat({ label: 'Liquidez disponible', value: fmtSigned(liquidityAvailable), color: 'accent-2' })}
        </div>

        ${_renderMainFinancialChart(composition, {
          patrimonio,
          liquidCapital,
          activePortfolio,
          realProfit,
        })}

        <div class="finance-indicators-grid">
          ${_renderIndicator('ROI', fmtPct(roi), 'Utilidad real sobre capital productivo', roi >= 0 ? 'positive' : 'negative')}
          ${_renderIndicator('Rendimiento mensual', fmtPct(monthlyYieldRate), 'Utilidad real del mes sobre capital', monthlyYieldRate >= 0 ? 'positive' : 'negative')}
          ${_renderIndicator('Capital invertido', fmtPct(capitalInvestedPct), 'Porcentaje del capital en produccion', 'neutral')}
          ${_renderIndicator('Crecimiento patrimonial', fmtPct(patrimonioGrowth), 'Evolucion del patrimonio registrado', patrimonioGrowth >= 0 ? 'positive' : 'negative')}
        </div>

        <div class="dashboard-grid">
          ${Cards.panel({
            title: 'Flujo Mensual',
            dot: true,
            content: `
              ${_renderBarChart(monthly)}
              <div class="chart-legend">
                <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div>Ingresos reales</div>
                <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div>Gastos reales</div>
              </div>
              <div class="divider"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-md);text-align:center">
                <div>
                  <div style="font-family:var(--font-mono);font-size:0.9rem;color:var(--success)">${fmt(income)}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Ingresos reales</div>
                </div>
                <div>
                  <div style="font-family:var(--font-mono);font-size:0.9rem;color:var(--danger)">${fmt(expense)}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Gastos reales</div>
                </div>
                <div>
                  <div style="font-family:var(--font-mono);font-size:0.9rem;color:${profit >= 0 ? 'var(--accent)' : 'var(--danger)'}">${fmtSigned(profit)}</div>
                  <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em">Flujo neto</div>
                </div>
              </div>
            `,
            actions: `<span class="badge badge-accent" style="font-size:0.65rem">${new Date().getFullYear()}</span>`,
          })}

          <div style="display:flex;flex-direction:column;gap:var(--space-md)">
            ${Cards.panel({
              title: 'Alertas',
              content: _renderAlerts(alerts),
            })}

            ${Cards.panel({
              title: 'Composición',
              content: _renderCapitalComposition(composition, { investmentValue, assetValue, loanActive: loanSummary.active, capital }),
              footer: `
                <span style="font-size:0.78rem;color:var(--text-muted)">Capital real</span>
                <span style="font-family:var(--font-mono);font-size:0.875rem;color:var(--accent)">${fmt(Number(fm.totalCapitalBase ?? capital))}</span>
              `,
            })}
          </div>
        </div>

        <div class="dashboard-grid mt-lg">
          ${Cards.panel({
            title: 'Evolucion patrimonial',
            dot: true,
            content: _renderPatrimonialEvolution(monthly),
          })}

          ${Cards.panel({
            title: 'Metricas cartera',
            content: _renderPortfolioMetrics({
              activePortfolio,
              projectedReturn,
              portfolioReturn,
              productiveCapital,
              capitalInvestedPct,
              capitalGrowth,
            }),
          })}
        </div>

        <div class="dashboard-grid mt-lg">
          ${Cards.panel({
            title: 'Movimientos Recientes',
            dot: true,
            content: _renderRecentMovements(recentMovements),
            footer: `
              <span style="font-size:0.78rem;color:var(--text-muted)">${recentMovements.length} movimientos reales recientes</span>
              <button class="btn btn-ghost btn-sm" onclick="Router.navigate('finance')">Ver todos</button>
            `,
          })}

          ${Cards.panel({
            title: 'Actividad',
            content: _renderHistory(history),
          })}
        </div>
      </div>
    `;

    _animateBars();
  }

  function normalizeMonthly(rows) {
    const source = Array.isArray(rows) && rows.length
      ? rows
      : Array.from({ length: 12 }, (_, index) => ({
        key: `${new Date().getFullYear()}-${String(index + 1).padStart(2, '0')}`,
        income: 0,
        expense: 0,
      }));

    return source.map(row => ({
      ...row,
      income: Number(row.income ?? row.realIncome ?? 0),
      expense: Number(row.expense ?? row.realExpense ?? 0),
      realProfit: Number(row.realProfit ?? 0),
      patrimonio: Number(row.patrimonio ?? 0),
      capitalBase: Number(row.capitalBase ?? 0),
      yieldRate: Number(row.yieldRate ?? 0),
    }));
  }

  function fmtPct(value) {
    const number = Number(value) || 0;
    return `${number.toFixed(1)}%`;
  }

  function _renderIndicator(label, value, detail, tone = 'neutral') {
    return `
      <div class="finance-indicator ${tone}">
        <div class="finance-indicator-label">${escapeHtml(label)}</div>
        <div class="finance-indicator-value">${escapeHtml(value)}</div>
        <div class="finance-indicator-detail">${escapeHtml(detail)}</div>
      </div>
    `;
  }

  function _renderAlerts(alerts) {
    if (!alerts.length) {
      return `<div class="empty-state"><div class="empty-icon">✓</div><p>Sin alertas con los datos actuales</p></div>`;
    }

    return `
      <div class="alerts-list">
        ${alerts.map(alert => Cards.alert({
          type: alert.type || 'info',
          icon: alert.type === 'warning' ? '!' : alert.type === 'danger' ? '×' : 'i',
          title: alert.title || 'Alerta',
          text: alert.text || alert.message || '',
        })).join('')}
      </div>
    `;
  }

  function _renderMainFinancialChart(composition = {}, metrics = {}) {
    const rows = normalizeChartRows(composition.rows || [], metrics);
    if (!rows.length) {
      return `
        <section class="capital-map-panel">
          <div class="capital-map-empty">
            <span>Sin distribucion financiera suficiente</span>
            <small>El grafico se activara con registros reales en prestamos, animales, vehiculos, trading, software o patrimonio.</small>
          </div>
        </section>
      `;
    }

    const gradient = buildConicGradient(rows);
    return `
      <section class="capital-map-panel">
        <div class="capital-map-copy">
          <span class="capital-map-kicker">Mapa financiero</span>
          <h2>Distribucion real de capital</h2>
          <p>Lectura consolidada de liquidez, cartera, negocios, patrimonio y utilidad real.</p>
          <div class="capital-map-total">${fmtSigned(metrics.patrimonio)}</div>
        </div>
        <div class="capital-map-visual">
          <div class="capital-orbit" style="background:${gradient}">
            <div class="capital-orbit-core">
              <span>Patrimonio</span>
              <strong>${fmtSigned(metrics.patrimonio)}</strong>
              <small>Utilidad ${fmtSigned(metrics.realProfit)}</small>
            </div>
          </div>
        </div>
        <div class="capital-map-legend">
          ${rows.map(row => `
            <div class="capital-legend-row">
              <span class="legend-swatch" style="background:${row.color}"></span>
              <span>${escapeHtml(row.label)}</span>
              <strong>${fmt(row.value)}</strong>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function normalizeChartRows(rows, metrics) {
    const colorMap = {
      liquid: '#38bdf8',
      activePortfolio: '#f5c451',
      animals: '#4ecdc4',
      vehicles: '#9ca3ff',
      trading: '#8fd7ff',
      software: '#6ee7b7',
      personalPatrimony: '#c4b5fd',
      personalAssets: '#c4b5fd',
      realProfit: '#22c55e',
    };
    const filtered = rows
      .filter(row => Number(row.value) > 0)
      .map(row => ({
        label: row.label,
        value: Number(row.value) || 0,
        color: colorMap[row.key] || '#64748b',
      }));
    if (metrics.realProfit > 0) {
      filtered.push({ label: 'Utilidad real', value: metrics.realProfit, color: colorMap.realProfit });
    }
    return filtered.slice(0, 8);
  }

  function buildConicGradient(rows) {
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
    let cursor = 0;
    const parts = rows.map(row => {
      const start = cursor;
      cursor += (row.value / total) * 100;
      return `${row.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  function _renderCapitalComposition(composition = {}, fallback = {}) {
    const fallbackRows = [
      { label: 'Inversiones', value: fallback.investmentValue, color: 'accent' },
      { label: 'Activos', value: fallback.assetValue, color: 'success' },
      { label: 'Prestamos activos', value: fallback.loanActive, color: 'warning' },
    ];
    const sourceRows = composition.rows?.length ? composition.rows : fallbackRows;
    const rows = sourceRows
      .map((row, index) => ({
        label: row.label,
        value: Number(row.value) || 0,
        color: row.color || ['accent', 'success', 'warning', 'accent-2'][index % 4],
      }))
      .filter(row => row.value > 0);
    const max = Math.max(Number(composition.total ?? fallback.capital ?? 0), ...rows.map(row => row.value), 1);
    if (!rows.length) {
      return `<div class="empty-state"><div class="empty-icon">○</div><p>Sin capital registrado todavía</p></div>`;
    }

    return rows.map(row => Cards.progressBar({
      label: row.label,
      value: row.value,
      max,
      color: row.color,
    })).join('');
  }

  function _renderPatrimonialEvolution(monthlyData) {
    const rows = monthlyData.filter(row => row.patrimonio || row.capitalBase || row.realProfit).slice(-6);
    if (!rows.length) {
      return `<div class="empty-state"><div class="empty-icon">â—‹</div><p>Sin evolucion patrimonial suficiente</p></div>`;
    }

    const max = Math.max(...rows.map(row => Math.abs(row.patrimonio || row.capitalBase || 0)), 1);
    return `
      <div class="patrimonial-evolution">
        ${rows.map(row => {
          const value = Number(row.patrimonio || row.capitalBase || 0);
          const width = Math.max(4, Math.round((Math.abs(value) / max) * 100));
          return `
            <div class="evolution-row">
              <div class="evolution-month">${escapeHtml(formatMonthKey(row.key))}</div>
              <div class="evolution-track"><span style="width:${width}%"></span></div>
              <div class="evolution-value">${fmtSigned(value)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function _renderPortfolioMetrics(values) {
    const rows = [
      { label: 'Cartera activa', value: fmt(values.activePortfolio), tone: 'warning' },
      { label: 'Retorno proyectado', value: fmt(values.projectedReturn), tone: 'positive' },
      { label: 'Retorno cartera', value: fmtPct(values.portfolioReturn), tone: values.portfolioReturn >= 0 ? 'positive' : 'negative' },
      { label: 'Capital productivo', value: fmt(values.productiveCapital), tone: 'neutral' },
      { label: 'Capital invertido', value: fmtPct(values.capitalInvestedPct), tone: 'neutral' },
      { label: 'Crecimiento capital', value: fmtPct(values.capitalGrowth), tone: values.capitalGrowth >= 0 ? 'positive' : 'negative' },
    ];

    return `
      <div class="portfolio-metrics-list">
        ${rows.map(row => `
          <div class="portfolio-metric-row ${row.tone}">
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(row.value)}</strong>
          </div>
        `).join('')}
      </div>
    `;
  }

  function _renderRecentMovements(movements) {
    if (!movements.length) {
      return `<div class="empty-state"><div class="empty-icon">○</div><p>Sin movimientos reales aún</p></div>`;
    }

    return `
      <div class="financial-movement-list">
        ${movements.map(tx => {
          const nature = getMovementNature(tx);
          return `
            <div class="financial-movement-item ${nature.tone}">
              <div class="movement-main">
                <div class="movement-icon">${nature.icon}</div>
                <div>
                  <div class="movement-name">${escapeHtml(tx.description || tx.categoryLabel || tx.category || 'Movimiento')}</div>
                  <div class="movement-date">${fmtDate(tx.date)} · ${escapeHtml(nature.label)}</div>
                  ${renderImpactLine(tx)}
                </div>
              </div>
              <div class="movement-amount">${fmtSigned(getMovementDisplayAmount(tx))}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function getMovementNature(tx) {
    if ((tx.realIncomeImpact || 0) > 0) return { label: 'Ingreso real', icon: '▲', tone: 'positive' };
    if ((tx.realExpenseImpact || 0) > 0) return { label: 'Gasto real', icon: '▼', tone: 'negative' };
    if (tx.isInternalMovement) return { label: 'Movimiento interno', icon: '↔', tone: 'neutral' };
    if (tx.isCapitalMovement) return { label: 'Capital', icon: '◆', tone: 'capital' };
    return tx.type === 'income'
      ? { label: 'Entrada', icon: '▲', tone: 'positive' }
      : { label: 'Salida', icon: '▼', tone: 'negative' };
  }

  function getMovementDisplayAmount(tx) {
    if ((tx.realIncomeImpact || 0) > 0) return tx.realIncomeImpact;
    if ((tx.realExpenseImpact || 0) > 0) return -tx.realExpenseImpact;
    if ((tx.liquidImpact || 0) !== 0) return tx.liquidImpact;
    return tx.type === 'expense' ? -tx.amount : tx.amount;
  }

  function renderImpactLine(tx) {
    const source = Array.isArray(tx.impactSummary) ? tx.impactSummary : tx.impactSummary?.rows;
    const items = Array.isArray(source) ? source.slice(0, 3) : [];
    if (!items.length) return '';
    return `
      <div class="movement-impact">
        ${items.map(item => `<span>${escapeHtml(item.text || `${item.direction || ''} ${item.label || ''}`)}</span>`).join('')}
      </div>
    `;
  }

  function _renderHistory(history) {
    const realHistory = history.filter(item => item.description || item.action).slice(0, 8);
    if (!realHistory.length) {
      return `<div class="empty-state"><div class="empty-icon">○</div><p>Sin actividad registrada</p></div>`;
    }

    return `
      <div class="timeline">
        ${realHistory.map(item => Cards.timelineItem({
          time: fmtDate(item.timestamp || item.date),
          text: `<strong>${escapeHtml(item.action || item.category || 'Actividad')}</strong> ${escapeHtml(item.description || '')}${renderHistoryImpact(item)}`,
        })).join('')}
      </div>
    `;
  }

  function renderHistoryImpact(item) {
    const source = Array.isArray(item.impactSummary) ? item.impactSummary : item.impactSummary?.rows;
    const rows = Array.isArray(source) ? source.slice(0, 3) : [];
    if (!rows.length) return '';
    return `<div class="movement-impact">${rows.map(row => `<span>${escapeHtml(row.text || `${row.direction || ''} ${row.label || ''}`)}</span>`).join('')}</div>`;
  }

  function _renderBarChart(monthlyData) {
    const rows = monthlyData.slice(-6);
    const maxVal = rows.reduce((m, d) => Math.max(m, d.income || 0, d.expense || 0), 1);

    const barsHTML = rows.map(data => {
      const incH = Math.max(4, Math.round(((data.income || 0) / maxVal) * 120));
      const expH = Math.max(4, Math.round(((data.expense || 0) / maxVal) * 120));
      return `
        <div class="bar-group">
          <div class="bar-wrap">
            <div class="bar income" data-h="${incH}" style="height:4px" title="Ingreso real: ${fmt(data.income)}"></div>
            <div class="bar expense" data-h="${expH}" style="height:4px" title="Gasto real: ${fmt(data.expense)}"></div>
          </div>
          <div class="bar-label">${formatMonthKey(data.key)}</div>
        </div>
      `;
    }).join('');

    return `<div class="bar-chart">${barsHTML}</div>`;
  }

  function _animateBars() {
    document.querySelectorAll('.bar-chart .bar').forEach((bar, i) => {
      const targetH = bar.dataset.h || 4;
      setTimeout(() => {
        bar.style.transition = 'height 0.6s cubic-bezier(0.4,0,0.2,1)';
        bar.style.height = targetH + 'px';
      }, i * 40);
    });
  }

  function _skeletonHTML() {
    return `
      <div style="padding-top:var(--space-sm)">
        <div class="skeleton" style="width:240px;height:28px;margin-bottom:8px"></div>
        <div class="skeleton" style="width:320px;height:14px;margin-bottom:var(--space-xl)"></div>
        <div class="metrics-grid" style="margin-bottom:var(--space-xl)">
          ${Array(4).fill('<div class="skeleton" style="height:120px;border-radius:var(--radius-lg)"></div>').join('')}
        </div>
        <div class="skeleton" style="height:300px;border-radius:var(--radius-lg)"></div>
      </div>
    `;
  }

  function quickAdd() {
    Modal.show({
      title: '+ Nueva Transacción',
      size: 'md',
      content: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label required">Tipo</label>
            <select class="form-select" id="tx-type">
              <option value="income">Ingreso</option>
              <option value="expense">Gasto</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label required">Monto (${code})</label>
            <input class="form-input" type="text" id="tx-amount" placeholder="0" data-money />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label required">Descripción</label>
          <input class="form-input" type="text" id="tx-desc" placeholder="Ej: Pago salario" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Categoría</label>
            <select class="form-select" id="tx-category">
              <option value="">Seleccionar</option>
              <optgroup label="Ingresos">
                ${APP_CONFIG.transactionCategories.income.map(c => `<option>${c}</option>`).join('')}
              </optgroup>
              <optgroup label="Gastos">
                ${APP_CONFIG.transactionCategories.expense.map(c => `<option>${c}</option>`).join('')}
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fecha</label>
            <input class="form-input" type="date" id="tx-date" value="${new Date().toISOString().slice(0,10)}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas</label>
          <textarea class="form-textarea" id="tx-notes" placeholder="Notas adicionales..." style="min-height:70px"></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-ghost" onclick="Modal.dismiss()">Cancelar</button>
        <button class="btn btn-primary" onclick="DashboardModule.saveTransaction()">Guardar</button>
      `,
    });
  }

  async function saveTransaction() {
    const type = document.getElementById('tx-type')?.value;
    const amount = window.Formatters?.parseMoney
      ? window.Formatters.parseMoney(document.getElementById('tx-amount')?.value)
      : parseFloat(document.getElementById('tx-amount')?.value);
    const desc = document.getElementById('tx-desc')?.value?.trim();
    const category = document.getElementById('tx-category')?.value;
    const date = document.getElementById('tx-date')?.value;
    const notes = document.getElementById('tx-notes')?.value?.trim();

    if (!type || !amount || !desc || !date) {
      Toast.show('Completa los campos obligatorios', 'error');
      return;
    }

    if (amount <= 0) {
      Toast.show('El monto debe ser mayor a cero', 'error');
      return;
    }

    try {
      await Storage.Transactions.add({ type, amount, description: desc, category, date, notes });
      await Storage.History.log('transaction_added', { type, amount, desc, module: 'finance' });
      Modal.dismiss();
      Toast.show('Transacción guardada correctamente', 'success');
      await render();
    } catch (err) {
      console.error('[Dashboard] Error guardando transacción:', err);
      Toast.show('Error al guardar. Intenta de nuevo.', 'error');
    }
  }

  async function recalculate() {
    Toast.show('Dashboard recalculado desde IndexedDB', 'success');
    await render();
  }

  async function cleanupDemoData() {
    const ok = window.confirm('Esto eliminará datos demo heredados y recalculará el dashboard. Tus registros reales no se borran.');
    if (!ok) return;
    const removed = await Storage.cleanupDemoData();
    const total = Object.values(removed).reduce((sum, n) => sum + n, 0);
    Toast.show(total ? `Datos demo eliminados: ${total}` : 'No se encontraron datos demo', total ? 'success' : 'info');
    await render();
  }

  function exportSummary() {
    Toast.show('Exportación disponible en próxima versión', 'info');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { render, quickAdd, saveTransaction, recalculate, cleanupDemoData, exportSummary };
})();

window.DashboardModule = DashboardModule;

export async function refreshDashboard() {
  if (Router?.getCurrent?.() === 'dashboard') {
    await DashboardModule.render();
  }
}

export function addRecentActivity(activity) {
  Storage.History.log('activity', {
    module: activity.module || activity.source || 'dashboard',
    category: activity.category || 'activity',
    description: activity.description || activity.text || activity.title || 'Actividad registrada',
    amount: activity.amount || null,
    status: activity.status || 'ok',
    ...activity,
  }).catch(() => {});
}

export function updateAlerts() {
  return true;
}

export { DashboardModule };
