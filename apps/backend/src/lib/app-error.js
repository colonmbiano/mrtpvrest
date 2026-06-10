'use strict';

class AppError extends Error {
  constructor({
    statusCode = 500,
    errorCode = 'INTERNAL_ERROR',
    message = 'Ocurrió un error al procesar la solicitud',
    cause,
    level,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    if (level) this.level = level;
    Error.captureStackTrace?.(this, AppError);
  }
}

module.exports = AppError;
