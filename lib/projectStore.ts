// Project storage in IndexedDB (the browser's built-in database).
//
// IMPORTANT: IndexedDB is NOT durable. Safari may delete it after 7 days
// without a visit (home-screen web apps are exempt), and users can clear it.
// The app therefore also offers Export/Import of project files.
//
// Two object stores ("tables"), both keyed by project id:
//   projects    -> ProjectMeta (name, dates, settings, thumbnail): small,
//                  so listing projects doesn't load every photo.
//   projectData -> { id, photo, drawing }: the big blobs.

import type { Project, ProjectMeta } from "./projectTypes";

const DB_NAME = "trace-paint";
const DB_VERSION = 1;
const META_STORE = "projects";
const DATA_STORE = "projectData";

interface ProjectData {
  id: string;
  photo: Blob;
  drawing: Blob;
}

/** Thrown when the browser refuses to store more data. */
export class StorageFullError extends Error {
  constructor() {
    super(
      "Not enough browser storage to save. Export this project as a file, then delete old projects to free space."
    );
    this.name = "StorageFullError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Open (and on first use create) the database. Cached after the first call. */
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    // Runs only when the database is new or DB_VERSION increased: create tables.
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null; // allow a retry later
      reject(request.error);
    };
  });
  return dbPromise;
}

/** IndexedDB uses callbacks; wrap one request as a Promise. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolve when a transaction has fully committed. Writes are only safe once
 * this fires; quota errors usually surface here as an abort.
 */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toStoreError(tx.error));
    tx.onabort = () => reject(toStoreError(tx.error));
  });
}

function toStoreError(error: DOMException | null): Error {
  if (error?.name === "QuotaExceededError") return new StorageFullError();
  return error ?? new Error("Storage transaction failed");
}

/** All projects, most recently changed first. */
export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const all = await requestToPromise(tx.objectStore(META_STORE).getAll() as IDBRequest<ProjectMeta[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | null> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], "readonly");
  const [meta, data] = await Promise.all([
    requestToPromise(tx.objectStore(META_STORE).get(id) as IDBRequest<ProjectMeta | undefined>),
    requestToPromise(tx.objectStore(DATA_STORE).get(id) as IDBRequest<ProjectData | undefined>),
  ]);
  if (!meta || !data) return null;
  return { ...meta, photo: data.photo, drawing: data.drawing };
}

/** Insert or overwrite a project. Both stores are written in ONE transaction (all or nothing). */
export async function saveProject(project: Project): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
  const { photo, drawing, ...meta } = project;
  try {
    tx.objectStore(META_STORE).put(meta);
    tx.objectStore(DATA_STORE).put({ id: project.id, photo, drawing } satisfies ProjectData);
  } catch (err) {
    // Some browsers throw synchronously from put() when out of space.
    tx.abort();
    throw toStoreError(err instanceof DOMException ? err : null);
  }
  await transactionDone(tx);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  const store = tx.objectStore(META_STORE);
  const meta = await requestToPromise(store.get(id) as IDBRequest<ProjectMeta | undefined>);
  if (meta) store.put({ ...meta, name, updatedAt: Date.now() });
  await transactionDone(tx);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([META_STORE, DATA_STORE], "readwrite");
  tx.objectStore(META_STORE).delete(id);
  tx.objectStore(DATA_STORE).delete(id);
  await transactionDone(tx);
}

/**
 * Ask the browser to keep our data even under storage pressure. Browsers
 * may silently say no; it is a best-effort hint, so errors are ignored.
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // not supported: nothing to do
  }
}
