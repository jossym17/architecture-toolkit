/**
 * Batch Operations Service
 * 
 * Provides batch update operations for artifacts with filter expressions,
 * preview mode, and confirmation prompts.
 * 
 * Requirements: 7.1, 7.3, 7.4
 */

import { Artifact } from '../../models/artifact.js';
import { ArtifactType, ArtifactStatus } from '../../models/types.js';
import { FileStore } from '../storage/file-store.js';

/**
 * Filter expression for batch operations
 */
export interface BatchFilter {
  /** Filter by artifact type */
  type?: ArtifactType;
  /** Filter by status */
  status?: ArtifactStatus | string;
  /** Filter by owner */
  owner?: string;
  /** Filter by tags (artifact must have ALL specified tags) */
  tags?: string[];
  /** Filter by creation date (from) */
  dateFrom?: Date;
  /** Filter by creation date (to) */
  dateTo?: Date;
  /** Filter by ID pattern (regex) */
  idPattern?: string;
  /** Filter by title pattern (regex) */
  titlePattern?: string;
}

/**
 * Update operations to apply to matching artifacts
 */
export interface BatchUpdate {
  /** New status to set */
  status?: ArtifactStatus | string;
  /** New owner to set */
  owner?: string;
  /** Tags to add */
  addTags?: string[];
  /** Tags to remove */
  removeTags?: string[];
  /** Custom field updates */
  customFields?: Record<string, unknown>;
}

/**
 * Result of a batch operation preview
 */
export interface BatchPreview {
  /** Artifacts that match the filter */
  matchingArtifacts: Artifact[];
  /** Count of matching artifacts */
  count: number;
  /** Updates that will be applied */
  updates: BatchUpdate;
  /** Preview of changes for each artifact */
  changes: BatchChangePreview[];
}

/**
 * Preview of changes for a single artifact
 */
export interface BatchChangePreview {
  artifactId: string;
  artifactTitle: string;
  changes: FieldChange[];
}

/**
 * A single field change
 */
export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Result of a batch update operation
 */
export interface BatchResult {
  /** Number of artifacts updated */
  updatedCount: number;
  /** IDs of updated artifacts */
  updatedIds: string[];
  /** Errors encountered during update */
  errors: BatchError[];
  /** Whether the operation was successful */
  success: boolean;
}

/**
 * Error during batch operation
 */
export interface BatchError {
  artifactId: string;
  message: string;
}

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /** Skip confirmation prompt */
  skipConfirmation?: boolean;
  /** Dry run - don't actually apply changes */
  dryRun?: boolean;
}


/**
 * Batch Operations Service
 * 
 * Provides batch update operations for artifacts with filter expressions,
 * preview mode, and confirmation prompts.
 */
export class BatchService {
  private fileStore: FileStore;

  constructor(fileStore: FileStore) {
    this.fileStore = fileStore;
  }

  /**
   * Parse a filter expression string into a BatchFilter object
   * 
   * Supported filter syntax:
   * - type:rfc - filter by artifact type
   * - status:draft - filter by status
   * - owner:john - filter by owner
   * - tag:architecture - filter by tag (can be repeated)
   * - id:/RFC-00\d+/ - filter by ID pattern (regex)
   * - title:/migration/i - filter by title pattern (regex)
   * 
   * @param filterExpression - Filter expression string
   * @returns Parsed BatchFilter object
   */
  parseFilter(filterExpression: string): BatchFilter {
    const filter: BatchFilter = {};
    
    if (!filterExpression || filterExpression.trim() === '') {
      return filter;
    }

    // Split by spaces, but respect quoted strings
    const parts = this.tokenizeFilterExpression(filterExpression);
    const tags: string[] = [];

    for (const part of parts) {
      const colonIndex = part.indexOf(':');
      if (colonIndex === -1) continue;

      const key = part.substring(0, colonIndex).toLowerCase();
      const value = part.substring(colonIndex + 1);

      switch (key) {
        case 'type':
          if (this.isValidArtifactType(value)) {
            filter.type = value as ArtifactType;
          }
          break;
        case 'status':
          filter.status = value;
          break;
        case 'owner':
          filter.owner = value;
          break;
        case 'tag':
          tags.push(value);
          break;
        case 'id':
          filter.idPattern = this.extractPattern(value);
          break;
        case 'title':
          filter.titlePattern = this.extractPattern(value);
          break;
        case 'from':
        case 'datefrom':
          filter.dateFrom = new Date(value);
          break;
        case 'to':
        case 'dateto':
          filter.dateTo = new Date(value);
          break;
      }
    }

    if (tags.length > 0) {
      filter.tags = tags;
    }

    return filter;
  }

  /**
   * Tokenize a filter expression, respecting quoted strings
   */
  private tokenizeFilterExpression(expression: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (const char of expression) {
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          tokens.push(current.trim());
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  /**
   * Extract regex pattern from a value (handles /pattern/flags syntax)
   */
  private extractPattern(value: string): string {
    if (value.startsWith('/') && value.lastIndexOf('/') > 0) {
      // Extract pattern from /pattern/flags format
      const lastSlash = value.lastIndexOf('/');
      return value.substring(1, lastSlash);
    }
    return value;
  }

  /**
   * Check if a value is a valid artifact type
   */
  private isValidArtifactType(value: string): boolean {
    return ['rfc', 'adr', 'decomposition'].includes(value.toLowerCase());
  }

  /**
   * Find all artifacts matching the filter
   * 
   * @param filter - Filter to apply
   * @returns Array of matching artifacts
   */
  async findMatching(filter: BatchFilter): Promise<Artifact[]> {
    // Get all artifacts with basic filters
    const artifacts = await this.fileStore.list({
      type: filter.type,
      status: filter.status,
      owner: filter.owner,
      tags: filter.tags,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo
    });

    // Apply additional pattern filters
    return artifacts.filter(artifact => {
      // ID pattern filter
      if (filter.idPattern) {
        try {
          const regex = new RegExp(filter.idPattern, 'i');
          if (!regex.test(artifact.id)) {
            return false;
          }
        } catch {
          // Invalid regex, skip this filter
        }
      }

      // Title pattern filter
      if (filter.titlePattern) {
        try {
          const regex = new RegExp(filter.titlePattern, 'i');
          if (!regex.test(artifact.title)) {
            return false;
          }
        } catch {
          // Invalid regex, skip this filter
        }
      }

      return true;
    });
  }

  /**
   * Preview the changes that would be made by a batch update
   * 
   * @param filter - Filter to select artifacts
   * @param updates - Updates to apply
   * @returns Preview of the batch operation
   */
  async preview(filter: BatchFilter, updates: BatchUpdate): Promise<BatchPreview> {
    const matchingArtifacts = await this.findMatching(filter);
    const changes: BatchChangePreview[] = [];

    for (const artifact of matchingArtifacts) {
      const fieldChanges = this.calculateChanges(artifact, updates);
      if (fieldChanges.length > 0) {
        changes.push({
          artifactId: artifact.id,
          artifactTitle: artifact.title,
          changes: fieldChanges
        });
      }
    }

    return {
      matchingArtifacts,
      count: matchingArtifacts.length,
      updates,
      changes
    };
  }

  /**
   * Calculate the changes that would be made to an artifact
   */
  private calculateChanges(artifact: Artifact, updates: BatchUpdate): FieldChange[] {
    const changes: FieldChange[] = [];

    // Status change
    if (updates.status !== undefined && artifact.status !== updates.status) {
      changes.push({
        field: 'status',
        oldValue: artifact.status,
        newValue: updates.status
      });
    }

    // Owner change
    if (updates.owner !== undefined && artifact.owner !== updates.owner) {
      changes.push({
        field: 'owner',
        oldValue: artifact.owner,
        newValue: updates.owner
      });
    }

    // Tags to add
    if (updates.addTags && updates.addTags.length > 0) {
      const currentTags = new Set(artifact.tags);
      const tagsToAdd = updates.addTags.filter(tag => !currentTags.has(tag));
      if (tagsToAdd.length > 0) {
        changes.push({
          field: 'tags',
          oldValue: artifact.tags,
          newValue: [...artifact.tags, ...tagsToAdd]
        });
      }
    }

    // Tags to remove
    if (updates.removeTags && updates.removeTags.length > 0) {
      const tagsToRemove = new Set(updates.removeTags);
      const newTags = artifact.tags.filter(tag => !tagsToRemove.has(tag));
      if (newTags.length !== artifact.tags.length) {
        // Only add change if we haven't already added a tags change
        const existingTagChange = changes.find(c => c.field === 'tags');
        if (existingTagChange) {
          // Combine with existing tag change
          existingTagChange.newValue = (existingTagChange.newValue as string[]).filter(
            tag => !tagsToRemove.has(tag)
          );
        } else {
          changes.push({
            field: 'tags',
            oldValue: artifact.tags,
            newValue: newTags
          });
        }
      }
    }

    // Custom field updates
    if (updates.customFields) {
      for (const [field, value] of Object.entries(updates.customFields)) {
        const currentValue = (artifact as unknown as Record<string, unknown>)[field];
        if (currentValue !== value) {
          changes.push({
            field,
            oldValue: currentValue,
            newValue: value
          });
        }
      }
    }

    return changes;
  }

  /**
   * Apply updates to an artifact
   */
  private applyUpdates(artifact: Artifact, updates: BatchUpdate): Artifact {
    const updated = { ...artifact };

    // Status change
    if (updates.status !== undefined) {
      (updated as Record<string, unknown>).status = updates.status;
    }

    // Owner change
    if (updates.owner !== undefined) {
      updated.owner = updates.owner;
    }

    // Tags changes
    let newTags = [...artifact.tags];
    
    if (updates.addTags && updates.addTags.length > 0) {
      const currentTags = new Set(newTags);
      for (const tag of updates.addTags) {
        if (!currentTags.has(tag)) {
          newTags.push(tag);
        }
      }
    }

    if (updates.removeTags && updates.removeTags.length > 0) {
      const tagsToRemove = new Set(updates.removeTags);
      newTags = newTags.filter(tag => !tagsToRemove.has(tag));
    }

    updated.tags = newTags;

    // Custom field updates
    if (updates.customFields) {
      for (const [field, value] of Object.entries(updates.customFields)) {
        (updated as Record<string, unknown>)[field] = value;
      }
    }

    // Update modification timestamp
    updated.updatedAt = new Date();

    return updated;
  }

  /**
   * Execute a batch update operation
   * 
   * @param filter - Filter to select artifacts
   * @param updates - Updates to apply
   * @param options - Batch operation options
   * @returns Result of the batch operation
   */
  async update(
    filter: BatchFilter,
    updates: BatchUpdate,
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    const matchingArtifacts = await this.findMatching(filter);
    const updatedIds: string[] = [];
    const errors: BatchError[] = [];

    // If dry run, just return what would be updated
    if (options.dryRun) {
      return {
        updatedCount: matchingArtifacts.length,
        updatedIds: matchingArtifacts.map(a => a.id),
        errors: [],
        success: true
      };
    }

    // Apply updates to each matching artifact
    for (const artifact of matchingArtifacts) {
      try {
        const updated = this.applyUpdates(artifact, updates);
        await this.fileStore.save(updated);
        updatedIds.push(artifact.id);
      } catch (error) {
        errors.push({
          artifactId: artifact.id,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      updatedCount: updatedIds.length,
      updatedIds,
      errors,
      success: errors.length === 0
    };
  }

  /**
   * Format a preview for display
   */
  formatPreview(preview: BatchPreview): string {
    const lines: string[] = [];
    
    lines.push(`Found ${preview.count} artifact(s) matching the filter:`);
    lines.push('');

    for (const change of preview.changes) {
      lines.push(`  ${change.artifactId}: ${change.artifactTitle}`);
      for (const fieldChange of change.changes) {
        lines.push(`    - ${fieldChange.field}: ${JSON.stringify(fieldChange.oldValue)} → ${JSON.stringify(fieldChange.newValue)}`);
      }
    }

    if (preview.changes.length === 0 && preview.count > 0) {
      lines.push('  No changes would be made (artifacts already have the specified values)');
    }

    return lines.join('\n');
  }
}
