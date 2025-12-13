/**
 * Property-Based Tests for Batch Operations Service
 * 
 * Tests the correctness properties defined in the design document
 * for the batch operations functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { BatchService } from './batch-service.js';
import { FileStore } from '../storage/file-store.js';
import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { ArtifactType } from '../../models/types.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-batch-${process.pid}-${++testCounter}`;
}
const TEST_DIR = '.arch-test-batch-unit';

/**
 * Creates a complete test RFC artifact
 */
function createTestRFC(id: string, status: string, owner: string, tags: string[], title: string): RFC {
  return {
    id,
    type: 'rfc',
    title,
    status: status as RFC['status'],
    createdAt: new Date(),
    updatedAt: new Date(),
    owner,
    tags,
    references: [],
    problemStatement: 'Test problem statement',
    successCriteria: ['Criterion 1'],
    options: [],
    recommendedApproach: 'Test approach',
    migrationPath: 'Test migration',
    rollbackPlan: 'Test rollback',
    securityNotes: 'Test security',
    costModel: 'Test cost',
    timeline: 'Test timeline',
    signoffs: []
  };
}

/**
 * Creates a complete test ADR artifact
 */
function createTestADR(id: string, status: string, owner: string, tags: string[], title: string): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: status as ADR['status'],
    createdAt: new Date(),
    updatedAt: new Date(),
    owner,
    tags,
    references: [],
    context: 'Test context',
    decision: 'Test decision',
    consequences: ['Consequence 1'],
    alternativesConsidered: []
  };
}

/**
 * Creates a complete test Decomposition artifact
 */
function createTestDecomp(id: string, status: string, owner: string, tags: string[], title: string): DecompositionPlan {
  return {
    id,
    type: 'decomposition',
    title,
    status: status as unknown as DecompositionPlan['status'],
    createdAt: new Date(),
    updatedAt: new Date(),
    owner,
    tags,
    references: [],
    rationale: 'Test rationale',
    successMetrics: ['Metric 1'],
    phases: [{
      id: 'phase-1',
      name: 'Phase 1',
      description: 'Test phase',
      dependencies: [],
      estimatedDuration: '1 week',
      status: 'pending'
    }],
    teamModuleMapping: [],
    migrationTasks: []
  };
}

/**
 * Creates a test artifact based on type
 */
function createTestArtifact(
  id: string,
  type: ArtifactType,
  status: string,
  owner: string,
  tags: string[],
  title: string
): Artifact {
  if (type === 'rfc') {
    return createTestRFC(id, status, owner, tags, title);
  } else if (type === 'adr') {
    return createTestADR(id, status, owner, tags, title);
  } else {
    return createTestDecomp(id, status, owner, tags, title);
  }
}

describe('BatchService', () => {
  let fileStore: FileStore;
  let batchService: BatchService;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    await fs.mkdir(TEST_DIR, { recursive: true });
    fileStore = new FileStore({ baseDir: TEST_DIR });
    await fileStore.initialize();
    batchService = new BatchService(fileStore);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('parseFilter - unit tests', () => {
    it('should parse empty filter expression', () => {
      const filter = batchService.parseFilter('');
      expect(filter).toEqual({});
    });

    it('should parse type filter', () => {
      const filter = batchService.parseFilter('type:rfc');
      expect(filter.type).toBe('rfc');
    });

    it('should parse status filter', () => {
      const filter = batchService.parseFilter('status:draft');
      expect(filter.status).toBe('draft');
    });

    it('should parse owner filter', () => {
      const filter = batchService.parseFilter('owner:john');
      expect(filter.owner).toBe('john');
    });

    it('should parse multiple tag filters', () => {
      const filter = batchService.parseFilter('tag:architecture tag:security');
      expect(filter.tags).toEqual(['architecture', 'security']);
    });

    it('should parse id pattern filter', () => {
      const filter = batchService.parseFilter('id:/RFC-00\\d+/');
      expect(filter.idPattern).toBe('RFC-00\\d+');
    });

    it('should parse title pattern filter', () => {
      const filter = batchService.parseFilter('title:/migration/');
      expect(filter.titlePattern).toBe('migration');
    });

    it('should parse combined filters', () => {
      const filter = batchService.parseFilter('type:rfc status:draft owner:john tag:arch');
      expect(filter.type).toBe('rfc');
      expect(filter.status).toBe('draft');
      expect(filter.owner).toBe('john');
      expect(filter.tags).toEqual(['arch']);
    });
  });

  describe('findMatching - unit tests', () => {
    it('should find artifacts matching type filter', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC'));
      await fileStore.save(createTestArtifact('ADR-0001', 'adr', 'proposed', 'jane', [], 'Test ADR'));

      const results = await batchService.findMatching({ type: 'rfc' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('RFC-0001');
    });

    it('should find artifacts matching status filter', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC 1'));
      await fileStore.save(createTestArtifact('RFC-0002', 'rfc', 'approved', 'jane', [], 'Test RFC 2'));

      const results = await batchService.findMatching({ status: 'draft' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('RFC-0001');
    });

    it('should find artifacts matching owner filter', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC 1'));
      await fileStore.save(createTestArtifact('RFC-0002', 'rfc', 'draft', 'jane', [], 'Test RFC 2'));

      const results = await batchService.findMatching({ owner: 'john' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('RFC-0001');
    });

    it('should find artifacts matching tag filter', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', ['arch', 'security'], 'Test RFC 1'));
      await fileStore.save(createTestArtifact('RFC-0002', 'rfc', 'draft', 'jane', ['arch'], 'Test RFC 2'));

      const results = await batchService.findMatching({ tags: ['arch', 'security'] });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('RFC-0001');
    });

    it('should find artifacts matching title pattern', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Database Migration'));
      await fileStore.save(createTestArtifact('RFC-0002', 'rfc', 'draft', 'jane', [], 'API Design'));

      const results = await batchService.findMatching({ titlePattern: 'migration' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('RFC-0001');
    });
  });

  describe('preview - unit tests', () => {
    it('should preview status change', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC'));

      const preview = await batchService.preview(
        { type: 'rfc' },
        { status: 'review' }
      );

      expect(preview.count).toBe(1);
      expect(preview.changes).toHaveLength(1);
      expect(preview.changes[0].changes).toContainEqual({
        field: 'status',
        oldValue: 'draft',
        newValue: 'review'
      });
    });

    it('should preview tag additions', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', ['existing'], 'Test RFC'));

      const preview = await batchService.preview(
        { type: 'rfc' },
        { addTags: ['new-tag'] }
      );

      expect(preview.changes[0].changes).toContainEqual({
        field: 'tags',
        oldValue: ['existing'],
        newValue: ['existing', 'new-tag']
      });
    });

    it('should not show changes when values are the same', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC'));

      const preview = await batchService.preview(
        { type: 'rfc' },
        { status: 'draft' } // Same as current
      );

      expect(preview.count).toBe(1);
      expect(preview.changes).toHaveLength(0);
    });
  });

  describe('update - unit tests', () => {
    it('should update status of matching artifacts', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC 1'));
      await fileStore.save(createTestArtifact('RFC-0002', 'rfc', 'draft', 'jane', [], 'Test RFC 2'));

      const result = await batchService.update(
        { type: 'rfc' },
        { status: 'review' }
      );

      expect(result.updatedCount).toBe(2);
      expect(result.success).toBe(true);

      // Verify changes persisted
      const updated1 = await fileStore.load('RFC-0001');
      const updated2 = await fileStore.load('RFC-0002');
      expect(updated1?.status).toBe('review');
      expect(updated2?.status).toBe('review');
    });

    it('should add tags to matching artifacts', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', ['existing'], 'Test RFC'));

      const result = await batchService.update(
        { type: 'rfc' },
        { addTags: ['new-tag'] }
      );

      expect(result.success).toBe(true);

      const updated = await fileStore.load('RFC-0001');
      expect(updated?.tags).toContain('existing');
      expect(updated?.tags).toContain('new-tag');
    });

    it('should remove tags from matching artifacts', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', ['keep', 'remove'], 'Test RFC'));

      const result = await batchService.update(
        { type: 'rfc' },
        { removeTags: ['remove'] }
      );

      expect(result.success).toBe(true);

      const updated = await fileStore.load('RFC-0001');
      expect(updated?.tags).toContain('keep');
      expect(updated?.tags).not.toContain('remove');
    });

    it('should support dry run mode', async () => {
      await fileStore.save(createTestArtifact('RFC-0001', 'rfc', 'draft', 'john', [], 'Test RFC'));

      const result = await batchService.update(
        { type: 'rfc' },
        { status: 'review' },
        { dryRun: true }
      );

      expect(result.updatedCount).toBe(1);

      // Verify no actual changes
      const artifact = await fileStore.load('RFC-0001');
      expect(artifact?.status).toBe('draft');
    });
  });


  /**
   * **Feature: interactive-mode, Property 17: Batch filter accuracy**
   * **Validates: Requirements 7.1**
   * 
   * For any batch update operation with a filter, all artifacts matching the filter
   * SHALL be updated and no artifacts not matching the filter SHALL be modified.
   */
  describe('Property 17: Batch filter accuracy', () => {
    // Arbitraries for generating test data
    const artifactTypeArb = fc.constantFrom<ArtifactType>('rfc', 'adr', 'decomposition');
    const ownerArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/).filter(s => s.length >= 3);
    const tagArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/).filter(s => s.length >= 2);
    const tagsArb = fc.array(tagArb, { minLength: 0, maxLength: 3 });
    const titleArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9 ]{5,20}$/).filter(s => s.length >= 6);

    const getIdForType = (type: ArtifactType, num: number): string => {
      const prefix = type === 'rfc' ? 'RFC' : type === 'adr' ? 'ADR' : 'DECOMP';
      return `${prefix}-${String(num).padStart(4, '0')}`;
    };

    const getStatusForType = (type: ArtifactType): string => {
      return type === 'adr' ? 'proposed' : 'draft';
    };

    it('should update ALL artifacts matching type filter (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          fc.array(
            fc.record({
              type: artifactTypeArb,
              owner: ownerArb,
              tags: tagsArb,
              title: titleArb
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (filterType, artifactSpecs) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testBatchService = new BatchService(testFileStore);

              // Create artifacts with unique IDs per type
              const typeCounters: Record<ArtifactType, number> = { rfc: 1, adr: 1, decomposition: 1 };
              const artifacts: Artifact[] = [];
              
              for (const spec of artifactSpecs) {
                const id = getIdForType(spec.type, typeCounters[spec.type]++);
                const status = getStatusForType(spec.type);
                const artifact = createTestArtifact(id, spec.type, status, spec.owner, spec.tags, spec.title);
                await testFileStore.save(artifact);
                artifacts.push(artifact);
              }

              // Apply batch update with type filter - use owner change instead of status
              const newOwner = 'batch-updated-owner';
              const result = await testBatchService.update(
                { type: filterType },
                { owner: newOwner }
              );

              // Property: All matching artifacts should be updated
              const matchingArtifacts = artifacts.filter(a => a.type === filterType);
              expect(result.updatedCount).toBe(matchingArtifacts.length);

              // Verify all matching artifacts were updated
              for (const artifact of matchingArtifacts) {
                const updated = await testFileStore.load(artifact.id);
                expect(updated?.owner).toBe(newOwner);
              }

              // Property: No non-matching artifacts should be modified
              const nonMatchingArtifacts = artifacts.filter(a => a.type !== filterType);
              for (const artifact of nonMatchingArtifacts) {
                const loaded = await testFileStore.load(artifact.id);
                expect(loaded?.owner).toBe(artifact.owner);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update ALL artifacts matching owner filter (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          ownerArb,
          fc.array(
            fc.record({
              type: artifactTypeArb,
              owner: ownerArb,
              tags: tagsArb,
              title: titleArb
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (filterOwner, artifactSpecs) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testBatchService = new BatchService(testFileStore);

              // Create artifacts
              const typeCounters: Record<ArtifactType, number> = { rfc: 1, adr: 1, decomposition: 1 };
              const artifacts: Artifact[] = [];
              
              for (const spec of artifactSpecs) {
                const id = getIdForType(spec.type, typeCounters[spec.type]++);
                const status = getStatusForType(spec.type);
                const artifact = createTestArtifact(id, spec.type, status, spec.owner, spec.tags, spec.title);
                await testFileStore.save(artifact);
                artifacts.push(artifact);
              }

              // Apply batch update with owner filter - add a tag instead of changing status
              const newTag = 'batch-updated';
              const result = await testBatchService.update(
                { owner: filterOwner },
                { addTags: [newTag] }
              );

              // Property: All matching artifacts should be updated
              const matchingArtifacts = artifacts.filter(a => a.owner === filterOwner);
              expect(result.updatedCount).toBe(matchingArtifacts.length);

              // Verify all matching artifacts were updated
              for (const artifact of matchingArtifacts) {
                const updated = await testFileStore.load(artifact.id);
                expect(updated?.tags).toContain(newTag);
              }

              // Property: No non-matching artifacts should be modified
              const nonMatchingArtifacts = artifacts.filter(a => a.owner !== filterOwner);
              for (const artifact of nonMatchingArtifacts) {
                const loaded = await testFileStore.load(artifact.id);
                expect(loaded?.tags).not.toContain(newTag);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update ALL artifacts matching tag filter (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagArb,
          fc.array(
            fc.record({
              type: artifactTypeArb,
              owner: ownerArb,
              tags: tagsArb,
              title: titleArb
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (filterTag, artifactSpecs) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testBatchService = new BatchService(testFileStore);

              // Create artifacts
              const typeCounters: Record<ArtifactType, number> = { rfc: 1, adr: 1, decomposition: 1 };
              const artifacts: Artifact[] = [];
              
              for (const spec of artifactSpecs) {
                const id = getIdForType(spec.type, typeCounters[spec.type]++);
                const status = getStatusForType(spec.type);
                const artifact = createTestArtifact(id, spec.type, status, spec.owner, spec.tags, spec.title);
                await testFileStore.save(artifact);
                artifacts.push(artifact);
              }

              // Apply batch update with tag filter
              const newOwner = 'batch-updated';
              const result = await testBatchService.update(
                { tags: [filterTag] },
                { owner: newOwner }
              );

              // Property: All matching artifacts should be updated
              const matchingArtifacts = artifacts.filter(a => a.tags.includes(filterTag));
              expect(result.updatedCount).toBe(matchingArtifacts.length);

              // Verify all matching artifacts were updated
              for (const artifact of matchingArtifacts) {
                const updated = await testFileStore.load(artifact.id);
                expect(updated?.owner).toBe(newOwner);
              }

              // Property: No non-matching artifacts should be modified
              const nonMatchingArtifacts = artifacts.filter(a => !a.tags.includes(filterTag));
              for (const artifact of nonMatchingArtifacts) {
                const loaded = await testFileStore.load(artifact.id);
                expect(loaded?.owner).toBe(artifact.owner);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should update ALL artifacts matching combined filters (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          ownerArb,
          fc.array(
            fc.record({
              type: artifactTypeArb,
              owner: ownerArb,
              tags: tagsArb,
              title: titleArb
            }),
            { minLength: 3, maxLength: 6 }
          ),
          async (filterType, filterOwner, artifactSpecs) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testBatchService = new BatchService(testFileStore);

              // Create artifacts
              const typeCounters: Record<ArtifactType, number> = { rfc: 1, adr: 1, decomposition: 1 };
              const artifacts: Artifact[] = [];
              
              for (const spec of artifactSpecs) {
                const id = getIdForType(spec.type, typeCounters[spec.type]++);
                const status = getStatusForType(spec.type);
                const artifact = createTestArtifact(id, spec.type, status, spec.owner, spec.tags, spec.title);
                await testFileStore.save(artifact);
                artifacts.push(artifact);
              }

              // Apply batch update with combined filter (type + owner)
              const newTag = 'combined-update';
              const result = await testBatchService.update(
                { type: filterType, owner: filterOwner },
                { addTags: [newTag] }
              );

              // Property: All matching artifacts should be updated
              const matchingArtifacts = artifacts.filter(
                a => a.type === filterType && a.owner === filterOwner
              );
              expect(result.updatedCount).toBe(matchingArtifacts.length);

              // Verify all matching artifacts were updated
              for (const artifact of matchingArtifacts) {
                const updated = await testFileStore.load(artifact.id);
                expect(updated?.tags).toContain(newTag);
              }

              // Property: No non-matching artifacts should be modified
              const nonMatchingArtifacts = artifacts.filter(
                a => a.type !== filterType || a.owner !== filterOwner
              );
              for (const artifact of nonMatchingArtifacts) {
                const loaded = await testFileStore.load(artifact.id);
                expect(loaded?.tags).not.toContain(newTag);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should correctly add tags to ALL matching artifacts (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          tagArb,
          fc.array(
            fc.record({
              type: artifactTypeArb,
              owner: ownerArb,
              tags: tagsArb,
              title: titleArb
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (filterType, newTag, artifactSpecs) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testBatchService = new BatchService(testFileStore);

              // Create artifacts
              const typeCounters: Record<ArtifactType, number> = { rfc: 1, adr: 1, decomposition: 1 };
              const artifacts: Artifact[] = [];
              
              for (const spec of artifactSpecs) {
                const id = getIdForType(spec.type, typeCounters[spec.type]++);
                const status = getStatusForType(spec.type);
                const artifact = createTestArtifact(id, spec.type, status, spec.owner, spec.tags, spec.title);
                await testFileStore.save(artifact);
                artifacts.push(artifact);
              }

              // Apply batch update to add tag
              await testBatchService.update(
                { type: filterType },
                { addTags: [newTag] }
              );

              // Property: All matching artifacts should have the new tag
              const matchingArtifacts = artifacts.filter(a => a.type === filterType);
              for (const artifact of matchingArtifacts) {
                const updated = await testFileStore.load(artifact.id);
                expect(updated?.tags).toContain(newTag);
                // Original tags should still be present
                for (const originalTag of artifact.tags) {
                  expect(updated?.tags).toContain(originalTag);
                }
              }

              // Property: Non-matching artifacts should not have the new tag (unless they already had it)
              const nonMatchingArtifacts = artifacts.filter(a => a.type !== filterType);
              for (const artifact of nonMatchingArtifacts) {
                const loaded = await testFileStore.load(artifact.id);
                // Tags should be unchanged
                expect(loaded?.tags).toEqual(artifact.tags);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
