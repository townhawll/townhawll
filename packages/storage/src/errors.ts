export class StorageError extends Error {
  override name = "StorageError";

  constructor(
    message: string,
    readonly code:
      "INVALID_KEY" | "INVALID_FILE" | "OBJECT_NOT_FOUND" | "OPERATION_FAILED",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class StorageValidationError extends StorageError {
  override name = "StorageValidationError";
}
