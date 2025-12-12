// CLI error handling utilities

import { ToolkitError, ValidationError, SecurityError, NotFoundError } from '../../core/errors.js';

/**
 * Format an error for CLI output
 */
export function formatError(error: unknown): string {
  if (error instanceof ValidationError) {
    const field = error.field ? ` (field: ${error.field})` : '';
    return `Validation Error${field}: ${error.message}`;
  }
  
  if (error instanceof SecurityError) {
    return `Security Error: ${error.message}`;
  }
  
  if (error instanceof NotFoundError) {
    return `Not Found: ${error.message}`;
  }
  
  if (error instanceof ToolkitError) {
    return `Error [${error.code}]: ${error.message}`;
  }
  
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  
  return `Unknown error: ${String(error)}`;
}

/**
 * Handle CLI errors with proper exit codes
 */
export function handleError(error: unknown): never {
  const message = formatError(error);
  console.error(`\n❌ ${message}\n`);
  
  // Determine exit code based on error type
  let exitCode = 1;
  
  if (error instanceof ValidationError) {
    exitCode = 2;
  } else if (error instanceof SecurityError) {
    exitCode = 3;
  } else if (error instanceof NotFoundError) {
    exitCode = 4;
  }
  
  process.exit(exitCode);
}

/**
 * Wrap an async CLI action with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}

/**
 * Print success message
 */
export function success(message: string): void {
  console.log(`✓ ${message}`);
}

/**
 * Print info message
 */
export function info(message: string): void {
  console.log(`ℹ ${message}`);
}

/**
 * Print warning message
 */
export function warn(message: string): void {
  console.warn(`⚠ ${message}`);
}
