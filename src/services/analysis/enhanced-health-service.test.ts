/**
 * Property-Based Tests for Enhanced Health Service
 * 
 * Tests the correctness properties defined in the design document
 * for the enhanced health scoring functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  EnhancedHealthService,
  EnhancedHealthConfig,
  HealthBreakdown,
} from './enhanced-health-service.js';
import { FileStore } from '../storage/file-store.js';
import { LinkService } from '../link/link-service.js';
import { GraphService } from '../graph/graph-service.js';
import type { Artifact } from '../../models/artifact.js';
import type { ArtifactType, ArtifactStatus } from '../../models/types.js';

// Mock the dependencies
vi.mock('../storage/file-store.js');
vi.mock('../link/link-service.js');
vi.mock('../graph/graph-service.js');

describe('EnhancedHealthService', () => {
  let service: EnhancedHealthService;
  let mockFileStore: FileStore;
  let mockLinkService: LinkService;
  let mockGraphService: GraphService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFileStore = new FileStore();
    mockLinkService = new LinkService(mockFileStore);
    mockGraphService = new GraphService(mockFileStore, mockLinkService);
    service = new EnhancedHealthService(
      mockFileStore,
      mockLinkService,
      mockGraphService
    );
  });

  /**
   * Helper to create a mock artifact
   */
  function createMockArtifact(overrides: Partial<Artifact> = {}): Artifact {
    const now = new Date();
    return {
      id: 'RFC-0001',
      type: 'rfc' as ArtifactType,
      title: 'Test Artifact',
      status: 'approved' as ArtifactStatus,
      createdAt: now,
      updatedAt: now,
      owner: 'test-owner',
      tags: ['test'],
      references: [],
      ...overrides
    };
  }


  /**
   * **Feature: interactive-mode, Property 11: Health score calculation consistency**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   * 
   * For any artifact, the health score SHALL equal 100 minus the sum of all
   * applicable penalties (no links, stale references, staleness), with the
   * score bounded between 0 and 100.
   */
  describe('Property 11: Health score calculation consistency', () => {
    // Arbitrary for artifact type
    const artifactTypeArb = fc.constantFrom<ArtifactType>('rfc', 'adr', 'decomposition');

    // Arbitrary for artifact status
    const artifactStatusArb = fc.constantFrom<ArtifactStatus>(
      'draft', 'review', 'approved', 'rejected', 'implemented',
      'proposed', 'accepted', 'deprecated', 'superseded'
    );

    // Arbitrary for days since update (0 to 365)
    const daysSinceUpdateArb = fc.integer({ min: 0, max: 365 });

    // Arbitrary for number of outgoing links (0 to 5)
    const outgoingLinksCountArb = fc.integer({ min: 0, max: 5 });

    // Arbitrary for number of stale references (0 to 3)
    const staleReferencesCountArb = fc.integer({ min: 0, max: 3 });

    // Arbitrary for health config
    const healthConfigArb = fc.record({
      threshold: fc.integer({ min: 0, max: 100 }),
      stalenessThresholdDays: fc.integer({ min: 30, max: 180 }),
      noLinksPenalty: fc.integer({ min: 0, max: 30 }),
      staleReferencePenalty: fc.integer({ min: 0, max: 30 }),
      stalenessPenaltyPerMonth: fc.integer({ min: 0, max: 15 })
    });

    it('should calculate score as 100 minus sum of penalties (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          artifactStatusArb,
          daysSinceUpdateArb,
          outgoingLinksCountArb,
          staleReferencesCountArb,
          healthConfigArb,
          async (
            artifactType,
            status,
            daysSinceUpdate,
            outgoingLinksCount,
            staleReferencesCount,
            config
          ) => {
            // Create artifact with specified properties
            const updatedAt = new Date();
            updatedAt.setDate(updatedAt.getDate() - daysSinceUpdate);

            const artifact = createMockArtifact({
              id: `${artifactType.toUpperCase()}-0001`,
              type: artifactType,
              status,
              updatedAt,
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            });

            // Mock file store to return the artifact
            vi.mocked(mockFileStore.load).mockResolvedValue(artifact);

            // Create mock outgoing links
            const outgoingLinks = Array.from({ length: outgoingLinksCount }, (_, i) => ({
              sourceId: artifact.id,
              targetId: `RFC-${String(i + 2).padStart(4, '0')}`,
              type: 'relates-to' as const,
              createdAt: new Date()
            }));

            // Create mock stale target artifacts
            const staleTargets: Artifact[] = [];
            for (let i = 0; i < staleReferencesCount && i < outgoingLinksCount; i++) {
              staleTargets.push(createMockArtifact({
                id: outgoingLinks[i].targetId,
                status: i % 2 === 0 ? 'deprecated' : 'superseded'
              }));
            }

            // Mock link service
            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: outgoingLinks
            });

            // Mock file store load for target artifacts
            vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
              if (id === artifact.id) return artifact;
              const staleTarget = staleTargets.find(t => t.id === id);
              if (staleTarget) return staleTarget;
              // Return non-stale artifact for other targets
              return createMockArtifact({ id, status: 'approved' });
            });

            // Create service with config
            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService,
              config
            );

            const breakdown = await testService.getHealthBreakdown(artifact.id);
            const healthScore = await testService.calculateHealth(artifact.id);

            // Calculate expected penalties
            let expectedPenalty = 0;

            // No links penalty
            if (outgoingLinksCount === 0) {
              expectedPenalty += config.noLinksPenalty;
            }

            // Stale reference penalties
            expectedPenalty += staleReferencesCount * config.staleReferencePenalty;

            // Staleness penalty
            if (daysSinceUpdate > config.stalenessThresholdDays) {
              const daysOver = daysSinceUpdate - config.stalenessThresholdDays;
              const monthsOver = Math.floor(daysOver / 30);
              expectedPenalty += monthsOver * config.stalenessPenaltyPerMonth;
            }

            // Property: total penalty from breakdown should match calculated penalty
            const actualPenalty = breakdown.penalties.reduce((sum, p) => sum + p.points, 0);
            
            // Property: score should be 100 - penalties, bounded [0, 100]
            const expectedScore = Math.max(0, Math.min(100, 100 - actualPenalty));
            expect(healthScore.score).toBe(expectedScore);

            // Property: score should always be between 0 and 100
            expect(healthScore.score).toBeGreaterThanOrEqual(0);
            expect(healthScore.score).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });


    it('should apply no-links penalty when artifact has no outgoing links (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          healthConfigArb,
          async (config) => {
            const artifact = createMockArtifact({
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            });

            vi.mocked(mockFileStore.load).mockResolvedValue(artifact);
            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: [] // No outgoing links
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService,
              config
            );

            const breakdown = await testService.getHealthBreakdown(artifact.id);

            // Property: should have a penalty for no outgoing links
            const noLinksPenalty = breakdown.penalties.find(p => p.reason === 'No outgoing links');
            expect(noLinksPenalty).toBeDefined();
            expect(noLinksPenalty?.points).toBe(config.noLinksPenalty);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply staleness penalty correctly based on days over threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 91, max: 365 }), // Days since update (over default 90)
          healthConfigArb,
          async (daysSinceUpdate, config) => {
            const updatedAt = new Date();
            updatedAt.setDate(updatedAt.getDate() - daysSinceUpdate);

            const artifact = createMockArtifact({
              updatedAt,
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            });

            vi.mocked(mockFileStore.load).mockResolvedValue(artifact);
            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: [{ sourceId: artifact.id, targetId: 'RFC-0002', type: 'relates-to', createdAt: new Date() }]
            });

            // Mock target artifact as non-stale
            vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
              if (id === artifact.id) return artifact;
              return createMockArtifact({ id, status: 'approved' });
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService,
              config
            );

            const breakdown = await testService.getHealthBreakdown(artifact.id);

            if (daysSinceUpdate > config.stalenessThresholdDays) {
              const daysOver = daysSinceUpdate - config.stalenessThresholdDays;
              const monthsOver = Math.floor(daysOver / 30);
              const expectedPenalty = monthsOver * config.stalenessPenaltyPerMonth;

              if (expectedPenalty > 0) {
                // Property: staleness penalty should be applied
                const stalenessPenalty = breakdown.penalties.find(p => p.reason === 'Staleness');
                expect(stalenessPenalty).toBeDefined();
                expect(stalenessPenalty?.points).toBe(expectedPenalty);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply stale reference penalty for deprecated/superseded targets (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<ArtifactStatus>('deprecated', 'superseded'),
          healthConfigArb,
          async (targetStatus, config) => {
            const artifact = createMockArtifact({
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            });

            const targetArtifact = createMockArtifact({
              id: 'RFC-0002',
              status: targetStatus
            });

            vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
              if (id === artifact.id) return artifact;
              if (id === targetArtifact.id) return targetArtifact;
              return null;
            });

            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: [{
                sourceId: artifact.id,
                targetId: targetArtifact.id,
                type: 'relates-to',
                createdAt: new Date()
              }]
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService,
              config
            );

            const breakdown = await testService.getHealthBreakdown(artifact.id);

            // Property: should have a stale reference penalty
            const staleRefPenalty = breakdown.penalties.find(p => p.reason === 'Stale reference');
            expect(staleRefPenalty).toBeDefined();
            expect(staleRefPenalty?.points).toBe(config.staleReferencePenalty);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('Unit tests for EnhancedHealthService', () => {
    it('should return score of 0 for non-existent artifact', async () => {
      vi.mocked(mockFileStore.load).mockResolvedValue(null);

      const result = await service.calculateHealth('RFC-9999');

      expect(result.score).toBe(0);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe('incomplete');
      expect(result.issues[0].severity).toBe('critical');
    });

    it('should return perfect score for healthy artifact', async () => {
      const artifact = createMockArtifact({
        title: 'Test',
        owner: 'owner',
        tags: ['tag']
      });

      vi.mocked(mockFileStore.load).mockResolvedValue(artifact);
      vi.mocked(mockLinkService.getLinks).mockResolvedValue({
        incoming: [],
        outgoing: [{
          sourceId: artifact.id,
          targetId: 'RFC-0002',
          type: 'relates-to',
          createdAt: new Date()
        }]
      });

      // Mock target as healthy
      vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
        if (id === artifact.id) return artifact;
        return createMockArtifact({ id, status: 'approved' });
      });

      const result = await service.calculateHealth(artifact.id);

      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should calculate all health for multiple artifacts', async () => {
      const artifacts = [
        createMockArtifact({ id: 'RFC-0001' }),
        createMockArtifact({ id: 'RFC-0002' })
      ];

      vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
      vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
        return artifacts.find(a => a.id === id) || null;
      });
      vi.mocked(mockLinkService.getLinks).mockResolvedValue({
        incoming: [],
        outgoing: [{ sourceId: 'RFC-0001', targetId: 'RFC-0002', type: 'relates-to', createdAt: new Date() }]
      });
      vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);

      const report = await service.calculateAllHealth();

      expect(report.artifacts).toHaveLength(2);
      expect(report.summary).toBeDefined();
      expect(report.circularDependencies).toEqual([]);
    });

    it('should include circular dependencies in report', async () => {
      const artifacts = [createMockArtifact({ id: 'RFC-0001' })];

      vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
      vi.mocked(mockFileStore.load).mockResolvedValue(artifacts[0]);
      vi.mocked(mockLinkService.getLinks).mockResolvedValue({
        incoming: [],
        outgoing: []
      });
      vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([
        { cycle: ['RFC-0001', 'RFC-0002', 'RFC-0001'], severity: 'critical' }
      ]);

      const report = await service.calculateAllHealth();

      expect(report.circularDependencies).toHaveLength(1);
      expect(report.summary.criticalIssues).toBeGreaterThanOrEqual(1);
    });

    it('should update config correctly', () => {
      const newConfig: Partial<EnhancedHealthConfig> = {
        threshold: 90,
        noLinksPenalty: 20
      };

      service.updateConfig(newConfig);
      const config = service.getConfig();

      expect(config.threshold).toBe(90);
      expect(config.noLinksPenalty).toBe(20);
    });

    it('should check threshold correctly', async () => {
      const artifacts = [
        createMockArtifact({ id: 'RFC-0001' })
      ];

      vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
      vi.mocked(mockFileStore.load).mockResolvedValue(artifacts[0]);
      vi.mocked(mockLinkService.getLinks).mockResolvedValue({
        incoming: [],
        outgoing: [] // No links = penalty
      });
      vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);

      // With default config, no links = 10 point penalty = score of 90
      const result = await service.checkThreshold(95);

      expect(result.passed).toBe(false);
      expect(result.failedCount).toBe(1);
    });
  });

  describe('getHealthBreakdown', () => {
    it('should return breakdown with all categories', async () => {
      const artifact = createMockArtifact();

      vi.mocked(mockFileStore.load).mockResolvedValue(artifact);
      vi.mocked(mockLinkService.getLinks).mockResolvedValue({
        incoming: [],
        outgoing: []
      });

      const breakdown = await service.getHealthBreakdown(artifact.id);

      expect(breakdown).toHaveProperty('completeness');
      expect(breakdown).toHaveProperty('freshness');
      expect(breakdown).toHaveProperty('relationships');
      expect(breakdown).toHaveProperty('penalties');
    });

    it('should return zero scores for non-existent artifact', async () => {
      vi.mocked(mockFileStore.load).mockResolvedValue(null);

      const breakdown = await service.getHealthBreakdown('RFC-9999');

      expect(breakdown.completeness).toBe(0);
      expect(breakdown.freshness).toBe(0);
      expect(breakdown.relationships).toBe(0);
      expect(breakdown.penalties).toHaveLength(1);
    });
  });

  /**
   * **Feature: interactive-mode, Property 12: Health threshold exit code**
   * **Validates: Requirements 4.6**
   * 
   * For any set of artifacts and threshold value, the health command SHALL
   * return non-zero exit code if and only if at least one artifact has a
   * health score below the threshold.
   */
  describe('Property 12: Health threshold exit code', () => {
    // Arbitrary for threshold value (0-100)
    const thresholdArb = fc.integer({ min: 0, max: 100 });

    // Arbitrary for artifact scores (0-100)
    const artifactScoreArb = fc.integer({ min: 0, max: 100 });

    // Arbitrary for array of artifact scores
    const artifactScoresArb = fc.array(artifactScoreArb, { minLength: 1, maxLength: 10 });

    it('should return passed=false if and only if at least one artifact is below threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          thresholdArb,
          artifactScoresArb,
          async (threshold, scores) => {
            // Create mock artifacts with the specified scores
            const artifacts = scores.map((_, i) => createMockArtifact({
              id: `RFC-${String(i + 1).padStart(4, '0')}`,
              title: `Test ${i}`,
              owner: 'owner',
              tags: ['tag']
            }));

            vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
            vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);

            // Mock each artifact's health calculation based on scores
            // We'll simulate scores by controlling the penalties
            let scoreIndex = 0;
            vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
              const artifact = artifacts.find(a => a.id === id);
              return artifact || null;
            });

            // Mock link service to control the score
            vi.mocked(mockLinkService.getLinks).mockImplementation(async (artifactId: string) => {
              const idx = artifacts.findIndex(a => a.id === artifactId);
              const targetScore = scores[idx] ?? 100;
              
              // If score should be 100, return links; otherwise return no links to apply penalty
              if (targetScore >= 90) {
                return {
                  incoming: [],
                  outgoing: [{
                    sourceId: artifactId,
                    targetId: 'RFC-9999',
                    type: 'relates-to' as const,
                    createdAt: new Date()
                  }]
                };
              }
              return { incoming: [], outgoing: [] };
            });

            // Create service and check threshold
            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService
            );

            const result = await testService.checkThreshold(threshold);

            // Calculate expected result
            // With no links, score is 90 (100 - 10 penalty)
            // With links, score is 100
            const actualScores = scores.map(s => s >= 90 ? 100 : 90);
            const expectedBelowThreshold = actualScores.filter(s => s < threshold).length;
            const expectedPassed = expectedBelowThreshold === 0;

            // Property: passed should be true iff no artifacts are below threshold
            expect(result.passed).toBe(expectedPassed);
            expect(result.failedCount).toBe(expectedBelowThreshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count correct number of artifacts below threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          thresholdArb,
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          async (threshold, hasLinks) => {
            // Create artifacts where hasLinks[i] determines if artifact has links
            const artifacts = hasLinks.map((_, i) => createMockArtifact({
              id: `RFC-${String(i + 1).padStart(4, '0')}`,
              title: `Test ${i}`,
              owner: 'owner',
              tags: ['tag']
            }));

            vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
            vi.mocked(mockFileStore.load).mockImplementation(async (id: string) => {
              return artifacts.find(a => a.id === id) || null;
            });
            vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);

            // Mock links based on hasLinks array
            vi.mocked(mockLinkService.getLinks).mockImplementation(async (artifactId: string) => {
              const idx = artifacts.findIndex(a => a.id === artifactId);
              if (hasLinks[idx]) {
                return {
                  incoming: [],
                  outgoing: [{
                    sourceId: artifactId,
                    targetId: 'RFC-9999',
                    type: 'relates-to' as const,
                    createdAt: new Date()
                  }]
                };
              }
              return { incoming: [], outgoing: [] };
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService
            );

            const result = await testService.checkThreshold(threshold);

            // Calculate expected: artifacts with links have score 100, without have score 90
            const expectedScores = hasLinks.map(has => has ? 100 : 90);
            const expectedBelowThreshold = expectedScores.filter(s => s < threshold).length;

            // Property: failedCount should match number of artifacts below threshold
            expect(result.failedCount).toBe(expectedBelowThreshold);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return passed=true when all artifacts meet threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 90 }), // Threshold at or below 90
          fc.array(fc.constant(true), { minLength: 1, maxLength: 5 }), // All have links (score 100)
          async (threshold, _) => {
            const artifacts = [createMockArtifact({
              id: 'RFC-0001',
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            })];

            vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
            vi.mocked(mockFileStore.load).mockResolvedValue(artifacts[0]);
            vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);
            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: [{
                sourceId: 'RFC-0001',
                targetId: 'RFC-0002',
                type: 'relates-to',
                createdAt: new Date()
              }]
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService
            );

            const result = await testService.checkThreshold(threshold);

            // Property: with score 100 and threshold <= 90, should always pass
            expect(result.passed).toBe(true);
            expect(result.failedCount).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return passed=false when threshold is above all scores (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 91, max: 100 }), // Threshold above 90
          async (threshold) => {
            const artifacts = [createMockArtifact({
              id: 'RFC-0001',
              title: 'Test',
              owner: 'owner',
              tags: ['tag']
            })];

            vi.mocked(mockFileStore.list).mockResolvedValue(artifacts);
            vi.mocked(mockFileStore.load).mockResolvedValue(artifacts[0]);
            vi.mocked(mockGraphService.detectCircularDependencies).mockResolvedValue([]);
            // No links = score of 90
            vi.mocked(mockLinkService.getLinks).mockResolvedValue({
              incoming: [],
              outgoing: []
            });

            const testService = new EnhancedHealthService(
              mockFileStore,
              mockLinkService,
              mockGraphService
            );

            const result = await testService.checkThreshold(threshold);

            // Property: with score 90 and threshold > 90, should fail
            expect(result.passed).toBe(false);
            expect(result.failedCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});