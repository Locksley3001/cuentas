/**
 * ============================================================
 * CRM.JS — Sistema Completo de Gestión de Clientes y Ventas
 * ============================================================
 * Módulo principal del CRM para administrar clientes, leads,
 * prospectos, negocios, seguimientos y pipeline de ventas.
 *
 * Responsabilidades:
 *  - CRUD completo de leads / clientes / prospectos
 *  - Pipeline de ventas con estados visuales
 *  - Seguimientos, reuniones, notas y tareas
 *  - Integración con finance.js (ingresos al cerrar negocio)
 *  - Integración con dashboard.js (métricas, alertas, actividad)
 *  - Integración con tables.js y modal.js
 *  - Persistencia completa en IndexedDB (db.js / storage.js)
 *  - Preparado para history.js, investments.js, settings.js
 *
 * Fase 4 del proyecto /cuentas
 * ============================================================
 */

import { DB }      from '../storage/db.js';
import { Storage } from '../storage/storage.js';
import { renderTable, refreshTable }             from '../components/tables.js';
import { openModal, closeModal, setModalLoading } from '../components/modal.js';
import { registerTransaction, getFinanceSummary } from './finance.js';
import { refreshDashboard, addRecentActivity, updateAlerts } from './dashboard.js';

// ============================================================
// CONSTANTES Y CONFIGURACIÓN
// ============================================================

/** Stores en IndexedDB */
const STORE_LEADS    = 'crm_leads';
const STORE_FOLLOWUP = 'crm_followups';
const STORE_MEETINGS = 'crm_meetings';
const STORE_NOTES    = 'crm_notes';
const STORE_TASKS    = 'crm_tasks';

/** ID del contenedor principal */
const CONTAINER_ID = 'crm-container';

/**
 * Estados del pipeline de ventas.
 * El orden numérico define la posición en el pipeline.
 */
const LEAD_STATUS = {
  NEW         : 'nuevo_lead',
  CONTACTED   : 'contactado',
  MEETING     : 'reunion_agendada',
  PROPOSAL    : 'propuesta_enviada',
  NEGOTIATION : 'negociacion',
  CLOSED      : 'cerrado',
  LOST        : 'perdido',
  FUTURE      : 'seguimiento_futuro',
};

/**
 * Etiquetas y colores para cada estado del pipeline.
 * Se usan para badges visuales en tablas y kanban.
 */
const STATUS_META = {
  [LEAD_STATUS.NEW]        : { label: 'Nuevo Lead',         color: '#6366f1', icon: '🌱' },
  [LEAD_STATUS.CONTACTED]  : { label: 'Contactado',         color: '#3b82f6', icon: '📞' },
  [LEAD_STATUS.MEETING]    : { label: 'Reunión Agendada',   color: '#f59e0b', icon: '📅' },
  [LEAD_STATUS.PROPOSAL]   : { label: 'Propuesta Enviada',  color: '#8b5cf6', icon: '📄' },
  [LEAD_STATUS.NEGOTIATION]: { label: 'Negociación',        color: '#f97316', icon: '🤝' },
  [LEAD_STATUS.CLOSED]     : { label: 'Cerrado',            color: '#22c55e', icon: '✅' },
  [LEAD_STATUS.LOST]       : { label: 'Perdido',            color: '#ef4444', icon: '❌' },
  [LEAD_STATUS.FUTURE]     : { label: 'Seguimiento Futuro', color: '#64748b', icon: '🔁' },
};

/**
 * Servicios que la empresa ofrece.
 * Se usan en el formulario de nuevo lead.
 */
const SERVICES = [
  { id: 'bots_ia',           label: 'Bots IA'                  },
  { id: 'paginas_web',       label: 'Páginas Web'              },
  { id: 'automatizacion',    label: 'Automatización'           },
  { id: 'facturacion',       label: 'Facturación Electrónica'  },
  { id: 'publicidad',        label: 'Publicidad'               },
  { id: 'diseno_grafico',    label: 'Diseño Gráfico'           },
  { id: 'videos',            label: 'Videos'                   },
  { id: 'fotografia',        label: 'Fotografía'               },
  { id: 'software_custom',   label: 'Software Personalizado'   },
  { id: 'otros',             label: 'Otros'                    },
];

/** Tipos de seguimiento */
const FOLLOWUP_TYPE = {
  CALL   : 'llamada',
  EMAIL  : 'correo',
  WHATS  : 'whatsapp',
  VISIT  : 'visita',
  SOCIAL : 'redes_sociales',
  OTHER  : 'otro',
};

/** Prioridades de tareas */
const TASK_PRIORITY = {
  HIGH   : 'alta',
  MEDIUM : 'media',
  LOW    : 'baja',
};

// ============================================================
// ESTADO INTERNO DEL MÓDULO
// ============================================================

/** Cache principal de leads en memoria */
let _leadsCache    = [];
/** Cache de seguimientos indexados por leadId */
let _followupCache = {};
/** Cache de reuniones indexadas por leadId */
let _meetingsCache = {};
/** Cache de notas indexadas por leadId */
let _notesCache    = {};
/** Cache de tareas indexadas por leadId */
let _tasksCache    = {};
/** Vista activa: 'table' | 'kanban' */
let _activeView    = 'table';
/** Filtro de estado activo */
let _activeFilter  = 'all';
/** Término de búsqueda activo */
let _searchTerm    = '';
/** Lead actualmente seleccionado en detalle */
let _selectedLeadId = null;

// ============================================================
// INICIALIZACIÓN DEL MÓDULO
// ============================================================

/**
 * Inicializa el módulo CRM.
 * Llamar desde el router cuando el usuario navega a /crm.
 */
export async function initCRM() {
  try {
    // 1. Garantizar que los stores existan en IndexedDB
    await _ensureStores();

    // 2. Cargar todos los datos en memoria
    await _loadCache();

    // 3. Renderizar la vista principal
    _renderView();

    // 4. Verificar tareas vencidas y disparar alertas
    await _checkOverdueTasks();

    console.log('[CRM] Módulo inicializado correctamente');
  } catch (err) {
    console.error('[CRM] Error al inicializar:', err);
    _showError('No se pudo cargar el módulo CRM.');
  }
}

// ============================================================
// GESTIÓN DE INDEXEDDB
// ============================================================

/**
 * Garantiza que todos los object stores necesarios existen.
 * Delega en db.js que maneja las migraciones de versión.
 */
async function _ensureStores() {
  await DB.ensureStore(STORE_LEADS,    { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_FOLLOWUP, { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_MEETINGS, { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_NOTES,    { keyPath: 'id', autoIncrement: true });
  await DB.ensureStore(STORE_TASKS,    { keyPath: 'id', autoIncrement: true });
}

/**
 * Carga todos los datos desde IndexedDB en las caches en memoria.
 * Indexa seguimientos, reuniones, notas y tareas por leadId para
 * acceso O(1) durante el renderizado.
 */
async function _loadCache() {
  _leadsCache = (await Storage.getAll(STORE_LEADS))    || [];

  const followups = (await Storage.getAll(STORE_FOLLOWUP)) || [];
  const meetings  = (await Storage.getAll(STORE_MEETINGS)) || [];
  const notes     = (await Storage.getAll(STORE_NOTES))    || [];
  const tasks     = (await Storage.getAll(STORE_TASKS))    || [];

  // Indexar por leadId
  _followupCache = _indexById(followups, 'leadId');
  _meetingsCache = _indexById(meetings,  'leadId');
  _notesCache    = _indexById(notes,     'leadId');
  _tasksCache    = _indexById(tasks,     'leadId');
}

/** Agrupa un array de objetos en un mapa { [keyField]: [...items] } */
function _indexById(arr, keyField) {
  return arr.reduce((map, item) => {
    if (!map[item[keyField]]) map[item[keyField]] = [];
    map[item[keyField]].push(item);
    return map;
  }, {});
}

// ============================================================
// CRUD — LEADS / CLIENTES
// ============================================================

/**
 * Crea un nuevo lead y lo persiste en IndexedDB.
 *
 * @param {Object} data — datos del lead (validados con _validateLeadData)
 * @returns {Object} — lead creado con id asignado
 */
export async function createLead(data) {
  _validateLeadData(data);

  const lead = {
    // Datos principales
    name        : data.name.trim(),
    company     : data.company?.trim()  || '',
    phone       : data.phone?.trim()    || '',
    email       : data.email?.trim()    || '',
    city        : data.city?.trim()     || '',
    observations: data.observations?.trim() || '',

    // Redes sociales (objeto con plataformas opcionales)
    social: {
      instagram : data.social?.instagram?.trim() || '',
      facebook  : data.social?.facebook?.trim()  || '',
      linkedin  : data.social?.linkedin?.trim()  || '',
      twitter   : data.social?.twitter?.trim()   || '',
      tiktok    : data.social?.tiktok?.trim()    || '',
    },

    // Pipeline
    status    : data.status   || LEAD_STATUS.NEW,
    services  : Array.isArray(data.services) ? data.services : [],

    // Valor del negocio (opcional, para finanzas)
    dealValue : parseFloat(data.dealValue) || 0,

    // Seguimiento
    nextAction    : data.nextAction?.trim()    || '',
    nextActionDate: data.nextActionDate        || null,

    // Metadatos
    createdAt : new Date().toISOString(),
    updatedAt : new Date().toISOString(),
    closedAt  : null,
  };

  // Guardar en IndexedDB
  const id = await Storage.add(STORE_LEADS, lead);
  lead.id = id;

  // Actualizar cache en memoria
  _leadsCache.push(lead);

  // Inicializar sub-caches para este lead
  _followupCache[id] = [];
  _meetingsCache[id] = [];
  _notesCache[id]    = [];
  _tasksCache[id]    = [];

  // Registrar en historial
  _logAction({
    action     : 'lead_created',
    category   : 'crm',
    description: `Nuevo lead creado: ${lead.name}`,
    meta       : { leadId: id, status: lead.status },
  });

  // Notificar al dashboard
  addRecentActivity({
    type    : 'crm',
    icon    : '🌱',
    text    : `Nuevo lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    date    : lead.createdAt,
  });
  refreshDashboard();

  // Re-renderizar tabla / kanban
  _rerenderList();

  return lead;
}

/**
 * Edita un lead existente.
 *
 * @param {number} leadId — id del lead
 * @param {Object} changes — campos a actualizar
 * @returns {Object} — lead actualizado
 */
export async function editLead(leadId, changes) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);

  const prevStatus = lead.status;

  // Mezclar cambios con el lead existente
  const updated = {
    ...lead,
    ...changes,
    social: { ...lead.social, ...(changes.social || {}) },
    id       : lead.id,
    createdAt: lead.createdAt,
    updatedAt: new Date().toISOString(),
  };

  // Si servicios viene como array, reemplazar; si no, conservar
  if (Array.isArray(changes.services)) updated.services = changes.services;

  // Si se marca como cerrado, registrar fecha de cierre
  if (updated.status === LEAD_STATUS.CLOSED && !updated.closedAt) {
    updated.closedAt = new Date().toISOString();
  }

  // Persistir en IndexedDB
  await Storage.put(STORE_LEADS, updated);

  // Actualizar cache en memoria
  _updateCacheItem(updated);

  // Registrar en historial
  _logAction({
    action     : 'lead_edited',
    category   : 'crm',
    description: `Lead editado: ${updated.name}`,
    meta       : { leadId, prevStatus, newStatus: updated.status },
  });

  // Manejar transición de estado
  await _handleStatusTransition(updated, prevStatus);

  _rerenderList();
  refreshDashboard();

  return updated;
}

/**
 * Elimina un lead y todos sus datos relacionados.
 *
 * @param {number} leadId
 */
export async function deleteLead(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);

  // Eliminar de IndexedDB
  await Storage.delete(STORE_LEADS, leadId);

  // Eliminar registros relacionados en lote
  const relatedStores = [STORE_FOLLOWUP, STORE_MEETINGS, STORE_NOTES, STORE_TASKS];
  for (const store of relatedStores) {
    const items = (await Storage.getAll(store)) || [];
    for (const item of items) {
      if (item.leadId === leadId) {
        await Storage.delete(store, item.id);
      }
    }
  }

  // Limpiar caches en memoria
  _leadsCache = _leadsCache.filter(l => l.id !== leadId);
  delete _followupCache[leadId];
  delete _meetingsCache[leadId];
  delete _notesCache[leadId];
  delete _tasksCache[leadId];

  _logAction({
    action     : 'lead_deleted',
    category   : 'crm',
    description: `Lead eliminado: ${lead.name}`,
    meta       : { leadId },
  });

  _rerenderList();
  refreshDashboard();
}

/**
 * Cambia únicamente el estado de un lead en el pipeline.
 *
 * @param {number} leadId
 * @param {string} newStatus — uno de LEAD_STATUS
 */
export async function changeLeadStatus(leadId, newStatus) {
  if (!Object.values(LEAD_STATUS).includes(newStatus)) {
    throw new Error(`Estado no válido: ${newStatus}`);
  }
  return editLead(leadId, { status: newStatus });
}

// ============================================================
// SEGUIMIENTOS
// ============================================================

/**
 * Registra un seguimiento para un lead.
 *
 * @param {number} leadId
 * @param {Object} data — { type, date, summary, nextDate, nextAction }
 * @returns {Object} — seguimiento creado
 */
export async function addFollowup(leadId, data) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);

  if (!data.summary?.trim()) throw new Error('El resumen del seguimiento es obligatorio');

  const followup = {
    leadId  : leadId,
    type    : data.type    || FOLLOWUP_TYPE.CALL,
    date    : data.date    || new Date().toISOString().split('T')[0],
    summary : data.summary.trim(),
    // Próxima acción sugerida tras este seguimiento
    nextDate  : data.nextDate   || null,
    nextAction: data.nextAction?.trim() || '',
    createdAt : new Date().toISOString(),
  };

  const id = await Storage.add(STORE_FOLLOWUP, followup);
  followup.id = id;

  // Actualizar cache
  if (!_followupCache[leadId]) _followupCache[leadId] = [];
  _followupCache[leadId].push(followup);

  // Actualizar próxima acción en el lead si viene informada
  if (data.nextDate || data.nextAction) {
    await editLead(leadId, {
      nextAction    : data.nextAction || lead.nextAction,
      nextActionDate: data.nextDate   || lead.nextActionDate,
    });
  }

  _logAction({
    action     : 'followup_added',
    category   : 'crm',
    description: `Seguimiento registrado para: ${lead.name}`,
    meta       : { leadId, followupId: id, type: followup.type },
  });

  addRecentActivity({
    type: 'crm',
    icon: '📞',
    text: `Seguimiento con ${lead.name}: ${followup.summary.substring(0, 60)}`,
    date: followup.createdAt,
  });

  return followup;
}

// ============================================================
// REUNIONES
// ============================================================

/**
 * Registra una reunión con un lead.
 *
 * @param {number} leadId
 * @param {Object} data — { date, time, location, summary, outcome }
 * @returns {Object} — reunión creada
 */
export async function addMeeting(leadId, data) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);

  if (!data.date)           throw new Error('La fecha de reunión es obligatoria');
  if (!data.summary?.trim()) throw new Error('El resumen de la reunión es obligatorio');

  const meeting = {
    leadId   : leadId,
    date     : data.date,
    time     : data.time     || '',
    location : data.location?.trim() || '',
    summary  : data.summary.trim(),
    outcome  : data.outcome?.trim()  || '',
    createdAt: new Date().toISOString(),
  };

  const id = await Storage.add(STORE_MEETINGS, meeting);
  meeting.id = id;

  if (!_meetingsCache[leadId]) _meetingsCache[leadId] = [];
  _meetingsCache[leadId].push(meeting);

  // Si hay reunión agendada, avanzar automáticamente el estado
  if (lead.status === LEAD_STATUS.NEW || lead.status === LEAD_STATUS.CONTACTED) {
    await changeLeadStatus(leadId, LEAD_STATUS.MEETING);
  }

  _logAction({
    action     : 'meeting_added',
    category   : 'crm',
    description: `Reunión registrada con: ${lead.name}`,
    meta       : { leadId, meetingId: id, date: meeting.date },
  });

  addRecentActivity({
    type: 'crm',
    icon: '📅',
    text: `Reunión con ${lead.name} — ${_formatDate(meeting.date)}`,
    date: meeting.createdAt,
  });

  return meeting;
}

// ============================================================
// NOTAS
// ============================================================

/**
 * Agrega una nota interna a un lead.
 *
 * @param {number} leadId
 * @param {string} text — contenido de la nota
 * @returns {Object} — nota creada
 */
export async function addNote(leadId, text) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);
  if (!text?.trim())  throw new Error('La nota no puede estar vacía');

  const note = {
    leadId   : leadId,
    text     : text.trim(),
    createdAt: new Date().toISOString(),
  };

  const id = await Storage.add(STORE_NOTES, note);
  note.id = id;

  if (!_notesCache[leadId]) _notesCache[leadId] = [];
  _notesCache[leadId].push(note);

  _logAction({
    action     : 'note_added',
    category   : 'crm',
    description: `Nota añadida para: ${lead.name}`,
    meta       : { leadId, noteId: id },
  });

  return note;
}

// ============================================================
// TAREAS
// ============================================================

/**
 * Agrega una tarea pendiente a un lead.
 *
 * @param {number} leadId
 * @param {Object} data — { title, dueDate, priority }
 * @returns {Object} — tarea creada
 */
export async function addTask(leadId, data) {
  const lead = _getLeadById(leadId);
  if (!lead) throw new Error(`Lead #${leadId} no encontrado`);
  if (!data.title?.trim()) throw new Error('El título de la tarea es obligatorio');

  const task = {
    leadId   : leadId,
    title    : data.title.trim(),
    dueDate  : data.dueDate  || null,
    priority : data.priority || TASK_PRIORITY.MEDIUM,
    done     : false,
    createdAt: new Date().toISOString(),
    doneAt   : null,
  };

  const id = await Storage.add(STORE_TASKS, task);
  task.id = id;

  if (!_tasksCache[leadId]) _tasksCache[leadId] = [];
  _tasksCache[leadId].push(task);

  _logAction({
    action     : 'task_added',
    category   : 'crm',
    description: `Tarea añadida para: ${lead.name} — ${task.title}`,
    meta       : { leadId, taskId: id, dueDate: task.dueDate },
  });

  updateAlerts();

  return task;
}

/**
 * Marca una tarea como completada o pendiente.
 *
 * @param {number} leadId
 * @param {number} taskId
 * @param {boolean} done
 */
export async function toggleTask(leadId, taskId, done) {
  const tasks = _tasksCache[leadId] || [];
  const task  = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Tarea #${taskId} no encontrada`);

  task.done   = done;
  task.doneAt = done ? new Date().toISOString() : null;

  await Storage.put(STORE_TASKS, task);

  _logAction({
    action     : done ? 'task_completed' : 'task_reopened',
    category   : 'crm',
    description: `Tarea ${done ? 'completada' : 'reabierta'}: ${task.title}`,
    meta       : { leadId, taskId },
  });

  updateAlerts();
}

// ============================================================
// INTEGRACIÓN CON FINANCE.JS
// ============================================================

/**
 * Cuando un lead pasa al estado CLOSED con un dealValue > 0,
 * genera automáticamente un ingreso en finance.js.
 *
 * @param {Object} lead
 * @param {string} prevStatus
 */
async function _handleStatusTransition(lead, prevStatus) {
  const closingStatuses = [LEAD_STATUS.CLOSED];
  const wasAlreadyClosed = closingStatuses.includes(prevStatus);
  const isNowClosed      = closingStatuses.includes(lead.status);

  // Solo actuar cuando se pasa a Cerrado por primera vez
  if (isNowClosed && !wasAlreadyClosed && lead.dealValue > 0) {
    try {
      await registerTransaction({
        type       : 'income',
        amount     : lead.dealValue,
        category   : 'crm_deal',
        description: `Negocio cerrado — ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
        date       : new Date().toISOString().split('T')[0],
        meta       : {
          leadId  : lead.id,
          services: lead.services,
          source  : 'crm',
        },
      });

      _showToast(
        `💰 Ingreso de ${_formatCurrency(lead.dealValue)} registrado en Finanzas`,
        'success'
      );

      addRecentActivity({
        type: 'finance',
        icon: '💰',
        text: `Negocio cerrado: ${lead.name} — ${_formatCurrency(lead.dealValue)}`,
        date: new Date().toISOString(),
      });

      _logAction({
        action     : 'deal_income_registered',
        category   : 'crm',
        amount     : lead.dealValue,
        description: `Ingreso generado por cierre de negocio con ${lead.name}`,
        meta       : { leadId: lead.id },
      });
    } catch (err) {
      console.error('[CRM] Error al registrar ingreso en finance.js:', err);
      _showToast('No se pudo registrar el ingreso automáticamente', 'error');
    }
  }
}

// ============================================================
// ESTADÍSTICAS DEL CRM
// ============================================================

/**
 * Calcula estadísticas generales del CRM para el dashboard.
 *
 * @returns {Object} — métricas consolidadas
 */
export function getCRMStats() {
  const total       = _leadsCache.length;
  const byStatus    = {};
  let totalValue    = 0;
  let closedValue   = 0;
  let pendingTasks  = 0;

  for (const status of Object.values(LEAD_STATUS)) {
    byStatus[status] = 0;
  }

  for (const lead of _leadsCache) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
    totalValue += lead.dealValue || 0;

    if (lead.status === LEAD_STATUS.CLOSED) {
      closedValue += lead.dealValue || 0;
    }
  }

  // Contar tareas pendientes de todos los leads
  for (const tasks of Object.values(_tasksCache)) {
    pendingTasks += (tasks || []).filter(t => !t.done).length;
  }

  return {
    total,
    byStatus,
    totalValue   : _round(totalValue),
    closedValue  : _round(closedValue),
    pendingTasks,
    activeLeads  : byStatus[LEAD_STATUS.NEW]
                 + byStatus[LEAD_STATUS.CONTACTED]
                 + byStatus[LEAD_STATUS.MEETING]
                 + byStatus[LEAD_STATUS.PROPOSAL]
                 + byStatus[LEAD_STATUS.NEGOTIATION],
    conversionRate: total > 0
      ? _round((byStatus[LEAD_STATUS.CLOSED] / total) * 100)
      : 0,
  };
}

/**
 * Retorna los N leads más recientes para el widget del dashboard.
 *
 * @param {number} limit
 * @returns {Array}
 */
export function getRecentLeads(limit = 5) {
  return [..._leadsCache]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

/**
 * Retorna las tareas pendientes más urgentes (por fecha límite).
 *
 * @param {number} limit
 * @returns {Array}
 */
export function getPendingTasks(limit = 10) {
  const all = [];
  for (const [leadId, tasks] of Object.entries(_tasksCache)) {
    const lead = _getLeadById(Number(leadId));
    for (const task of (tasks || [])) {
      if (!task.done) {
        all.push({ ...task, leadName: lead?.name || '—' });
      }
    }
  }
  // Ordenar: primero las con fecha más próxima, luego sin fecha
  return all
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    })
    .slice(0, limit);
}

// ============================================================
// RENDERIZADO DE LA VISTA PRINCIPAL
// ============================================================

/**
 * Construye y renderiza la vista completa del CRM
 * en el contenedor principal (#crm-container).
 */
function _renderView() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  const stats = getCRMStats();

  container.innerHTML = `
    <!-- ── Cabecera del módulo ─────────────────────────────── -->
    <div class="module-header">
      <div class="module-title-group">
        <h2 class="module-title">CRM</h2>
        <span class="module-subtitle">Gestión de Clientes y Ventas</span>
      </div>
      <div class="module-actions">
        <button class="btn btn-ghost crm-view-toggle" id="crm-toggle-view" title="Cambiar vista">
          ${_activeView === 'table' ? '⬛ Kanban' : '☰ Tabla'}
        </button>
        <button class="btn btn-primary" id="btn-new-lead">
          + Nuevo Lead
        </button>
      </div>
    </div>

    <!-- ── Tarjetas de estadísticas ───────────────────────── -->
    <div class="stats-grid crm-stats-grid">
      ${_renderStatCard('Total Leads',       stats.total,           '👥')}
      ${_renderStatCard('Leads Activos',     stats.activeLeads,     '🔥')}
      ${_renderStatCard('Cerrados',          stats.byStatus[LEAD_STATUS.CLOSED], '✅')}
      ${_renderStatCard('Tareas Pendientes', stats.pendingTasks,    '📋')}
      ${_renderStatCard('Valor Total',       _formatCurrency(stats.totalValue),  '💼')}
      ${_renderStatCard('Ingresos CRM',      _formatCurrency(stats.closedValue), '💰')}
      ${_renderStatCard('Conversión',        stats.conversionRate + '%',          '📈')}
    </div>

    <!-- ── Pipeline visual (barra de estados) ──────────────── -->
    <div class="crm-pipeline-bar">
      ${Object.entries(STATUS_META).map(([key, meta]) => {
        const count = stats.byStatus[key] || 0;
        return `
          <div class="pipeline-stage ${_activeFilter === key ? 'active' : ''}"
               data-filter="${key}">
            <span class="pipeline-icon">${meta.icon}</span>
            <span class="pipeline-label">${meta.label}</span>
            <span class="pipeline-count" style="background:${meta.color}">${count}</span>
          </div>
        `;
      }).join('')}
      <div class="pipeline-stage ${_activeFilter === 'all' ? 'active' : ''}"
           data-filter="all">
        <span class="pipeline-icon">🔍</span>
        <span class="pipeline-label">Todos</span>
        <span class="pipeline-count">${stats.total}</span>
      </div>
    </div>

    <!-- ── Barra de búsqueda ──────────────────────────────── -->
    <div class="table-toolbar">
      <div class="search-wrapper">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          id="crm-search"
          class="search-input"
          placeholder="Buscar por nombre, empresa, ciudad…"
          value="${_esc(_searchTerm)}"
        />
      </div>
    </div>

    <!-- ── Contenido principal (tabla o kanban) ────────────── -->
    <div id="crm-content-area">
      ${_activeView === 'table' ? _renderTable() : _renderKanban()}
    </div>
  `;

  // Vincular eventos
  _bindViewEvents();
}

/**
 * Re-renderiza solo la lista/tabla sin reconstruir toda la vista.
 * Más eficiente para actualizaciones parciales.
 */
function _rerenderList() {
  const area = document.getElementById('crm-content-area');
  if (!area) {
    _renderView();
    return;
  }
  area.innerHTML = _activeView === 'table' ? _renderTable() : _renderKanban();
  _bindListEvents();
  _updateStatsDisplay();
}

/** Actualiza los contadores de estadísticas sin re-renderizar toda la vista */
function _updateStatsDisplay() {
  const stats = getCRMStats();
  const grid  = document.querySelector('.crm-stats-grid');
  if (!grid) return;
  grid.innerHTML = `
    ${_renderStatCard('Total Leads',       stats.total,           '👥')}
    ${_renderStatCard('Leads Activos',     stats.activeLeads,     '🔥')}
    ${_renderStatCard('Cerrados',          stats.byStatus[LEAD_STATUS.CLOSED], '✅')}
    ${_renderStatCard('Tareas Pendientes', stats.pendingTasks,    '📋')}
    ${_renderStatCard('Valor Total',       _formatCurrency(stats.totalValue),  '💼')}
    ${_renderStatCard('Ingresos CRM',      _formatCurrency(stats.closedValue), '💰')}
    ${_renderStatCard('Conversión',        stats.conversionRate + '%',          '📈')}
  `;
}

/** HTML de una tarjeta de estadística */
function _renderStatCard(label, value, icon) {
  return `
    <div class="stat-card">
      <div class="stat-icon">${icon}</div>
      <div class="stat-info">
        <span class="stat-value">${value}</span>
        <span class="stat-label">${label}</span>
      </div>
    </div>
  `;
}

// ============================================================
// VISTA TABLA
// ============================================================

/** Genera el HTML de la tabla de leads usando tables.js */
function _renderTable() {
  const filtered = _getFilteredLeads();

  if (filtered.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🌱</div>
        <h3>No hay leads</h3>
        <p>${_activeFilter !== 'all'
          ? 'No hay leads en este estado. Prueba otro filtro.'
          : 'Comienza agregando tu primer lead con el botón "Nuevo Lead".'
        }</p>
      </div>
    `;
  }

  const columns = [
    { key: 'name',       label: 'Nombre',   sortable: true },
    { key: 'company',    label: 'Empresa',  sortable: true },
    { key: 'phone',      label: 'Teléfono', sortable: false },
    { key: 'services',   label: 'Servicios', sortable: false },
    { key: 'status',     label: 'Estado',   sortable: true },
    { key: 'dealValue',  label: 'Valor',    sortable: true },
    { key: 'nextActionDate', label: 'Próx. Acción', sortable: true },
    { key: 'actions',    label: '',         sortable: false },
  ];

  const rows = filtered.map(lead => ({
    id      : lead.id,
    name    : `<span class="lead-name" data-detail="${lead.id}">${_esc(lead.name)}</span>`,
    company : _esc(lead.company) || '—',
    phone   : lead.phone
      ? `<a href="tel:${_esc(lead.phone)}" class="link-subtle">${_esc(lead.phone)}</a>`
      : '—',
    services: _renderServicesTags(lead.services),
    status  : _renderStatusBadge(lead.status),
    dealValue: lead.dealValue > 0
      ? `<span class="deal-value">${_formatCurrency(lead.dealValue)}</span>`
      : '—',
    nextActionDate: lead.nextActionDate
      ? `<span class="${_isOverdue(lead.nextActionDate) ? 'overdue-date' : ''}">${_formatDate(lead.nextActionDate)}</span>`
      : '—',
    actions : _renderRowActions(lead.id),
  }));

  return renderTable({
    id      : 'crm-leads-table',
    columns,
    rows,
    striped : true,
    hover   : true,
    responsive: true,
  });
}

/** Genera badges de servicios */
function _renderServicesTags(services = []) {
  if (!services.length) return '<span class="text-muted">—</span>';
  const visible = services.slice(0, 2);
  const rest    = services.length - 2;
  const tags    = visible.map(s => {
    const svc = SERVICES.find(x => x.id === s);
    return `<span class="service-tag">${svc?.label || s}</span>`;
  }).join('');
  return tags + (rest > 0 ? `<span class="service-tag more">+${rest}</span>` : '');
}

/** Badge visual de estado */
function _renderStatusBadge(status) {
  const meta = STATUS_META[status] || { label: status, color: '#64748b', icon: '•' };
  return `
    <span class="status-badge" style="--badge-color:${meta.color}">
      ${meta.icon} ${meta.label}
    </span>
  `;
}

/** Botones de acción por fila */
function _renderRowActions(leadId) {
  return `
    <div class="row-actions">
      <button class="btn-action" data-action="detail"   data-id="${leadId}" title="Ver detalle">👁</button>
      <button class="btn-action" data-action="followup" data-id="${leadId}" title="Seguimiento">📞</button>
      <button class="btn-action" data-action="edit"     data-id="${leadId}" title="Editar">✏️</button>
      <button class="btn-action btn-action-danger" data-action="delete" data-id="${leadId}" title="Eliminar">🗑</button>
    </div>
  `;
}

// ============================================================
// VISTA KANBAN
// ============================================================

/** Genera el HTML del tablero Kanban por estados */
function _renderKanban() {
  const filtered = _getFilteredLeads();

  // Agrupar por estado
  const grouped = {};
  for (const s of Object.values(LEAD_STATUS)) grouped[s] = [];
  for (const lead of filtered) {
    if (grouped[lead.status]) grouped[lead.status].push(lead);
  }

  const columns = Object.entries(LEAD_STATUS).map(([, statusKey]) => {
    const meta  = STATUS_META[statusKey];
    const leads = grouped[statusKey];
    return `
      <div class="kanban-column" data-status="${statusKey}">
        <div class="kanban-column-header" style="border-top-color:${meta.color}">
          <span>${meta.icon} ${meta.label}</span>
          <span class="kanban-count">${leads.length}</span>
        </div>
        <div class="kanban-cards">
          ${leads.map(l => _renderKanbanCard(l)).join('')}
          ${leads.length === 0
            ? `<div class="kanban-empty">Sin leads</div>`
            : ''
          }
        </div>
      </div>
    `;
  }).join('');

  return `<div class="kanban-board">${columns}</div>`;
}

/** Tarjeta individual del Kanban */
function _renderKanbanCard(lead) {
  const tasksPending = (_tasksCache[lead.id] || []).filter(t => !t.done).length;
  const followups    = (_followupCache[lead.id] || []).length;

  return `
    <div class="kanban-card" data-id="${lead.id}">
      <div class="kanban-card-header">
        <strong class="kanban-name">${_esc(lead.name)}</strong>
        ${lead.company ? `<span class="kanban-company">${_esc(lead.company)}</span>` : ''}
      </div>
      ${lead.services.length
        ? `<div class="kanban-services">${_renderServicesTags(lead.services)}</div>`
        : ''
      }
      <div class="kanban-card-footer">
        ${lead.dealValue > 0
          ? `<span class="kanban-value">${_formatCurrency(lead.dealValue)}</span>`
          : ''
        }
        <div class="kanban-meta">
          ${tasksPending > 0 ? `<span title="Tareas pendientes">📋 ${tasksPending}</span>` : ''}
          ${followups    > 0 ? `<span title="Seguimientos">📞 ${followups}</span>` : ''}
        </div>
        <div class="kanban-actions">
          <button class="btn-action" data-action="detail"   data-id="${lead.id}" title="Ver">👁</button>
          <button class="btn-action" data-action="followup" data-id="${lead.id}" title="Seguimiento">📞</button>
          <button class="btn-action" data-action="edit"     data-id="${lead.id}" title="Editar">✏️</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MODALES — CREAR / EDITAR LEAD
// ============================================================

/**
 * Abre el modal para crear un nuevo lead.
 */
export function openModalNewLead() {
  openModal({
    id      : 'modal-crm-lead',
    title   : 'Nuevo Lead',
    size    : 'large',
    content : _buildLeadForm(null),
    footer  : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-lead">Guardar Lead</button>
    `,
    onOpen: () => {
      document.getElementById('btn-submit-lead')
        ?.addEventListener('click', _submitLeadForm);
    },
  });
}

/**
 * Abre el modal para editar un lead existente.
 *
 * @param {number} leadId
 */
export function openModalEditLead(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) return;

  openModal({
    id     : 'modal-crm-lead',
    title  : 'Editar Lead',
    size   : 'large',
    content: _buildLeadForm(lead),
    footer : `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-lead">Guardar Cambios</button>
    `,
    onOpen: () => {
      document.getElementById('btn-submit-lead')
        ?.addEventListener('click', () => _submitLeadForm(leadId));
    },
  });
}

/**
 * Construye el HTML del formulario de lead.
 * Si se pasa un lead, lo pre-rellena para edición.
 *
 * @param {Object|null} lead — null para creación, objeto para edición
 * @returns {string} — HTML del formulario
 */
function _buildLeadForm(lead) {
  const s = lead || {};
  const social = s.social || {};

  const servicesHTML = SERVICES.map(svc => `
    <label class="checkbox-label service-checkbox">
      <input type="checkbox" name="services" value="${svc.id}"
        ${(s.services || []).includes(svc.id) ? 'checked' : ''}>
      ${svc.label}
    </label>
  `).join('');

  const statusOptions = Object.entries(STATUS_META).map(([key, meta]) => `
    <option value="${key}" ${s.status === key ? 'selected' : ''}>${meta.icon} ${meta.label}</option>
  `).join('');

  return `
    <div class="form-grid form-grid-2">
      <!-- Datos principales -->
      <div class="form-group">
        <label class="form-label required">Nombre</label>
        <input id="l-name" class="form-control" type="text" maxlength="100"
          placeholder="Nombre completo" value="${_esc(s.name || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Empresa</label>
        <input id="l-company" class="form-control" type="text" maxlength="100"
          placeholder="Nombre de la empresa" value="${_esc(s.company || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Teléfono / WhatsApp</label>
        <input id="l-phone" class="form-control" type="tel"
          placeholder="+57 300 000 0000" value="${_esc(s.phone || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Correo electrónico</label>
        <input id="l-email" class="form-control" type="email"
          placeholder="correo@empresa.com" value="${_esc(s.email || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Ciudad</label>
        <input id="l-city" class="form-control" type="text"
          placeholder="Ciudad (opcional)" value="${_esc(s.city || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Estado del Pipeline</label>
        <select id="l-status" class="form-control form-select">
          ${statusOptions}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Valor del negocio (COP)</label>
        <input id="l-deal-value" class="form-control" type="number" min="0"
          placeholder="0" value="${s.dealValue || ''}">
      </div>

      <div class="form-group">
        <label class="form-label">Próxima acción</label>
        <input id="l-next-action" class="form-control" type="text" maxlength="200"
          placeholder="Ej: Llamar para confirmar propuesta"
          value="${_esc(s.nextAction || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">Fecha próxima acción</label>
        <input id="l-next-date" class="form-control" type="date"
          value="${s.nextActionDate || ''}">
      </div>
    </div>

    <!-- Redes sociales -->
    <div class="form-section-title">Redes Sociales</div>
    <div class="form-grid form-grid-3">
      <div class="form-group">
        <label class="form-label">Instagram</label>
        <input id="l-instagram" class="form-control" type="text"
          placeholder="@usuario" value="${_esc(social.instagram || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Facebook</label>
        <input id="l-facebook" class="form-control" type="text"
          placeholder="@usuario" value="${_esc(social.facebook || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">LinkedIn</label>
        <input id="l-linkedin" class="form-control" type="text"
          placeholder="linkedin.com/in/..." value="${_esc(social.linkedin || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Twitter / X</label>
        <input id="l-twitter" class="form-control" type="text"
          placeholder="@usuario" value="${_esc(social.twitter || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">TikTok</label>
        <input id="l-tiktok" class="form-control" type="text"
          placeholder="@usuario" value="${_esc(social.tiktok || '')}">
      </div>
    </div>

    <!-- Servicios de interés -->
    <div class="form-section-title">Servicios de Interés</div>
    <div class="services-grid">
      ${servicesHTML}
    </div>

    <!-- Observaciones -->
    <div class="form-group mt-16">
      <label class="form-label">Observaciones</label>
      <textarea id="l-observations" class="form-control" rows="3"
        placeholder="Notas adicionales sobre el lead…">${_esc(s.observations || '')}</textarea>
    </div>
  `;
}

/** Handler del submit del formulario de lead */
async function _submitLeadForm(leadId = null) {
  const name = document.getElementById('l-name')?.value?.trim();
  if (!name) return _showFieldError('l-name', 'El nombre es obligatorio');

  const selectedServices = Array.from(
    document.querySelectorAll('input[name="services"]:checked')
  ).map(cb => cb.value);

  const data = {
    name        : name,
    company     : document.getElementById('l-company')?.value,
    phone       : document.getElementById('l-phone')?.value,
    email       : document.getElementById('l-email')?.value,
    city        : document.getElementById('l-city')?.value,
    status      : document.getElementById('l-status')?.value,
    dealValue   : document.getElementById('l-deal-value')?.value,
    nextAction  : document.getElementById('l-next-action')?.value,
    nextActionDate: document.getElementById('l-next-date')?.value || null,
    observations: document.getElementById('l-observations')?.value,
    services    : selectedServices,
    social      : {
      instagram: document.getElementById('l-instagram')?.value,
      facebook : document.getElementById('l-facebook')?.value,
      linkedin : document.getElementById('l-linkedin')?.value,
      twitter  : document.getElementById('l-twitter')?.value,
      tiktok   : document.getElementById('l-tiktok')?.value,
    },
  };

  const btn = document.getElementById('btn-submit-lead');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    if (leadId) {
      await editLead(leadId, data);
      closeModal('modal-crm-lead');
      _showToast('Lead actualizado ✅');
    } else {
      await createLead(data);
      closeModal('modal-crm-lead');
      _showToast('Lead creado correctamente 🌱');
    }
  } catch (err) {
    console.error('[CRM] Error al guardar lead:', err);
    _showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = leadId ? 'Guardar Cambios' : 'Guardar Lead'; }
  }
}

// ============================================================
// MODALES — SEGUIMIENTO
// ============================================================

/**
 * Abre el modal para registrar un seguimiento a un lead.
 *
 * @param {number} leadId
 */
export function openModalFollowup(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) return;

  const typeOptions = Object.entries(FOLLOWUP_TYPE).map(([, v]) =>
    `<option value="${v}">${_capitalize(v.replace('_', ' '))}</option>`
  ).join('');

  openModal({
    id     : 'modal-crm-followup',
    title  : `Seguimiento — ${_esc(lead.name)}`,
    size   : 'medium',
    content: `
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Tipo de contacto</label>
          <select id="f-type" class="form-control">
            ${typeOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input id="f-date" class="form-control" type="date"
            value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label required">Resumen del contacto</label>
        <textarea id="f-summary" class="form-control" rows="3"
          placeholder="¿Qué se habló? ¿Qué respondió el cliente?"></textarea>
      </div>
      <div class="form-section-title">Próxima Acción</div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Acción a realizar</label>
          <input id="f-next-action" class="form-control" type="text"
            placeholder="Ej: Enviar propuesta"
            value="${_esc(lead.nextAction || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha límite</label>
          <input id="f-next-date" class="form-control" type="date"
            value="${lead.nextActionDate || ''}">
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-followup">Registrar Seguimiento</button>
    `,
    onOpen: () => {
      document.getElementById('btn-submit-followup')
        ?.addEventListener('click', () => _submitFollowup(leadId));
    },
  });
}

async function _submitFollowup(leadId) {
  const summary = document.getElementById('f-summary')?.value?.trim();
  if (!summary) return _showFieldError('f-summary', 'Escribe el resumen del contacto');

  const btn = document.getElementById('btn-submit-followup');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await addFollowup(leadId, {
      type      : document.getElementById('f-type')?.value,
      date      : document.getElementById('f-date')?.value,
      summary,
      nextAction: document.getElementById('f-next-action')?.value,
      nextDate  : document.getElementById('f-next-date')?.value || null,
    });
    closeModal('modal-crm-followup');
    _showToast('Seguimiento registrado 📞');
  } catch (err) {
    _showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar Seguimiento'; }
  }
}

// ============================================================
// MODALES — DETALLE DEL LEAD (historial completo)
// ============================================================

/**
 * Abre el modal de detalle completo de un lead con todo su historial.
 *
 * @param {number} leadId
 */
export function openModalLeadDetail(leadId) {
  const lead     = _getLeadById(leadId);
  if (!lead) return;

  const followups = (_followupCache[leadId] || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const meetings  = (_meetingsCache[leadId] || [])
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const notes     = (_notesCache[leadId] || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const tasks     = (_tasksCache[leadId]  || [])
    .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));

  const meta = STATUS_META[lead.status] || {};

  openModal({
    id     : 'modal-crm-detail',
    title  : `${_esc(lead.name)}${lead.company ? ` · ${_esc(lead.company)}` : ''}`,
    size   : 'xlarge',
    content: `
      <!-- ── Info principal ────────────────────────────────── -->
      <div class="detail-header">
        <div class="detail-status">
          ${_renderStatusBadge(lead.status)}
        </div>
        ${lead.dealValue > 0 ? `<div class="detail-value">${_formatCurrency(lead.dealValue)}</div>` : ''}
        <div class="detail-controls">
          <select id="detail-status-select" class="form-control form-control-sm">
            ${Object.entries(STATUS_META).map(([k, m]) =>
              `<option value="${k}" ${lead.status === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`
            ).join('')}
          </select>
          <button class="btn btn-sm btn-primary" id="btn-change-status">Cambiar Estado</button>
        </div>
      </div>

      <!-- Contacto -->
      <div class="detail-contact-row">
        ${lead.phone  ? `<a href="tel:${_esc(lead.phone)}"  class="contact-chip">📞 ${_esc(lead.phone)}</a>`  : ''}
        ${lead.email  ? `<a href="mailto:${_esc(lead.email)}" class="contact-chip">✉️ ${_esc(lead.email)}</a>` : ''}
        ${lead.city   ? `<span class="contact-chip">📍 ${_esc(lead.city)}</span>` : ''}
        ${lead.social?.instagram ? `<a href="https://instagram.com/${_esc(lead.social.instagram)}" target="_blank" class="contact-chip">📸 ${_esc(lead.social.instagram)}</a>` : ''}
        ${lead.social?.linkedin  ? `<a href="${_esc(lead.social.linkedin)}" target="_blank" class="contact-chip">💼 LinkedIn</a>` : ''}
      </div>

      ${lead.services.length ? `
        <div class="detail-services">
          ${_renderServicesTags(lead.services)}
        </div>
      ` : ''}

      ${lead.observations ? `
        <div class="detail-observations">
          <strong>Observaciones:</strong> ${_esc(lead.observations)}
        </div>
      ` : ''}

      ${lead.nextAction ? `
        <div class="detail-next-action ${_isOverdue(lead.nextActionDate) ? 'overdue' : ''}">
          📌 <strong>Próxima acción:</strong> ${_esc(lead.nextAction)}
          ${lead.nextActionDate ? ` — ${_formatDate(lead.nextActionDate)}` : ''}
        </div>
      ` : ''}

      <!-- ── Tabs de historial ──────────────────────────────── -->
      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="followups">
          📞 Seguimientos <span class="tab-count">${followups.length}</span>
        </button>
        <button class="detail-tab" data-tab="meetings">
          📅 Reuniones <span class="tab-count">${meetings.length}</span>
        </button>
        <button class="detail-tab" data-tab="tasks">
          📋 Tareas <span class="tab-count">${tasks.filter(t => !t.done).length}</span>
        </button>
        <button class="detail-tab" data-tab="notes">
          📝 Notas <span class="tab-count">${notes.length}</span>
        </button>
      </div>

      <div class="detail-tab-content">
        <!-- Seguimientos -->
        <div class="tab-panel active" id="tab-followups">
          <div class="panel-actions">
            <button class="btn btn-sm btn-primary" id="btn-add-followup-detail">+ Seguimiento</button>
          </div>
          <div class="timeline">
            ${followups.length
              ? followups.map(f => `
                <div class="timeline-item">
                  <div class="timeline-dot"></div>
                  <div class="timeline-body">
                    <div class="timeline-meta">
                      <span>${_capitalize(f.type)}</span>
                      <span>${_formatDate(f.date)}</span>
                    </div>
                    <p class="timeline-text">${_esc(f.summary)}</p>
                    ${f.nextAction ? `<p class="timeline-next">➡ ${_esc(f.nextAction)}</p>` : ''}
                  </div>
                </div>
              `).join('')
              : '<p class="empty-panel">Sin seguimientos registrados.</p>'
            }
          </div>
        </div>

        <!-- Reuniones -->
        <div class="tab-panel" id="tab-meetings">
          <div class="panel-actions">
            <button class="btn btn-sm btn-primary" id="btn-add-meeting-detail">+ Reunión</button>
          </div>
          <div class="timeline">
            ${meetings.length
              ? meetings.map(m => `
                <div class="timeline-item">
                  <div class="timeline-dot meeting-dot"></div>
                  <div class="timeline-body">
                    <div class="timeline-meta">
                      <span>📅 ${_formatDate(m.date)}${m.time ? ` ${m.time}` : ''}</span>
                      ${m.location ? `<span>📍 ${_esc(m.location)}</span>` : ''}
                    </div>
                    <p class="timeline-text">${_esc(m.summary)}</p>
                    ${m.outcome ? `<p class="timeline-outcome">Resultado: ${_esc(m.outcome)}</p>` : ''}
                  </div>
                </div>
              `).join('')
              : '<p class="empty-panel">Sin reuniones registradas.</p>'
            }
          </div>
        </div>

        <!-- Tareas -->
        <div class="tab-panel" id="tab-tasks">
          <div class="panel-actions">
            <button class="btn btn-sm btn-primary" id="btn-add-task-detail">+ Tarea</button>
          </div>
          <div class="tasks-list">
            ${tasks.length
              ? tasks.map(t => `
                <div class="task-item ${t.done ? 'task-done' : ''}">
                  <input type="checkbox" class="task-check"
                    data-task-id="${t.id}" data-lead-id="${leadId}"
                    ${t.done ? 'checked' : ''}>
                  <div class="task-body">
                    <span class="task-title">${_esc(t.title)}</span>
                    ${t.dueDate ? `<span class="task-due ${_isOverdue(t.dueDate) && !t.done ? 'overdue-date' : ''}">${_formatDate(t.dueDate)}</span>` : ''}
                  </div>
                  <span class="priority-badge priority-${t.priority}">${_capitalize(t.priority)}</span>
                </div>
              `).join('')
              : '<p class="empty-panel">Sin tareas pendientes.</p>'
            }
          </div>
        </div>

        <!-- Notas -->
        <div class="tab-panel" id="tab-notes">
          <div class="panel-actions">
            <div class="note-quick-input">
              <input id="note-quick-text" class="form-control" type="text"
                placeholder="Escribe una nota rápida…">
              <button class="btn btn-sm btn-primary" id="btn-add-note-detail">Agregar</button>
            </div>
          </div>
          <div class="notes-list">
            ${notes.length
              ? notes.map(n => `
                <div class="note-item">
                  <p class="note-text">${_esc(n.text)}</p>
                  <span class="note-date">${_formatDateTime(n.createdAt)}</span>
                </div>
              `).join('')
              : '<p class="empty-panel">Sin notas registradas.</p>'
            }
          </div>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close-modal>Cerrar</button>
      <button class="btn btn-secondary" id="btn-edit-from-detail">Editar Lead</button>
    `,
    onOpen: () => _bindDetailModalEvents(leadId),
  });
}

/** Vincula todos los eventos del modal de detalle */
function _bindDetailModalEvents(leadId) {
  // Tabs
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      if (panel) panel.classList.add('active');
    });
  });

  // Cambiar estado
  document.getElementById('btn-change-status')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('detail-status-select')?.value;
    if (!newStatus) return;
    try {
      await changeLeadStatus(leadId, newStatus);
      closeModal('modal-crm-detail');
      _showToast('Estado actualizado');
      openModalLeadDetail(leadId); // Reabrir con datos frescos
    } catch (err) {
      _showToast(err.message, 'error');
    }
  });

  // Botones de acción dentro del modal
  document.getElementById('btn-add-followup-detail')?.addEventListener('click', () => {
    closeModal('modal-crm-detail');
    openModalFollowup(leadId);
  });

  document.getElementById('btn-add-meeting-detail')?.addEventListener('click', () => {
    closeModal('modal-crm-detail');
    openModalMeeting(leadId);
  });

  document.getElementById('btn-add-task-detail')?.addEventListener('click', () => {
    closeModal('modal-crm-detail');
    openModalTask(leadId);
  });

  document.getElementById('btn-add-note-detail')?.addEventListener('click', async () => {
    const text = document.getElementById('note-quick-text')?.value?.trim();
    if (!text) return;
    await addNote(leadId, text);
    closeModal('modal-crm-detail');
    _showToast('Nota agregada 📝');
    openModalLeadDetail(leadId); // Refrescar
  });

  document.getElementById('btn-edit-from-detail')?.addEventListener('click', () => {
    closeModal('modal-crm-detail');
    openModalEditLead(leadId);
  });

  // Checkboxes de tareas
  document.querySelectorAll('.task-check').forEach(cb => {
    cb.addEventListener('change', async (e) => {
      const tid = Number(e.target.dataset.taskId);
      const lid = Number(e.target.dataset.leadId);
      await toggleTask(lid, tid, e.target.checked);
      // Actualizar visual sin cerrar modal
      const item = e.target.closest('.task-item');
      if (item) item.classList.toggle('task-done', e.target.checked);
    });
  });
}

// ============================================================
// MODAL — REUNIÓN
// ============================================================

export function openModalMeeting(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) return;

  openModal({
    id     : 'modal-crm-meeting',
    title  : `Nueva Reunión — ${_esc(lead.name)}`,
    size   : 'medium',
    content: `
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label required">Fecha</label>
          <input id="m-date" class="form-control" type="date"
            value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">Hora</label>
          <input id="m-time" class="form-control" type="time">
        </div>
        <div class="form-group form-col-2">
          <label class="form-label">Lugar / Plataforma</label>
          <input id="m-location" class="form-control" type="text"
            placeholder="Ej: Oficina, Zoom, Meet…">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label required">Resumen / Agenda</label>
        <textarea id="m-summary" class="form-control" rows="3"
          placeholder="¿De qué se tratará / trató la reunión?"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Resultado / Acuerdos</label>
        <textarea id="m-outcome" class="form-control" rows="2"
          placeholder="Qué se acordó, próximos pasos…"></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-meeting">Registrar Reunión</button>
    `,
    onOpen: () => {
      document.getElementById('btn-submit-meeting')
        ?.addEventListener('click', async () => {
          const summary = document.getElementById('m-summary')?.value?.trim();
          if (!summary) return _showFieldError('m-summary', 'El resumen es obligatorio');
          const btn = document.getElementById('btn-submit-meeting');
          if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
          try {
            await addMeeting(leadId, {
              date    : document.getElementById('m-date')?.value,
              time    : document.getElementById('m-time')?.value,
              location: document.getElementById('m-location')?.value,
              summary,
              outcome : document.getElementById('m-outcome')?.value,
            });
            closeModal('modal-crm-meeting');
            _showToast('Reunión registrada 📅');
          } catch (err) {
            _showToast(`Error: ${err.message}`, 'error');
          } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Registrar Reunión'; }
          }
        });
    },
  });
}

// ============================================================
// MODAL — TAREA
// ============================================================

export function openModalTask(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) return;

  const priorityOptions = Object.entries(TASK_PRIORITY).map(([, v]) =>
    `<option value="${v}">${_capitalize(v)}</option>`
  ).join('');

  openModal({
    id     : 'modal-crm-task',
    title  : `Nueva Tarea — ${_esc(lead.name)}`,
    size   : 'small',
    content: `
      <div class="form-group">
        <label class="form-label required">Título de la tarea</label>
        <input id="t-title" class="form-control" type="text" maxlength="200"
          placeholder="Ej: Enviar propuesta comercial">
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Fecha límite</label>
          <input id="t-due" class="form-control" type="date">
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select id="t-priority" class="form-control">
            ${priorityOptions}
          </select>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-ghost" data-close-modal>Cancelar</button>
      <button class="btn btn-primary" id="btn-submit-task">Agregar Tarea</button>
    `,
    onOpen: () => {
      document.getElementById('btn-submit-task')
        ?.addEventListener('click', async () => {
          const title = document.getElementById('t-title')?.value?.trim();
          if (!title) return _showFieldError('t-title', 'El título es obligatorio');
          const btn = document.getElementById('btn-submit-task');
          if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
          try {
            await addTask(leadId, {
              title,
              dueDate : document.getElementById('t-due')?.value || null,
              priority: document.getElementById('t-priority')?.value,
            });
            closeModal('modal-crm-task');
            _showToast('Tarea agregada 📋');
          } catch (err) {
            _showToast(`Error: ${err.message}`, 'error');
          } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Agregar Tarea'; }
          }
        });
    },
  });
}

// ============================================================
// MODAL — CONFIRMAR ELIMINACIÓN
// ============================================================

function _confirmDelete(leadId) {
  const lead = _getLeadById(leadId);
  if (!lead) return;

  openModal({
    id     : 'modal-crm-delete',
    title  : 'Eliminar Lead',
    size   : 'small',
    content: `
      <p class="confirm-text">
        ¿Confirmas que deseas eliminar el lead de
        <strong>${_esc(lead.name)}</strong>?
        Esta acción eliminará también todos sus seguimientos, reuniones, notas y tareas.
      </p>
    `,
    footer: `
      <button class="btn btn-ghost" data-close-modal>No eliminar</button>
      <button class="btn btn-danger" id="btn-confirm-delete">Sí, eliminar</button>
    `,
    onOpen: () => {
      document.getElementById('btn-confirm-delete')
        ?.addEventListener('click', async () => {
          await deleteLead(leadId);
          closeModal('modal-crm-delete');
          _showToast('Lead eliminado');
        });
    },
  });
}

// ============================================================
// VINCULACIÓN DE EVENTOS
// ============================================================

/** Vincula todos los eventos interactivos de la vista principal */
function _bindViewEvents() {
  // Botón "Nuevo Lead"
  document.getElementById('btn-new-lead')
    ?.addEventListener('click', openModalNewLead);

  // Toggle de vista (tabla / kanban)
  document.getElementById('crm-toggle-view')
    ?.addEventListener('click', () => {
      _activeView = _activeView === 'table' ? 'kanban' : 'table';
      _rerenderList();
      const btn = document.getElementById('crm-toggle-view');
      if (btn) btn.textContent = _activeView === 'table' ? '⬛ Kanban' : '☰ Tabla';
    });

  // Filtros del pipeline bar
  document.querySelectorAll('.pipeline-stage').forEach(stage => {
    stage.addEventListener('click', () => {
      _activeFilter = stage.dataset.filter;
      document.querySelectorAll('.pipeline-stage').forEach(s => s.classList.remove('active'));
      stage.classList.add('active');
      _rerenderList();
    });
  });

  // Búsqueda (debounce 300ms)
  let _searchDebounce;
  document.getElementById('crm-search')
    ?.addEventListener('input', (e) => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        _searchTerm = e.target.value.trim().toLowerCase();
        _rerenderList();
      }, 300);
    });

  // Eventos de la lista
  _bindListEvents();
}

/** Vincula eventos de la tabla / kanban (se re-aplica al re-renderizar) */
function _bindListEvents() {
  // Delegación en el área de contenido
  document.getElementById('crm-content-area')
    ?.addEventListener('click', (e) => {
      const btn    = e.target.closest('[data-action]');
      const card   = e.target.closest('.kanban-card');
      const detail = e.target.closest('[data-detail]');

      // Acciones desde botones de fila
      if (btn) {
        const id     = Number(btn.dataset.id);
        const action = btn.dataset.action;
        if (action === 'detail')   openModalLeadDetail(id);
        if (action === 'edit')     openModalEditLead(id);
        if (action === 'followup') openModalFollowup(id);
        if (action === 'delete')   _confirmDelete(id);
        return;
      }

      // Click en nombre del lead (detalle)
      if (detail) {
        openModalLeadDetail(Number(detail.dataset.detail));
        return;
      }

      // Click en tarjeta kanban (sin acción específica)
      if (card && !btn) {
        openModalLeadDetail(Number(card.dataset.id));
      }
    });
}

// ============================================================
// FILTRADO Y BÚSQUEDA
// ============================================================

/**
 * Devuelve los leads filtrados por estado y término de búsqueda.
 *
 * @returns {Array}
 */
function _getFilteredLeads() {
  let result = [..._leadsCache];

  // Filtro de pipeline
  if (_activeFilter !== 'all') {
    result = result.filter(l => l.status === _activeFilter);
  }

  // Búsqueda de texto
  if (_searchTerm) {
    result = result.filter(l =>
      l.name.toLowerCase().includes(_searchTerm)    ||
      (l.company  || '').toLowerCase().includes(_searchTerm) ||
      (l.city     || '').toLowerCase().includes(_searchTerm) ||
      (l.email    || '').toLowerCase().includes(_searchTerm) ||
      (l.phone    || '').includes(_searchTerm)
    );
  }

  // Ordenar por fecha de creación descendente (más reciente primero)
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return result;
}

// ============================================================
// VERIFICACIÓN DE TAREAS VENCIDAS
// ============================================================

/**
 * Revisa si hay tareas vencidas o leads con próxima acción vencida
 * y actualiza las alertas del dashboard.
 */
async function _checkOverdueTasks() {
  const today   = new Date().toISOString().split('T')[0];
  let overdue   = 0;

  // Tareas vencidas
  for (const tasks of Object.values(_tasksCache)) {
    for (const t of (tasks || [])) {
      if (!t.done && t.dueDate && t.dueDate < today) overdue++;
    }
  }

  // Leads con próxima acción vencida
  for (const lead of _leadsCache) {
    if (lead.nextActionDate && lead.nextActionDate < today
        && lead.status !== LEAD_STATUS.CLOSED
        && lead.status !== LEAD_STATUS.LOST) {
      overdue++;
    }
  }

  if (overdue > 0) {
    updateAlerts({
      type   : 'warning',
      module : 'crm',
      message: `${overdue} tarea${overdue > 1 ? 's' : ''} vencida${overdue > 1 ? 's' : ''} en CRM`,
    });
  }
}

// ============================================================
// PREPARADO PARA HISTORY.JS
// ============================================================

/**
 * Registra una acción en el historial del sistema.
 * Usa window._historyModule si está disponible (history.js).
 * Fallback en sessionStorage para consumo posterior.
 *
 * @param {Object} entry — { action, category, amount, description, meta }
 */
function _logAction(entry) {
  const log = {
    timestamp  : new Date().toISOString(),
    module     : 'crm',
    user       : 'local',
    action     : entry.action,
    category   : entry.category     || 'crm',
    amount     : entry.amount       || null,
    description: entry.description  || '',
    meta       : entry.meta         || {},
  };

  // Intentar conectar con history.js si ya está cargado
  if (typeof window._historyModule?.log === 'function') {
    window._historyModule.log(log);
    return;
  }

  // Fallback: sessionStorage hasta que history.js exista
  try {
    const key     = 'crm_pending_history';
    const pending = JSON.parse(sessionStorage.getItem(key) || '[]');
    pending.push(log);
    if (pending.length > 300) pending.splice(0, pending.length - 300);
    sessionStorage.setItem(key, JSON.stringify(pending));
  } catch (_) {
    // sessionStorage no disponible — ignorar
  }
}

/**
 * Expone los logs pendientes para que history.js los migre al inicializarse.
 *
 * @returns {Array}
 */
export function getPendingHistoryLogs() {
  try {
    const key     = 'crm_pending_history';
    const pending = JSON.parse(sessionStorage.getItem(key) || '[]');
    sessionStorage.removeItem(key);
    return pending;
  } catch (_) {
    return [];
  }
}

// ============================================================
// VALIDACIONES
// ============================================================

/**
 * Valida los datos mínimos requeridos para un lead.
 * Lanza Error si algún campo falla.
 *
 * @param {Object} data
 */
function _validateLeadData(data) {
  if (!data.name?.trim()) {
    throw new Error('El nombre del lead es obligatorio');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('El correo electrónico no tiene un formato válido');
  }
  if (data.dealValue && isNaN(parseFloat(data.dealValue))) {
    throw new Error('El valor del negocio debe ser un número');
  }
  if (data.status && !Object.values(LEAD_STATUS).includes(data.status)) {
    throw new Error(`Estado de pipeline no válido: ${data.status}`);
  }
}

// ============================================================
// UTILIDADES PRIVADAS
// ============================================================

/** Busca un lead en cache por ID */
function _getLeadById(id) {
  return _leadsCache.find(l => l.id === id) || null;
}

/** Actualiza un item en la cache en memoria */
function _updateCacheItem(lead) {
  const idx = _leadsCache.findIndex(l => l.id === lead.id);
  if (idx !== -1) _leadsCache[idx] = lead;
}

/** Verifica si una fecha ISO está vencida (antes de hoy) */
function _isOverdue(dateISO) {
  if (!dateISO) return false;
  return dateISO < new Date().toISOString().split('T')[0];
}

/** Redondea a 2 decimales */
function _round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formatea número como moneda COP */
function _formatCurrency(n) {
  return new Intl.NumberFormat('es-CO', {
    style               : 'currency',
    currency            : 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/** Formatea fecha ISO a DD/MM/YYYY */
function _formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = (iso.split('T')[0]).split('-');
  return `${d}/${m}/${y}`;
}

/** Formatea fecha+hora ISO a DD/MM/YYYY HH:mm */
function _formatDateTime(iso) {
  if (!iso) return '—';
  const dt   = new Date(iso);
  const date = _formatDate(iso);
  const time = dt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

/** Escapa HTML para prevenir XSS */
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Capitaliza la primera letra */
function _capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
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
    if (err.parentNode) err.remove();
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
  LEAD_STATUS,
  LEAD_STATUS as CRM_STATUS,
  STATUS_META,
  SERVICES,
  FOLLOWUP_TYPE,
  TASK_PRIORITY,
};
