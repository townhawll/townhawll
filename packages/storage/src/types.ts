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
  readonly driver: "local" | "r2";
  uploadObject(input: UploadObjectInput): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  readObject?(key: string): Promise<ReadObjectResult | null>;
}
