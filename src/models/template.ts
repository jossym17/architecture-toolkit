// Template model for artifact templates

import { ArtifactType } from './types.js';

/**
 * Represents a section within a template
 */
export interface TemplateSection {
  /** Name of the section */
  name: string;
  /** Whether this section is required */
  required: boolean;
  /** Description of what should go in this section */
  description: string;
  /** Default content for the section */
  defaultContent?: string;
}

/**
 * Template for creating new artifacts
 */
export interface Template {
  /** Unique identifier for the template */
  id: string;
  /** Display name of the template */
  name: string;
  /** Type of artifact this template creates */
  artifactType: ArtifactType;
  /** Sections defined in this template */
  sections: TemplateSection[];
}
