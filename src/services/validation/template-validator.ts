// Template-based Validator Service for Architecture Documentation Toolkit

import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { Template } from '../../models/template.js';
import { ArtifactType } from '../../models/types.js';
import { ValidationResult, ValidationError } from '../../models/validation.js';

/**
 * Default RFC template with required sections
 */
const DEFAULT_RFC_TEMPLATE: Template = {
  id: 'default-rfc',
  name: 'Default RFC Template',
  artifactType: 'rfc',
  sections: [
    { name: 'problemStatement', required: true, description: 'Problem statement describing the issue to be addressed' },
    { name: 'successCriteria', required: true, description: 'List of success criteria' },
    { name: 'options', required: true, description: 'Options analysis' },
    { name: 'recommendedApproach', required: true, description: 'Recommended approach' },
    { name: 'migrationPath', required: true, description: 'Migration path' },
    { name: 'rollbackPlan', required: true, description: 'Rollback plan' },
    { name: 'securityNotes', required: true, description: 'Security considerations' },
    { name: 'costModel', required: true, description: 'Cost model' },
    { name: 'timeline', required: true, description: 'Timeline' },
    { name: 'signoffs', required: false, description: 'Sign-off tracking' },
  ],
};

/**
 * Default ADR template with required sections
 */
const DEFAULT_ADR_TEMPLATE: Template = {
  id: 'default-adr',
  name: 'Default ADR Template',
  artifactType: 'adr',
  sections: [
    { name: 'context', required: true, description: 'Context and background for the decision' },
    { name: 'decision', required: true, description: 'The decision that was made' },
    { name: 'consequences', required: true, description: 'Consequences of the decision' },
    { name: 'alternativesConsidered', required: false, description: 'Alternatives that were considered' },
  ],
};

/**
 * Default Decomposition Plan template with required sections
 */
const DEFAULT_DECOMPOSITION_TEMPLATE: Template = {
  id: 'default-decomposition',
  name: 'Default Decomposition Plan Template',
  artifactType: 'decomposition',
  sections: [
    { name: 'rationale', required: true, description: 'Rationale for the decomposition' },
    { name: 'successMetrics', required: true, description: 'Success metrics for the decomposition' },
    { name: 'phases', required: true, description: 'Phases of the decomposition' },
    { name: 'teamModuleMapping', required: false, description: 'Team to module assignments' },
    { name: 'migrationTasks', required: false, description: 'Migration tasks' },
  ],
};


/**
 * Gets the default template for an artifact type
 */
export function getDefaultTemplate(artifactType: ArtifactType): Template {
  switch (artifactType) {
    case 'rfc':
      return DEFAULT_RFC_TEMPLATE;
    case 'adr':
      return DEFAULT_ADR_TEMPLATE;
    case 'decomposition':
      return DEFAULT_DECOMPOSITION_TEMPLATE;
    default:
      throw new Error(`Unknown artifact type: ${artifactType}`);
  }
}

/**
 * Checks if a section has content
 */
function sectionHasContent(artifact: Artifact, sectionName: string): boolean {
  const value = (artifact as unknown as Record<string, unknown>)[sectionName];
  
  if (value === undefined || value === null) {
    return false;
  }
  
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  
  // For objects, consider them as having content if they exist
  if (typeof value === 'object') {
    return true;
  }
  
  return Boolean(value);
}

/**
 * TemplateValidator class for validating artifacts against templates
 */
export class TemplateValidator {
  private customTemplates: Map<string, Template> = new Map();

  /**
   * Registers a custom template
   * @param template - The template to register
   */
  registerTemplate(template: Template): void {
    this.customTemplates.set(template.id, template);
  }

  /**
   * Gets a template by ID, falling back to default if not found
   * @param templateId - The template ID to look up
   * @param artifactType - The artifact type for default fallback
   * @returns The template
   */
  getTemplate(templateId: string | undefined, artifactType: ArtifactType): Template {
    if (templateId && this.customTemplates.has(templateId)) {
      return this.customTemplates.get(templateId)!;
    }
    return getDefaultTemplate(artifactType);
  }

  /**
   * Validates an artifact against a template
   * @param artifact - The artifact to validate
   * @param template - Optional template to validate against (uses default if not provided)
   * @returns ValidationResult with valid flag and any errors
   */
  validateAgainstTemplate(artifact: Artifact, template?: Template): ValidationResult {
    const errors: ValidationError[] = [];
    const templateToUse = template || getDefaultTemplate(artifact.type);

    // Validate that template matches artifact type
    if (templateToUse.artifactType !== artifact.type) {
      errors.push({
        field: 'type',
        message: `Template type mismatch: template is for ${templateToUse.artifactType}, but artifact is ${artifact.type}`,
      });
      return { valid: false, errors };
    }

    // Validate all required sections have content
    for (const section of templateToUse.sections) {
      if (section.required && !sectionHasContent(artifact, section.name)) {
        errors.push({
          field: section.name,
          message: `Required section '${section.name}' is missing or empty`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates an RFC against a template
   * @param rfc - The RFC to validate
   * @param template - Optional template to validate against
   * @returns ValidationResult
   */
  validateRFC(rfc: RFC, template?: Template): ValidationResult {
    return this.validateAgainstTemplate(rfc, template);
  }

  /**
   * Validates an ADR against a template
   * @param adr - The ADR to validate
   * @param template - Optional template to validate against
   * @returns ValidationResult
   */
  validateADR(adr: ADR, template?: Template): ValidationResult {
    return this.validateAgainstTemplate(adr, template);
  }

  /**
   * Validates a DecompositionPlan against a template
   * @param plan - The DecompositionPlan to validate
   * @param template - Optional template to validate against
   * @returns ValidationResult
   */
  validateDecompositionPlan(plan: DecompositionPlan, template?: Template): ValidationResult {
    return this.validateAgainstTemplate(plan, template);
  }
}
