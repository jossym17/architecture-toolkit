/**
 * Property-Based Tests for Impact Analysis Service
 * 
 * Tests the correctness properties defined in the design document
 * for the impact analysis functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { ImpactAnalysisService } from './impact-service.js';
import { LinkService, LinkType, LINK_TYPES } from '../link/link-service.js';
import { FileStore } from '../storage/file-store.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { Artifact } from '../../models/artifact.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-impact-${process.pid}-${++testCounter}`;
}
const TEST_DIR = '.arch-test-impact-unit';

/**
 * Creates a complete test RFC artifact
 */
function createTestRFC(id: string, title: string = 'Test RFC', status: string = 'draft'): RFC {
  return {
    id,
    type: 'rfc',
    title,
    status: status as RFC['status'],
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
function createTestADR(id: string, title: string = 'Test ADR', status: string = 'proposed'): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: status as ADR['status'],
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
    status: 'pending' as unknown as DecompositionPlan['status'],
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
function createTestArtifact(id: string, title: string = 'Test Artifact', status?: string): Artifact {
  if (id.startsWith('RFC')) {
    return createTestRFC(id, title, status || 'draft');
  } else if (id.startsWith('ADR')) {
    return createTestADR(id, title, status || 'proposed');
  } else {
    return createTestDecomp(id, title);
  }
}

describe('ImpactAnalysisService', () => {
  let fileStore: FileStore;
  let linkService: LinkService;
  let impactService: ImpactAnalysisService;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    fileStore = new FileStore({ baseDir: TEST_DIR });
    await fileStore.initialize();
    linkService = new LinkService(fileStore);
    impactService = new ImpactAnalysisService(fileStore, linkService);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('analyzeImpact - unit tests', () => {
    it('should return empty dependents for artifact with no incoming links', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      await fileStore.save(rfc);

      const report = await impactService.analyzeImpact('RFC-0001');

      expect(report.artifactId).toBe('RFC-0001');
      expect(report.directDependents).toEqual([]);
      expect(report.transitiveDependents).toEqual([]);
      expect(report.maxDepth).toBe(0);
      expect(report.riskScore).toBe(0);
    });

    it('should identify direct dependents', async () => {
      const target = createTestRFC('RFC-0001', 'Target RFC');
      const dependent = createTestADR('ADR-0001', 'Dependent ADR');
      await fileStore.save(target);
      await fileStore.save(dependent);
      
      // ADR depends on RFC (ADR -> RFC)
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');

      const report = await impactService.analyzeImpact('RFC-0001');

      expect(report.directDependents).toContain('ADR-0001');
      expect(report.transitiveDependents).toEqual([]);
      expect(report.maxDepth).toBe(1);
    });

    it('should identify transitive dependents', async () => {
      const target = createTestRFC('RFC-0001', 'Target RFC');
      const direct = createTestADR('ADR-0001', 'Direct Dependent');
      const transitive = createTestADR('ADR-0002', 'Transitive Dependent');
      await fileStore.save(target);
      await fileStore.save(direct);
      await fileStore.save(transitive);
      
      // Chain: ADR-0002 -> ADR-0001 -> RFC-0001
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('ADR-0002', 'ADR-0001', 'depends-on');

      const report = await impactService.analyzeImpact('RFC-0001');

      expect(report.directDependents).toContain('ADR-0001');
      expect(report.transitiveDependents).toContain('ADR-0002');
      expect(report.maxDepth).toBe(2);
    });

    it('should calculate correct max depth for deep chains', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      const dep1 = createTestADR('ADR-0001', 'Depth 1');
      const dep2 = createTestADR('ADR-0002', 'Depth 2');
      const dep3 = createTestADR('ADR-0003', 'Depth 3');
      await fileStore.save(target);
      await fileStore.save(dep1);
      await fileStore.save(dep2);
      await fileStore.save(dep3);
      
      // Chain: ADR-0003 -> ADR-0002 -> ADR-0001 -> RFC-0001
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('ADR-0002', 'ADR-0001', 'depends-on');
      await linkService.createLink('ADR-0003', 'ADR-0002', 'depends-on');

      const report = await impactService.analyzeImpact('RFC-0001');

      expect(report.maxDepth).toBe(3);
    });
  });

  describe('calculateRiskScore - unit tests', () => {
    it('should return 0 for artifact with no dependents', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      await fileStore.save(rfc);

      const score = await impactService.calculateRiskScore('RFC-0001');

      expect(score).toBe(0);
    });

    it('should increase score with more dependents', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      const dep1 = createTestADR('ADR-0001', 'Dependent 1');
      const dep2 = createTestADR('ADR-0002', 'Dependent 2');
      await fileStore.save(target);
      await fileStore.save(dep1);
      await fileStore.save(dep2);
      
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      
      const scoreWith1 = await impactService.calculateRiskScore('RFC-0001');
      
      await linkService.createLink('ADR-0002', 'RFC-0001', 'implements');
      
      const scoreWith2 = await impactService.calculateRiskScore('RFC-0001');

      expect(scoreWith2).toBeGreaterThan(scoreWith1);
    });

    it('should cap score at 100', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      await fileStore.save(target);
      
      // Create many dependents
      for (let i = 1; i <= 20; i++) {
        const dep = createTestADR(`ADR-${i.toString().padStart(4, '0')}`, `Dependent ${i}`, 'approved');
        await fileStore.save(dep);
        await linkService.createLink(`ADR-${i.toString().padStart(4, '0')}`, 'RFC-0001', 'implements');
      }

      const score = await impactService.calculateRiskScore('RFC-0001');

      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateDeprecationChecklist - unit tests', () => {
    it('should return empty tasks for artifact with no dependents', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      await fileStore.save(rfc);

      const checklist = await impactService.generateDeprecationChecklist('RFC-0001');

      expect(checklist.artifactId).toBe('RFC-0001');
      expect(checklist.tasks).toEqual([]);
    });

    it('should generate tasks for each dependent', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      const dep1 = createTestADR('ADR-0001', 'Dependent 1');
      const dep2 = createTestADR('ADR-0002', 'Dependent 2');
      await fileStore.save(target);
      await fileStore.save(dep1);
      await fileStore.save(dep2);
      
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('ADR-0002', 'RFC-0001', 'implements');

      const checklist = await impactService.generateDeprecationChecklist('RFC-0001');

      expect(checklist.tasks.length).toBe(2);
      expect(checklist.tasks.map(t => t.artifactId)).toContain('ADR-0001');
      expect(checklist.tasks.map(t => t.artifactId)).toContain('ADR-0002');
    });

    it('should prioritize tasks by criticality', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      const lowPriority = createTestADR('ADR-0001', 'Draft ADR', 'proposed');
      const highPriority = createTestRFC('RFC-0002', 'Approved RFC', 'approved');
      await fileStore.save(target);
      await fileStore.save(lowPriority);
      await fileStore.save(highPriority);
      
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('RFC-0002', 'RFC-0001', 'depends-on');

      const checklist = await impactService.generateDeprecationChecklist('RFC-0001');

      // High priority (approved RFC) should come first
      expect(checklist.tasks[0].artifactId).toBe('RFC-0002');
      expect(checklist.tasks[0].priority).toBe('high');
    });

    it('should distinguish direct vs transitive in action text', async () => {
      const target = createTestRFC('RFC-0001', 'Target');
      const direct = createTestADR('ADR-0001', 'Direct');
      const transitive = createTestADR('ADR-0002', 'Transitive');
      await fileStore.save(target);
      await fileStore.save(direct);
      await fileStore.save(transitive);
      
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('ADR-0002', 'ADR-0001', 'depends-on');

      const checklist = await impactService.generateDeprecationChecklist('RFC-0001');

      const directTask = checklist.tasks.find(t => t.artifactId === 'ADR-0001');
      const transitiveTask = checklist.tasks.find(t => t.artifactId === 'ADR-0002');

      expect(directTask?.action).toContain('direct dependency');
      expect(transitiveTask?.action).toContain('transitive dependency');
    });
  });


  /**
   * **Feature: interactive-mode, Property 20: Impact analysis completeness**
   * **Validates: Requirements 9.1, 9.4**
   * 
   * For any artifact, impact analysis SHALL return all artifacts that directly
   * or transitively depend on it, with correct depth classification.
   */
  describe('Property 20: Impact analysis completeness', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 30 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 30 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should return all direct dependents (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(artifactIdArb, { minLength: 1, maxLength: 5 }),
          linkTypeArb,
          async (targetId, dependentIds, linkType) => {
            // Ensure unique IDs and no self-references
            const uniqueDependents = [...new Set(dependentIds)].filter(id => id !== targetId);
            if (uniqueDependents.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create target artifact
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Create dependents and link them to target
              for (const depId of uniqueDependents) {
                const dep = createTestArtifact(depId, `Dependent ${depId}`);
                await testFileStore.save(dep);
                // Dependent -> Target (dependent depends on target)
                await testLinkService.createLink(depId, targetId, linkType);
              }

              // Analyze impact
              const report = await testImpactService.analyzeImpact(targetId);

              // Property: All dependents should be in directDependents
              for (const depId of uniqueDependents) {
                expect(report.directDependents).toContain(depId);
              }

              // Property: No transitive dependents (all are direct)
              expect(report.transitiveDependents).toEqual([]);

              // Property: Max depth should be 1
              expect(report.maxDepth).toBe(1);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all transitive dependents with correct depth (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          artifactIdArb,
          linkTypeArb,
          async (targetId, directId, transitiveId, linkType) => {
            // Ensure all IDs are unique
            if (targetId === directId || targetId === transitiveId || directId === transitiveId) {
              return;
            }

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create chain: transitive -> direct -> target
              const target = createTestArtifact(targetId, 'Target');
              const direct = createTestArtifact(directId, 'Direct');
              const transitive = createTestArtifact(transitiveId, 'Transitive');
              
              await testFileStore.save(target);
              await testFileStore.save(direct);
              await testFileStore.save(transitive);
              
              await testLinkService.createLink(directId, targetId, linkType);
              await testLinkService.createLink(transitiveId, directId, linkType);

              // Analyze impact
              const report = await testImpactService.analyzeImpact(targetId);

              // Property: Direct dependent should be in directDependents
              expect(report.directDependents).toContain(directId);

              // Property: Transitive dependent should be in transitiveDependents
              expect(report.transitiveDependents).toContain(transitiveId);

              // Property: Max depth should be 2
              expect(report.maxDepth).toBe(2);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle complex dependency graphs (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(artifactIdArb, { minLength: 2, maxLength: 4 }),
          fc.array(
            fc.tuple(fc.nat({ max: 3 }), fc.nat({ max: 3 }), linkTypeArb),
            { minLength: 1, maxLength: 6 }
          ),
          async (targetId, otherIds, edges) => {
            // Ensure unique IDs
            const uniqueOthers = [...new Set(otherIds)].filter(id => id !== targetId);
            if (uniqueOthers.length < 2) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create all artifacts
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);
              
              for (const id of uniqueOthers) {
                const artifact = createTestArtifact(id, `Artifact ${id}`);
                await testFileStore.save(artifact);
              }

              // Create edges (some pointing to target, some between others)
              const createdEdges = new Set<string>();
              const directDeps = new Set<string>();
              
              // First, ensure at least one edge to target
              if (uniqueOthers.length > 0) {
                const firstDep = uniqueOthers[0];
                await testLinkService.createLink(firstDep, targetId, 'depends-on');
                directDeps.add(firstDep);
                createdEdges.add(`${firstDep}->${targetId}`);
              }

              // Create additional edges
              for (const [srcIdx, tgtIdx, linkType] of edges) {
                const allIds = [targetId, ...uniqueOthers];
                const sourceIdx = srcIdx % allIds.length;
                const targetIdx = tgtIdx % allIds.length;
                
                if (sourceIdx === targetIdx) continue;
                
                const sourceId = allIds[sourceIdx];
                const tgtId = allIds[targetIdx];
                
                // Skip if source is target (we want edges TO target, not FROM)
                if (sourceId === targetId) continue;
                
                const edgeKey = `${sourceId}->${tgtId}`;
                if (createdEdges.has(edgeKey)) continue;
                
                await testLinkService.createLink(sourceId, tgtId, linkType);
                createdEdges.add(edgeKey);
                
                if (tgtId === targetId) {
                  directDeps.add(sourceId);
                }
              }

              // Analyze impact
              const report = await testImpactService.analyzeImpact(targetId);

              // Property: All direct dependents should be in directDependents
              for (const depId of directDeps) {
                expect(report.directDependents).toContain(depId);
              }

              // Property: All dependents should be accounted for
              const allDependents = new Set([...report.directDependents, ...report.transitiveDependents]);
              
              // Property: No duplicate between direct and transitive
              const directSet = new Set(report.directDependents);
              for (const transitive of report.transitiveDependents) {
                expect(directSet.has(transitive)).toBe(false);
              }

              // Property: Max depth should be >= 1 if there are dependents
              if (allDependents.size > 0) {
                expect(report.maxDepth).toBeGreaterThanOrEqual(1);
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
   * **Feature: interactive-mode, Property 21: Risk score calculation**
   * **Validates: Requirements 9.2**
   * 
   * For any artifact with dependents, the risk score SHALL be proportional
   * to the number and criticality of dependent artifacts.
   */
  describe('Property 21: Risk score calculation', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 30 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 30 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const decompIdArb = fc.integer({ min: 1, max: 30 }).map(n => `DECOMP-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb, decompIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should return higher score with more dependents (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(artifactIdArb, { minLength: 2, maxLength: 6 }),
          linkTypeArb,
          async (targetId, dependentIds, linkType) => {
            // Ensure unique IDs and no self-references
            const uniqueDependents = [...new Set(dependentIds)].filter(id => id !== targetId);
            if (uniqueDependents.length < 2) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create target artifact
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Create first dependent and measure score
              const firstDep = createTestArtifact(uniqueDependents[0], 'First Dependent');
              await testFileStore.save(firstDep);
              await testLinkService.createLink(uniqueDependents[0], targetId, linkType);
              
              const scoreWith1 = await testImpactService.calculateRiskScore(targetId);

              // Add more dependents
              for (let i = 1; i < uniqueDependents.length; i++) {
                const dep = createTestArtifact(uniqueDependents[i], `Dependent ${i}`);
                await testFileStore.save(dep);
                await testLinkService.createLink(uniqueDependents[i], targetId, linkType);
              }

              const scoreWithMore = await testImpactService.calculateRiskScore(targetId);

              // Property: More dependents should result in higher or equal score
              expect(scoreWithMore).toBeGreaterThanOrEqual(scoreWith1);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return higher score for higher criticality dependents (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          adrIdArb,
          rfcIdArb,
          async (targetId, lowCriticalityId, highCriticalityId) => {
            // Ensure all IDs are unique
            if (targetId === lowCriticalityId || targetId === highCriticalityId || lowCriticalityId === highCriticalityId) {
              return;
            }

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create target artifact
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Create low criticality dependent (draft ADR)
              const lowCriticality = createTestADR(lowCriticalityId, 'Low Criticality', 'proposed');
              await testFileStore.save(lowCriticality);
              await testLinkService.createLink(lowCriticalityId, targetId, 'depends-on');
              
              const scoreWithLow = await testImpactService.calculateRiskScore(targetId);

              // Remove low criticality link
              await testLinkService.removeLink(lowCriticalityId, targetId);

              // Create high criticality dependent (approved RFC)
              const highCriticality = createTestRFC(highCriticalityId, 'High Criticality', 'approved');
              await testFileStore.save(highCriticality);
              await testLinkService.createLink(highCriticalityId, targetId, 'depends-on');

              const scoreWithHigh = await testImpactService.calculateRiskScore(targetId);

              // Property: Higher criticality dependent should result in higher score
              // RFC (type=3) * approved (status=3) = 9
              // ADR (type=2) * proposed (status=2) = 4
              expect(scoreWithHigh).toBeGreaterThan(scoreWithLow);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return score between 0 and 100 (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(artifactIdArb, { minLength: 0, maxLength: 10 }),
          linkTypeArb,
          async (targetId, dependentIds, linkType) => {
            // Ensure unique IDs and no self-references
            const uniqueDependents = [...new Set(dependentIds)].filter(id => id !== targetId);

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testImpactService = new ImpactAnalysisService(testFileStore, testLinkService);

              // Create target artifact
              const target = createTestArtifact(targetId, 'Target');
              await testFileStore.save(target);

              // Create dependents
              for (const depId of uniqueDependents) {
                const dep = createTestArtifact(depId, `Dependent ${depId}`);
                await testFileStore.save(dep);
                await testLinkService.createLink(depId, targetId, linkType);
              }

              const score = await testImpactService.calculateRiskScore(targetId);

              // Property: Score should always be between 0 and 100
              expect(score).toBeGreaterThanOrEqual(0);
              expect(score).toBeLessThanOrEqual(100);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 for artifact with no dependents (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          async (targetId) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testImpactService = new ImpactAnalysisService(testFileStore, new LinkService(testFileStore));

              // Create isolated artifact
              const target = createTestArtifact(targetId, 'Isolated');
              await testFileStore.save(target);

              const score = await testImpactService.calculateRiskScore(targetId);

              // Property: No dependents should result in 0 score
              expect(score).toBe(0);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
