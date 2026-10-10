import { metadataForVersion, validStoredVersion } from "./document-records";

const DATABASE = "mark-documents";
export const VERSION_METADATA_STORE = "version-metadata";
interface DocumentStores { documents: IDBObjectStore; versions: IDBObjectStore; metadata: IDBObjectStore }
type TransactionWork<T> = (stores: DocumentStores, done: (value: T) => void, fail: (error: unknown) => void) => void;

export function onDocumentResult<T>(request: IDBRequest<T>, ready: (value: T) => void, failed: (error: unknown) => void): void {
  request.onsuccess = () => {
    try { ready(request.result); } catch (error) { failed(error); }
  };
}

function migrateVersionMetadata(request: IDBOpenDBRequest, fail: (error: Error) => void): void {
  const database = request.result;
  const transaction = request.transaction;
  if (!transaction) throw new Error("Version migration is unavailable.");
  const metadata = database.createObjectStore(VERSION_METADATA_STORE, { keyPath: "key" });
  metadata.createIndex("document", "document");
  const cursor = transaction.objectStore("versions").openCursor();
  const abort = (error: unknown): void => {
    fail(error instanceof Error ? error : new Error(String(error))); transaction.abort();
  };
  onDocumentResult(cursor, entry => {
    if (!entry) return;
    const value: unknown = entry.value;
    if (!value || typeof value !== "object" || !("document" in value) || typeof value.document !== "string"
      || !validStoredVersion(value, value.document)) {
      fail(new Error("Unsupported version storage. Migration was cancelled; existing data was not replaced."));
      transaction.abort(); return;
    }
    metadata.add(metadataForVersion(value)); entry.continue();
  }, abort);
}

function openDocumentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    let failure: Error | null = null;
    let blocked = false;
    request.onupgradeneeded = event => {
      try {
        if (event.oldVersion === 0) {
          request.result.createObjectStore("documents", { keyPath: "id" });
          request.result.createObjectStore("versions", { keyPath: "key" }).createIndex("document", "document");
        }
        migrateVersionMetadata(request, error => { failure = error; });
      } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); request.transaction?.abort(); }
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(failure ?? request.error);
    request.onblocked = () => { blocked = true; reject(new Error("Close other MARK tabs before opening document storage.")); };
  });
}

export async function withDocumentTransaction<T>(mode: IDBTransactionMode, work: TransactionWork<T>): Promise<T> {
  const database = await openDocumentDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = database.transaction(["documents", "versions", VERSION_METADATA_STORE], mode); }
    catch (error) { database.close(); reject(error); return; }
    let result: T, failure: unknown;
    let failed = false;
    const fail = (error: unknown): void => {
      if (failed) return;
      failed = true; failure = error;
      try { transaction.abort(); } catch { database.close(); reject(error); }
    };
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onabort = () => { database.close(); reject(failure ?? transaction.error ?? new Error("Document storage did not acknowledge the write.")); };
    transaction.onerror = () => { failure ??= transaction.error; };
    const stores = { documents: transaction.objectStore("documents"), versions: transaction.objectStore("versions"), metadata: transaction.objectStore(VERSION_METADATA_STORE) };
    try { work(stores, value => { result = value; }, fail); } catch (error) { fail(error); }
  });
}
