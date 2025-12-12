// Artifact integrity and checksum utilities

import { createHash } from 'crypto';
import { Artifact } from '../models/artifact.js';

/**
 * Integrity metadata stored with artifacts
 */
export interface IntegrityMetadata {
  /** SHA-256 checksum of the artifact content */
  checksum: string;
  /** Timestamp when checksum was computed */
  computedAt: Date;
  /** Version of the integrity algorithm */
  version: number;
}

const INTEGRITY_VERSION = 1;

/**
 * Computes a SHA-256 checksum for an artifact
 * Uses a deterministic serialization to ensure consistent hashes
 */
export function computeChecksum(artifact: Artifact): string {
  // Create deterministic representation (sorted keys, no whitespace variance)
  const normalized = normalizeArtifact(artifact);
  const content = JSON.stringify(normalized);
  
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Normalizes an artifact for consistent checksum computation
 * Excludes volatile fields that change on every save
 */
function normalizeArtifact(artifact: Artifact): Record<string, unknown> {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    status: artifact.status,
    owner: artifact.owner,
    tags: [...artifact.tags].sort(),
    references: artifact.references.map(ref => ({
      targetId: ref.targetId,
      targetType: ref.targetType,
      referenceType: ref.referenceType
    })).sort((a, b) => a.targetId.localeCompare(b.targetId))
  };
}

/**
 * Creates integrity metadata for an artifact
 */
export function createIntegrityMetadata(artifact: Artifact): IntegrityMetadata {
  return {
    checksum: computeChecksum(artifact),
    computedAt: new Date(),
    version: INTEGRITY_VERSION
  };
}

/**
 * Verifies an artifact's integrity against stored metadata
 */
export function verifyIntegrity(
  artifact: Artifact,
  metadata: IntegrityMetadata
): { valid: boolean; reason?: string } {
  if (metadata.version !== INTEGRITY_VERSION) {
    return {
      valid: false,
      reason: `Integrity version mismatch: expected ${INTEGRITY_VERSION}, got ${metadata.version}`
    };
  }

  const currentChecksum = computeChecksum(artifact);
  
  if (currentChecksum !== metadata.checksum) {
    return {
      valid: false,
      reason: 'Checksum mismatch: artifact has been modified'
    };
  }

  return { valid: true };
}

/**
 * Compares two artifacts for content equality (ignoring timestamps)
 */
export function artifactsEqual(a: Artifact, b: Artifact): boolean {
  return computeChecksum(a) === computeChecksum(b);
}
