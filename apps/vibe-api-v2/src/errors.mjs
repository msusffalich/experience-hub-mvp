export class ApiError extends Error {
  constructor(status, code, message = code, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asApiError(error) {
  if (error instanceof ApiError) return error;
  if (error?.name === "AbortError") {
    return new ApiError(504, "upstream_timeout", "El servicio externo no respondió a tiempo.");
  }
  return new ApiError(
    500,
    "internal_error",
    "No se pudo completar la operación.",
    process.env.NODE_ENV === "production" ? null : String(error?.stack || error),
  );
}
