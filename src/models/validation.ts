// Validation result types

/**
 * Represents a single validation error
 */
export interface ValidationError {
  /** Field or section that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Result of validating an artifact
 */
export interface ValidationResult {
  /** Whether the artifact is valid */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}
