export interface UploadObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}

export interface StoredObject {
  key: string;
  publicUrl: string;
}

export interface ReadObjectResult {
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}

export interface ObjectStorage {
  // This adapter serves intentionally PUBLIC objects. Prefixes do not provide privacy.
  readonly driver: "local" | "r2";
  // Create only: reject an existing key instead of overwriting its bytes.
  uploadObject(input: UploadObjectInput): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  readObject?(key: string): Promise<ReadObjectResult | null>;
}
