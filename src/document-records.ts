import { VERSION_RETENTION_MS, type DocumentVersion } from "./document-session";
import { validSnapshotPayload, type SnapshotPayload } from "./snapshot-codec";
import { documentStorageUsage, type DocumentStorageUsage } from "./document-budget";

export interface StoredDocument { format: "mark-document"; version: 1; id: string; source: string; stamp: number }
interface VersionIdentity extends DocumentVersion { key: string; document: string }
export interface LegacyStoredVersion extends VersionIdentity { source: string }
export type StoredVersion = LegacyStoredVersion | (VersionIdentity & SnapshotPayload);
export interface VersionMetadata extends VersionIdentity { storedBytes: number }

export function validDocument(value: unknown, id: string): value is StoredDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<StoredDocument>;
  return doc.format === "mark-document" && doc.version === 1 && doc.id === id && typeof doc.source === "string"
    && Number.isSafeInteger(doc.stamp) && Number(doc.stamp) >= 0;
}
function validVersionIdentity(value: unknown, document: string): value is VersionIdentity {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<VersionIdentity>;
  return item.document === document && Number.isSafeInteger(item.createdAt) && Number(item.createdAt) >= 0
    && item.id === String(item.createdAt) && item.key === `${document}:${item.id}`
    && Number.isSafeInteger(item.bytes) && Number(item.bytes) >= 0;
}
export function validStoredVersion(value: unknown, document: string): value is StoredVersion {
  if (!validVersionIdentity(value, document)) return false;
  if ("source" in value) return typeof value.source === "string" && !("codec" in value) && !("payload" in value);
  return validSnapshotPayload(value);
}
export function validVersions(value: unknown, document: string): value is StoredVersion[] {
  return Array.isArray(value) && value.every((item: unknown) => validStoredVersion(item, document));
}
export function validVersionMetadata(value: unknown, document: string): value is VersionMetadata {
  if (!validVersionIdentity(value, document) || !("storedBytes" in value)) return false;
  return Number.isSafeInteger(value.storedBytes) && Number(value.storedBytes) >= 0;
}
export function versionFor(doc: StoredDocument): LegacyStoredVersion {
  return { key: `${doc.id}:${doc.stamp}`, document: doc.id, id: String(doc.stamp), createdAt: doc.stamp,
    bytes: new TextEncoder().encode(doc.source).length, source: doc.source };
}
export function compressedVersionFor(doc: StoredDocument, snapshot: SnapshotPayload): StoredVersion {
  return { key: `${doc.id}:${doc.stamp}`, document: doc.id, id: String(doc.stamp), createdAt: doc.stamp, ...snapshot };
}
export function metadataForVersion(version: StoredVersion): VersionMetadata {
  const storedBytes = "source" in version ? new TextEncoder().encode(version.source).length : version.payload.length;
  return { key: version.key, document: version.document, id: version.id, createdAt: version.createdAt, bytes: version.bytes, storedBytes };
}
/** Metadata-only accounting includes source, payloads, and a bounded snapshot header allowance. */
export function browserDocumentUsage(doc: StoredDocument, versions: VersionMetadata[], limit: number): DocumentStorageUsage {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(JSON.stringify(doc)).length;
  for (const version of versions) {
    const { storedBytes, ...identity } = version;
    bytes += storedBytes + encoder.encode(JSON.stringify(version)).length + encoder.encode(JSON.stringify(identity)).length + 64;
  }
  return documentStorageUsage(bytes, limit);
}

/** Never expire the newest snapshot, including when the document is no longer edited. */
export function expiredVersions<T extends { createdAt: number }>(versions: T[], now: number): T[] {
  let latest = -1;
  for (const version of versions) latest = Math.max(latest, version.createdAt);
  return versions.filter(version => version.createdAt < now - VERSION_RETENTION_MS && version.createdAt !== latest);
}
