import { Storage } from '../storage/storage.js';

const HISTORY_STYLES = `
  .history-toolbar,.settings-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:18px 0}
  .history-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .history-filters input,.history-filters select,.settings-card input,.settings-card select{
    background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:var(--text);
    border-radius:8px;padding:10px 12px;outline:none;min-height:38px
  }
  .history-filters input{min-width:240px}
  .history-row-module{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(56,189,248,.1);color:var(--accent);font-size:.75rem;font-weight:700}
  .history-desc{max-width:520px;color:var(--text);line-height:1.45}
  .history-meta{color:var(--text-muted);font-size:.78rem}
  .history-amount{font-family:var(--font-mono);font-weight:700;color:var(--success)}
  .history-amount.negative{color:var(--danger)}
  .activity-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:18px}
  .activity-chip{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:8px;padding:12px}
  .activity-chip strong{display:block;color:var(--text);font-family:var(--font-mono);font-size:1.1rem}
  .activity-chip span{font-size:.74rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
`;

const MODULE_LABELS = {
  dashboard: 'Dashboard',
  finance: 'Finanzas',
  loans: 'Préstamos',
  crm: 'CRM',
  investments: 'Inversiones',
  assets: 'Activos',
  settings: 'Configuración',
  system: 'Sistema',
};

const CATEGORY_LABELS = {
  ventas: 'Ventas',
  servicios: 'Servicios',
  intereses: 'Intereses',
  trading: 'Trading',
  inversiones: 'Inversiones',
  otros_ing: 'Otros ingresos',
  capital_inicial: 'Capital inicial',
  publicidad: 'Publicidad',
  herramientas: 'Herramientas',
  servidores: 'Servidores',
  transporte: 'Transporte',
  alimentacion: 'Alimentación',
  mantenimiento: 'Mantenimiento',
  otros_gas: 'Otros gastos',
};

function categoryLabel(itemOrCategory) {
  if (itemOrCategory && typeof itemOrCategory === 'object') {
    return itemOrCategory.categoryLabel
      || itemOrCategory.data?.categoryLabel
      || CATEGORY_LABELS[itemOrCategory.category]
      || itemOrCategory.category
      || '';
  }
  return CATEGORY_LABELS[itemOrCategory] || itemOrCategory || '';
}

class HistoryModuleClass {
  constructor() {
    this.container = null;
    this.cache = [];
    this.filters = { search: '', module: 'all', category: 'all', range: 'all', sort: 'desc' };
    this._listening = false;
  }

  async init(container) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    injectStyles();
    await this.consumePendingLogs();
    await this.load();
    this.render();
    this.bindEvents();
  }

  setupGlobalListeners() {
    if (this._listening) return;
    this._listening = true;
    window._historyModule = this;

    window.addEventListener('history:log', (event) => {
      this.log(event.detail || {}).catch(err => console.error('[History] Error registrando evento:', err));
    });

    window.addEventListener('error', (event) => {
      this.log({
        module: 'system',
        action: 'runtime_error',
        category: 'error',
        description: event.message,
        status: 'error',
      }).catch(() => {});
    });
  }

  async consumePendingLogs() {
    const sources = [
      ['loans_pending_history', 'loans'],
      ['crm_pending_history', 'crm'],
    ];

    for (const [key, module] of sources) {
      try {
        const pending = JSON.parse(sessionStorage.getItem(key) || '[]');
        sessionStorage.removeItem(key);
        for (const item of pending) await this.log({ module, ...item });
      } catch (_) {}
    }
  }

  async log(actionOrEntry, data = {}) {
    const entry = typeof actionOrEntry === 'string'
      ? Storage.normalizeHistoryEntry(actionOrEntry, data)
      : Storage.normalizeHistoryEntry(actionOrEntry.action, actionOrEntry);

    const id = await Storage.add('history', entry);
    const saved = { ...entry, id };
    this.cache.unshift(saved);
    window.dispatchEvent(new CustomEvent('history:changed', { detail: saved }));
    if (Router?.getCurrent?.() === 'history' && this.container) this.refreshList();
    return saved;
  }

  async load() {
    this.cache = (await Storage.getAll('history'))
      .map(item => Storage.normalizeHistoryEntry(item.action, item))
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  }

  getRecent(limit = 8) {
    return [...this.cache].slice(0, limit);
  }

  getStats() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const byModule = {};
    let errors = 0;
    let todayCount = 0;

    for (const item of this.cache) {
      byModule[item.module] = (byModule[item.module] || 0) + 1;
      if ((item.timestamp || item.date || '').slice(0, 10) === today) todayCount++;
      if (item.category === 'error' || item.status === 'error') errors++;
    }

    return { total: this.cache.length, today: todayCount, errors, modules: Object.keys(byModule).length, byModule };
  }

  filtered() {
    const q = this.filters.search.toLowerCase().trim();
    const now = Date.now();
    const ranges = {
      today: 1,
      week: 7,
      month: 30,
    };

    return this.cache
      .filter(item => this.filters.module === 'all' || item.module === this.filters.module)
      .filter(item => this.filters.category === 'all' || item.category === this.filters.category)
      .filter(item => {
        if (this.filters.range === 'all') return true;
        const days = ranges[this.filters.range] || 99999;
        return now - new Date(item.timestamp || item.date).getTime() <= days * 86400000;
      })
      .filter(item => !q || [item.module, item.action, item.category, categoryLabel(item), item.description, item.status]
        .join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const diff = new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date);
        return this.filters.sort === 'asc' ? diff : -diff;
      });
  }

  render() {
    if (!this.container) return;
    const stats = this.getStats();
    const modules = unique(this.cache.map(i => i.module).filter(Boolean));
    const categories = unique(this.cache.map(i => i.category).filter(Boolean));

    this.container.innerHTML = `
      <div class="module-container history-module">
        <div class="module-header">
          <div class="module-title-group">
            <h2 class="module-title">Historial Global</h2>
            <p class="module-subtitle">Actividad real de finanzas, préstamos, CRM, inversiones, activos y sistema.</p>
          </div>
          <div class="module-actions">
            <button class="btn btn-ghost" id="historyExport">Exportar JSON</button>
            <button class="btn btn-primary" id="historyRefresh">Actualizar</button>
          </div>
        </div>

        <div class="activity-strip">
          <div class="activity-chip"><strong>${stats.total}</strong><span>Registros</span></div>
          <div class="activity-chip"><strong>${stats.today}</strong><span>Hoy</span></div>
          <div class="activity-chip"><strong>${stats.modules}</strong><span>Módulos</span></div>
          <div class="activity-chip"><strong>${stats.errors}</strong><span>Alertas error</span></div>
        </div>

        <div class="history-toolbar">
          <div class="history-filters">
            <input id="historySearch" placeholder="Buscar actividad..." value="${esc(this.filters.search)}" />
            <select id="historyModule">
              <option value="all">Todos los módulos</option>
              ${modules.map(m => `<option value="${esc(m)}" ${this.filters.module === m ? 'selected' : ''}>${MODULE_LABELS[m] || m}</option>`).join('')}
            </select>
            <select id="historyCategory">
              <option value="all">Todas las categorías</option>
              ${categories.map(c => `<option value="${esc(c)}" ${this.filters.category === c ? 'selected' : ''}>${esc(categoryLabel(c))}</option>`).join('')}
            </select>
            <select id="historyRange">
              <option value="all">Todo</option>
              <option value="today" ${this.filters.range === 'today' ? 'selected' : ''}>Hoy</option>
              <option value="week" ${this.filters.range === 'week' ? 'selected' : ''}>7 días</option>
              <option value="month" ${this.filters.range === 'month' ? 'selected' : ''}>30 días</option>
            </select>
            <select id="historySort">
              <option value="desc" ${this.filters.sort === 'desc' ? 'selected' : ''}>Más reciente</option>
              <option value="asc" ${this.filters.sort === 'asc' ? 'selected' : ''}>Más antiguo</option>
            </select>
          </div>
        </div>

        <div id="historyList"></div>
      </div>
    `;

    this.refreshList();
  }

  refreshList() {
    const list = this.container?.querySelector('#historyList');
    if (!list) return;
    const rows = this.filtered();

    list.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th><th>Módulo</th><th>Acción</th><th>Categoría</th><th>Descripción</th><th>Monto</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(item => `
              <tr>
                <td><div class="history-meta">${formatDate(item.timestamp || item.date)}</div></td>
                <td><span class="history-row-module">${MODULE_LABELS[item.module] || esc(item.module)}</span></td>
                <td>${esc(item.action)}</td>
                <td>${esc(categoryLabel(item))}</td>
                <td><div class="history-desc">${esc(item.description)}</div></td>
                <td>${item.amount ? `<span class="history-amount ${item.amount < 0 ? 'negative' : ''}">${formatMoney(item.amount)}</span>` : '<span class="history-meta">-</span>'}</td>
                <td>${item.status ? esc(item.status) : '<span class="history-meta">-</span>'}</td>
              </tr>
            `).join('') || '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">○</div><p>Sin actividad para los filtros actuales.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#historySearch')?.addEventListener('input', e => {
      this.filters.search = e.target.value;
      this.refreshList();
    });
    ['Module', 'Category', 'Range', 'Sort'].forEach(name => {
      this.container.querySelector(`#history${name}`)?.addEventListener('change', e => {
        this.filters[name.toLowerCase()] = e.target.value;
        this.refreshList();
      });
    });
    this.container.querySelector('#historyRefresh')?.addEventListener('click', async () => {
      await this.load();
      this.render();
      Toast?.show?.('Historial actualizado', 'success');
    });
    this.container.querySelector('#historyExport')?.addEventListener('click', () => {
      downloadJSON({ exportedAt: new Date().toISOString(), history: this.filtered() }, `historial_cuentas_${today()}.json`);
    });
  }
}

function injectStyles() {
  if (document.getElementById('history-module-styles')) return;
  const style = document.createElement('style');
  style.id = 'history-module-styles';
  style.textContent = HISTORY_STYLES;
  document.head.appendChild(style);
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: APP_CONFIG.currency.code, maximumFractionDigits: 0 }).format(value);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch]));
}

export const HistoryModule = new HistoryModuleClass();
export const initHistory = (container) => HistoryModule.init(container);
export const logHistory = (...args) => HistoryModule.log(...args);
export default HistoryModule;
