// ADR Service for Architecture Documentation Toolkit

import { ADR, Alternative } from '../../models/adr.js';
import { ADRStatus } from '../../models/types.js';
import { Reference } from '../../models/reference.js';
import { ValidationResult } from '../../models/validation.js';
import { IdGenerator } from '../id-generator.js';
import { FileStore, ArtifactFilters } from '../storage/file-store.js';
import { ArtifactValidator } from '../validation/validator.js';

/**
 * Data for creating a new ADR
 */
export interface CreateADRData {
  title: string;
  owner: string;
  context?: string;
  decision?: string;
  consequences?: string[];
  alternativesConsidered?: Alternative[];
  tags?: string[];
  references?: Reference[];
}

/**
 * Data for updating an existing ADR
 */
export interface UpdateADRData {
  title?: string;
  owner?: string;
  status?: ADRStatus;
  context?: string;
  decision?: string;
  consequences?: string[];
  alternativesConsidered?: Alternative[];
  tags?: string[];
  references?: Reference[];
  supersededBy?: string;
}

/**
 * ADR Service for managing Architecture Decision Records
 * Implements CRUD operations with template generation, validation, and status tracking
 */
export class ADRService {
  private idGenerator: IdGenerator;
  private fileStore: FileStore;
  private validator: ArtifactValidator;

  /**
   * Creates a new ADRService instance
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
   * Creates a new ADR with template generation
   * Generates a unique ID and populates default template sections
   * 
   * @param data - The ADR creation data
   * @returns The created ADR
   * @throws Error if validation fails
   */
  async create(data: CreateADRData): Promise<ADR> {
    const now = new Date();
    const id = this.idGenerator.generateId('adr');

    const adr: ADR = {
      id,
      type: 'adr',
      title: data.title,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      owner: data.owner,
      tags: data.tags ?? [],
      references: data.references ?? [],
      context: data.context ?? '[Describe the context and background for this decision]',
      decision: data.decision ?? '[Describe the decision that was made]',
      consequences: data.consequences ?? ['[List the consequences of this decision]'],
      alternativesConsidered: data.alternativesConsidered ?? [{
        name: 'Alternative 1',
        description: '[Describe this alternative]',
        rejectionReason: '[Explain why this alternative was not chosen]'
      }]
    };

    // Validate the ADR
    const validationResult = this.validator.validateADR(adr);
    if (!validationResult.valid) {
      throw new Error(`ADR validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(adr);

    return adr;
  }

  /**
   * Gets an ADR by ID
   * 
   * @param id - The ADR ID (e.g., ADR-0001)
   * @returns The ADR or null if not found
   */
  async get(id: string): Promise<ADR | null> {
    const artifact = await this.fileStore.load(id);
    if (!artifact || artifact.type !== 'adr') {
      return null;
    }
    return artifact as ADR;
  }

  /**
   * Updates an existing ADR
   * Tracks status changes with timestamps
   * Handles superseded status with required reference
   * 
   * @param id - The ADR ID to update
   * @param data - The update data
   * @returns The updated ADR
   * @throws Error if ADR not found or validation fails
   */
  async update(id: string, data: UpdateADRData): Promise<ADR> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`ADR not found: ${id}`);
    }

    const now = new Date();
    
    // Build updated ADR
    const updatedADR: ADR = {
      ...existing,
      title: data.title ?? existing.title,
      owner: data.owner ?? existing.owner,
      status: data.status ?? existing.status,
      context: data.context ?? existing.context,
      decision: data.decision ?? existing.decision,
      consequences: data.consequences ?? existing.consequences,
      alternativesConsidered: data.alternativesConsidered ?? existing.alternativesConsidered,
      tags: data.tags ?? existing.tags,
      references: data.references ?? existing.references,
      updatedAt: now
    };

    // Handle supersededBy field
    if (data.supersededBy !== undefined) {
      updatedADR.supersededBy = data.supersededBy;
    }

    // Validate the updated ADR
    const validationResult = this.validator.validateADR(updatedADR);
    if (!validationResult.valid) {
      throw new Error(`ADR validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(updatedADR);

    return updatedADR;
  }


  /**
   * Deletes an ADR by ID
   * 
   * @param id - The ADR ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    return await this.fileStore.delete(id);
  }

  /**
   * Lists ADRs with optional filtering
   * Supports filtering by status, date range, and owner
   * 
   * @param filters - Optional filters to apply
   * @returns Array of ADRs matching the filters
   */
  async list(filters?: ArtifactFilters): Promise<ADR[]> {
    const artifacts = await this.fileStore.list({
      ...filters,
      type: 'adr'
    });
    return artifacts as ADR[];
  }

  /**
   * Validates an ADR without saving
   * 
   * @param adr - The ADR to validate
   * @returns Validation result
   */
  validate(adr: ADR): ValidationResult {
    return this.validator.validateADR(adr);
  }

  /**
   * Changes the status of an ADR and records the timestamp
   * 
   * @param id - The ADR ID
   * @param newStatus - The new status
   * @param supersededBy - Required when status is 'superseded', the ID of the superseding ADR
   * @returns The updated ADR
   * @throws Error if ADR not found or if supersededBy is missing when status is 'superseded'
   */
  async changeStatus(id: string, newStatus: ADRStatus, supersededBy?: string): Promise<ADR> {
    // Validate that supersededBy is provided when status is 'superseded'
    if (newStatus === 'superseded' && !supersededBy) {
      throw new Error('Reference to superseding ADR is required when changing status to superseded');
    }

    const updateData: UpdateADRData = { status: newStatus };
    if (supersededBy) {
      updateData.supersededBy = supersededBy;
    }

    return await this.update(id, updateData);
  }

  /**
   * Marks an ADR as superseded by another ADR
   * 
   * @param id - The ADR ID to mark as superseded
   * @param supersedingAdrId - The ID of the ADR that supersedes this one
   * @returns The updated ADR
   * @throws Error if ADR not found or superseding ADR doesn't exist
   */
  async markSuperseded(id: string, supersedingAdrId: string): Promise<ADR> {
    // Verify the superseding ADR exists
    const supersedingAdr = await this.get(supersedingAdrId);
    if (!supersedingAdr) {
      throw new Error(`Superseding ADR not found: ${supersedingAdrId}`);
    }

    return await this.changeStatus(id, 'superseded', supersedingAdrId);
  }

  /**
   * Adds an alternative to an ADR
   * 
   * @param id - The ADR ID
   * @param alternative - The alternative to add
   * @returns The updated ADR
   * @throws Error if ADR not found
   */
  async addAlternative(id: string, alternative: Alternative): Promise<ADR> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`ADR not found: ${id}`);
    }

    const alternativesConsidered = [...existing.alternativesConsidered, alternative];
    return await this.update(id, { alternativesConsidered });
  }

  /**
   * Checks if an ADR exists
   * 
   * @param id - The ADR ID to check
   * @returns true if the ADR exists
   */
  async exists(id: string): Promise<boolean> {
    return await this.fileStore.exists(id);
  }
}
