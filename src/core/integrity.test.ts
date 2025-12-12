// Integrity tests

import { describe, it, expect } from 'vitest';
import {
  computeChecksum,
  createIntegrityMetadata,
  verifyIntegrity,
  artifactsEqual
} from './integrity.js';
import { Artifact } from '../models/artifact.js';

describe('Integrity', () => {
  const createMockArtifact = (overrides: Partial<Artifact> = {}): Artifact => ({
    id: 'RFC-0001',
    type: 'rfc',
    title: 'Test RFC',
    status: 'draft',
    owner: 'test@example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['test', 'example'],
    references: [],
    ...overrides
  });

  describe('computeChecksum', () => {
    it('should compute consistent checksum for same artifact', () => {
      const artifact = createMockArtifact();
      const checksum1 = computeChecksum(artifact);
      const checksum2 = computeChecksum(artifact);
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksum for different content', () => {
      const artifact1 = createMockArtifact({ title: 'Title A' });
      const artifact2 = createMockArtifact({ title: 'Title B' });
      expect(computeChecksum(artifact1)).not.toBe(computeChecksum(artifact2));
    });

    it('should ignore timestamp changes', () => {
      const artifact1 = createMockArtifact({ updatedAt: new Date('2024-01-01') });
      const artifact2 = createMockArtifact({ updatedAt: new Date('2024-12-31') });
      expect(computeChecksum(artifact1)).toBe(computeChecksum(artifact2));
    });

    it('should handle tag order consistently', () => {
      const artifact1 = createMockArtifact({ tags: ['a', 'b', 'c'] });
      const artifact2 = createMockArtifact({ tags: ['c', 'a', 'b'] });
      expect(computeChecksum(artifact1)).toBe(computeChecksum(artifact2));
    });

    it('should return 64-character hex string', () => {
      const checksum = computeChecksum(createMockArtifact());
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createIntegrityMetadata', () => {
    it('should create metadata with checksum', () => {
      const artifact = createMockArtifact();
      const metadata = createIntegrityMetadata(artifact);
      
      expect(metadata.checksum).toBeDefined();
      expect(metadata.computedAt).toBeInstanceOf(Date);
      expect(metadata.version).toBe(1);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return valid for unmodified artifact', () => {
      const artifact = createMockArtifact();
      const metadata = createIntegrityMetadata(artifact);
      
      const result = verifyIntegrity(artifact, metadata);
      expect(result.valid).toBe(true);
    });

    it('should detect modified artifact', () => {
      const artifact = createMockArtifact();
      const metadata = createIntegrityMetadata(artifact);
      
      artifact.title = 'Modified Title';
      const result = verifyIntegrity(artifact, metadata);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Checksum mismatch');
    });

    it('should detect version mismatch', () => {
      const artifact = createMockArtifact();
      const metadata = {
        checksum: computeChecksum(artifact),
        computedAt: new Date(),
        version: 999
      };
      
      const result = verifyIntegrity(artifact, metadata);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('version mismatch');
    });
  });

  describe('artifactsEqual', () => {
    it('should return true for identical artifacts', () => {
      const artifact1 = createMockArtifact();
      const artifact2 = createMockArtifact();
      expect(artifactsEqual(artifact1, artifact2)).toBe(true);
    });

    it('should return false for different artifacts', () => {
      const artifact1 = createMockArtifact({ id: 'RFC-0001' });
      const artifact2 = createMockArtifact({ id: 'RFC-0002' });
      expect(artifactsEqual(artifact1, artifact2)).toBe(false);
    });
  });
});
