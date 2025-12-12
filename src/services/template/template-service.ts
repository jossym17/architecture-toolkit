// Template Management Service for Architecture Documentation Toolkit

import * as fs from 'fs/promises';
import * as path from 'path';
import { Template, TemplateSection } from '../../models/template.js';
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
 * JSON structure for template export/import
 */
export interface TemplateJSON {
  id: string;
  name: string;
  artifactType: ArtifactType;
  sections: TemplateSection[];
}

/**
 * Result of template import operation
 */
export interface TemplateImportResult {
  success: boolean;
  template?: Template;
  errors: ValidationError[];
}

/**
 * Configuration for the template service
 */
export interface TemplateServiceConfig {
  /** Base directory for template storage (default: .arch) */
  baseDir: string;
}

const DEFAULT_CONFIG: TemplateServiceConfig = {
  baseDir: '.arch'
};

/**
 * Valid artifact types for validation
 */
const VALID_ARTIFACT_TYPES: ArtifactType[] = ['rfc', 'adr', 'decomposition'];

/**
 * Template management service
 * Handles loading, creating, exporting, and importing templates
 */
export class TemplateService {
  private config: TemplateServiceConfig;
  private customTemplates: Map<string, Template> = new Map();

  constructor(config: Partial<TemplateServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets the templates directory path
   */
  private getTemplatesDir(): string {
    return path.join(this.config.baseDir, 'templates');
  }

  /**
   * Gets the file path for a template
   */
  private getTemplatePath(id: string): string {
    return path.join(this.getTemplatesDir(), `${id}.json`);
  }

  /**
   * Loads the default template for an artifact type
   * @param artifactType - The artifact type
   * @returns The default template for the type
   */
  getDefaultTemplate(artifactType: ArtifactType): Template {
    switch (artifactType) {
      case 'rfc':
        return { ...DEFAULT_RFC_TEMPLATE };
      case 'adr':
        return { ...DEFAULT_ADR_TEMPLATE };
      case 'decomposition':
        return { ...DEFAULT_DECOMPOSITION_TEMPLATE };
      default:
        throw new Error(`Unknown artifact type: ${artifactType}`);
    }
  }

  /**
   * Gets a template by ID
   * Returns custom template if found, otherwise returns default for the artifact type
   * @param id - The template ID
   * @param artifactType - Fallback artifact type for default template
   * @returns The template
   */
  getTemplate(id: string, artifactType?: ArtifactType): Template | null {
    // Check custom templates first
    if (this.customTemplates.has(id)) {
      return this.customTemplates.get(id)!;
    }

    // Check if it's a default template ID
    if (id === 'default-rfc') return this.getDefaultTemplate('rfc');
    if (id === 'default-adr') return this.getDefaultTemplate('adr');
    if (id === 'default-decomposition') return this.getDefaultTemplate('decomposition');

    // If artifact type provided, return default for that type
    if (artifactType) {
      return this.getDefaultTemplate(artifactType);
    }

    return null;
  }

  /**
   * Lists all available templates (default + custom)
   * @returns Array of all templates
   */
  listTemplates(): Template[] {
    const templates: Template[] = [
      this.getDefaultTemplate('rfc'),
      this.getDefaultTemplate('adr'),
      this.getDefaultTemplate('decomposition'),
    ];

    // Add custom templates
    for (const template of this.customTemplates.values()) {
      templates.push(template);
    }

    return templates;
  }


  /**
   * Creates a custom template with required/optional sections
   * @param data - Template data
   * @returns The created template
   */
  createTemplate(data: {
    id: string;
    name: string;
    artifactType: ArtifactType;
    sections: TemplateSection[];
  }): Template {
    // Validate the template data
    const validation = this.validateTemplateData(data);
    if (!validation.valid) {
      throw new Error(`Invalid template: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const template: Template = {
      id: data.id,
      name: data.name,
      artifactType: data.artifactType,
      sections: data.sections.map(s => ({
        name: s.name,
        required: s.required,
        description: s.description,
        defaultContent: s.defaultContent,
      })),
    };

    this.customTemplates.set(template.id, template);
    return template;
  }

  /**
   * Registers an existing template
   * @param template - The template to register
   */
  registerTemplate(template: Template): void {
    this.customTemplates.set(template.id, template);
  }

  /**
   * Removes a custom template
   * @param id - The template ID to remove
   * @returns true if removed, false if not found
   */
  removeTemplate(id: string): boolean {
    return this.customTemplates.delete(id);
  }

  /**
   * Validates template data structure
   * @param data - The template data to validate
   * @returns ValidationResult
   */
  validateTemplateData(data: unknown): ValidationResult {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'template', message: 'Template must be an object' });
      return { valid: false, errors };
    }

    const template = data as Record<string, unknown>;

    // Validate id
    if (!template.id || typeof template.id !== 'string') {
      errors.push({ field: 'id', message: 'Template id must be a non-empty string' });
    } else if (template.id.trim().length === 0) {
      errors.push({ field: 'id', message: 'Template id cannot be empty' });
    }

    // Validate name
    if (!template.name || typeof template.name !== 'string') {
      errors.push({ field: 'name', message: 'Template name must be a non-empty string' });
    } else if (template.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Template name cannot be empty' });
    }

    // Validate artifactType
    if (!template.artifactType || typeof template.artifactType !== 'string') {
      errors.push({ field: 'artifactType', message: 'Template artifactType must be a string' });
    } else if (!VALID_ARTIFACT_TYPES.includes(template.artifactType as ArtifactType)) {
      errors.push({ 
        field: 'artifactType', 
        message: `Template artifactType must be one of: ${VALID_ARTIFACT_TYPES.join(', ')}` 
      });
    }

    // Validate sections
    if (!Array.isArray(template.sections)) {
      errors.push({ field: 'sections', message: 'Template sections must be an array' });
    } else {
      for (let i = 0; i < template.sections.length; i++) {
        const section = template.sections[i] as Record<string, unknown>;
        const sectionErrors = this.validateSectionData(section, i);
        errors.push(...sectionErrors);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates a single section's data
   */
  private validateSectionData(section: unknown, index: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const prefix = `sections[${index}]`;

    if (!section || typeof section !== 'object') {
      errors.push({ field: prefix, message: `Section at index ${index} must be an object` });
      return errors;
    }

    const s = section as Record<string, unknown>;

    if (!s.name || typeof s.name !== 'string') {
      errors.push({ field: `${prefix}.name`, message: 'Section name must be a non-empty string' });
    } else if (s.name.trim().length === 0) {
      errors.push({ field: `${prefix}.name`, message: 'Section name cannot be empty' });
    }

    if (typeof s.required !== 'boolean') {
      errors.push({ field: `${prefix}.required`, message: 'Section required must be a boolean' });
    }

    if (!s.description || typeof s.description !== 'string') {
      errors.push({ field: `${prefix}.description`, message: 'Section description must be a non-empty string' });
    }

    // defaultContent is optional, but if present must be a string
    if (s.defaultContent !== undefined && typeof s.defaultContent !== 'string') {
      errors.push({ field: `${prefix}.defaultContent`, message: 'Section defaultContent must be a string if provided' });
    }

    return errors;
  }


  /**
   * Exports a template to JSON format
   * @param templateId - The template ID to export
   * @returns JSON string representation of the template
   */
  exportTemplate(templateId: string): string {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const json: TemplateJSON = {
      id: template.id,
      name: template.name,
      artifactType: template.artifactType,
      sections: template.sections.map(s => ({
        name: s.name,
        required: s.required,
        description: s.description,
        ...(s.defaultContent !== undefined && { defaultContent: s.defaultContent }),
      })),
    };

    return JSON.stringify(json, null, 2);
  }

  /**
   * Imports a template from JSON string
   * @param jsonString - The JSON string to import
   * @returns TemplateImportResult with success status and template or errors
   */
  importTemplate(jsonString: string): TemplateImportResult {
    let parsed: unknown;

    // Parse JSON
    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      return {
        success: false,
        errors: [{ field: 'json', message: `Invalid JSON: ${(error as Error).message}` }],
      };
    }

    // Validate structure
    const validation = this.validateTemplateData(parsed);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Create and register the template
    const data = parsed as TemplateJSON;
    const template: Template = {
      id: data.id,
      name: data.name,
      artifactType: data.artifactType,
      sections: data.sections.map(s => ({
        name: s.name,
        required: s.required,
        description: s.description,
        defaultContent: s.defaultContent,
      })),
    };

    this.customTemplates.set(template.id, template);

    return {
      success: true,
      template,
      errors: [],
    };
  }

  /**
   * Saves a template to the filesystem
   * @param templateId - The template ID to save
   */
  async saveTemplate(templateId: string): Promise<void> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const templatesDir = this.getTemplatesDir();
    await fs.mkdir(templatesDir, { recursive: true });

    const filePath = this.getTemplatePath(templateId);
    const json = this.exportTemplate(templateId);
    await fs.writeFile(filePath, json, 'utf-8');
  }

  /**
   * Loads a template from the filesystem
   * @param templateId - The template ID to load
   * @returns The loaded template or null if not found
   */
  async loadTemplate(templateId: string): Promise<Template | null> {
    const filePath = this.getTemplatePath(templateId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = this.importTemplate(content);
      if (result.success && result.template) {
        return result.template;
      }
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Loads all custom templates from the filesystem
   */
  async loadAllTemplates(): Promise<void> {
    const templatesDir = this.getTemplatesDir();

    try {
      const files = await fs.readdir(templatesDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(templatesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          this.importTemplate(content);
        } catch {
          // Skip files that can't be parsed
          continue;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Directory doesn't exist, no templates to load
    }
  }

  /**
   * Deletes a template from the filesystem
   * @param templateId - The template ID to delete
   * @returns true if deleted, false if not found
   */
  async deleteTemplate(templateId: string): Promise<boolean> {
    const filePath = this.getTemplatePath(templateId);

    try {
      await fs.unlink(filePath);
      this.customTemplates.delete(templateId);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Still remove from memory if it exists there
        return this.customTemplates.delete(templateId);
      }
      throw error;
    }
  }
}
