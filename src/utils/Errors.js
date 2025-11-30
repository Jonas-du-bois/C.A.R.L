export class AppError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.isOperational = true;
    this.cause = options.cause;
  }
}

export class ValidationError extends AppError {}
export class ConfigurationError extends AppError {}
export class DatabaseError extends AppError {}
export class ServiceError extends AppError {}
