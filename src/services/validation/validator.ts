// Artifact Validator Service for Architecture Documentation Toolkit

import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { ArtifactType, RFCStatus, ADRStatus } from '../../models/types.js';
import { ValidationResult, ValidationError } from '../../models/validation.js';
import { IdGenerator } from '../id-generator.js';

/**
 * Valid RFC status values
 */
const VALID_RFC_STATUSES: RFCStatus[] = ['draft', 'review', 'approved', 'rejected', 'implemented'];

/**
 * Valid ADR status values
 */
const VALID_ADR_STATUSES: ADRStatus[] = ['proposed', 'accepted', 'deprecated', 'superseded'];

/**
 * Checks if a string value is non-empty (not null, undefined, or whitespace-only)
 */
function isNonEmpty(value: string | undefined | null): boolean {
  return value !== undefined && value !== null && value.trim().length > 0;
}

/**
 * Checks if an array is non-empty
 */
function isNonEmptyArray<T>(arr: T[] | undefined | null): boolean {
  return arr !== undefined && arr !== null && arr.length > 0;
}

/**
 * Validates an RFC artifact
 */
function validateRFC(rfc: RFC): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate required string sections
  if (!isNonEmpty(rfc.problemStatement)) {
    errors.push({ field: 'problemStatement', message: 'Problem statement is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.recommendedApproach)) {
    errors.push({ field: 'recommendedApproach', message: 'Recommended approach is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.migrationPath)) {
    errors.push({ field: 'migrationPath', message: 'Migration path is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.rollbackPlan)) {
    errors.push({ field: 'rollbackPlan', message: 'Rollback plan is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.securityNotes)) {
    errors.push({ field: 'securityNotes', message: 'Security notes is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.costModel)) {
    errors.push({ field: 'costModel', message: 'Cost model is required and cannot be empty' });
  }
  if (!isNonEmpty(rfc.timeline)) {
    errors.push({ field: 'timeline', message: 'Timeline is required and cannot be empty' });
  }

  // Validate required array sections
  if (!isNonEmptyArray(rfc.successCriteria)) {
    errors.push({ field: 'successCriteria', message: 'At least one success criterion is required' });
  }
  if (!isNonEmptyArray(rfc.options)) {
    errors.push({ field: 'options', message: 'At least one option is required in options analysis' });
  }

  // Validate status
  if (!VALID_RFC_STATUSES.includes(rfc.status)) {
    errors.push({ field: 'status', message: `Invalid RFC status: ${rfc.status}. Valid values are: ${VALID_RFC_STATUSES.join(', ')}` });
  }

  return errors;
}

/**
 * Validates an ADR artifact
 */
function validateADR(adr: ADR): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate required string sections
  if (!isNonEmpty(adr.context)) {
    errors.push({ field: 'context', message: 'Context is required and cannot be empty' });
  }
  if (!isNonEmpty(adr.decision)) {
    errors.push({ field: 'decision', message: 'Decision is required and cannot be empty' });
  }

  // Validate required array sections
  if (!isNonEmptyArray(adr.consequences)) {
    errors.push({ field: 'consequences', message: 'At least one consequence is required' });
  }

  // Validate status
  if (!VALID_ADR_STATUSES.includes(adr.status)) {
    errors.push({ field: 'status', message: `Invalid ADR status: ${adr.status}. Valid values are: ${VALID_ADR_STATUSES.join(', ')}` });
  }

  // Validate supersededBy is required when status is 'superseded'
  if (adr.status === 'superseded' && !isNonEmpty(adr.supersededBy)) {
    errors.push({ field: 'supersededBy', message: 'Reference to superseding ADR is required when status is superseded' });
  }

  return errors;
}

/**
 * Validates a DecompositionPlan artifact
 */
function validateDecompositionPlan(plan: DecompositionPlan): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate required string sections
  if (!isNonEmpty(plan.rationale)) {
    errors.push({ field: 'rationale', message: 'Rationale is required and cannot be empty' });
  }

  // Validate required array sections
  if (!isNonEmptyArray(plan.successMetrics)) {
    errors.push({ field: 'successMetrics', message: 'At least one success metric is required' });
  }
  if (!isNonEmptyArray(plan.phases)) {
    errors.push({ field: 'phases', message: 'At least one phase is required' });
  }

  // Validate each phase has required fields
  if (plan.phases) {
    plan.phases.forEach((phase, index) => {
      if (!isNonEmpty(phase.name)) {
        errors.push({ field: `phases[${index}].name`, message: `Phase ${index + 1} name is required` });
      }
      if (!isNonEmpty(phase.description)) {
        errors.push({ field: `phases[${index}].description`, message: `Phase ${index + 1} description is required` });
      }
      if (!isNonEmpty(phase.estimatedDuration)) {
        errors.push({ field: `phases[${index}].estimatedDuration`, message: `Phase ${index + 1} estimated duration is required` });
      }
    });
  }

  return errors;
}


/**
 * Validates common artifact fields
 */
function validateCommonFields(artifact: Artifact): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate ID format matches artifact type
  if (!IdGenerator.validateIdFormat(artifact.id, artifact.type)) {
    const expectedPrefix = artifact.type === 'rfc' ? 'RFC' : artifact.type === 'adr' ? 'ADR' : 'DECOMP';
    errors.push({ 
      field: 'id', 
      message: `Invalid ID format: ${artifact.id}. Expected format: ${expectedPrefix}-NNNN` 
    });
  }

  // Validate title is non-empty
  if (!isNonEmpty(artifact.title)) {
    errors.push({ field: 'title', message: 'Title is required and cannot be empty' });
  }

  // Validate owner is non-empty
  if (!isNonEmpty(artifact.owner)) {
    errors.push({ field: 'owner', message: 'Owner is required and cannot be empty' });
  }

  // Validate dates
  if (!artifact.createdAt || !(artifact.createdAt instanceof Date) || isNaN(artifact.createdAt.getTime())) {
    errors.push({ field: 'createdAt', message: 'Valid creation date is required' });
  }
  if (!artifact.updatedAt || !(artifact.updatedAt instanceof Date) || isNaN(artifact.updatedAt.getTime())) {
    errors.push({ field: 'updatedAt', message: 'Valid update date is required' });
  }

  return errors;
}

/**
 * ArtifactValidator class for validating architectural artifacts
 */
export class ArtifactValidator {
  /**
   * Validates an artifact based on its type
   * @param artifact - The artifact to validate
   * @returns ValidationResult with valid flag and any errors
   */
  validate(artifact: Artifact): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate common fields
    errors.push(...validateCommonFields(artifact));

    // Validate type-specific fields
    switch (artifact.type) {
      case 'rfc':
        errors.push(...validateRFC(artifact as RFC));
        break;
      case 'adr':
        errors.push(...validateADR(artifact as ADR));
        break;
      case 'decomposition':
        errors.push(...validateDecompositionPlan(artifact as DecompositionPlan));
        break;
      default:
        errors.push({ field: 'type', message: `Unknown artifact type: ${(artifact as Artifact).type}` });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates an RFC artifact
   * @param rfc - The RFC to validate
   * @returns ValidationResult with valid flag and any errors
   */
  validateRFC(rfc: RFC): ValidationResult {
    return this.validate(rfc);
  }

  /**
   * Validates an ADR artifact
   * @param adr - The ADR to validate
   * @returns ValidationResult with valid flag and any errors
   */
  validateADR(adr: ADR): ValidationResult {
    return this.validate(adr);
  }

  /**
   * Validates a DecompositionPlan artifact
   * @param plan - The DecompositionPlan to validate
   * @returns ValidationResult with valid flag and any errors
   */
  validateDecompositionPlan(plan: DecompositionPlan): ValidationResult {
    return this.validate(plan);
  }
}
