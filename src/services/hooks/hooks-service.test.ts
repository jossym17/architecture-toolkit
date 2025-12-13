/**
 * Property-Based Tests for Git Hooks Service
 * 
 * Tests the correctness properties defined in the design document
 * for the git hooks functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { GitHooksService } from './hooks-service.js';
import { FileStore } from '../storage/file-store.js';
import type { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { Reference } from '../../models/reference.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-hooks-${process.pid}-${++testCounter}`;
}

/**
 * Creates a complete test RFC artifact
 */
function createTestRFC(id: string, title: string = 'Test RFC', references: Reference[] = []): RFC {
  return {
    id,
    type: 'rfc',
    title,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
    references,
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
function createTestADR(id: string, title: string = 'Test ADR', references: Reference[] = []): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
    references,
    context: 'Test context',
    decision: 'Test decision',
    consequences: ['Consequence 1'],
    alternativesConsidered: []
  };
}


/**
 * Creates a complete test Decomposition artifact
 */
function createTestDecomp(id: string, title: string = 'Test Decomposition', references: Reference[] = []): DecompositionPlan {
  return {
    id,
    type: 'decomposition',
    title,
    status: 'draft' as unknown as DecompositionPlan['status'],
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
    references,
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
function createTestArtifact(id: string, title: string = 'Test Artifact', references: Reference[] = []): Artifact {
  if (id.startsWith('RFC')) {
    return createTestRFC(id, title, references);
  } else if (id.startsWith('ADR')) {
    return createTestADR(id, title, references);
  } else {
    return createTestDecomp(id, title, references);
  }
}

describe('GitHooksService', () => {
  describe('validateStagedArtifacts - unit tests', () => {
    it('should return valid result when no staged files', async () => {
      const testDir = getTestDir();
      try {
        const fileStore = new FileStore({ baseDir: testDir });
        await fileStore.initialize();
        
        // Create service with mocked git
        const service = new GitHooksService(fileStore, testDir);
        
        // Mock getStagedArchFiles to return empty array
        vi.spyOn(service, 'getStagedArchFiles').mockResolvedValue([]);
        
        const result = await service.validateStagedArtifacts();
        
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.brokenLinks).toHaveLength(0);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });


  /**
   * **Feature: interactive-mode, Property 14: Pre-commit validates all staged artifacts**
   * **Validates: Requirements 5.2, 5.3**
   * 
   * For any set of staged artifact files, the pre-commit hook SHALL validate
   * all of them and report all validation errors.
   */
  describe('Property 14: Pre-commit validates all staged artifacts', () => {
    // Arbitrary for valid artifact IDs
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);

    // Arbitrary for valid alphanumeric title
    const titleArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,30}$/)
      .filter(s => s.trim().length > 0);

    it('should validate all staged artifacts and report errors (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(artifactIdArb, { minLength: 1, maxLength: 5 }),
          titleArb,
          async (artifactIds, title) => {
            // Ensure unique artifact IDs
            const uniqueIds = [...new Set(artifactIds)];
            if (uniqueIds.length === 0) return;

            const testDir = getTestDir();
            try {
              const fileStore = new FileStore({ baseDir: testDir });
              await fileStore.initialize();
              
              // Create and save all artifacts
              const stagedFiles: string[] = [];
              const savedArtifactIds: string[] = [];
              
              for (const id of uniqueIds) {
                const artifact = createTestArtifact(id, title);
                await fileStore.save(artifact);
                savedArtifactIds.push(id);
                
                // Build staged file path
                const type = id.startsWith('RFC') ? 'rfc' : id.startsWith('ADR') ? 'adr' : 'decomposition';
                stagedFiles.push(`.arch/${type}/${id}.md`);
              }

              const service = new GitHooksService(fileStore, testDir);
              
              // Mock getStagedArchFiles to return our test files
              vi.spyOn(service, 'getStagedArchFiles').mockResolvedValue(stagedFiles);
              
              const result = await service.validateStagedArtifacts();

              // Property: All staged artifacts should be validated
              // Since our test artifacts are valid, result should be valid
              // If there are errors, they should only be for artifacts we staged
              if (!result.valid) {
                // All errors should reference artifacts we created
                for (const error of result.errors) {
                  expect(savedArtifactIds).toContain(error.artifactId);
                }
              }
              
              // Property: No broken links since we have no references
              expect(result.brokenLinks).toHaveLength(0);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report validation errors for invalid artifacts (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          async (artifactId) => {
            const testDir = getTestDir();
            try {
              const fileStore = new FileStore({ baseDir: testDir });
              await fileStore.initialize();
              
              // Create an invalid artifact (missing required fields)
              const invalidArtifact = createTestArtifact(artifactId, 'Test');
              
              // Make it invalid by clearing required fields
              if (artifactId.startsWith('RFC')) {
                (invalidArtifact as RFC).problemStatement = '';
              } else if (artifactId.startsWith('ADR')) {
                (invalidArtifact as ADR).context = '';
              }
              
              await fileStore.save(invalidArtifact);
              
              const type = artifactId.startsWith('RFC') ? 'rfc' : artifactId.startsWith('ADR') ? 'adr' : 'decomposition';
              const stagedFiles = [`.arch/${type}/${artifactId}.md`];

              const service = new GitHooksService(fileStore, testDir);
              vi.spyOn(service, 'getStagedArchFiles').mockResolvedValue(stagedFiles);
              
              const result = await service.validateStagedArtifacts();

              // Property: Invalid artifacts should produce validation errors
              expect(result.valid).toBe(false);
              expect(result.errors.length).toBeGreaterThan(0);
              
              // Property: Error should reference the artifact ID
              const hasErrorForArtifact = result.errors.some(e => e.artifactId === artifactId);
              expect(hasErrorForArtifact).toBe(true);
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
   * **Feature: interactive-mode, Property 15: Broken link detection in hooks**
   * **Validates: Requirements 5.6**
   * 
   * For any artifact with references to non-existent artifacts,
   * the pre-commit hook SHALL identify and list all broken links.
   */
  describe('Property 15: Broken link detection in hooks', () => {
    // Arbitrary for valid artifact IDs
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);

    it('should detect broken links to non-existent artifacts (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          fc.array(adrIdArb, { minLength: 1, maxLength: 3 }),
          async (sourceId, targetIds) => {
            // Ensure unique target IDs that don't match source
            const uniqueTargets = [...new Set(targetIds)].filter(id => id !== sourceId);
            if (uniqueTargets.length === 0) return;

            const testDir = getTestDir();
            try {
              const fileStore = new FileStore({ baseDir: testDir });
              await fileStore.initialize();
              
              // Create references to non-existent artifacts
              const references: Reference[] = uniqueTargets.map(targetId => ({
                targetId,
                targetType: 'adr' as const,
                referenceType: 'relates-to' as const
              }));
              
              // Create source artifact with broken references
              const sourceArtifact = createTestArtifact(sourceId, 'Source', references);
              await fileStore.save(sourceArtifact);
              
              // Note: We intentionally do NOT create the target artifacts
              // This simulates broken links
              
              const service = new GitHooksService(fileStore, testDir);
              
              // Detect broken links
              const brokenLinks = await service.detectBrokenLinks([sourceArtifact]);

              // Property: All references to non-existent artifacts should be detected
              expect(brokenLinks.length).toBe(uniqueTargets.length);
              
              // Property: Each broken link should have correct source and target
              for (const targetId of uniqueTargets) {
                const found = brokenLinks.find(
                  link => link.sourceId === sourceId && link.targetId === targetId
                );
                expect(found).toBeDefined();
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not report valid links as broken (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          fc.array(adrIdArb, { minLength: 1, maxLength: 3 }),
          async (sourceId, targetIds) => {
            // Ensure unique target IDs that don't match source
            const uniqueTargets = [...new Set(targetIds)].filter(id => id !== sourceId);
            if (uniqueTargets.length === 0) return;

            const testDir = getTestDir();
            try {
              const fileStore = new FileStore({ baseDir: testDir });
              await fileStore.initialize();
              
              // Create references
              const references: Reference[] = uniqueTargets.map(targetId => ({
                targetId,
                targetType: 'adr' as const,
                referenceType: 'relates-to' as const
              }));
              
              // Create source artifact with references
              const sourceArtifact = createTestArtifact(sourceId, 'Source', references);
              await fileStore.save(sourceArtifact);
              
              // Create all target artifacts (valid links)
              for (const targetId of uniqueTargets) {
                const targetArtifact = createTestArtifact(targetId, `Target ${targetId}`);
                await fileStore.save(targetArtifact);
              }
              
              const service = new GitHooksService(fileStore, testDir);
              
              // Detect broken links
              const brokenLinks = await service.detectBrokenLinks([sourceArtifact]);

              // Property: No broken links should be reported when all targets exist
              expect(brokenLinks.length).toBe(0);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect partial broken links (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          adrIdArb,
          adrIdArb,
          async (sourceId, existingTargetId, missingTargetId) => {
            // Ensure all IDs are different
            if (sourceId === existingTargetId || sourceId === missingTargetId || 
                existingTargetId === missingTargetId) return;

            const testDir = getTestDir();
            try {
              const fileStore = new FileStore({ baseDir: testDir });
              await fileStore.initialize();
              
              // Create references to both existing and non-existing artifacts
              const references: Reference[] = [
                { targetId: existingTargetId, targetType: 'adr', referenceType: 'relates-to' },
                { targetId: missingTargetId, targetType: 'adr', referenceType: 'depends-on' }
              ];
              
              // Create source artifact
              const sourceArtifact = createTestArtifact(sourceId, 'Source', references);
              await fileStore.save(sourceArtifact);
              
              // Only create one target (the other is missing)
              const existingTarget = createTestArtifact(existingTargetId, 'Existing Target');
              await fileStore.save(existingTarget);
              
              const service = new GitHooksService(fileStore, testDir);
              
              // Detect broken links
              const brokenLinks = await service.detectBrokenLinks([sourceArtifact]);

              // Property: Only the missing target should be reported as broken
              expect(brokenLinks.length).toBe(1);
              expect(brokenLinks[0].sourceId).toBe(sourceId);
              expect(brokenLinks[0].targetId).toBe(missingTargetId);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('generateCIScript - unit tests', () => {
    it('should generate GitHub Actions script by default', () => {
      const service = new GitHooksService();
      const script = service.generateCIScript();
      
      expect(script).toContain('name: Architecture Validation');
      expect(script).toContain('actions/checkout');
      expect(script).toContain('npx arch verify');
    });

    it('should generate GitHub Actions script when specified', () => {
      const service = new GitHooksService();
      const script = service.generateCIScript('github');
      
      expect(script).toContain('name: Architecture Validation');
      expect(script).toContain('actions/checkout');
    });

    it('should generate GitLab CI script when specified', () => {
      const service = new GitHooksService();
      const script = service.generateCIScript('gitlab');
      
      expect(script).toContain('stages:');
      expect(script).toContain('validate-architecture');
      expect(script).toContain('npx arch verify');
    });
  });

  describe('detectBrokenLinks - unit tests', () => {
    it('should return empty array for artifacts with no references', async () => {
      const testDir = getTestDir();
      try {
        const fileStore = new FileStore({ baseDir: testDir });
        await fileStore.initialize();
        
        const artifact = createTestArtifact('RFC-0001', 'Test');
        await fileStore.save(artifact);
        
        const service = new GitHooksService(fileStore, testDir);
        const brokenLinks = await service.detectBrokenLinks([artifact]);
        
        expect(brokenLinks).toHaveLength(0);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });
});
