import type { LoadedFile } from "./types";
import { validDocument, validStoredVersion, validVersionMetadata, compressedVersionFor, metadataForVersion,
  expiredVersions, browserDocumentUsage, type StoredDocument, type StoredVersion, type VersionMetadata } from "./document-records";
import { DEFAULT_DOCUMENT_BUDGET_BYTES, requireDocumentBudget, type DocumentStorageUsage } from "./document-budget";
import { compressDocumentSnapshot, readDocumentSnapshot, type SnapshotPayload } from "./snapshot-codec";
import { onDocumentResult, withDocumentTransaction } from "./document-database";
import type { DocumentBinding, DocumentStore, DocumentVersion } from "./document-session";

function addSnapshot(stores: { versions: IDBObjectStore; metadata: IDBObjectStore }, doc: StoredDocument, snapshot: SnapshotPayload): void {
  const version = compressedVersionFor(doc, snapshot);
  stores.versions.add(version); stores.metadata.add(metadataForVersion(version));
}
function validMetadataList(value: unknown, document: string): value is VersionMetadata[] {
  return Array.isArray(value) && value.every((item: unknown) => validVersionMetadata(item, document));
}
interface VersionStores { versions: IDBObjectStore; metadata: IDBObjectStore }
interface MetadataRequest { document: string; ready: (versions: VersionMetadata[]) => void; failed: (error: unknown) => void }
function readVersionMetadata(stores: VersionStores, request: MetadataRequest): void {
  const { document, ready, failed } = request;
  const history = stores.metadata.index("document").getAll(document);
  onDocumentResult(history, (value: unknown) => {
    if (!validMetadataList(value, document)) { failed(new Error("Version metadata is corrupt; changes were not applied.")); return; }
    const count = stores.versions.index("document").count(document);
    onDocumentResult(count, length => {
      if (length !== value.length) { failed(new Error("Version metadata is incomplete; changes were not applied.")); return; }
      ready(value);
    }, failed);
  }, failed);
}
function documentDigest(file: LoadedFile): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(file.name + "\0" + file.source))
    .then(digest => [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""));
}
/** Uploaded files remain read-only; acknowledged working sources and versions live in IndexedDB. */
export class BrowserDocumentStore implements DocumentStore {
  constructor(private budget: () => number = () => DEFAULT_DOCUMENT_BUDGET_BYTES) {}
  async open(file: LoadedFile): Promise<DocumentBinding> {
    const id = await documentDigest(file);
    const snapshot = await compressDocumentSnapshot(file.source);
    return withDocumentTransaction("readwrite", (stores, done, fail) => {
      const request = stores.documents.get(id);
      onDocumentResult(request, (value: unknown) => {
        if (value !== undefined && !validDocument(value, id)) { fail(new Error("Unsupported document storage. Existing data was not replaced.")); return; }
        const doc: StoredDocument = value ?? { format: "mark-document", version: 1, id, source: file.source, stamp: Date.now() };
        if (value === undefined) {
          const metadata = metadataForVersion(compressedVersionFor(doc, snapshot));
          const storage = browserDocumentUsage(doc, [metadata], this.budget());
          requireDocumentBudget(storage);
          stores.documents.add(doc); addSnapshot(stores, doc, snapshot);
          done({ id, source: doc.source, hasUnappliedVersion: false, storage });
        } else {
          readVersionMetadata(stores, { document: id, failed: fail, ready: history => {
            done({ id, source: doc.source, hasUnappliedVersion: false, storage: browserDocumentUsage(doc, history, this.budget()) });
          } });
        }
      }, fail);
    });
  }
  async save(id: string, change: { expected: string; source: string }): Promise<{ savedAt: number; storage: DocumentStorageUsage }> {
    const snapshot = await compressDocumentSnapshot(change.source);
    return withDocumentTransaction("readwrite", (stores, done, fail) => {
      const request = stores.documents.get(id);
      onDocumentResult(request, (doc: unknown) => {
        if (!validDocument(doc, id)) { fail(new Error("Document storage is unavailable or corrupt.")); return; }
        if (doc.source !== change.expected) { fail(new Error("This document changed in another MARK tab. Export before reloading.")); return; }
        readVersionMetadata(stores, { document: id, failed: fail, ready: value => {
          if (doc.source === change.source) {
            done({ savedAt: doc.stamp, storage: browserDocumentUsage(doc, value, this.budget()) }); return;
          }
          const next = { ...doc, source: change.source, stamp: Math.max(Date.now(), doc.stamp + 1) };
          const history = [...value, metadataForVersion(compressedVersionFor(next, snapshot))];
          const storage = browserDocumentUsage(next, history, this.budget());
          requireDocumentBudget(storage);
          stores.documents.put(next); addSnapshot(stores, next, snapshot);
          for (const version of expiredVersions(history, Date.now())) {
            stores.versions.delete(version.key); stores.metadata.delete(version.key);
          }
          // Conservative receipt: expired rows are never subtracted before their transaction commits.
          done({ savedAt: next.stamp, storage });
        } });
      }, fail);
    });
  }
  async versions(id: string): Promise<DocumentVersion[]> {
    return withDocumentTransaction("readwrite", (stores, done, fail) => {
      readVersionMetadata(stores, { document: id, failed: fail, ready: value => {
        const expired = new Set(expiredVersions(value, Date.now()).map(version => version.key));
        for (const key of expired) { stores.versions.delete(key); stores.metadata.delete(key); }
        done(value.filter(version => !expired.has(version.key)).sort((a, b) => b.createdAt - a.createdAt)
          .map(({ id, createdAt, bytes }) => ({ id, createdAt, bytes })));
      } });
    });
  }
  async read(id: string, version: string): Promise<string> {
    const snapshot = await withDocumentTransaction<StoredVersion>("readonly", (stores, done, fail) => {
      const request = stores.versions.get(`${id}:${version}`);
      onDocumentResult(request, (value: unknown) => {
        if (!validStoredVersion(value, id)) { fail(new Error("This version is unavailable.")); return; }
        done(value);
      }, fail);
    });
    return "source" in snapshot ? snapshot.source : readDocumentSnapshot(snapshot);
  }
}
