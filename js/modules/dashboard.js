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

    const monthly = globalData.monthly || Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
    const recentMovements = globalData.recentMovements || [];
    const alerts = globalData.alerts || [];
    const history = globalData.history || [];
    const income = Number(globalData.income) || 0;
    const expense = Number(globalData.expense) || 0;
    const profit = income - expense;
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
          ${Cards.metric({ label: 'Capital Total', value: fmt(capital), delta: '', deltaType: 'neutral', icon: '◈', type: 'capital', sub: 'Activos + inversiones reales' })}
          ${Cards.metric({ label: 'Ingresos (año)', value: fmt(income), delta: '', deltaType: 'neutral', icon: '▲', type: 'income', sub: `${code} año en curso` })}
          ${Cards.metric({ label: 'Gastos (año)', value: fmt(expense), delta: '', deltaType: 'neutral', icon: '▼', type: 'expense', sub: 'Movimientos reales' })}
          ${Cards.metric({ label: 'Ganancia Neta', value: fmtSigned(profit), delta: '', deltaType: profit >= 0 ? 'up' : 'down', icon: '◎', type: 'profit', sub: 'Ingresos - gastos' })}
        </div>

        <div class="quick-stats">
          ${Cards.quickStat({ label: 'Portafolio', value: fmt(investmentValue), color: 'accent' })}
          ${Cards.quickStat({ label: 'Préstamos activos', value: fmt(loanSummary.active), color: 'warning' })}
          ${Cards.quickStat({ label: 'Activos', value: fmt(assetValue), color: 'accent-2' })}
        </div>

        <div class="dashboard-grid">
          ${Cards.panel({
            title: 'Flujo Mensual',
            dot: true,
            content: `
              ${_renderBarChart(monthly)}
              <div class="chart-legend">
                <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div>Ingresos</div>
                <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div>Gastos</div>
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
              content: _renderCapitalComposition({ investmentValue, assetValue, loanActive: loanSummary.active, capital }),
              footer: `
                <span style="font-size:0.78rem;color:var(--text-muted)">Capital real</span>
                <span style="font-family:var(--font-mono);font-size:0.875rem;color:var(--accent)">${fmt(capital)}</span>
              `,
            })}
          </div>
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

  function _renderCapitalComposition({ investmentValue, assetValue, loanActive, capital }) {
    const max = Math.max(capital, investmentValue, assetValue, loanActive, 1);
    const rows = [
      { label: 'Inversiones', value: investmentValue, color: 'accent' },
      { label: 'Activos', value: assetValue, color: 'success' },
      { label: 'Préstamos activos', value: loanActive, color: 'warning' },
    ].filter(row => row.value > 0);

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

  function _renderRecentMovements(movements) {
    if (!movements.length) {
      return `<div class="empty-state"><div class="empty-icon">○</div><p>Sin movimientos reales aún</p></div>`;
    }

    return `
      <div class="tx-list">
        ${movements.map(tx => Cards.txItem({
          icon: tx.type === 'income' ? '▲' : '▼',
          iconBg: tx.type === 'income' ? 'var(--success-soft)' : 'var(--danger-soft)',
          name: tx.description || tx.categoryLabel || tx.category || 'Movimiento',
          date: fmtDate(tx.date),
          amount: fmt(tx.amount),
          positive: tx.type === 'income',
        })).join('')}
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
          text: `<strong>${escapeHtml(item.action || item.category || 'Actividad')}</strong> ${escapeHtml(item.description || '')}`,
        })).join('')}
      </div>
    `;
  }

  function _renderBarChart(monthlyData) {
    const maxVal = monthlyData.reduce((m, d) => Math.max(m, d.income || 0, d.expense || 0), 1);
    const months = APP_CONFIG.months;
    const currentMonth = new Date().getMonth();
    const indices = [];
    for (let i = 5; i >= 0; i--) indices.push((currentMonth - i + 12) % 12);

    const barsHTML = indices.map(i => {
      const data = monthlyData[i] || { income: 0, expense: 0 };
      const incH = Math.max(4, Math.round(((data.income || 0) / maxVal) * 120));
      const expH = Math.max(4, Math.round(((data.expense || 0) / maxVal) * 120));
      return `
        <div class="bar-group">
          <div class="bar-wrap">
            <div class="bar income" data-h="${incH}" style="height:4px" title="Ingreso: ${fmt(data.income)}"></div>
            <div class="bar expense" data-h="${expH}" style="height:4px" title="Gasto: ${fmt(data.expense)}"></div>
          </div>
          <div class="bar-label">${months[i]}</div>
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
            <input class="form-input" type="number" id="tx-amount" placeholder="0" min="0" />
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
    const amount = parseFloat(document.getElementById('tx-amount')?.value);
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
