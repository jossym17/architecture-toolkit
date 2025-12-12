/**
 * Interactive Prompt Service
 * 
 * Handles interactive prompting for missing artifact fields,
 * TTY detection, smart defaults from git config, and validation.
 */

import inquirer from 'inquirer';
import { simpleGit, SimpleGit } from 'simple-git';
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
 * Error thrown when interactive mode is required but not available
 */
export class InteractiveError extends Error {
  readonly code = 'INTERACTIVE_ERROR';
  readonly missingFields: string[];

  constructor(missingFields: string[]) {
    const fieldList = missingFields.join(', ');
    super(
      `Interactive mode required but terminal does not support TTY input.\n` +
      `Missing required fields: ${fieldList}\n` +
      `Please provide these fields via command line flags.`
    );
    this.name = 'InteractiveError';
    this.missingFields = missingFields;
  }
}

/**
 * Result of title uniqueness validation
 */
export interface TitleValidationResult {
  isUnique: boolean;
  duplicates: TitleDuplicate[];
}

/**
 * Information about a duplicate title match
 */
export interface TitleDuplicate {
  id: string;
  title: string;
  matchType: 'exact' | 'fuzzy';
  similarity?: number;
}

/**
 * Required fields per artifact type
 */
export const REQUIRED_FIELDS: Record<ArtifactType, string[]> = {
  rfc: ['title', 'owner'],
  adr: ['title', 'owner'],
  decomposition: ['title', 'owner']
};

/**
 * Field display names for prompts
 */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  owner: 'Owner',
  tags: 'Tags'
};

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
  getMissingRequiredFields(artifactType: ArtifactType, providedFields: Partial<ArtifactInput>): string[];
  getGitUserName(): Promise<string | undefined>;
  getSmartDefaults(): Promise<Record<string, string>>;
  getTagSuggestionsFromArtifacts(artifacts: Array<{ tags: string[] }>, limit?: number): string[];
  getTagSuggestions(artifactType: ArtifactType, recentArtifacts: Array<{ tags: string[] }>): string[];
  validateTitleUniqueness(title: string, existingArtifacts: Array<{ title: string; id: string }>): TitleValidationResult;
}

/**
 * Prompt Service Implementation
 * 
 * Provides interactive prompting capabilities for CLI commands
 * with TTY detection, smart defaults, and validation.
 */
export class PromptService implements IPromptService {
  private git: SimpleGit;

  constructor(basePath?: string) {
    this.git = simpleGit(basePath);
  }

  /**
   * Check if the terminal supports interactive input
   */
  isInteractive(): boolean {
    return process.stdin.isTTY === true;
  }

  /**
   * Get the git user.name from git config
   * Falls back to git user.email if user.name is not set
   * 
   * @returns The git user name or email, or undefined if not available
   */
  async getGitUserName(): Promise<string | undefined> {
    try {
      // Try to get user.name first
      const userName = await this.git.getConfig('user.name', 'global');
      if (userName.value && userName.value.trim()) {
        return userName.value.trim();
      }

      // Fall back to user.email
      const userEmail = await this.git.getConfig('user.email', 'global');
      if (userEmail.value && userEmail.value.trim()) {
        return userEmail.value.trim();
      }

      return undefined;
    } catch {
      // Git not available or not configured
      return undefined;
    }
  }

  /**
   * Get smart defaults for artifact creation
   * Includes git user.name for owner field
   * 
   * @returns Record of field names to default values
   */
  async getSmartDefaults(): Promise<Record<string, string>> {
    const defaults: Record<string, string> = {};

    // Get git user name for owner default
    const gitUser = await this.getGitUserName();
    if (gitUser) {
      defaults.owner = gitUser;
    }

    return defaults;
  }

  /**
   * Get tag suggestions from recent artifacts of the same type
   * 
   * @param artifacts - Array of artifacts to extract tags from
   * @param limit - Maximum number of suggestions to return (default: 10)
   * @returns Array of unique tag suggestions sorted by frequency
   */
  getTagSuggestionsFromArtifacts(
    artifacts: Array<{ tags: string[] }>,
    limit: number = 10
  ): string[] {
    // Count tag frequency
    const tagCounts = new Map<string, number>();
    
    for (const artifact of artifacts) {
      if (artifact.tags && Array.isArray(artifact.tags)) {
        for (const tag of artifact.tags) {
          const normalizedTag = tag.trim().toLowerCase();
          if (normalizedTag) {
            tagCounts.set(normalizedTag, (tagCounts.get(normalizedTag) || 0) + 1);
          }
        }
      }
    }

    // Sort by frequency (descending) and return top suggestions
    const sortedTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, limit);

    return sortedTags;
  }

  /**
   * Get tag suggestions for a specific artifact type
   * This method is designed to be used with a FileStore to query recent artifacts
   * 
   * @param artifactType - The type of artifact being created
   * @param recentArtifacts - Recent artifacts of the same type
   * @returns Array of suggested tags
   */
  getTagSuggestions(
    artifactType: ArtifactType,
    recentArtifacts: Array<{ tags: string[] }>
  ): string[] {
    return this.getTagSuggestionsFromArtifacts(recentArtifacts);
  }

  /**
   * Result of title uniqueness validation
   */
  validateTitleUniqueness(
    title: string,
    existingArtifacts: Array<{ title: string; id: string }>
  ): TitleValidationResult {
    const normalizedTitle = title.trim().toLowerCase();
    
    if (!normalizedTitle) {
      return { isUnique: true, duplicates: [] };
    }

    const duplicates: TitleDuplicate[] = [];

    for (const artifact of existingArtifacts) {
      const existingNormalized = artifact.title.trim().toLowerCase();
      
      // Check for exact match
      if (existingNormalized === normalizedTitle) {
        duplicates.push({
          id: artifact.id,
          title: artifact.title,
          matchType: 'exact'
        });
        continue;
      }

      // Check for fuzzy match using simple similarity
      const similarity = this.calculateSimilarity(normalizedTitle, existingNormalized);
      if (similarity >= 0.8) { // 80% similarity threshold
        duplicates.push({
          id: artifact.id,
          title: artifact.title,
          matchType: 'fuzzy',
          similarity
        });
      }
    }

    return {
      isUnique: duplicates.length === 0,
      duplicates
    };
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   * Returns a value between 0 (completely different) and 1 (identical)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Create a matrix to store distances
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // Fill in the rest of the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Get the list of missing required fields for an artifact type
   */
  getMissingRequiredFields(
    artifactType: ArtifactType,
    providedFields: Partial<ArtifactInput>
  ): string[] {
    const requiredFields = REQUIRED_FIELDS[artifactType] || [];
    return requiredFields.filter(field => {
      const value = providedFields[field];
      // Field is missing if undefined, null, or empty string
      if (value === undefined || value === null) return true;
      if (typeof value === 'string' && value.trim() === '') return true;
      return false;
    });
  }

  /**
   * Prompt for missing required fields
   * 
   * @param artifactType - The type of artifact being created
   * @param providedFields - Fields already provided via command line
   * @param options - Optional prompt configuration (defaults, suggestions, validators)
   * @returns Complete artifact input with all required fields
   * @throws InteractiveError if TTY not available and fields are missing
   */
  async promptForMissingFields(
    artifactType: ArtifactType,
    providedFields: Partial<ArtifactInput>,
    options?: PromptOptions
  ): Promise<ArtifactInput> {
    const missingFields = this.getMissingRequiredFields(artifactType, providedFields);

    // If no fields are missing, return the provided fields as complete input
    if (missingFields.length === 0) {
      return {
        title: providedFields.title ?? '',
        owner: providedFields.owner ?? '',
        tags: providedFields.tags ?? [],
        ...providedFields
      };
    }

    // Check if we can prompt interactively
    if (!this.isInteractive()) {
      throw new InteractiveError(missingFields);
    }

    // Build prompts for missing fields only
    const questions = this.buildQuestions(missingFields, options);
    
    // Prompt user for missing fields
    const answers = await inquirer.prompt(questions);

    // Merge provided fields with prompted answers
    const result: ArtifactInput = {
      title: providedFields.title ?? answers.title ?? '',
      owner: providedFields.owner ?? answers.owner ?? '',
      tags: providedFields.tags ?? this.parseTags(answers.tags)
    };

    // Copy any additional provided fields
    for (const key of Object.keys(providedFields)) {
      if (!(key in result)) {
        result[key] = providedFields[key];
      }
    }

    return result;
  }

  /**
   * Build inquirer questions for missing fields
   */
  private buildQuestions(
    missingFields: string[],
    options?: PromptOptions
  ): Array<{ type: string; name: string; message: string; default?: string; validate?: (input: string) => boolean | string }> {
    const questions: Array<{ type: string; name: string; message: string; default?: string; validate?: (input: string) => boolean | string }> = [];

    for (const field of missingFields) {
      const label = FIELD_LABELS[field] || field;
      const defaultValue = options?.defaults?.[field];
      const suggestions = options?.suggestions?.[field];
      const validator = options?.validators?.[field];

      if (field === 'tags') {
        // Tags use autocomplete-style input with suggestions
        questions.push({
          type: 'input',
          name: field,
          message: `${label} (comma-separated):`,
          default: defaultValue || (suggestions ? suggestions.join(', ') : undefined),
          validate: validator 
            ? (input: string) => {
                const result = validator(input);
                return result.valid || result.message || 'Invalid input';
              }
            : undefined
        });
      } else {
        // Standard text input
        questions.push({
          type: 'input',
          name: field,
          message: `${label}:`,
          default: defaultValue,
          validate: (input: string) => {
            // Required field validation
            if (!input || input.trim() === '') {
              return `${label} is required`;
            }
            // Custom validator if provided
            if (validator) {
              const result = validator(input);
              return result.valid || result.message || 'Invalid input';
            }
            return true;
          }
        });
      }
    }

    return questions;
  }

  /**
   * Parse comma-separated tags string into array
   */
  private parseTags(tagsInput: string | string[] | undefined): string[] {
    if (!tagsInput) return [];
    if (Array.isArray(tagsInput)) return tagsInput;
    return tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);
  }

  /**
   * Prompt for link type selection
   */
  async promptForLinkType(): Promise<LinkType> {
    if (!this.isInteractive()) {
      throw new InteractiveError(['type']);
    }

    const { linkType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'linkType',
        message: 'Select relationship type:',
        choices: [
          { name: 'Implements - Target implements this artifact', value: 'implements' },
          { name: 'Supersedes - This artifact supersedes target', value: 'supersedes' },
          { name: 'Relates to - General relationship', value: 'relates-to' },
          { name: 'Depends on - This artifact depends on target', value: 'depends-on' },
          { name: 'Blocks - This artifact blocks target', value: 'blocks' },
          { name: 'Enables - This artifact enables target', value: 'enables' }
        ],
        default: 'relates-to'
      }
    ]);

    return linkType;
  }

  /**
   * Prompt for confirmation
   */
  async promptForConfirmation(message: string): Promise<boolean> {
    if (!this.isInteractive()) {
      // In non-interactive mode, default to false for safety
      return false;
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: false
      }
    ]);

    return confirmed;
  }
}
