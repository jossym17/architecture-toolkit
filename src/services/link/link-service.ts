/**
 * Link Service
 * 
 * Manages bidirectional relationships between artifacts
 * with support for various link types.
 */

import { FileStore } from '../storage/file-store.js';
import { Artifact } from '../../models/artifact.js';
import { Reference } from '../../models/reference.js';
import { ArtifactType, ReferenceType } from '../../models/types.js';
import { NotFoundError } from '../../core/errors.js';

/**
 * Link type options for artifact relationships
 */
export type LinkType = 'implements' | 'supersedes' | 'relates-to' | 'depends-on' | 'blocks' | 'enables';

/**
 * All valid link types
 */
export const LINK_TYPES: LinkType[] = ['implements', 'supersedes', 'relates-to', 'depends-on', 'blocks', 'enables'];

/**
 * Represents a link between two artifacts
 */
export interface Link {
  sourceId: string;
  targetId: string;
  type: LinkType;
  createdAt: Date;
}

/**
 * Information about an artifact's links
 */
export interface LinkInfo {
  incoming: Link[];
  outgoing: Link[];
}

/**
 * Result of a link creation operation
 */
export interface LinkResult {
  link: Link;
  warning?: string;
}

/**
 * Result of duplicate link detection
 */
export interface DuplicateLinkResult {
  exists: boolean;
  existingType?: LinkType;
}

/**
 * Link display information for artifact show
 */
export interface LinkDisplay {
  id: string;
  title: string;
  type: ArtifactType;
  linkType: LinkType;
  direction: 'incoming' | 'outgoing';
}

/**
 * Link Service Interface
 */
export interface ILinkService {
  createLink(sourceId: string, targetId: string, type: LinkType): Promise<LinkResult>;
  removeLink(sourceId: string, targetId: string): Promise<void>;
  updateLinkType(sourceId: string, targetId: string, newType: LinkType): Promise<Link>;
  getLinks(artifactId: string): Promise<LinkInfo>;
  linkExists(sourceId: string, targetId: string): Promise<boolean>;
  checkDuplicateLink(sourceId: string, targetId: string): Promise<DuplicateLinkResult>;
  batchLink(sourceId: string, targetIds: string[], type: LinkType): Promise<LinkResult[]>;
  getLinksForDisplay(artifactId: string): Promise<LinkDisplay[]>;
}

/**
 * Gets the inverse link type for bidirectional linking
 */
function getInverseLinkType(type: LinkType): LinkType {
  switch (type) {
    case 'implements':
      return 'depends-on'; // If A implements B, B depends-on A
    case 'supersedes':
      return 'supersedes'; // Supersession is tracked from both sides
    case 'relates-to':
      return 'relates-to'; // Symmetric relationship
    case 'depends-on':
      return 'enables'; // If A depends-on B, B enables A
    case 'blocks':
      return 'blocks'; // Blocking is tracked from both sides
    case 'enables':
      return 'depends-on'; // If A enables B, B depends-on A
    default:
      return 'relates-to';
  }
}

/**
 * Extracts artifact type from ID prefix
 */
function getTypeFromId(id: string): ArtifactType | null {
  const prefix = id.split('-')[0]?.toUpperCase();
  switch (prefix) {
    case 'RFC':
      return 'rfc';
    case 'ADR':
      return 'adr';
    case 'DECOMP':
      return 'decomposition';
    default:
      return null;
  }
}

/**
 * Converts LinkType to ReferenceType for storage
 */
function linkTypeToReferenceType(linkType: LinkType): ReferenceType {
  // Map link types to the subset supported by ReferenceType
  switch (linkType) {
    case 'implements':
      return 'implements';
    case 'supersedes':
      return 'supersedes';
    case 'depends-on':
      return 'depends-on';
    case 'relates-to':
    case 'blocks':
    case 'enables':
      return 'relates-to';
    default:
      return 'relates-to';
  }
}

/**
 * Link Service Implementation
 */
export class LinkService implements ILinkService {
  private fileStore: FileStore;

  constructor(fileStore?: FileStore) {
    this.fileStore = fileStore || new FileStore();
  }

  /**
   * Creates a bidirectional link between two artifacts
   * Updates both artifacts' references arrays
   * 
   * @param sourceId - The source artifact ID
   * @param targetId - The target artifact ID
   * @param type - The type of relationship
   * @returns The created link and any warnings
   * @throws NotFoundError if either artifact doesn't exist
   */
  async createLink(sourceId: string, targetId: string, type: LinkType): Promise<LinkResult> {
    // Validate both artifacts exist
    const sourceArtifact = await this.fileStore.load(sourceId);
    if (!sourceArtifact) {
      throw new NotFoundError('Artifact', sourceId);
    }

    const targetArtifact = await this.fileStore.load(targetId);
    if (!targetArtifact) {
      throw new NotFoundError('Artifact', targetId);
    }

    // Check for duplicate link
    const duplicateCheck = await this.checkDuplicateLink(sourceId, targetId);
    let warning: string | undefined;
    
    if (duplicateCheck.exists) {
      warning = `Link already exists between ${sourceId} and ${targetId} with type '${duplicateCheck.existingType}'`;
    }

    const createdAt = new Date();

    // Add reference to source artifact (outgoing link)
    const targetType = getTypeFromId(targetId);
    if (targetType) {
      const sourceReference: Reference = {
        targetId,
        targetType,
        referenceType: linkTypeToReferenceType(type)
      };
      
      // Check if reference already exists
      const existingSourceRef = sourceArtifact.references.find(r => r.targetId === targetId);
      if (!existingSourceRef) {
        sourceArtifact.references.push(sourceReference);
        sourceArtifact.updatedAt = createdAt;
        await this.fileStore.save(sourceArtifact);
      }
    }

    // Add inverse reference to target artifact (incoming link)
    const sourceType = getTypeFromId(sourceId);
    if (sourceType) {
      const inverseType = getInverseLinkType(type);
      const targetReference: Reference = {
        targetId: sourceId,
        targetType: sourceType,
        referenceType: linkTypeToReferenceType(inverseType)
      };
      
      // Check if reference already exists
      const existingTargetRef = targetArtifact.references.find(r => r.targetId === sourceId);
      if (!existingTargetRef) {
        targetArtifact.references.push(targetReference);
        targetArtifact.updatedAt = createdAt;
        await this.fileStore.save(targetArtifact);
      }
    }

    const link: Link = {
      sourceId,
      targetId,
      type,
      createdAt
    };

    return { link, warning };
  }

  /**
   * Removes a link between two artifacts
   * Updates both artifacts' references arrays
   */
  async removeLink(sourceId: string, targetId: string): Promise<void> {
    const sourceArtifact = await this.fileStore.load(sourceId);
    if (sourceArtifact) {
      sourceArtifact.references = sourceArtifact.references.filter(r => r.targetId !== targetId);
      sourceArtifact.updatedAt = new Date();
      await this.fileStore.save(sourceArtifact);
    }

    const targetArtifact = await this.fileStore.load(targetId);
    if (targetArtifact) {
      targetArtifact.references = targetArtifact.references.filter(r => r.targetId !== sourceId);
      targetArtifact.updatedAt = new Date();
      await this.fileStore.save(targetArtifact);
    }
  }

  /**
   * Updates the type of an existing link
   */
  async updateLinkType(sourceId: string, targetId: string, newType: LinkType): Promise<Link> {
    // Remove existing link
    await this.removeLink(sourceId, targetId);
    
    // Create new link with updated type
    const result = await this.createLink(sourceId, targetId, newType);
    return result.link;
  }

  /**
   * Gets all links for an artifact (both incoming and outgoing)
   */
  async getLinks(artifactId: string): Promise<LinkInfo> {
    const artifact = await this.fileStore.load(artifactId);
    
    const incoming: Link[] = [];
    const outgoing: Link[] = [];

    if (!artifact) {
      return { incoming, outgoing };
    }

    // Get outgoing links from artifact's references
    for (const ref of artifact.references) {
      outgoing.push({
        sourceId: artifactId,
        targetId: ref.targetId,
        type: ref.referenceType as LinkType,
        createdAt: artifact.updatedAt
      });
    }

    // Get incoming links by scanning all artifacts
    const allArtifacts = await this.fileStore.list();
    for (const other of allArtifacts) {
      if (other.id === artifactId) continue;
      
      for (const ref of other.references) {
        if (ref.targetId === artifactId) {
          incoming.push({
            sourceId: other.id,
            targetId: artifactId,
            type: ref.referenceType as LinkType,
            createdAt: other.updatedAt
          });
        }
      }
    }

    return { incoming, outgoing };
  }

  /**
   * Checks if a link exists between two artifacts
   */
  async linkExists(sourceId: string, targetId: string): Promise<boolean> {
    const artifact = await this.fileStore.load(sourceId);
    if (!artifact) return false;
    
    return artifact.references.some(r => r.targetId === targetId);
  }

  /**
   * Checks for duplicate link and returns existing type if found
   */
  async checkDuplicateLink(sourceId: string, targetId: string): Promise<DuplicateLinkResult> {
    const artifact = await this.fileStore.load(sourceId);
    if (!artifact) {
      return { exists: false };
    }
    
    const existingRef = artifact.references.find(r => r.targetId === targetId);
    if (existingRef) {
      return {
        exists: true,
        existingType: existingRef.referenceType as LinkType
      };
    }
    
    return { exists: false };
  }

  /**
   * Creates links from one source to multiple targets atomically
   */
  async batchLink(sourceId: string, targetIds: string[], type: LinkType): Promise<LinkResult[]> {
    const results: LinkResult[] = [];
    
    // Validate source exists first
    const sourceArtifact = await this.fileStore.load(sourceId);
    if (!sourceArtifact) {
      throw new NotFoundError('Artifact', sourceId);
    }

    // Validate all targets exist before creating any links
    for (const targetId of targetIds) {
      const targetArtifact = await this.fileStore.load(targetId);
      if (!targetArtifact) {
        throw new NotFoundError('Artifact', targetId);
      }
    }

    // Create all links
    for (const targetId of targetIds) {
      const result = await this.createLink(sourceId, targetId, type);
      results.push(result);
    }

    return results;
  }

  /**
   * Gets links formatted for display in artifact show command
   */
  async getLinksForDisplay(artifactId: string): Promise<LinkDisplay[]> {
    const links = await this.getLinks(artifactId);
    const displays: LinkDisplay[] = [];

    // Process outgoing links
    for (const link of links.outgoing) {
      const targetArtifact = await this.fileStore.load(link.targetId);
      if (targetArtifact) {
        displays.push({
          id: link.targetId,
          title: targetArtifact.title,
          type: targetArtifact.type,
          linkType: link.type,
          direction: 'outgoing'
        });
      }
    }

    // Process incoming links
    for (const link of links.incoming) {
      const sourceArtifact = await this.fileStore.load(link.sourceId);
      if (sourceArtifact) {
        displays.push({
          id: link.sourceId,
          title: sourceArtifact.title,
          type: sourceArtifact.type,
          linkType: link.type,
          direction: 'incoming'
        });
      }
    }

    return displays;
  }
}
