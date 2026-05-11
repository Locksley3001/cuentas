/* ============================================================
   cards.js — Componentes de tarjetas reutilizables
   ============================================================ */

const Cards = (() => {

  /* ── Tarjeta métrica ─────────────────────────────────────── */
  function metric({ label, value, delta, deltaType = 'up', icon, type = '', sub = '' }) {
    const deltaIcon = deltaType === 'up' ? '▲' : deltaType === 'down' ? '▼' : '—';
    return `
      <div class="metric-card ${type}">
        <div class="metric-icon">${icon}</div>
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
        ${delta ? `
          <div class="metric-delta ${deltaType}">
            ${deltaIcon} ${delta}
          </div>
        ` : ''}
        ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
        <div class="metric-bg-icon">${icon}</div>
      </div>
    `;
  }

  /* ── Panel genérico ──────────────────────────────────────── */
  function panel({ title, dot = false, content, footer = '', actions = '' }) {
    return `
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            ${dot ? '<span class="dot"></span>' : ''}
            ${title}
          </div>
          ${actions}
        </div>
        <div class="panel-body">${content}</div>
        ${footer ? `<div class="panel-footer">${footer}</div>` : ''}
      </div>
    `;
  }

  /* ── Tarjeta de estadística rápida ───────────────────────── */
  function quickStat({ label, value, color = 'accent' }) {
    return `
      <div class="quick-stat">
        <div class="qs-value" style="color:var(--${color})">${value}</div>
        <div class="qs-label">${label}</div>
      </div>
    `;
  }

  /* ── Ítem de transacción ─────────────────────────────────── */
  function txItem({ icon, iconBg, name, date, amount, positive = true }) {
    return `
      <div class="tx-item">
        <div class="tx-icon" style="background:${iconBg}">${icon}</div>
        <div class="tx-info">
          <div class="tx-name">${name}</div>
          <div class="tx-date">${date}</div>
        </div>
        <div class="tx-amount ${positive ? 'positive' : 'negative'}">
          ${positive ? '+' : '-'}${amount}
        </div>
      </div>
    `;
  }

  /* ── Alerta ──────────────────────────────────────────────── */
  function alert({ type = 'info', icon, title, text }) {
    return `
      <div class="alert-item ${type}">
        <div class="alert-icon">${icon}</div>
        <div>
          <div class="alert-title">${title}</div>
          <div class="alert-text">${text}</div>
        </div>
      </div>
    `;
  }

  /* ── Item de timeline ────────────────────────────────────── */
  function timelineItem({ time, text }) {
    return `
      <div class="timeline-item">
        <div class="tl-time">${time}</div>
        <div class="tl-text">${text}</div>
      </div>
    `;
  }

  /* ── Progreso con barra ──────────────────────────────────── */
  function progressBar({ label, value, max, color = 'accent', showPct = true }) {
    const pct = Math.min(100, Math.round((value / max) * 100));
    return `
      <div style="margin-bottom:var(--space-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:0.8rem;color:var(--text-secondary)">${label}</span>
          ${showPct ? `<span style="font-size:0.75rem;font-family:var(--font-mono);color:var(--text-muted)">${pct}%</span>` : ''}
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${color}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }

  return { metric, panel, quickStat, txItem, alert, timelineItem, progressBar };
})();

window.Cards = Cards;


/* ============================================================
   modal.js — Sistema de modales reutilizables
   ============================================================ */

const Modal = (() => {
  let _activeModal = null;

  /* ── Crear y mostrar modal ───────────────────────────────── */
  function show({ id = 'modal-main', title, content, footer = '', size = 'md', onClose = null }) {
    /* Eliminar modal anterior si existe */
    dismiss();

    /* Overlay */
    let overlay = document.getElementById('global-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-overlay';
      overlay.className = 'overlay';
      document.body.appendChild(overlay);
    }
    overlay.classList.add('active');
    overlay.addEventListener('click', dismiss, { once: true });

    /* Wrapper del modal */
    const wrapper = document.createElement('div');
    wrapper.className = 'modal-wrapper';
    wrapper.id = `wrapper-${id}`;

    const sizeMap = { sm: '420px', md: '540px', lg: '720px', xl: '900px' };

    wrapper.innerHTML = `
      <div class="modal" style="max-width:${sizeMap[size] || sizeMap.md}">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(wrapper);
    _activeModal = { wrapper, onClose };

    /* Activar con animación */
    requestAnimationFrame(() => wrapper.classList.add('active'));

    /* Cerrar con botón */
    wrapper.querySelector('#modal-close-btn')?.addEventListener('click', dismiss);

    /* Cerrar con ESC */
    document.addEventListener('keydown', _onKeyDown);

    return wrapper;
  }

  /* ── Cerrar modal ────────────────────────────────────────── */
  function dismiss() {
    if (!_activeModal) return;

    const { wrapper, onClose } = _activeModal;

    wrapper.classList.remove('active');
    setTimeout(() => wrapper.remove(), 300);

    const overlay = document.getElementById('global-overlay');
    if (overlay) overlay.classList.remove('active');

    document.removeEventListener('keydown', _onKeyDown);
    _activeModal = null;

    if (typeof onClose === 'function') onClose();
  }

  function _onKeyDown(e) {
    if (e.key === 'Escape') dismiss();
  }

  /* ── Modal de confirmación ───────────────────────────────── */
  function confirm({ title = '¿Confirmar acción?', message, onConfirm, danger = false }) {
    show({
      title,
      size: 'sm',
      content: `<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6">${message}</p>`,
      footer: `
        <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">Confirmar</button>
      `,
    });

    document.getElementById('modal-cancel')?.addEventListener('click', dismiss);
    document.getElementById('modal-confirm')?.addEventListener('click', () => {
      dismiss();
      if (typeof onConfirm === 'function') onConfirm();
    });
  }

  return { show, dismiss, confirm };
})();

window.Modal = Modal;


/* ============================================================
   tables.js — Componente de tabla de datos reutilizable
   ============================================================ */

const Tables = (() => {

  /**
   * Renderizar tabla de datos
   * @param {Object} opts
   * @param {Array}  opts.columns - [{ key, label, render?, class? }]
   * @param {Array}  opts.data    - Array de objetos
   * @param {string} opts.emptyMsg
   * @param {Function} opts.actions - fn(row) => HTML string de acciones
   */
  function render({ columns, data, emptyMsg = 'Sin registros', actions = null }) {
    if (!data || data.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">◌</div>
          <h3>Sin registros</h3>
          <p>${emptyMsg}</p>
        </div>
      `;
    }

    const headerHTML = columns.map(col =>
      `<th>${col.label}</th>`
    ).join('') + (actions ? '<th style="text-align:right">Acciones</th>' : '');

    const rowsHTML = data.map(row => {
      const cells = columns.map(col => {
        const val = col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—');
        return `<td class="${col.class || ''}" data-label="${col.label}">${val}</td>`;
      }).join('');
      const actionCell = actions ? `<td data-label="Acciones" style="text-align:right">${actions(row)}</td>` : '';
      return `<tr data-id="${row.id || ''}">${cells}${actionCell}</tr>`;
    }).join('');

    return `
      <div class="table-container">
        <table class="data-table">
          <thead><tr>${headerHTML}</tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `;
  }

  /* ── Renderizar paginación ───────────────────────────────── */
  function pagination({ page, total, perPage, onPage }) {
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) return '';

    const start = (page - 1) * perPage + 1;
    const end   = Math.min(page * perPage, total);

    let pageButtons = '';
    for (let i = 1; i <= totalPages; i++) {
      pageButtons += `<button class="pg-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    return `
      <div class="table-pagination">
        <span class="pagination-info">Mostrando ${start}–${end} de ${total}</span>
        <div class="pagination-btns">
          <button class="pg-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>
          ${pageButtons}
          <button class="pg-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>›</button>
        </div>
      </div>
    `;
  }

  return { render, pagination };
})();

window.Tables = Tables;


/* ============================================================
   toast.js — Sistema de notificaciones tipo toast
   (incluido en cards.js por conveniencia de carga)
   ============================================================ */

const Toast = (() => {

  function show(message, type = 'info', duration = APP_CONFIG.ui.toastDuration) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span style="color:var(--${type === 'error' ? 'danger' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'accent'})">${icons[type]}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    /* Auto-cerrar */
    setTimeout(() => {
      toast.style.animation = 'fadeIn 0.3s ease reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show };
})();

window.Toast = Toast;
