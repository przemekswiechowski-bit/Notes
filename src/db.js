const DB_NAME = "notes-db";
const DB_VERSION = 1;
const STORE = "notes";

let dbPromise;

export function openDb() {
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("Ta przeglądarka nie obsługuje IndexedDB."));
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("deleted", "deleted", { unique: false });
          store.createIndex("archived", "archived", { unique: false });
        }
      };
    });
  }

  return dbPromise;
}

export async function getAllNotes() {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
}

export async function putNote(note) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(note));
}

export async function putNotes(notes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    notes.forEach((note) => store.put(note));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNote(id) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
