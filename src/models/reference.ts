// Reference model for cross-referencing between artifacts

import { ArtifactType, ReferenceType } from './types.js';

/**
 * Represents a cross-reference between artifacts
 */
export interface Reference {
  /** ID of the target artifact */
  targetId: string;
  /** Type of the target artifact */
  targetType: ArtifactType;
  /** Type of relationship */
  referenceType: ReferenceType;
}
