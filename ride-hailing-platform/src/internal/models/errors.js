// src/internal/models/errors.js
export class AppError extends Error {
  constructor(message, code, httpStatus, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      }
    };
  }
}

export const DomainErrors = {
  NOT_FOUND: (resource) => new AppError(`${resource} not found`, 'NOT_FOUND', 404),
  VALIDATION_ERROR: (details) => new AppError('Invalid request', 'VALIDATION_ERROR', 400, details),
  UNAUTHORIZED: (details) => new AppError('Unauthorized access', 'UNAUTHORIZED', 401, details),
  FORBIDDEN: (details) => new AppError('Access forbidden', 'FORBIDDEN', 403, details),
  INVALID_STATE_TRANSITION: (from, to) => new AppError(`Cannot transition from ${from} to ${to}`, 'INVALID_STATE_TRANSITION', 409),
  IDEMPOTENCY_CONFLICT: (key) => new AppError(`Idempotency key already used: ${key}`, 'IDEMPOTENCY_CONFLICT', 409),
  DRIVER_UNAVAILABLE: (id) => new AppError(`Driver unavailable: ${id}`, 'DRIVER_UNAVAILABLE', 409),
  INTERNAL_ERROR: (err) => new AppError('An internal error occurred', 'INTERNAL_ERROR', 500, err?.message)
};
