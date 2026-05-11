import { Storage } from '../storage/storage.js';
import { showConfirm, showToast } from '../components/modal.js';
import { HistoryModule } from './history.js';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  accent: '#38bdf8',
  currency: 'COP',
  dateFormat: 'es-CO',
  notifications: true,
  compactTables: false,
  reduceMotion: false,
  autoBackupReminder: true,
};

const SETTINGS_STYLES = `
  .settings-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:16px;margin-top:18px}
  .settings-card{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:8px;padding:18px}
  .settings-card h3{font-size:1rem;margin:0 0 12px;color:var(--text)}
  .settings-form{display:grid;gap:14px}
  .settings-field{display:grid;gap:7px}
  .settings-field label{font-size:.76rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
  .settings-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
  .settings-danger{border-color:rgba(248,113,113,.22);background:rgba(248,113,113,.04)}
  .settings-muted{font-size:.82rem;color:var(--text-muted);line-height:1.55}
  .backup-drop{border:1px dashed rgba(255,255,255,.18);border-radius:8px;padding:18px;text-align:center;background:rgba(255,255,255,.025)}
  .backup-drop input{display:none}
  .backup-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:12px}
  .backup-summary div{background:rgba(0,0,0,.16);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px}
  .backup-summary strong{display:block;font-family:var(--font-mono);font-size:1rem}
  @media(max-width:900px){.settings-grid{grid-template-columns:1fr}}
`;

class SettingsModuleClass {
  constructor() {
    this.container = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastBackup = null;
  }

  async init(container) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
    injectStyles();
    await this.load();
    this.applyPreferences();
    this.render();
    this.bindEvents();
  }

  async load() {
    const stored = await Storage.Settings.get('preferences');
    this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  }

  async save(patch = {}) {
    this.settings = { ...this.settings, ...patch };
    await Storage.Settings.set('preferences', this.settings);
    this.applyPreferences();
    await HistoryModule.log({
      module: 'settings',
      action: 'settings_updated',
      category: 'preferences',
      description: 'Preferencias globales actualizadas',
      status: 'success',
    });
    showToast('Configuración guardada', 'success');
  }

  applyPreferences() {
    document.documentElement.dataset.theme = this.settings.theme;
    document.documentElement.style.setProperty('--accent', this.settings.accent);
    document.body.classList.toggle('compact-tables', Boolean(this.settings.compactTables));
    document.body.classList.toggle('reduce-motion', Boolean(this.settings.reduceMotion));
    APP_CONFIG.currency.code = this.settings.currency;
  }

  async exportBackup() {
    const backup = await Storage.exportData();
    this.lastBackup = backup;
    downloadJSON(backup, `cuentas_backup_${today()}.json`);
    await HistoryModule.log({
      module: 'settings',
      action: 'backup_exported',
      category: 'backup',
      description: 'Backup completo exportado en JSON',
      status: 'success',
    });
    showToast('Backup JSON exportado', 'success');
    this.renderBackupSummary(backup);
  }

  async importBackupFile(file, mode = 'merge') {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      showToast('Selecciona un archivo JSON válido', 'warning');
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await Storage.importData(payload, { mode });
      showToast(`Backup importado: ${result.importedStores.length} stores`, 'success');
      await this.load();
      this.applyPreferences();
      this.renderBackupSummary(payload);
    } catch (err) {
      console.error('[Settings] Error importando backup:', err);
      await HistoryModule.log({
        module: 'settings',
        action: 'backup_import_failed',
        category: 'error',
        description: err.message,
        status: 'error',
      });
      showToast(err.message || 'No se pudo importar el backup', 'danger');
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="module-container settings-module">
        <div class="module-header">
          <div class="module-title-group">
            <h2 class="module-title">Configuración Global</h2>
            <p class="module-subtitle">Preferencias, backup, restauración y mantenimiento local del ERP.</p>
          </div>
          <div class="module-actions">
            <button class="btn btn-ghost" id="settingsExportTop">Exportar backup</button>
            <button class="btn btn-primary" id="settingsSave">Guardar cambios</button>
          </div>
        </div>

        <div class="settings-grid">
          <section class="settings-card">
            <h3>Preferencias de interfaz</h3>
            <div class="settings-form">
              <div class="settings-field">
                <label for="setTheme">Tema</label>
                <select id="setTheme">
                  <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>Dark premium</option>
                  <option value="contrast" ${this.settings.theme === 'contrast' ? 'selected' : ''}>Alto contraste</option>
                </select>
              </div>
              <div class="settings-field">
                <label for="setAccent">Color principal</label>
                <input id="setAccent" type="color" value="${esc(this.settings.accent)}" />
              </div>
              <div class="settings-field">
                <label for="setCurrency">Moneda</label>
                <select id="setCurrency">
                  ${['COP','USD','EUR','MXN'].map(c => `<option value="${c}" ${this.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>
              <div class="settings-field">
                <label for="setDateFormat">Formato regional</label>
                <select id="setDateFormat">
                  <option value="es-CO" ${this.settings.dateFormat === 'es-CO' ? 'selected' : ''}>Español Colombia</option>
                  <option value="es-MX" ${this.settings.dateFormat === 'es-MX' ? 'selected' : ''}>Español México</option>
                  <option value="en-US" ${this.settings.dateFormat === 'en-US' ? 'selected' : ''}>English US</option>
                </select>
              </div>
              <label class="checkbox-row"><input id="setNotifications" type="checkbox" ${this.settings.notifications ? 'checked' : ''}> Notificaciones internas</label>
              <label class="checkbox-row"><input id="setCompactTables" type="checkbox" ${this.settings.compactTables ? 'checked' : ''}> Tablas compactas</label>
              <label class="checkbox-row"><input id="setReduceMotion" type="checkbox" ${this.settings.reduceMotion ? 'checked' : ''}> Reducir animaciones</label>
            </div>
          </section>

          <section class="settings-card">
            <h3>Backup y restauración</h3>
            <p class="settings-muted">Exporta toda la base local como JSON o restaura un backup compatible. La importación puede mezclar datos o reemplazar stores completos.</p>
            <div class="settings-actions">
              <button class="btn btn-primary" id="settingsExport">Exportar JSON</button>
              <button class="btn btn-ghost" id="settingsPickImport">Importar JSON</button>
              <input id="settingsImportFile" type="file" accept="application/json,.json" hidden />
            </div>
            <div class="settings-field" style="margin-top:12px">
              <label for="importMode">Modo de importación</label>
              <select id="importMode">
                <option value="merge">Mezclar con datos actuales</option>
                <option value="replace">Reemplazar stores importados</option>
              </select>
            </div>
            <div class="backup-drop" id="backupSummary">
              <strong>Backup completo</strong>
              <p class="settings-muted">Incluye transacciones, préstamos, CRM, inversiones, activos, historial y configuración.</p>
            </div>
          </section>

          <section class="settings-card settings-danger">
            <h3>Mantenimiento local</h3>
            <p class="settings-muted">Acciones sensibles sobre IndexedDB. Usa backup antes de limpiar la base local.</p>
            <div class="settings-actions">
              <button class="btn btn-ghost" id="settingsCleanDemo">Limpiar datos demo</button>
              <button class="btn btn-danger" id="settingsClear">Limpiar base local</button>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const readForm = () => ({
      theme: this.container.querySelector('#setTheme').value,
      accent: this.container.querySelector('#setAccent').value,
      currency: this.container.querySelector('#setCurrency').value,
      dateFormat: this.container.querySelector('#setDateFormat').value,
      notifications: this.container.querySelector('#setNotifications').checked,
      compactTables: this.container.querySelector('#setCompactTables').checked,
      reduceMotion: this.container.querySelector('#setReduceMotion').checked,
    });

    this.container.querySelector('#settingsSave')?.addEventListener('click', () => this.save(readForm()));
    this.container.querySelector('#settingsExport')?.addEventListener('click', () => this.exportBackup());
    this.container.querySelector('#settingsExportTop')?.addEventListener('click', () => this.exportBackup());
    this.container.querySelector('#settingsPickImport')?.addEventListener('click', () => this.container.querySelector('#settingsImportFile')?.click());
    this.container.querySelector('#settingsImportFile')?.addEventListener('change', e => {
      const mode = this.container.querySelector('#importMode')?.value || 'merge';
      this.importBackupFile(e.target.files?.[0], mode);
      e.target.value = '';
    });

    this.container.querySelector('#settingsCleanDemo')?.addEventListener('click', async () => {
      const removed = await Storage.cleanupDemoData();
      const total = Object.values(removed).reduce((sum, count) => sum + count, 0);
      await HistoryModule.log({ module: 'settings', action: 'demo_data_cleaned', category: 'maintenance', description: 'Limpieza manual de datos demo ejecutada', data: removed });
      showToast(total ? `Datos demo eliminados: ${total}` : 'No se encontraron datos demo', total ? 'success' : 'info');
    });

    this.container.querySelector('#settingsClear')?.addEventListener('click', () => {
      showConfirm({
        title: 'Limpiar base local',
        message: 'Esta acción elimina los datos locales de IndexedDB. Exporta un backup antes si necesitas conservarlos.',
        type: 'danger',
        confirmText: 'Limpiar datos',
        onConfirm: async () => {
          await Storage.resetLocalData();
          showToast('Base local limpiada', 'warning');
          setTimeout(() => location.reload(), 900);
        },
      });
    });
  }

  renderBackupSummary(backup) {
    const el = this.container?.querySelector('#backupSummary');
    if (!el || !backup?.data) return;
    const stores = Object.entries(backup.data);
    el.innerHTML = `
      <strong>Último backup leído</strong>
      <p class="settings-muted">${new Date(backup.exportedAt || Date.now()).toLocaleString('es-CO')}</p>
      <div class="backup-summary">
        ${stores.map(([name, rows]) => `<div><strong>${Array.isArray(rows) ? rows.length : 0}</strong><span>${esc(name)}</span></div>`).join('')}
      </div>
    `;
  }
}

function injectStyles() {
  if (document.getElementById('settings-module-styles')) return;
  const style = document.createElement('style');
  style.id = 'settings-module-styles';
  style.textContent = SETTINGS_STYLES;
  document.head.appendChild(style);
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

export const SettingsModule = new SettingsModuleClass();
export const initSettings = (container) => SettingsModule.init(container);
export default SettingsModule;
