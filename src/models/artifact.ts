// Base artifact interface

import { ArtifactType, ArtifactStatus } from './types.js';
import { Reference } from './reference.js';

/**
 * Base interface for all architectural artifacts
 */
export interface Artifact {
  /** Unique identifier (e.g., RFC-0001, ADR-0001) */
  id: string;
  /** Type of artifact */
  type: ArtifactType;
  /** Title of the artifact */
  title: string;
  /** Current status */
  status: ArtifactStatus;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Owner/author of the artifact */
  owner: string;
  /** Tags for categorization */
  tags: string[];
  /** Cross-references to other artifacts */
  references: Reference[];
}
