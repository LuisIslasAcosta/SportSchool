// Almacenamiento local con IndexedDB
const DB_NAME = 'sportschool-db';
const DB_VERSION = 1;
let dbPromise = null;

export function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('estudiantes')) {
        db.createObjectStore('estudiantes', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('actividades')) {
        const store = db.createObjectStore('actividades', { keyPath: 'id', autoIncrement: true });
        store.createIndex('estudianteId', 'estudianteId', { unique: false });
        store.createIndex('sync', 'sync', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Ejecuta una operación dentro de una transacción y devuelve su resultado
async function operacion(store, modo, fn) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const peticion = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(peticion ? peticion.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const agregar = (store, obj) => operacion(store, 'readwrite', s => s.add(obj));
export const guardar = (store, obj) => operacion(store, 'readwrite', s => s.put(obj));
export const obtenerTodos = (store) => operacion(store, 'readonly', s => s.getAll());
export const obtener = (store, id) => operacion(store, 'readonly', s => s.get(id));
export const eliminar = (store, id) => operacion(store, 'readwrite', s => s.delete(id));
