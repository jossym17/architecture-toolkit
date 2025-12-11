// RFC Service for Architecture Documentation Toolkit

import { RFC, Option, Signoff } from '../../models/rfc.js';
import { RFCStatus } from '../../models/types.js';
import { Reference } from '../../models/reference.js';
import { ValidationResult } from '../../models/validation.js';
import { IdGenerator } from '../id-generator.js';
import { FileStore, ArtifactFilters } from '../storage/file-store.js';
import { ArtifactValidator } from '../validation/validator.js';

/**
 * Data for creating a new RFC
 */
export interface CreateRFCData {
  title: string;
  owner: string;
  problemStatement?: string;
  successCriteria?: string[];
  options?: Option[];
  recommendedApproach?: string;
  migrationPath?: string;
  rollbackPlan?: string;
  securityNotes?: string;
  costModel?: string;
  timeline?: string;
  signoffs?: Signoff[];
  tags?: string[];
  references?: Reference[];
}

/**
 * Data for updating an existing RFC
 */
export interface UpdateRFCData {
  title?: string;
  owner?: string;
  status?: RFCStatus;
  problemStatement?: string;
  successCriteria?: string[];
  options?: Option[];
  recommendedApproach?: string;
  migrationPath?: string;
  rollbackPlan?: string;
  securityNotes?: string;
  costModel?: string;
  timeline?: string;
  signoffs?: Signoff[];
  tags?: string[];
  references?: Reference[];
}


/**
 * RFC Service for managing RFC documents
 * Implements CRUD operations with template generation, validation, and status tracking
 */
export class RFCService {
  private idGenerator: IdGenerator;
  private fileStore: FileStore;
  private validator: ArtifactValidator;

  /**
   * Creates a new RFCService instance
   * @param basePath - Base path for the .arch directory (defaults to current working directory)
   */
  constructor(basePath: string = process.cwd()) {
    this.idGenerator = new IdGenerator(basePath);
    this.fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
    this.validator = new ArtifactValidator();
  }

  /**
   * Initializes the file store (creates directory structure)
   */
  async initialize(): Promise<void> {
    await this.fileStore.initialize();
  }

  /**
   * Creates a new RFC with template generation
   * Generates a unique ID and populates default template sections
   * 
   * @param data - The RFC creation data
   * @returns The created RFC
   * @throws Error if validation fails
   */
  async create(data: CreateRFCData): Promise<RFC> {
    const now = new Date();
    const id = this.idGenerator.generateId('rfc');

    const rfc: RFC = {
      id,
      type: 'rfc',
      title: data.title,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      owner: data.owner,
      tags: data.tags ?? [],
      references: data.references ?? [],
      problemStatement: data.problemStatement ?? '[Describe the problem to be addressed]',
      successCriteria: data.successCriteria ?? ['[Define measurable success criteria]'],
      options: data.options ?? [{
        name: 'Option 1',
        description: '[Describe this option]',
        pros: ['[List advantages]'],
        cons: ['[List disadvantages]']
      }],
      recommendedApproach: data.recommendedApproach ?? '[Describe the recommended approach]',
      migrationPath: data.migrationPath ?? '[Describe the migration path]',
      rollbackPlan: data.rollbackPlan ?? '[Describe the rollback plan]',
      securityNotes: data.securityNotes ?? '[Document security considerations]',
      costModel: data.costModel ?? '[Document cost implications]',
      timeline: data.timeline ?? '[Define the timeline]',
      signoffs: data.signoffs ?? []
    };

    // Validate the RFC
    const validationResult = this.validator.validateRFC(rfc);
    if (!validationResult.valid) {
      throw new Error(`RFC validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(rfc);

    return rfc;
  }


  /**
   * Gets an RFC by ID
   * 
   * @param id - The RFC ID (e.g., RFC-0001)
   * @returns The RFC or null if not found
   */
  async get(id: string): Promise<RFC | null> {
    const artifact = await this.fileStore.load(id);
    if (!artifact || artifact.type !== 'rfc') {
      return null;
    }
    return artifact as RFC;
  }

  /**
   * Updates an existing RFC
   * Tracks status changes with timestamps
   * 
   * @param id - The RFC ID to update
   * @param data - The update data
   * @returns The updated RFC
   * @throws Error if RFC not found or validation fails
   */
  async update(id: string, data: UpdateRFCData): Promise<RFC> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`RFC not found: ${id}`);
    }

    const now = new Date();
    
    // Track status change - updatedAt is always updated
    const updatedRFC: RFC = {
      ...existing,
      title: data.title ?? existing.title,
      owner: data.owner ?? existing.owner,
      status: data.status ?? existing.status,
      problemStatement: data.problemStatement ?? existing.problemStatement,
      successCriteria: data.successCriteria ?? existing.successCriteria,
      options: data.options ?? existing.options,
      recommendedApproach: data.recommendedApproach ?? existing.recommendedApproach,
      migrationPath: data.migrationPath ?? existing.migrationPath,
      rollbackPlan: data.rollbackPlan ?? existing.rollbackPlan,
      securityNotes: data.securityNotes ?? existing.securityNotes,
      costModel: data.costModel ?? existing.costModel,
      timeline: data.timeline ?? existing.timeline,
      signoffs: data.signoffs ?? existing.signoffs,
      tags: data.tags ?? existing.tags,
      references: data.references ?? existing.references,
      updatedAt: now
    };

    // Validate the updated RFC
    const validationResult = this.validator.validateRFC(updatedRFC);
    if (!validationResult.valid) {
      throw new Error(`RFC validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(updatedRFC);

    return updatedRFC;
  }

  /**
   * Deletes an RFC by ID
   * 
   * @param id - The RFC ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    return await this.fileStore.delete(id);
  }

  /**
   * Lists RFCs with optional filtering
   * 
   * @param filters - Optional filters to apply
   * @returns Array of RFCs matching the filters
   */
  async list(filters?: ArtifactFilters): Promise<RFC[]> {
    const artifacts = await this.fileStore.list({
      ...filters,
      type: 'rfc'
    });
    return artifacts as RFC[];
  }

  /**
   * Validates an RFC without saving
   * 
   * @param rfc - The RFC to validate
   * @returns Validation result
   */
  validate(rfc: RFC): ValidationResult {
    return this.validator.validateRFC(rfc);
  }

  /**
   * Changes the status of an RFC and records the timestamp
   * 
   * @param id - The RFC ID
   * @param newStatus - The new status
   * @returns The updated RFC
   * @throws Error if RFC not found
   */
  async changeStatus(id: string, newStatus: RFCStatus): Promise<RFC> {
    return await this.update(id, { status: newStatus });
  }

  /**
   * Adds a signoff to an RFC
   * 
   * @param id - The RFC ID
   * @param signoff - The signoff to add
   * @returns The updated RFC
   * @throws Error if RFC not found
   */
  async addSignoff(id: string, signoff: Signoff): Promise<RFC> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`RFC not found: ${id}`);
    }

    const signoffs = [...existing.signoffs, signoff];
    return await this.update(id, { signoffs });
  }

  /**
   * Checks if an RFC exists
   * 
   * @param id - The RFC ID to check
   * @returns true if the RFC exists
   */
  async exists(id: string): Promise<boolean> {
    return await this.fileStore.exists(id);
  }
}
