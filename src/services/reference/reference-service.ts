// Reference Service for Architecture Documentation Toolkit

import { Reference } from '../../models/reference.js';
import { ReferenceType, ArtifactType } from '../../models/types.js';
import { FileStore } from '../storage/file-store.js';
import { Artifact } from '../../models/artifact.js';

/**
 * Error thrown when a reference target does not exist
 */
export class ReferenceValidationError extends Error {
  constructor(
    public readonly targetId: string,
    message: string
  ) {
    super(message);
    this.name = 'ReferenceValidationError';
  }
}

/**
 * Warning returned when deleting an artifact that has incoming references
 */
export interface DeletionWarning {
  /** The artifact ID being deleted */
  artifactId: string;
  /** IDs of artifacts that reference the artifact being deleted */
  referencingArtifactIds: string[];
  /** Warning message */
  message: string;
}

/**
 * Result of a reference operation
 */
export interface ReferenceOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Reference Service for managing cross-references between artifacts
 * Implements Requirements 4.1, 4.2, 4.3, 4.4
 */
export class ReferenceService {
  private fileStore: FileStore;

  /**
   * Creates a new ReferenceService instance
   * @param basePath - Base path for the .arch directory (defaults to current working directory)
   */
  constructor(basePath: string = process.cwd()) {
    this.fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
  }

  /**
   * Initializes the file store (creates directory structure)
   */
  async initialize(): Promise<void> {
    await this.fileStore.initialize();
  }


  /**
   * Validates that a target artifact exists before adding a reference
   * Implements Requirement 4.1
   * 
   * @param targetId - The ID of the target artifact
   * @returns true if the target exists
   * @throws ReferenceValidationError if target does not exist
   */
  async validateTargetExists(targetId: string): Promise<boolean> {
    const exists = await this.fileStore.exists(targetId);
    if (!exists) {
      throw new ReferenceValidationError(
        targetId,
        `Reference target does not exist: ${targetId}`
      );
    }
    return true;
  }

  /**
   * Adds a reference from a source artifact to a target artifact
   * Validates that the target artifact exists before adding
   * Implements Requirements 4.1, 4.3
   * 
   * @param sourceId - The ID of the source artifact
   * @param reference - The reference to add
   * @throws ReferenceValidationError if target does not exist
   * @throws Error if source artifact not found
   */
  async addReference(sourceId: string, reference: Reference): Promise<void> {
    // Validate target exists (Requirement 4.1)
    await this.validateTargetExists(reference.targetId);

    // Load source artifact
    const sourceArtifact = await this.fileStore.load(sourceId);
    if (!sourceArtifact) {
      throw new Error(`Source artifact not found: ${sourceId}`);
    }

    // Check if reference already exists
    const existingRef = sourceArtifact.references.find(
      r => r.targetId === reference.targetId && r.referenceType === reference.referenceType
    );
    if (existingRef) {
      // Reference already exists, no need to add again
      return;
    }

    // Add the reference
    const updatedArtifact: Artifact = {
      ...sourceArtifact,
      references: [...sourceArtifact.references, reference],
      updatedAt: new Date()
    };

    // Save the updated artifact
    await this.fileStore.save(updatedArtifact);
  }

  /**
   * Removes a reference from a source artifact
   * 
   * @param sourceId - The ID of the source artifact
   * @param targetId - The ID of the target artifact to remove reference to
   * @throws Error if source artifact not found
   */
  async removeReference(sourceId: string, targetId: string): Promise<void> {
    // Load source artifact
    const sourceArtifact = await this.fileStore.load(sourceId);
    if (!sourceArtifact) {
      throw new Error(`Source artifact not found: ${sourceId}`);
    }

    // Filter out references to the target
    const updatedReferences = sourceArtifact.references.filter(
      r => r.targetId !== targetId
    );

    // Only update if references changed
    if (updatedReferences.length !== sourceArtifact.references.length) {
      const updatedArtifact: Artifact = {
        ...sourceArtifact,
        references: updatedReferences,
        updatedAt: new Date()
      };

      await this.fileStore.save(updatedArtifact);
    }
  }

  /**
   * Gets all outgoing references from an artifact
   * Implements Requirement 4.3
   * 
   * @param artifactId - The ID of the artifact
   * @returns Array of outgoing references
   */
  async getOutgoingReferences(artifactId: string): Promise<Reference[]> {
    const artifact = await this.fileStore.load(artifactId);
    if (!artifact) {
      return [];
    }
    return artifact.references;
  }

  /**
   * Gets all incoming references to an artifact
   * Scans all artifacts to find references pointing to the given artifact
   * Implements Requirement 4.3
   * 
   * @param artifactId - The ID of the artifact
   * @returns Array of objects containing source artifact ID and the reference
   */
  async getIncomingReferences(artifactId: string): Promise<Array<{ sourceId: string; reference: Reference }>> {
    const allArtifacts = await this.fileStore.list();
    const incomingRefs: Array<{ sourceId: string; reference: Reference }> = [];

    for (const artifact of allArtifacts) {
      for (const ref of artifact.references) {
        if (ref.targetId === artifactId) {
          incomingRefs.push({
            sourceId: artifact.id,
            reference: ref
          });
        }
      }
    }

    return incomingRefs;
  }


  /**
   * Checks for incoming references before deletion and returns a warning if any exist
   * Implements Requirement 4.2
   * 
   * @param artifactId - The ID of the artifact to check
   * @returns DeletionWarning if there are incoming references, null otherwise
   */
  async checkDeletionWarning(artifactId: string): Promise<DeletionWarning | null> {
    const incomingRefs = await this.getIncomingReferences(artifactId);
    
    if (incomingRefs.length === 0) {
      return null;
    }

    const referencingIds = incomingRefs.map(r => r.sourceId);
    
    return {
      artifactId,
      referencingArtifactIds: referencingIds,
      message: `Warning: Artifact ${artifactId} is referenced by ${referencingIds.length} artifact(s): ${referencingIds.join(', ')}`
    };
  }

  /**
   * Gets all references for an artifact (both outgoing and incoming)
   * Implements Requirement 4.3
   * 
   * @param artifactId - The ID of the artifact
   * @returns Object containing outgoing and incoming references
   */
  async getAllReferences(artifactId: string): Promise<{
    outgoing: Reference[];
    incoming: Array<{ sourceId: string; reference: Reference }>;
  }> {
    const [outgoing, incoming] = await Promise.all([
      this.getOutgoingReferences(artifactId),
      this.getIncomingReferences(artifactId)
    ]);

    return { outgoing, incoming };
  }

  /**
   * Creates a reference object
   * Helper method for creating properly typed references
   * 
   * @param targetId - The ID of the target artifact
   * @param targetType - The type of the target artifact
   * @param referenceType - The type of relationship
   * @returns A Reference object
   */
  createReference(
    targetId: string,
    targetType: ArtifactType,
    referenceType: ReferenceType
  ): Reference {
    return {
      targetId,
      targetType,
      referenceType
    };
  }

  /**
   * Checks if an artifact exists
   * 
   * @param id - The artifact ID to check
   * @returns true if the artifact exists
   */
  async exists(id: string): Promise<boolean> {
    return await this.fileStore.exists(id);
  }
}
