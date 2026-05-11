/* ============================================================
   db.js — Capa de base de datos local (IndexedDB)
   Maneja apertura, upgrades y operaciones CRUD base
   ============================================================ */

import { APP_CONFIG } from '../config.js';

const DB = (() => {
  let _db = null; // Instancia singleton de la DB

  /* ── Inicializar / abrir la base de datos ─────────────────── */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const { name, version, stores } = APP_CONFIG.db;
      const request = indexedDB.open(name, version);

      /* Crear o actualizar los object stores */
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log(`[DB] Creando/actualizando base de datos v${version}`);

        Object.entries(stores).forEach(([storeName, config]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath:       config.keyPath,
              autoIncrement: config.autoIncrement || false,
            });

            /* Crear índices según el store */
            if (storeName === 'transactions') {
              store.createIndex('date',     'date',     { unique: false });
              store.createIndex('type',     'type',     { unique: false });
              store.createIndex('category', 'category', { unique: false });
            }
            if (storeName === 'loans') {
              store.createIndex('clientId', 'clientId', { unique: false });
              store.createIndex('status',   'status',   { unique: false });
            }
            if (storeName === 'clients') {
              store.createIndex('name',  'name',  { unique: false });
              store.createIndex('email', 'email', { unique: false });
            }
            if (storeName === 'investments') {
              store.createIndex('type',   'type',   { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }

            console.log(`[DB] Store "${storeName}" creado`);
          }
        });
      };

      request.onsuccess = (event) => {
        _db = event.target.result;
        console.log('[DB] Base de datos abierta correctamente');
        resolve(_db);
      };

      request.onerror = (event) => {
        console.error('[DB] Error al abrir la base de datos:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /* ── Obtener instancia (ya inicializada) ─────────────────── */
  function getDB() {
    if (!_db) throw new Error('[DB] Base de datos no inicializada. Llama DB.init() primero.');
    return _db;
  }

  /* ── CRUD genérico ───────────────────────────────────────── */

  /** Insertar un registro */
  function add(storeName, data) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const payload = { ...data, createdAt: data?.createdAt || new Date().toISOString() };
      if (payload.id == null) delete payload.id;
      const req = store.add(payload);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Actualizar un registro existente */
  function update(storeName, data) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put({ ...data, updatedAt: new Date().toISOString() });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Eliminar un registro por ID */
  function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Obtener un registro por ID */
  function getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Obtener todos los registros de un store */
  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Obtener registros por índice */
  function getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Contar registros en un store */
  function count(storeName) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  /** Vaciar un store completo */
  function clear(storeName) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function getStoreNames() {
    const db = getDB();
    return Array.from(db.objectStoreNames);
  }

  function bulkPut(storeName, rows = []) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      rows.forEach(row => store.put(row));
      tx.oncomplete = () => resolve(rows.length);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  function replaceAll(storeName, rows = []) {
    return new Promise((resolve, reject) => {
      const db = getDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      store.clear();
      rows.forEach(row => store.put(row));
      tx.oncomplete = () => resolve(rows.length);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearAll() {
    const stores = getStoreNames();
    await Promise.all(stores.map(storeName => clear(storeName)));
    return true;
  }

  async function ensureStore(storeName, config = { keyPath: 'id', autoIncrement: true }) {
    await init();
    if (_db.objectStoreNames.contains(storeName)) return true;

    const nextVersion = _db.version + 1;
    _db.close();
    _db = null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(APP_CONFIG.db.name, nextVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, {
            keyPath: config.keyPath || 'id',
            autoIncrement: config.autoIncrement !== false,
          });
        }
      };

      request.onsuccess = (event) => {
        _db = event.target.result;
        resolve(true);
      };

      request.onerror = (event) => reject(event.target.error);
    });
  }

  /* ── API pública ─────────────────────────────────────────── */
  return {
    init,
    getDB,
    add,
    update,
    remove,
    getById,
    getAll,
    getByIndex,
    count,
    clear,
    clearAll,
    bulkPut,
    replaceAll,
    getStoreNames,
    ensureStore,
  };
})();

window.DB = DB;
export { DB };
