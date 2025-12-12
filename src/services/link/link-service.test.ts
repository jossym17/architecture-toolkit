/**
 * Property-Based Tests for Link Service
 * 
 * Tests the correctness properties defined in the design document
 * for the artifact linking functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { LinkService, LinkType, LINK_TYPES } from './link-service.js';
import { FileStore } from '../storage/file-store.js';
import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { NotFoundError } from '../../core/errors.js';

// Test directory for isolated file operations - use unique suffix to avoid conflicts
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-link-${process.pid}-${++testCounter}`;
}
const TEST_DIR = '.arch-test-link-unit';

/**
 * Creates a complete test RFC artifact
 */
function createTestRFC(id: string, title: string = 'Test RFC'): RFC {
  return {
    id,
    type: 'rfc',
    title,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
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
function createTestADR(id: string, title: string = 'Test ADR'): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
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
function createTestDecomp(id: string, title: string = 'Test Decomposition'): DecompositionPlan {
  return {
    id,
    type: 'decomposition',
    title,
    status: 'draft' as unknown as DecompositionPlan['status'],
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
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
 * Creates a test artifact based on ID prefix
 */
function createTestArtifact(id: string, title: string = 'Test Artifact'): Artifact {
  if (id.startsWith('RFC')) {
    return createTestRFC(id, title);
  } else if (id.startsWith('ADR')) {
    return createTestADR(id, title);
  } else {
    return createTestDecomp(id, title);
  }
}

describe('LinkService', () => {
  let fileStore: FileStore;
  let linkService: LinkService;

  beforeEach(async () => {
    // Create isolated test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    fileStore = new FileStore({ baseDir: TEST_DIR });
    await fileStore.initialize();
    linkService = new LinkService(fileStore);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createLink - unit tests', () => {
    it('should create a link between two existing artifacts', async () => {
      const source = createTestArtifact('RFC-0001', 'Source RFC');
      const target = createTestArtifact('ADR-0001', 'Target ADR');
      
      await fileStore.save(source);
      await fileStore.save(target);

      const result = await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      expect(result.link.sourceId).toBe('RFC-0001');
      expect(result.link.targetId).toBe('ADR-0001');
      expect(result.link.type).toBe('implements');
    });

    it('should throw NotFoundError when source does not exist', async () => {
      const target = createTestArtifact('ADR-0001', 'Target ADR');
      await fileStore.save(target);

      await expect(
        linkService.createLink('RFC-0001', 'ADR-0001', 'implements')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when target does not exist', async () => {
      const source = createTestArtifact('RFC-0001', 'Source RFC');
      await fileStore.save(source);

      await expect(
        linkService.createLink('RFC-0001', 'ADR-0001', 'implements')
      ).rejects.toThrow(NotFoundError);
    });
  });

  /**
   * **Feature: interactive-mode, Property 4: Bidirectional link creation**
   * **Validates: Requirements 2.1**
   * 
   * For any two valid artifacts, after creating a link between them,
   * both artifacts SHALL have references to each other with the specified link type.
   */
  describe('Property 4: Bidirectional link creation', () => {
    // Arbitrary for valid artifact IDs - use smaller range to avoid collisions
    const rfcIdArb = fc.integer({ min: 1, max: 100 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 100 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    
    // Arbitrary for link types
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    // Arbitrary for valid alphanumeric title (avoid special chars that break serialization)
    const titleArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,30}$/)
      .filter(s => s.trim().length > 0);

    it('should create bidirectional references (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          adrIdArb,
          linkTypeArb,
          titleArb,
          titleArb,
          async (sourceId, targetId, linkType, sourceTitle, targetTitle) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create source and target artifacts
              const source = createTestArtifact(sourceId, sourceTitle);
              const target = createTestArtifact(targetId, targetTitle);
              
              await testFileStore.save(source);
              await testFileStore.save(target);

              // Create the link
              await testLinkService.createLink(sourceId, targetId, linkType);

              // Reload artifacts to verify persistence
              const updatedSource = await testFileStore.load(sourceId);
              const updatedTarget = await testFileStore.load(targetId);

              // Property: Source artifact should have reference to target
              expect(updatedSource).not.toBeNull();
              const sourceRef = updatedSource!.references.find(r => r.targetId === targetId);
              expect(sourceRef).toBeDefined();

              // Property: Target artifact should have reference back to source
              expect(updatedTarget).not.toBeNull();
              const targetRef = updatedTarget!.references.find(r => r.targetId === sourceId);
              expect(targetRef).toBeDefined();
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: interactive-mode, Property 5: Link validation rejects non-existent artifacts**
   * **Validates: Requirements 2.4**
   * 
   * For any link operation where either source or target artifact ID does not exist,
   * the operation SHALL fail with an error identifying the missing artifact.
   */
  describe('Property 5: Link validation rejects non-existent artifacts', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 9999 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 9999 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should reject links when source does not exist (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          linkTypeArb,
          async (sourceId, targetId, linkType) => {
            if (sourceId === targetId) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Only create target, not source
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Property: Should throw NotFoundError for missing source
              try {
                await testLinkService.createLink(sourceId, targetId, linkType);
                expect.fail('Expected NotFoundError to be thrown');
              } catch (error) {
                expect(error).toBeInstanceOf(NotFoundError);
                expect((error as NotFoundError).message).toContain(sourceId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject links when target does not exist (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          linkTypeArb,
          async (sourceId, targetId, linkType) => {
            if (sourceId === targetId) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Only create source, not target
              const source = createTestArtifact(sourceId, 'Source');
              await testFileStore.save(source);

              // Property: Should throw NotFoundError for missing target
              try {
                await testLinkService.createLink(sourceId, targetId, linkType);
                expect.fail('Expected NotFoundError to be thrown');
              } catch (error) {
                expect(error).toBeInstanceOf(NotFoundError);
                expect((error as NotFoundError).message).toContain(targetId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: interactive-mode, Property 6: Duplicate link detection**
   * **Validates: Requirements 2.5**
   * 
   * For any pair of artifacts that already have a link between them,
   * attempting to create another link SHALL produce a warning about the existing link.
   */
  describe('Property 6: Duplicate link detection', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 9999 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 9999 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should detect duplicate links and return warning (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          linkTypeArb,
          linkTypeArb,
          async (sourceId, targetId, firstType, secondType) => {
            if (sourceId === targetId) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create both artifacts
              const source = createTestArtifact(sourceId, 'Source');
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(source);
              await testFileStore.save(target);

              // Create first link
              await testLinkService.createLink(sourceId, targetId, firstType);

              // Property: checkDuplicateLink should detect existing link
              const duplicateCheck = await testLinkService.checkDuplicateLink(sourceId, targetId);
              expect(duplicateCheck.exists).toBe(true);
              expect(duplicateCheck.existingType).toBeDefined();

              // Property: Creating second link should return warning
              const result = await testLinkService.createLink(sourceId, targetId, secondType);
              expect(result.warning).toBeDefined();
              expect(result.warning).toContain(sourceId);
              expect(result.warning).toContain(targetId);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: interactive-mode, Property 7: Artifact display includes all links**
   * **Validates: Requirements 2.6**
   * 
   * For any artifact with links, displaying that artifact SHALL show
   * all incoming and outgoing links with their types.
   */
  describe('Property 7: Artifact display includes all links', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should include all outgoing links in display (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          fc.array(adrIdArb, { minLength: 1, maxLength: 5 }),
          linkTypeArb,
          async (sourceId, targetIds, linkType) => {
            // Ensure unique target IDs
            const uniqueTargets = [...new Set(targetIds)].filter(id => id !== sourceId);
            if (uniqueTargets.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create source artifact
              const source = createTestArtifact(sourceId, 'Source');
              await testFileStore.save(source);

              // Create target artifacts and links
              for (const targetId of uniqueTargets) {
                const target = createTestArtifact(targetId, `Target ${targetId}`);
                await testFileStore.save(target);
                await testLinkService.createLink(sourceId, targetId, linkType);
              }

              // Get links for display
              const display = await testLinkService.getLinksForDisplay(sourceId);

              // Property: All outgoing links should be in display
              const outgoingIds = display
                .filter(d => d.direction === 'outgoing')
                .map(d => d.id);
              
              for (const targetId of uniqueTargets) {
                expect(outgoingIds).toContain(targetId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all incoming links in display (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          adrIdArb,
          fc.array(rfcIdArb, { minLength: 1, maxLength: 5 }),
          linkTypeArb,
          async (targetId, sourceIds, linkType) => {
            // Ensure unique source IDs
            const uniqueSources = [...new Set(sourceIds)].filter(id => id !== targetId);
            if (uniqueSources.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create target artifact
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Create source artifacts and links
              for (const sourceId of uniqueSources) {
                const source = createTestArtifact(sourceId, `Source ${sourceId}`);
                await testFileStore.save(source);
                await testLinkService.createLink(sourceId, targetId, linkType);
              }

              // Get links for display
              const display = await testLinkService.getLinksForDisplay(targetId);

              // Property: All incoming links should be in display
              const incomingIds = display
                .filter(d => d.direction === 'incoming')
                .map(d => d.id);
              
              for (const sourceId of uniqueSources) {
                expect(incomingIds).toContain(sourceId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: interactive-mode, Property 18: Batch link creation**
   * **Validates: Requirements 7.2**
   * 
   * For any batch link operation, links SHALL be created to all specified target artifacts.
   */
  describe('Property 18: Batch link creation', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should create links to all targets in batch (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          fc.array(adrIdArb, { minLength: 1, maxLength: 5 }),
          linkTypeArb,
          async (sourceId, targetIds, linkType) => {
            // Ensure unique target IDs
            const uniqueTargets = [...new Set(targetIds)].filter(id => id !== sourceId);
            if (uniqueTargets.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create source artifact
              const source = createTestArtifact(sourceId, 'Source');
              await testFileStore.save(source);

              // Create all target artifacts
              for (const targetId of uniqueTargets) {
                const target = createTestArtifact(targetId, `Target ${targetId}`);
                await testFileStore.save(target);
              }

              // Batch create links
              const results = await testLinkService.batchLink(sourceId, uniqueTargets, linkType);

              // Property: Should return result for each target
              expect(results.length).toBe(uniqueTargets.length);

              // Property: Each target should have a link from source
              for (const targetId of uniqueTargets) {
                const exists = await testLinkService.linkExists(sourceId, targetId);
                expect(exists).toBe(true);
              }

              // Property: Source should have references to all targets
              const updatedSource = await testFileStore.load(sourceId);
              expect(updatedSource).not.toBeNull();
              
              for (const targetId of uniqueTargets) {
                const ref = updatedSource!.references.find(r => r.targetId === targetId);
                expect(ref).toBeDefined();
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fail atomically if any target does not exist (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          fc.array(adrIdArb, { minLength: 2, maxLength: 5 }),
          linkTypeArb,
          async (sourceId, targetIds, linkType) => {
            // Ensure unique target IDs
            const uniqueTargets = [...new Set(targetIds)].filter(id => id !== sourceId);
            if (uniqueTargets.length < 2) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);

              // Create source artifact
              const source = createTestArtifact(sourceId, 'Source');
              await testFileStore.save(source);

              // Only create first target, skip the rest
              const firstTarget = createTestArtifact(uniqueTargets[0], 'First Target');
              await testFileStore.save(firstTarget);

              // Property: Batch link should fail when any target is missing
              try {
                await testLinkService.batchLink(sourceId, uniqueTargets, linkType);
                expect.fail('Expected NotFoundError to be thrown');
              } catch (error) {
                expect(error).toBeInstanceOf(NotFoundError);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getLinks - unit tests', () => {
    it('should return empty arrays for artifact with no links', async () => {
      const artifact = createTestArtifact('RFC-0001', 'Test RFC');
      await fileStore.save(artifact);

      const links = await linkService.getLinks('RFC-0001');

      expect(links.incoming).toEqual([]);
      expect(links.outgoing).toEqual([]);
    });

    it('should return outgoing links', async () => {
      const source = createTestArtifact('RFC-0001', 'Source');
      const target = createTestArtifact('ADR-0001', 'Target');
      await fileStore.save(source);
      await fileStore.save(target);

      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const links = await linkService.getLinks('RFC-0001');

      expect(links.outgoing.length).toBe(1);
      expect(links.outgoing[0].targetId).toBe('ADR-0001');
    });

    it('should return incoming links', async () => {
      const source = createTestArtifact('RFC-0001', 'Source');
      const target = createTestArtifact('ADR-0001', 'Target');
      await fileStore.save(source);
      await fileStore.save(target);

      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const links = await linkService.getLinks('ADR-0001');

      expect(links.incoming.length).toBe(1);
      expect(links.incoming[0].sourceId).toBe('RFC-0001');
    });
  });

  describe('removeLink - unit tests', () => {
    it('should remove link from both artifacts', async () => {
      const source = createTestArtifact('RFC-0001', 'Source');
      const target = createTestArtifact('ADR-0001', 'Target');
      await fileStore.save(source);
      await fileStore.save(target);

      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      await linkService.removeLink('RFC-0001', 'ADR-0001');

      const exists = await linkService.linkExists('RFC-0001', 'ADR-0001');
      expect(exists).toBe(false);

      const updatedSource = await fileStore.load('RFC-0001');
      const updatedTarget = await fileStore.load('ADR-0001');

      expect(updatedSource!.references.find(r => r.targetId === 'ADR-0001')).toBeUndefined();
      expect(updatedTarget!.references.find(r => r.targetId === 'RFC-0001')).toBeUndefined();
    });
  });

  describe('updateLinkType - unit tests', () => {
    it('should update link type', async () => {
      const source = createTestArtifact('RFC-0001', 'Source');
      const target = createTestArtifact('ADR-0001', 'Target');
      await fileStore.save(source);
      await fileStore.save(target);

      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      const updated = await linkService.updateLinkType('RFC-0001', 'ADR-0001', 'supersedes');

      expect(updated.type).toBe('supersedes');

      const updatedSource = await fileStore.load('RFC-0001');
      const ref = updatedSource!.references.find(r => r.targetId === 'ADR-0001');
      expect(ref).toBeDefined();
    });
  });
});
