/**
 * ============================================================
 * modal.js — Sistema de Modales Reutilizables
 * /JS/components/modal.js
 *
 * Propósito:
 *   Gestión centralizada de modales para toda la aplicación.
 *   Reutilizable en: finanzas, préstamos, CRM, inversiones,
 *   activos, configuraciones y cualquier módulo futuro.
 *
 * Exports:
 *   ModalSystem   — clase principal, instancia singleton
 *   showModal     — función helper global
 *   closeModal    — función helper global
 *   showConfirm   — diálogo de confirmación
 *   showAlert     — alerta visual tipo toast/modal
 * ============================================================
 */

// ─── Estilos de Modal (inyectados una sola vez en el <head>) ──────────────────
const MODAL_STYLES = `
  /* ── Overlay ── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
    padding: 1rem;
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .modal-overlay.is-visible {
    opacity: 1;
  }

  /* ── Contenedor del modal ── */
  .modal-container {
    position: relative;
    background: #1a1a2e;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-content: start;
    min-height: 0;
    transform: translateY(24px) scale(0.97);
    transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity   0.25s ease;
    opacity: 0;
    overflow: hidden;
  }
  .modal-overlay.is-visible .modal-container {
    transform: translateY(0) scale(1);
    opacity: 1;
  }

  /* Tamaños */
  .modal-container.modal-sm  { max-width: 380px; }
  .modal-container.modal-md  { max-width: 560px; }
  .modal-container.modal-lg  { max-width: 760px; }
  .modal-container.modal-xl  { max-width: 980px; }
  .modal-container.modal-full{ max-width: 96vw; }

  /* ── Header ── */
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.4rem 1.6rem 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .modal-title {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    font-size: 1.05rem;
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: 0.01em;
  }
  .modal-title .modal-icon {
    font-size: 1.2rem;
    line-height: 1;
  }
  .modal-close {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    color: #888;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    transition: background 0.18s, color 0.18s;
    flex-shrink: 0;
  }
  .modal-close:hover {
    background: rgba(255,80,80,0.18);
    color: #ff6b6b;
    border-color: rgba(255,80,80,0.3);
  }

  /* ── Body ── */
  .modal-body {
    padding: 1.4rem 1.6rem;
    overflow-y: auto;
    min-height: 0;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,0.1) transparent;
  }
  .modal-body::-webkit-scrollbar { width: 4px; }
  .modal-body::-webkit-scrollbar-track { background: transparent; }
  .modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }

  /* ── Footer ── */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.6rem 1.4rem;
    border-top: 1px solid rgba(255,255,255,0.06);
    align-self: end;
    height: 82px !important;
    min-height: 82px !important;
    max-height: 82px !important;
    box-sizing: border-box;
  }
  .modal-footer.footer-left   { justify-content: flex-start; }
  .modal-footer.footer-center { justify-content: center; }
  .modal-footer.footer-between{ justify-content: space-between; }

  .modal-overlay[data-modal-id="modal-loan-create"],
  .modal-overlay[data-modal-id="modal-loan-edit"] {
    align-items: flex-start;
    overflow-y: auto;
  }
  .modal-overlay[data-modal-id="modal-loan-create"] .modal-container,
  .modal-overlay[data-modal-id="modal-loan-edit"] .modal-container {
    display: block;
    max-height: none;
    overflow: visible;
    margin: auto 0;
  }
  .modal-overlay[data-modal-id="modal-loan-create"] .modal-body,
  .modal-overlay[data-modal-id="modal-loan-edit"] .modal-body {
    overflow: visible;
    min-height: 0;
  }
  .modal-overlay[data-modal-id="modal-loan-create"] .modal-footer,
  .modal-overlay[data-modal-id="modal-loan-edit"] .modal-footer {
    height: auto !important;
    min-height: 82px !important;
    max-height: none !important;
  }

  /* ── Botones del modal ── */
  .btn-modal {
    padding: 0.6rem 1.3rem;
    border-radius: 9px;
    border: 1px solid transparent;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s ease;
    letter-spacing: 0.01em;
  }
  .btn-modal-primary {
    background: linear-gradient(135deg, #6c63ff, #4ecdc4);
    color: #fff;
    border-color: transparent;
  }
  .btn-modal-primary:hover  { filter: brightness(1.12); transform: translateY(-1px); }
  .btn-modal-secondary {
    background: rgba(255,255,255,0.05);
    color: #aaa;
    border-color: rgba(255,255,255,0.1);
  }
  .btn-modal-secondary:hover { background: rgba(255,255,255,0.1); color: #e0e0e0; }
  .btn-modal-danger {
    background: rgba(255, 80, 80, 0.15);
    color: #ff6b6b;
    border-color: rgba(255,80,80,0.3);
  }
  .btn-modal-danger:hover { background: rgba(255,80,80,0.28); }
  .btn-modal-success {
    background: rgba(78,205,196,0.15);
    color: #4ecdc4;
    border-color: rgba(78,205,196,0.3);
  }
  .btn-modal-success:hover { background: rgba(78,205,196,0.28); }

  /* ── Tipos especiales ── */
  /* Confirm */
  .modal-confirm-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    font-size: 1.8rem;
    margin: 0 auto 1rem;
  }
  .modal-confirm-icon.danger  { background: rgba(255,80,80,0.14);  color: #ff6b6b; }
  .modal-confirm-icon.warning { background: rgba(255,193,7,0.14);  color: #ffc107; }
  .modal-confirm-icon.info    { background: rgba(108,99,255,0.14); color: #6c63ff; }
  .modal-confirm-icon.success { background: rgba(78,205,196,0.14); color: #4ecdc4; }
  .modal-confirm-text {
    text-align: center;
    color: #c0c0d0;
    font-size: 0.92rem;
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }

  /* Toast / Alert inline */
  .modal-alert-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1.1rem;
    border-radius: 10px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }
  .modal-alert-bar.alert-success { background: rgba(78,205,196,0.1); color: #4ecdc4; border: 1px solid rgba(78,205,196,0.25); }
  .modal-alert-bar.alert-danger  { background: rgba(255,80,80,0.1);  color: #ff6b6b; border: 1px solid rgba(255,80,80,0.25); }
  .modal-alert-bar.alert-warning { background: rgba(255,193,7,0.1);  color: #ffc107; border: 1px solid rgba(255,193,7,0.25); }
  .modal-alert-bar.alert-info    { background: rgba(108,99,255,0.1); color: #a09dff; border: 1px solid rgba(108,99,255,0.25); }

  /* ── Formularios dentro de modal ── */
  .modal-form-group {
    margin-bottom: 1.1rem;
  }
  .modal-form-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.45rem;
  }
  .modal-form-input,
  .modal-form-select,
  .modal-form-textarea {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 9px;
    color: #e0e0f0;
    font-size: 0.9rem;
    padding: 0.65rem 0.9rem;
    transition: border-color 0.18s, box-shadow 0.18s;
    outline: none;
    box-sizing: border-box;
  }
  .modal-form-input:focus,
  .modal-form-select:focus,
  .modal-form-textarea:focus {
    border-color: rgba(108,99,255,0.6);
    box-shadow: 0 0 0 3px rgba(108,99,255,0.12);
  }
  .modal-form-input::placeholder,
  .modal-form-textarea::placeholder { color: rgba(255,255,255,0.2); }
  .modal-form-select { cursor: pointer; }
  .modal-form-select option { background: #1a1a2e; }
  .modal-form-textarea { resize: vertical; min-height: 88px; }
  .modal-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.9rem;
  }
  .modal-form-error {
    font-size: 0.78rem;
    color: #ff6b6b;
    margin-top: 0.3rem;
  }
  .modal-form-input.is-invalid,
  .modal-form-select.is-invalid {
    border-color: rgba(255,80,80,0.5);
  }

  /* ── Toast de notificación flotante ── */
  #toast-container {
    position: fixed;
    top: 1.2rem;
    right: 1.2rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    pointer-events: none;
  }
  .toast-item {
    background: #1e1e35;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 11px;
    padding: 0.85rem 1.1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.875rem;
    color: #ddd;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    pointer-events: all;
    transform: translateX(120%);
    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
    opacity: 0;
  }
  .toast-item.show {
    transform: translateX(0);
    opacity: 1;
  }
  .toast-item.toast-success { border-left: 3px solid #4ecdc4; }
  .toast-item.toast-danger  { border-left: 3px solid #ff6b6b; }
  .toast-item.toast-warning { border-left: 3px solid #ffc107; }
  .toast-item.toast-info    { border-left: 3px solid #6c63ff; }
  .toast-icon { font-size: 1.1rem; flex-shrink: 0; }
  .toast-msg  { flex: 1; line-height: 1.4; }
  .toast-close {
    background: none; border: none; color: #666;
    cursor: pointer; font-size: 0.9rem; padding: 0;
    transition: color 0.15s;
  }
  .toast-close:hover { color: #bbb; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .modal-container { border-radius: 12px; max-height: 95vh; }
    .modal-container.modal-lg,
    .modal-container.modal-xl { max-width: 100%; }
    .modal-form-row { grid-template-columns: 1fr; }
    .modal-body { min-height: 0; }
    .modal-footer {
      height: 138px !important;
      min-height: 138px !important;
      max-height: 138px !important;
      flex-direction: column-reverse;
    }
    .modal-overlay[data-modal-id="modal-loan-create"] .modal-footer,
    .modal-overlay[data-modal-id="modal-loan-edit"] .modal-footer {
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
    }
    .btn-modal { width: 100%; justify-content: center; }
    #toast-container { left: 1rem; right: 1rem; }
    .toast-item { min-width: unset; max-width: 100%; }
  }
`;

// ─── Inyectar estilos una sola vez ───────────────────────────────────────────
(function injectModalStyles() {
  if (document.getElementById('modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'modal-styles';
  style.textContent = MODAL_STYLES;
  document.head.appendChild(style);
})();

// ─── Crear contenedor de toasts ──────────────────────────────────────────────
function ensureToastContainer() {
  let tc = document.getElementById('toast-container');
  if (!tc) {
    tc = document.createElement('div');
    tc.id = 'toast-container';
    document.body.appendChild(tc);
  }
  return tc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLASE PRINCIPAL — ModalSystem
// ═══════════════════════════════════════════════════════════════════════════════
class ModalSystem {
  constructor() {
    /** @type {HTMLElement|null} overlay activo */
    this._overlay    = null;
    /** @type {HTMLElement|null} contenedor activo */
    this._container  = null;
    /** Callbacks registrados */
    this._onClose    = null;
    this._onConfirm  = null;
    /** Stack para modales anidados */
    this._stack      = [];

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._overlay) this.close();
    });
  }

  // ─── MÉTODO PRINCIPAL: open() ─────────────────────────────────────────────
  /**
   * Abre un modal dinámico.
   * @param {Object} cfg Configuración del modal
   * @param {string}   cfg.title      - Título del modal
   * @param {string}   [cfg.icon]     - Emoji/icono en el título
   * @param {string}   cfg.content    - HTML del cuerpo
   * @param {string}   [cfg.size]     - 'sm'|'md'|'lg'|'xl'|'full'
   * @param {Array}    [cfg.buttons]  - Array de { label, type, action, close }
   * @param {string}   [cfg.footerAlign] - 'left'|'center'|'between'
   * @param {Function} [cfg.onClose]  - Callback al cerrar
   * @param {Function} [cfg.onOpen]   - Callback al abrir (recibe containerEl)
   * @param {boolean}  [cfg.closeOnOverlay] - Cerrar al click en overlay (def: true)
   * @returns {HTMLElement} El contenedor del modal
   */
  open(cfg = {}) {
    const {
      title          = '',
      id             = '',
      icon           = '',
      content        = '',
      size           = 'md',
      buttons        = [],
      footerAlign    = 'right',
      onClose        = null,
      onOpen         = null,
      closeOnOverlay = true,
    } = cfg;

    // Si hay un modal abierto, lo guardamos en el stack
    if (this._overlay) {
      this._stack.push({ overlay: this._overlay, container: this._container });
      this._overlay.style.zIndex = String(8000 + this._stack.length);
    }

    this._onClose = onClose;

    // ── Crear overlay ──
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    if (id) overlay.dataset.modalId = id;

    // ── Crear contenedor ──
    const container = document.createElement('div');
    container.className = `modal-container modal-${size}`;
    if (id) container.id = id;

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <div class="modal-title">
        ${icon ? `<span class="modal-icon">${icon}</span>` : ''}
        <span>${title}</span>
      </div>
      <button class="modal-close" aria-label="Cerrar modal">✕</button>
    `;
    header.querySelector('.modal-close').addEventListener('click', () => this.close());

    // ── Body ──
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = content;

    // ── Footer ──
    const footerAlignClass = footerAlign === 'left'   ? 'footer-left'
                           : footerAlign === 'center' ? 'footer-center'
                           : footerAlign === 'between' ? 'footer-between'
                           : '';
    const footer = document.createElement('div');
    footer.className = `modal-footer ${footerAlignClass}`;

    // Renderizar botones
    if (buttons.length === 0) {
      // Botón por defecto
      const btn = this._createButton({ label: 'Cerrar', type: 'secondary', close: true });
      footer.appendChild(btn);
    } else {
      buttons.forEach(btnCfg => {
        footer.appendChild(this._createButton(btnCfg));
      });
    }

    // ── Ensamblar ──
    container.appendChild(header);
    container.appendChild(body);
    container.appendChild(footer);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    this._overlay   = overlay;
    this._container = container;

    // Bloquear scroll del body
    document.body.style.overflow = 'hidden';

    // Animación de entrada (next tick)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
      });
    });

    // Cerrar al click en overlay (fuera del container)
    if (closeOnOverlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    // Callback post-apertura
    if (typeof onOpen === 'function') {
      setTimeout(() => onOpen(container, body), 300);
    }

    return container;
  }

  // ─── _createButton() ────────────────────────────────────────────────────
  /**
   * Crea un botón para el footer del modal.
   * @param {Object} cfg
   * @param {string}   cfg.label    - Texto del botón
   * @param {string}   [cfg.type]   - 'primary'|'secondary'|'danger'|'success'
   * @param {Function} [cfg.action] - Callback al hacer click
   * @param {boolean}  [cfg.close]  - ¿Cerrar modal al click?
   * @returns {HTMLButtonElement}
   */
  _createButton(cfg) {
    const { label = 'OK', type = 'secondary', action = null, close = false } = cfg;
    const btn = document.createElement('button');
    btn.className = `btn-modal btn-modal-${type}`;
    btn.textContent = label;
    btn.addEventListener('click', async () => {
      if (typeof action === 'function') {
        const result = await action(this._container);
        // Si la acción retorna false explícitamente, no cerrar
        if (result === false) return;
      }
      if (close) this.close();
    });
    return btn;
  }

  // ─── close() ────────────────────────────────────────────────────────────
  /**
   * Cierra el modal activo con animación.
   */
  close() {
    if (!this._overlay) return;

    const overlay   = this._overlay;
    const container = this._container;

    // Animación de salida
    overlay.classList.remove('is-visible');

    overlay.addEventListener('transitionend', () => {
      overlay.remove();
    }, { once: true });

    // Callback
    if (typeof this._onClose === 'function') {
      this._onClose();
    }

    // ¿Hay modales en el stack?
    if (this._stack.length > 0) {
      const prev = this._stack.pop();
      this._overlay   = prev.overlay;
      this._container = prev.container;
      this._overlay.style.zIndex = '9000';
    } else {
      this._overlay   = null;
      this._container = null;
      document.body.style.overflow = '';
    }
  }

  // ─── closeAll() ─────────────────────────────────────────────────────────
  /**
   * Cierra TODOS los modales del stack.
   */
  closeAll() {
    this._stack.forEach(item => item.overlay.remove());
    this._stack = [];
    this.close();
    document.body.style.overflow = '';
  }

  // ─── setLoading() ───────────────────────────────────────────────────────
  /**
   * Muestra/oculta estado de carga en el botón primario.
   * @param {boolean} loading
   * @param {string}  [text] - Texto durante la carga
   */
  setLoading(loading, text = 'Procesando...') {
    if (!this._container) return;
    const primary = this._container.querySelector('.btn-modal-primary');
    if (!primary) return;
    if (loading) {
      primary.disabled = true;
      primary._origText = primary.textContent;
      primary.textContent = text;
      primary.style.opacity = '0.7';
    } else {
      primary.disabled = false;
      primary.textContent = primary._origText || 'Guardar';
      primary.style.opacity = '1';
    }
  }

  // ─── showAlert() ────────────────────────────────────────────────────────
  /**
   * Inserta un alert bar dentro del body del modal activo.
   * @param {string} message
   * @param {'success'|'danger'|'warning'|'info'} type
   */
  showAlert(message, type = 'info') {
    if (!this._container) return;
    const body = this._container.querySelector('.modal-body');
    const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };
    const existing = body.querySelector('.modal-alert-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = `modal-alert-bar alert-${type}`;
    bar.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    body.insertBefore(bar, body.firstChild);
  }

  // ─── clearAlert() ───────────────────────────────────────────────────────
  clearAlert() {
    if (!this._container) return;
    const bar = this._container.querySelector('.modal-alert-bar');
    if (bar) bar.remove();
  }

  // ─── getBody() ──────────────────────────────────────────────────────────
  /** @returns {HTMLElement|null} El elemento .modal-body del modal activo */
  getBody() {
    return this._container?.querySelector('.modal-body') || null;
  }

  // ─── updateContent() ────────────────────────────────────────────────────
  /**
   * Reemplaza el contenido del body del modal activo.
   * @param {string} html
   */
  updateContent(html) {
    const body = this.getBody();
    if (body) body.innerHTML = html;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS GLOBALES
// ═══════════════════════════════════════════════════════════════════════════════

// Instancia singleton exportada
export const modalSystem = new ModalSystem();

// ─── showModal() ────────────────────────────────────────────────────────────
/**
 * Atajo para abrir un modal.
 * @param {Object} config — Misma config que ModalSystem.open()
 * @returns {HTMLElement}
 */
export function showModal(config) {
  return modalSystem.open(config);
}

// ─── closeModal() ───────────────────────────────────────────────────────────
/** Cierra el modal activo */
export function closeModal() {
  modalSystem.close();
}

// ─── closeAllModals() ───────────────────────────────────────────────────────
export function closeAllModals() {
  modalSystem.closeAll();
}

// ─── showConfirm() ──────────────────────────────────────────────────────────
/**
 * Muestra un modal de confirmación.
 * @param {Object} cfg
 * @param {string}   cfg.title        - Título
 * @param {string}   cfg.message      - Mensaje descriptivo
 * @param {string}   [cfg.type]       - 'danger'|'warning'|'info'|'success'
 * @param {string}   [cfg.confirmText]- Texto botón confirmar
 * @param {string}   [cfg.cancelText] - Texto botón cancelar
 * @param {Function} cfg.onConfirm    - Callback al confirmar
 * @param {Function} [cfg.onCancel]   - Callback al cancelar
 * @returns {HTMLElement}
 */
export function showConfirm(cfg = {}) {
  const {
    title       = '¿Estás seguro?',
    message     = '',
    type        = 'danger',
    confirmText = 'Confirmar',
    cancelText  = 'Cancelar',
    onConfirm   = null,
    onCancel    = null,
  } = cfg;

  const icons = { danger: '🗑️', warning: '⚠️', info: '❓', success: '✅' };

  const content = `
    <div style="text-align:center; padding: 0.5rem 0;">
      <div class="modal-confirm-icon ${type}">${icons[type] || '❓'}</div>
      <p class="modal-confirm-text">${message}</p>
    </div>
  `;

  return modalSystem.open({
    title,
    size: 'sm',
    content,
    footerAlign: 'center',
    buttons: [
      {
        label: cancelText,
        type: 'secondary',
        close: true,
        action: () => { if (typeof onCancel === 'function') onCancel(); },
      },
      {
        label: confirmText,
        type: type === 'danger' ? 'danger' : 'primary',
        close: true,
        action: () => { if (typeof onConfirm === 'function') onConfirm(); },
      },
    ],
  });
}

// ─── showToast() ────────────────────────────────────────────────────────────
/**
 * Muestra un toast/notificación flotante.
 * @param {string} message
 * @param {'success'|'danger'|'warning'|'info'} type
 * @param {number} [duration] — ms antes de auto-cerrar (0 = manual)
 */
export function showToast(message, type = 'info', duration = 3500) {
  const tc = ensureToastContainer();
  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span class="toast-msg">${message}</span>
    <button class="toast-close" aria-label="Cerrar">✕</button>
  `;

  const close = () => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast-close').addEventListener('click', close);
  tc.appendChild(toast);

  // Animación de entrada
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));

  // Auto-cierre
  if (duration > 0) setTimeout(close, duration);

  return { close };
}

// ─── buildFormHTML() ────────────────────────────────────────────────────────
/**
 * Helper para construir HTML de formulario rápido dentro de un modal.
 * @param {Array} fields — Array de definiciones de campo
 * @returns {string} HTML
 *
 * Ejemplo de campo:
 *   { id: 'amount', label: 'Monto', type: 'number', placeholder: '0.00', required: true }
 *   { id: 'category', label: 'Categoría', type: 'select', options: [{value:'x',label:'X'}] }
 *   { id: 'note', label: 'Nota', type: 'textarea' }
 */
export function buildFormHTML(fields = []) {
  // Agrupar en filas: si el campo tiene `col: 'half'` va a columna
  let html = '';
  let i = 0;

  while (i < fields.length) {
    const f = fields[i];
    if (f.col === 'half' && fields[i + 1]?.col === 'half') {
      // Par de medias columnas
      html += `<div class="modal-form-row">
        ${_renderField(fields[i])}
        ${_renderField(fields[i + 1])}
      </div>`;
      i += 2;
    } else {
      html += `<div class="modal-form-group">${_renderField(f, true)}</div>`;
      i++;
    }
  }

  return html;
}

function _renderField(f, withWrapper = false) {
  const required = f.required ? 'required' : '';
  const id       = f.id || '';
  const label    = f.label || '';
  const ph       = f.placeholder || '';
  const val      = f.value !== undefined ? f.value : '';

  let input = '';

  if (f.type === 'select') {
    const opts = (f.options || [])
      .map(o => `<option value="${o.value}" ${o.value == val ? 'selected' : ''}>${o.label}</option>`)
      .join('');
    input = `<select id="${id}" name="${id}" class="modal-form-select" ${required}>${opts}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea id="${id}" name="${id}" class="modal-form-textarea" placeholder="${ph}" ${required}>${val}</textarea>`;
  } else {
    input = `<input type="${f.type || 'text'}" id="${id}" name="${id}"
      class="modal-form-input" placeholder="${ph}" value="${val}" ${required}>`;
  }

  const inner = `
    <label class="modal-form-label" for="${id}">${label}${f.required ? ' *' : ''}</label>
    ${input}
  `;

  if (withWrapper) return inner;
  return `<div class="modal-form-group">${inner}</div>`;
}

// ─── getFormData() ───────────────────────────────────────────────────────────
/**
 * Extrae los valores de un formulario dentro del modal activo.
 * @returns {Object} { fieldId: value, ... }
 */
export function getModalFormData() {
  const body = modalSystem.getBody();
  if (!body) return {};
  const result = {};
  body.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.id) return;
    result[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return result;
}

// ─── validateModalForm() ────────────────────────────────────────────────────
/**
 * Valida los campos requeridos del formulario en el modal activo.
 * Agrega clase .is-invalid a los campos vacíos.
 * @returns {boolean} true si todo válido
 */
export function validateModalForm() {
  const body = modalSystem.getBody();
  if (!body) return true;

  let valid = true;

  body.querySelectorAll('[required]').forEach(el => {
    el.classList.remove('is-invalid');
    const errorEl = el.parentElement.querySelector('.modal-form-error');
    if (errorEl) errorEl.remove();

    if (!el.value.trim()) {
      el.classList.add('is-invalid');
      const err = document.createElement('div');
      err.className = 'modal-form-error';
      err.textContent = 'Este campo es obligatorio';
      el.after(err);
      valid = false;
    }
  });

  return valid;
}

export function openModal(config = {}) {
  const sizeMap = { small: 'sm', medium: 'md', large: 'lg', xlarge: 'xl' };
  const normalized = { ...config, size: sizeMap[config.size] || config.size };
  if (!normalized.buttons && typeof config.onConfirm === 'function') {
    normalized.buttons = [
      { label: config.cancelText || 'Cancelar', type: 'secondary', close: true },
      { label: config.confirmText || 'Guardar', type: 'primary', close: false, action: config.onConfirm },
    ];
  }
  const container = showModal(normalized);

  if (config.footer) {
    const footer = container.querySelector('.modal-footer');
    if (footer) {
      footer.innerHTML = config.footer;
      footer.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => closeModal());
      });
    }
  }

  return container;
}

export function setModalLoading(isLoading, message = 'Cargando...') {
  modalSystem.setLoading(Boolean(isLoading), message);
}

export const Modal = {
  open: openModal,
  close: closeModal,
  closeAll: closeAllModals,
  confirm: showConfirm,
  toast: showToast,
  showToast,
  setLoading: setModalLoading,
};

window.ModalSystem = modalSystem;

// ═══════════════════════════════════════════════════════════════════════════════
// Exportación por defecto
// ═══════════════════════════════════════════════════════════════════════════════
export default modalSystem;
