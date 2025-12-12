// Domain-specific error types for Architecture Toolkit

/**
 * Base error class for all toolkit errors
 */
export abstract class ToolkitError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context
    };
  }
}

/**
 * Validation errors for invalid input
 */
export class ValidationError extends ToolkitError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly field?: string, context?: Record<string, unknown>) {
    super(message, { ...context, field });
  }
}

/**
 * Security errors for path traversal, injection, etc.
 */
export class SecurityError extends ToolkitError {
  readonly code = 'SECURITY_ERROR';
  readonly statusCode = 403;
}

/**
 * Not found errors
 */
export class NotFoundError extends ToolkitError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;

  constructor(resourceType: string, id: string) {
    super(`${resourceType} not found: ${id}`, { resourceType, id });
  }
}

/**
 * Storage/filesystem errors
 */
export class StorageError extends ToolkitError {
  readonly code = 'STORAGE_ERROR';
  readonly statusCode = 500;
}

/**
 * Serialization/parsing errors
 */
export class SerializationError extends ToolkitError {
  readonly code = 'SERIALIZATION_ERROR';
  readonly statusCode = 400;

  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(message, { line, column });
  }
}

/**
 * Reference errors (circular, missing target, etc.)
 */
export class ReferenceError extends ToolkitError {
  readonly code = 'REFERENCE_ERROR';
  readonly statusCode = 400;
}
