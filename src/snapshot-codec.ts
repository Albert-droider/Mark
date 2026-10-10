export const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const GZIP_OVERHEAD_BYTES = 8192;
const MIN_SNAPSHOT_SAVING = 32;
const INCOMPLETE_UNICODE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
export interface SnapshotPayload { codec: "utf8" | "gzip"; payload: Uint8Array<ArrayBuffer>; bytes: number }

export function validSnapshotPayload(value: unknown): value is SnapshotPayload {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SnapshotPayload>;
  return (snapshot.codec === "utf8" || snapshot.codec === "gzip")
    && Number.isSafeInteger(snapshot.bytes) && Number(snapshot.bytes) >= 0 && Number(snapshot.bytes) <= MAX_DOCUMENT_BYTES
    && snapshot.payload instanceof Uint8Array && snapshot.payload.buffer instanceof ArrayBuffer
    && snapshot.payload.byteLength <= MAX_DOCUMENT_BYTES + GZIP_OVERHEAD_BYTES;
}

export async function compressDocumentSnapshot(source: string): Promise<SnapshotPayload> {
  if (source.length > MAX_DOCUMENT_BYTES) throw new Error("Edited Markdown is larger than 16 MB.");
  if (INCOMPLETE_UNICODE.test(source)) throw new Error("Markdown contains an incomplete Unicode character. Finish typing before saving.");
  const payload = new TextEncoder().encode(source);
  if (payload.length > MAX_DOCUMENT_BYTES) throw new Error("Edited Markdown is larger than 16 MB.");
  if (typeof CompressionStream === "undefined") return { codec: "utf8", payload, bytes: payload.length };
  const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (compressed.length + MIN_SNAPSHOT_SAVING < payload.length) return { codec: "gzip", payload: compressed, bytes: payload.length };
  return { codec: "utf8", payload, bytes: payload.length };
}

export async function readDocumentSnapshot(snapshot: SnapshotPayload): Promise<string> {
  if (!validSnapshotPayload(snapshot)) throw new Error("Unsupported version payload.");
  const bytes = snapshot.codec === "gzip" ? await inflateSnapshot(snapshot) : snapshot.payload;
  if (bytes.length !== snapshot.bytes) throw new Error("Version size does not match its metadata.");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

async function inflateSnapshot(snapshot: SnapshotPayload): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed versions.");
  const stream = new Blob([snapshot.payload]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const decoded = new Uint8Array(snapshot.bytes);
  let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > decoded.length) throw new Error("Compressed version exceeds its declared size.");
      decoded.set(value, offset); offset += value.length;
    }
    if (offset !== decoded.length) throw new Error("Compressed version size does not match its metadata.");
    return decoded;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
