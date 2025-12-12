/**
 * Interactive Prompt Service
 * 
 * Handles interactive prompting for missing artifact fields,
 * TTY detection, smart defaults from git config, and validation.
 */

import type { ArtifactType } from '../../models/types.js';
import type { LinkType } from '../link/link-service.js';

/**
 * Result of field validation for prompts
 */
export interface PromptValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Options for prompting behavior
 */
export interface PromptOptions {
  defaults?: Record<string, string>;
  suggestions?: Record<string, string[]>;
  validators?: Record<string, (value: string) => PromptValidationResult>;
}

/**
 * Input fields for artifact creation
 */
export interface ArtifactInput {
  title: string;
  owner: string;
  tags: string[];
  [key: string]: unknown;
}

/**
 * Prompt Service Interface
 */
export interface IPromptService {
  promptForMissingFields(
    artifactType: ArtifactType,
    providedFields: Partial<ArtifactInput>,
    options?: PromptOptions
  ): Promise<ArtifactInput>;
  
  promptForLinkType(): Promise<LinkType>;
  promptForConfirmation(message: string): Promise<boolean>;
  isInteractive(): boolean;
}

/**
 * Prompt Service Implementation
 */
export class PromptService implements IPromptService {
  /**
   * Check if the terminal supports interactive input
   */
  isInteractive(): boolean {
    return process.stdin.isTTY === true;
  }

  /**
   * Prompt for missing required fields
   */
  async promptForMissingFields(
    _artifactType: ArtifactType,
    providedFields: Partial<ArtifactInput>,
    _options?: PromptOptions
  ): Promise<ArtifactInput> {
    // Placeholder implementation - will be fully implemented in task 2
    return {
      title: providedFields.title ?? '',
      owner: providedFields.owner ?? '',
      tags: providedFields.tags ?? [],
      ...providedFields
    };
  }

  /**
   * Prompt for link type selection
   */
  async promptForLinkType(): Promise<LinkType> {
    // Placeholder implementation - will be fully implemented in task 2
    return 'relates-to';
  }

  /**
   * Prompt for confirmation
   */
  async promptForConfirmation(_message: string): Promise<boolean> {
    // Placeholder implementation - will be fully implemented in task 2
    return true;
  }
}
