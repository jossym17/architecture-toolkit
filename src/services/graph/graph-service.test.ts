/**
 * Property-Based Tests for Graph Service
 * 
 * Tests the correctness properties defined in the design document
 * for the graph visualization functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { GraphService } from './graph-service.js';
import { LinkService, LinkType, LINK_TYPES } from '../link/link-service.js';
import { FileStore } from '../storage/file-store.js';
import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { ArtifactType } from '../../models/types.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-graph-${process.pid}-${++testCounter}`;
}
const TEST_DIR = '.arch-test-graph-unit';

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
function createTestDecomp(id: string, title: string = 'Test Decomposition', status: string = 'pending'): DecompositionPlan {
  return {
    id,
    type: 'decomposition',
    title,
    status: status as unknown as DecompositionPlan['status'],
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
    return createTestDecomp(id, title, status || 'pending');
  }
}

describe('GraphService', () => {
  let fileStore: FileStore;
  let linkService: LinkService;
  let graphService: GraphService;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    fileStore = new FileStore({ baseDir: TEST_DIR });
    await fileStore.initialize();
    linkService = new LinkService(fileStore);
    graphService = new GraphService(fileStore, linkService);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('generateGraph - unit tests', () => {
    it('should generate empty Mermaid graph when no artifacts exist', async () => {
      const graph = await graphService.generateGraph({ format: 'mermaid' });
      expect(graph).toContain('graph TB');
    });

    it('should generate empty DOT graph when no artifacts exist', async () => {
      const graph = await graphService.generateGraph({ format: 'dot' });
      expect(graph).toContain('digraph G');
    });

    it('should include artifact nodes in Mermaid output', async () => {
      const rfc = createTestRFC('RFC-0001', 'Test RFC');
      await fileStore.save(rfc);

      const graph = await graphService.generateGraph({ format: 'mermaid' });
      
      expect(graph).toContain('RFC_0001');
      expect(graph).toContain('Test RFC');
    });

    it('should include edges in Mermaid output', async () => {
      const rfc = createTestRFC('RFC-0001', 'Source RFC');
      const adr = createTestADR('ADR-0001', 'Target ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const graph = await graphService.generateGraph({ format: 'mermaid' });
      
      expect(graph).toContain('RFC_0001');
      expect(graph).toContain('ADR_0001');
      expect(graph).toContain('-->');
      expect(graph).toContain('implements');
    });

    it('should include artifact nodes in DOT output with color coding', async () => {
      const rfc = createTestRFC('RFC-0001', 'Test RFC');
      const adr = createTestADR('ADR-0001', 'Test ADR');
      const decomp = createTestDecomp('DECOMP-0001', 'Test Decomp');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await fileStore.save(decomp);

      const graph = await graphService.generateGraph({ format: 'dot' });
      
      // Check nodes are present
      expect(graph).toContain('RFC_0001');
      expect(graph).toContain('ADR_0001');
      expect(graph).toContain('DECOMP_0001');
      
      // Check color coding by type
      expect(graph).toContain('color=blue');  // RFC
      expect(graph).toContain('color=green'); // ADR
      expect(graph).toContain('color=orange'); // Decomposition
    });

    it('should include edges in DOT output', async () => {
      const rfc = createTestRFC('RFC-0001', 'Source RFC');
      const adr = createTestADR('ADR-0001', 'Target ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const graph = await graphService.generateGraph({ format: 'dot' });
      
      expect(graph).toContain('RFC_0001 -> ADR_0001');
      expect(graph).toContain('label="implements"');
    });

    it('should apply status styling in DOT output', async () => {
      const draftRfc = createTestRFC('RFC-0001', 'Draft RFC', 'draft');
      const approvedRfc = createTestRFC('RFC-0002', 'Approved RFC', 'approved');
      const deprecatedAdr = createTestADR('ADR-0001', 'Deprecated ADR', 'deprecated');
      await fileStore.save(draftRfc);
      await fileStore.save(approvedRfc);
      await fileStore.save(deprecatedAdr);

      const graph = await graphService.generateGraph({ format: 'dot' });
      
      // Check status styling
      expect(graph).toContain('style=dashed'); // draft
      expect(graph).toContain('style=solid');  // approved
      expect(graph).toContain('fillcolor=gray'); // deprecated
    });
  });

  describe('rooted graph generation - unit tests', () => {
    it('should include only connected artifacts when rootId is specified', async () => {
      // Create a graph: RFC-0001 -> ADR-0001 -> ADR-0002
      // And an isolated: RFC-0002 (not connected)
      const rfc1 = createTestRFC('RFC-0001', 'Connected RFC');
      const adr1 = createTestADR('ADR-0001', 'Connected ADR 1');
      const adr2 = createTestADR('ADR-0002', 'Connected ADR 2');
      const rfc2 = createTestRFC('RFC-0002', 'Isolated RFC');
      
      await fileStore.save(rfc1);
      await fileStore.save(adr1);
      await fileStore.save(adr2);
      await fileStore.save(rfc2);
      
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      await linkService.createLink('ADR-0001', 'ADR-0002', 'relates-to');

      const graph = await graphService.generateGraph({ 
        format: 'mermaid', 
        rootId: 'RFC-0001' 
      });
      
      // Should include connected artifacts
      expect(graph).toContain('RFC_0001');
      expect(graph).toContain('ADR_0001');
      expect(graph).toContain('ADR_0002');
      
      // Should NOT include isolated artifact
      expect(graph).not.toContain('RFC_0002');
    });

    it('should include root artifact even if it has no connections', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      await fileStore.save(rfc);

      const graph = await graphService.generateGraph({ 
        format: 'mermaid', 
        rootId: 'RFC-0001' 
      });
      
      expect(graph).toContain('RFC_0001');
    });

    it('should traverse bidirectionally from root', async () => {
      // Create: ADR-0001 -> RFC-0001 -> ADR-0002
      const adr1 = createTestADR('ADR-0001', 'Incoming ADR');
      const rfc = createTestRFC('RFC-0001', 'Root RFC');
      const adr2 = createTestADR('ADR-0002', 'Outgoing ADR');
      
      await fileStore.save(adr1);
      await fileStore.save(rfc);
      await fileStore.save(adr2);
      
      await linkService.createLink('ADR-0001', 'RFC-0001', 'implements');
      await linkService.createLink('RFC-0001', 'ADR-0002', 'relates-to');

      const graph = await graphService.generateGraph({ 
        format: 'mermaid', 
        rootId: 'RFC-0001' 
      });
      
      // Should include both incoming and outgoing connected artifacts
      expect(graph).toContain('ADR_0001');
      expect(graph).toContain('RFC_0001');
      expect(graph).toContain('ADR_0002');
    });
  });

  describe('getConnectedArtifacts - unit tests', () => {
    it('should return empty array for artifact with no connections', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      await fileStore.save(rfc);

      const connected = await graphService.getConnectedArtifacts('RFC-0001');
      
      expect(connected).toEqual([]);
    });

    it('should return directly connected artifacts', async () => {
      const rfc = createTestRFC('RFC-0001', 'Source RFC');
      const adr = createTestADR('ADR-0001', 'Target ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const connected = await graphService.getConnectedArtifacts('RFC-0001');
      
      expect(connected).toContain('ADR-0001');
    });

    it('should return transitively connected artifacts', async () => {
      const rfc = createTestRFC('RFC-0001', 'Source RFC');
      const adr1 = createTestADR('ADR-0001', 'Middle ADR');
      const adr2 = createTestADR('ADR-0002', 'End ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr1);
      await fileStore.save(adr2);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      await linkService.createLink('ADR-0001', 'ADR-0002', 'relates-to');

      const connected = await graphService.getConnectedArtifacts('RFC-0001');
      
      expect(connected).toContain('ADR-0001');
      expect(connected).toContain('ADR-0002');
    });
  });

  describe('detectCircularDependencies - unit tests', () => {
    it('should return empty array for isolated artifacts', async () => {
      const rfc = createTestRFC('RFC-0001', 'Isolated RFC');
      const adr = createTestADR('ADR-0001', 'Isolated ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);

      const cycles = await graphService.detectCircularDependencies();
      
      expect(cycles).toEqual([]);
    });

    it('should detect cycle created by bidirectional linking', async () => {
      // Note: When we create a link, the LinkService creates bidirectional references
      // This means a single createLink call creates references in both directions
      // which forms a cycle in the graph
      const rfc = createTestRFC('RFC-0001', 'Source RFC');
      const adr = createTestADR('ADR-0001', 'Target ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const cycles = await graphService.detectCircularDependencies();
      
      // Bidirectional linking creates a cycle
      expect(cycles.length).toBeGreaterThan(0);
      const cycleNodes = cycles[0].cycle;
      expect(cycleNodes).toContain('RFC-0001');
      expect(cycleNodes).toContain('ADR-0001');
    });

    it('should detect explicit cycle with multiple links', async () => {
      const rfc = createTestRFC('RFC-0001', 'RFC');
      const adr1 = createTestADR('ADR-0001', 'ADR 1');
      const adr2 = createTestADR('ADR-0002', 'ADR 2');
      await fileStore.save(rfc);
      await fileStore.save(adr1);
      await fileStore.save(adr2);
      
      // Create explicit cycle: RFC -> ADR1 -> ADR2 -> RFC
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      await linkService.createLink('ADR-0001', 'ADR-0002', 'relates-to');
      await linkService.createLink('ADR-0002', 'RFC-0001', 'depends-on');

      const cycles = await graphService.detectCircularDependencies();
      
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should assign warning severity for short cycles', async () => {
      // A single bidirectional link creates a 2-node cycle (short = warning)
      const rfc = createTestRFC('RFC-0001', 'RFC');
      const adr = createTestADR('ADR-0001', 'ADR');
      await fileStore.save(rfc);
      await fileStore.save(adr);
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');

      const cycles = await graphService.detectCircularDependencies();
      
      expect(cycles.length).toBeGreaterThan(0);
      // Short cycles (3 or fewer nodes) should be warning
      expect(cycles[0].severity).toBe('warning');
    });

    it('should assign critical severity for longer cycles', async () => {
      // Create a longer explicit cycle (4+ nodes = critical)
      const rfc = createTestRFC('RFC-0001', 'RFC');
      const adr1 = createTestADR('ADR-0001', 'ADR 1');
      const adr2 = createTestADR('ADR-0002', 'ADR 2');
      const adr3 = createTestADR('ADR-0003', 'ADR 3');
      const adr4 = createTestADR('ADR-0004', 'ADR 4');
      await fileStore.save(rfc);
      await fileStore.save(adr1);
      await fileStore.save(adr2);
      await fileStore.save(adr3);
      await fileStore.save(adr4);
      
      // Create explicit long cycle: RFC -> ADR1 -> ADR2 -> ADR3 -> ADR4 -> RFC
      await linkService.createLink('RFC-0001', 'ADR-0001', 'implements');
      await linkService.createLink('ADR-0001', 'ADR-0002', 'relates-to');
      await linkService.createLink('ADR-0002', 'ADR-0003', 'relates-to');
      await linkService.createLink('ADR-0003', 'ADR-0004', 'relates-to');
      await linkService.createLink('ADR-0004', 'RFC-0001', 'depends-on');

      const cycles = await graphService.detectCircularDependencies();
      
      // Find the longest cycle (the explicit one we created)
      const longestCycle = cycles.reduce((longest, current) => 
        current.cycle.length > longest.cycle.length ? current : longest
      , cycles[0]);
      
      // Longer cycles (more than 3 nodes) should be critical
      expect(longestCycle.severity).toBe('critical');
    });
  });

  /**
   * **Feature: interactive-mode, Property 8: Graph contains all artifacts and edges**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * For any set of artifacts with relationships, the generated graph (Mermaid or DOT)
   * SHALL contain nodes for all artifacts and edges for all relationships.
   */
  describe('Property 8: Graph contains all artifacts and edges', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const decompIdArb = fc.integer({ min: 1, max: 50 }).map(n => `DECOMP-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb, decompIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);
    const formatArb = fc.constantFrom<'mermaid' | 'dot'>('mermaid', 'dot');
    const titleArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ]{0,20}$/).filter(s => s.trim().length > 0);

    it('should contain all artifact nodes in generated graph (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(artifactIdArb, titleArb),
            { minLength: 1, maxLength: 5 }
          ),
          formatArb,
          async (artifactData, format) => {
            // Ensure unique IDs
            const uniqueArtifacts = new Map<string, string>();
            for (const [id, title] of artifactData) {
              if (!uniqueArtifacts.has(id)) {
                uniqueArtifacts.set(id, title);
              }
            }
            if (uniqueArtifacts.size === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create all artifacts
              for (const [id, title] of uniqueArtifacts) {
                const artifact = createTestArtifact(id, title);
                await testFileStore.save(artifact);
              }

              // Generate graph
              const graph = await testGraphService.generateGraph({ format });

              // Property: All artifacts should appear in the graph
              for (const [id] of uniqueArtifacts) {
                const sanitizedId = id.replace(/-/g, '_');
                expect(graph).toContain(sanitizedId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should contain all edges in generated graph (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(artifactIdArb, { minLength: 2, maxLength: 5 }),
          fc.array(
            fc.tuple(fc.nat({ max: 4 }), fc.nat({ max: 4 }), linkTypeArb),
            { minLength: 1, maxLength: 5 }
          ),
          formatArb,
          async (artifactIds, edgeData, format) => {
            // Ensure unique IDs
            const uniqueIds = [...new Set(artifactIds)];
            if (uniqueIds.length < 2) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create all artifacts
              for (const id of uniqueIds) {
                const artifact = createTestArtifact(id, `Artifact ${id}`);
                await testFileStore.save(artifact);
              }

              // Create edges (filter valid indices and avoid self-loops)
              const createdEdges: Array<{ source: string; target: string }> = [];
              for (const [srcIdx, tgtIdx, linkType] of edgeData) {
                const sourceIdx = srcIdx % uniqueIds.length;
                const targetIdx = tgtIdx % uniqueIds.length;
                if (sourceIdx === targetIdx) continue;
                
                const sourceId = uniqueIds[sourceIdx];
                const targetId = uniqueIds[targetIdx];
                
                // Check if edge already exists
                const edgeKey = `${sourceId}->${targetId}`;
                if (createdEdges.some(e => `${e.source}->${e.target}` === edgeKey)) continue;
                
                await testLinkService.createLink(sourceId, targetId, linkType);
                createdEdges.push({ source: sourceId, target: targetId });
              }

              if (createdEdges.length === 0) return;

              // Generate graph
              const graph = await testGraphService.generateGraph({ format });

              // Property: All edges should appear in the graph
              for (const edge of createdEdges) {
                const sanitizedSource = edge.source.replace(/-/g, '_');
                const sanitizedTarget = edge.target.replace(/-/g, '_');
                
                if (format === 'mermaid') {
                  // Mermaid uses --> for edges
                  expect(graph).toContain(sanitizedSource);
                  expect(graph).toContain(sanitizedTarget);
                  expect(graph).toContain('-->');
                } else {
                  // DOT uses -> for edges
                  expect(graph).toContain(sanitizedSource);
                  expect(graph).toContain(sanitizedTarget);
                  expect(graph).toContain('->');
                }
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
   * **Feature: interactive-mode, Property 9: Rooted graph contains only connected artifacts**
   * **Validates: Requirements 3.3**
   * 
   * For any artifact graph and specified root, the generated graph SHALL contain
   * only artifacts that are reachable from the root through any path.
   */
  describe('Property 9: Rooted graph contains only connected artifacts', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 30 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 30 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);
    const formatArb = fc.constantFrom<'mermaid' | 'dot'>('mermaid', 'dot');

    it('should only include artifacts reachable from root (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Connected artifacts (will be linked to root)
          fc.array(artifactIdArb, { minLength: 1, maxLength: 3 }),
          // Isolated artifacts (will NOT be linked)
          fc.array(artifactIdArb, { minLength: 1, maxLength: 3 }),
          // Root artifact
          artifactIdArb,
          linkTypeArb,
          formatArb,
          async (connectedIds, isolatedIds, rootId, linkType, format) => {
            // Ensure all IDs are unique
            const uniqueConnected = connectedIds.filter(id => id !== rootId && !isolatedIds.includes(id));
            const uniqueIsolated = isolatedIds.filter(id => id !== rootId && !connectedIds.includes(id));
            
            if (uniqueConnected.length === 0 || uniqueIsolated.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create root artifact
              const rootArtifact = createTestArtifact(rootId, 'Root');
              await testFileStore.save(rootArtifact);

              // Create connected artifacts and link them to root
              for (const id of uniqueConnected) {
                const artifact = createTestArtifact(id, `Connected ${id}`);
                await testFileStore.save(artifact);
                await testLinkService.createLink(rootId, id, linkType);
              }

              // Create isolated artifacts (no links)
              for (const id of uniqueIsolated) {
                const artifact = createTestArtifact(id, `Isolated ${id}`);
                await testFileStore.save(artifact);
              }

              // Generate rooted graph
              const graph = await testGraphService.generateGraph({ 
                format, 
                rootId 
              });

              // Property: Root should be in graph
              const sanitizedRoot = rootId.replace(/-/g, '_');
              expect(graph).toContain(sanitizedRoot);

              // Property: Connected artifacts should be in graph
              for (const id of uniqueConnected) {
                const sanitizedId = id.replace(/-/g, '_');
                expect(graph).toContain(sanitizedId);
              }

              // Property: Isolated artifacts should NOT be in graph
              for (const id of uniqueIsolated) {
                const sanitizedId = id.replace(/-/g, '_');
                expect(graph).not.toContain(sanitizedId);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include transitively connected artifacts (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          artifactIdArb,
          linkTypeArb,
          formatArb,
          async (rootId, middleId, endId, linkType, format) => {
            // Ensure all IDs are unique
            if (rootId === middleId || rootId === endId || middleId === endId) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create chain: root -> middle -> end
              const root = createTestArtifact(rootId, 'Root');
              const middle = createTestArtifact(middleId, 'Middle');
              const end = createTestArtifact(endId, 'End');
              
              await testFileStore.save(root);
              await testFileStore.save(middle);
              await testFileStore.save(end);
              
              await testLinkService.createLink(rootId, middleId, linkType);
              await testLinkService.createLink(middleId, endId, linkType);

              // Generate rooted graph
              const graph = await testGraphService.generateGraph({ 
                format, 
                rootId 
              });

              // Property: All transitively connected artifacts should be in graph
              expect(graph).toContain(rootId.replace(/-/g, '_'));
              expect(graph).toContain(middleId.replace(/-/g, '_'));
              expect(graph).toContain(endId.replace(/-/g, '_'));
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
   * **Feature: interactive-mode, Property 10: Graph styling matches artifact properties**
   * **Validates: Requirements 3.4, 3.5**
   * 
   * For any artifact in a generated graph, the node color SHALL match the artifact type
   * and the node style SHALL match the artifact status.
   */
  describe('Property 10: Graph styling matches artifact properties', () => {
    // Type and status arbitraries
    const rfcStatusArb = fc.constantFrom<string>('draft', 'review', 'approved', 'rejected', 'implemented');
    const adrStatusArb = fc.constantFrom<string>('proposed', 'accepted', 'deprecated', 'superseded');
    
    // Map type to valid statuses
    const typeStatusArb = fc.oneof(
      fc.tuple(fc.constant<ArtifactType>('rfc'), rfcStatusArb),
      fc.tuple(fc.constant<ArtifactType>('adr'), adrStatusArb),
      fc.tuple(fc.constant<ArtifactType>('decomposition'), fc.constant('pending'))
    );

    // Expected colors by type for DOT format
    const expectedDotColors: Record<ArtifactType, string> = {
      rfc: 'blue',
      adr: 'green',
      decomposition: 'orange'
    };

    // Expected styles by status for DOT format
    const draftStatuses = ['draft', 'proposed', 'review'];
    const deprecatedStatuses = ['deprecated', 'superseded', 'rejected'];

    it('should apply correct type coloring in DOT format (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          typeStatusArb,
          fc.integer({ min: 1, max: 100 }),
          async ([type, status], idNum) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create artifact with specific type
              let id: string;
              if (type === 'rfc') {
                id = `RFC-${idNum.toString().padStart(4, '0')}`;
              } else if (type === 'adr') {
                id = `ADR-${idNum.toString().padStart(4, '0')}`;
              } else {
                id = `DECOMP-${idNum.toString().padStart(4, '0')}`;
              }

              const artifact = createTestArtifact(id, 'Test Artifact', status);
              await testFileStore.save(artifact);

              // Generate DOT graph
              const graph = await testGraphService.generateGraph({ format: 'dot' });

              // Property: Node should have correct color for its type
              const expectedColor = expectedDotColors[type];
              const sanitizedId = id.replace(/-/g, '_');
              
              // Find the node definition line
              const nodePattern = new RegExp(`${sanitizedId}.*color=${expectedColor}`);
              expect(graph).toMatch(nodePattern);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply correct status styling in DOT format (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          typeStatusArb,
          fc.integer({ min: 1, max: 100 }),
          async ([type, status], idNum) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create artifact with specific status
              let id: string;
              if (type === 'rfc') {
                id = `RFC-${idNum.toString().padStart(4, '0')}`;
              } else if (type === 'adr') {
                id = `ADR-${idNum.toString().padStart(4, '0')}`;
              } else {
                id = `DECOMP-${idNum.toString().padStart(4, '0')}`;
              }

              const artifact = createTestArtifact(id, 'Test Artifact', status);
              await testFileStore.save(artifact);

              // Generate DOT graph
              const graph = await testGraphService.generateGraph({ format: 'dot' });

              const sanitizedId = id.replace(/-/g, '_');

              // Property: Node should have correct style for its status
              if (draftStatuses.includes(status)) {
                // Draft/proposed statuses should have dashed style
                const nodePattern = new RegExp(`${sanitizedId}.*style=dashed`);
                expect(graph).toMatch(nodePattern);
              } else if (deprecatedStatuses.includes(status)) {
                // Deprecated statuses should have gray fill
                const nodePattern = new RegExp(`${sanitizedId}.*fillcolor=gray`);
                expect(graph).toMatch(nodePattern);
              } else {
                // Approved/accepted statuses should have solid style
                const nodePattern = new RegExp(`${sanitizedId}.*style=solid`);
                expect(graph).toMatch(nodePattern);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should apply correct type class in Mermaid format (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          typeStatusArb,
          fc.integer({ min: 1, max: 100 }),
          async ([type, status], idNum) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create artifact with specific type
              let id: string;
              if (type === 'rfc') {
                id = `RFC-${idNum.toString().padStart(4, '0')}`;
              } else if (type === 'adr') {
                id = `ADR-${idNum.toString().padStart(4, '0')}`;
              } else {
                id = `DECOMP-${idNum.toString().padStart(4, '0')}`;
              }

              const artifact = createTestArtifact(id, 'Test Artifact', status);
              await testFileStore.save(artifact);

              // Generate Mermaid graph
              const graph = await testGraphService.generateGraph({ format: 'mermaid' });

              const sanitizedId = id.replace(/-/g, '_');

              // Property: Node should have class applied for its type
              expect(graph).toContain(`class ${sanitizedId} ${type}`);
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
   * **Feature: interactive-mode, Property 13: Circular dependency detection**
   * **Validates: Requirements 4.7**
   * 
   * For any artifact graph containing a cycle, the health check SHALL identify
   * and report all circular dependencies.
   */
  describe('Property 13: Circular dependency detection', () => {
    const rfcIdArb = fc.integer({ min: 1, max: 30 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 30 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);
    const linkTypeArb = fc.constantFrom<LinkType>(...LINK_TYPES);

    it('should detect cycles when they exist (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a chain of artifact IDs that will form a cycle
          fc.array(artifactIdArb, { minLength: 2, maxLength: 4 }),
          linkTypeArb,
          async (artifactIds, linkType) => {
            // Ensure unique IDs
            const uniqueIds = [...new Set(artifactIds)];
            if (uniqueIds.length < 2) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create all artifacts
              for (const id of uniqueIds) {
                const artifact = createTestArtifact(id, `Artifact ${id}`);
                await testFileStore.save(artifact);
              }

              // Create a chain of links forming a cycle
              // A -> B -> C -> ... -> A
              for (let i = 0; i < uniqueIds.length; i++) {
                const sourceId = uniqueIds[i];
                const targetId = uniqueIds[(i + 1) % uniqueIds.length];
                await testLinkService.createLink(sourceId, targetId, linkType);
              }

              // Detect cycles
              const cycles = await testGraphService.detectCircularDependencies();

              // Property: At least one cycle should be detected
              expect(cycles.length).toBeGreaterThan(0);

              // Property: Each detected cycle should contain at least 2 nodes
              for (const cycle of cycles) {
                expect(cycle.cycle.length).toBeGreaterThanOrEqual(2);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for acyclic graphs (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a list of artifact IDs
          fc.array(artifactIdArb, { minLength: 1, maxLength: 5 }),
          async (artifactIds) => {
            // Ensure unique IDs
            const uniqueIds = [...new Set(artifactIds)];
            if (uniqueIds.length === 0) return;

            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create all artifacts but NO links
              for (const id of uniqueIds) {
                const artifact = createTestArtifact(id, `Artifact ${id}`);
                await testFileStore.save(artifact);
              }

              // Detect cycles
              const cycles = await testGraphService.detectCircularDependencies();

              // Property: No cycles should be detected for isolated artifacts
              expect(cycles).toEqual([]);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all cycle participants in the cycle array (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate exactly 3 unique artifact IDs for a simple cycle
          fc.tuple(rfcIdArb, adrIdArb, adrIdArb).filter(([a, b, c]) => a !== b && b !== c && a !== c),
          linkTypeArb,
          async ([id1, id2, id3], linkType) => {
            const testDir = getTestDir();
            try {
              const testFileStore = new FileStore({ baseDir: testDir });
              await testFileStore.initialize();
              const testLinkService = new LinkService(testFileStore);
              const testGraphService = new GraphService(testFileStore, testLinkService);

              // Create artifacts
              await testFileStore.save(createTestArtifact(id1, 'Artifact 1'));
              await testFileStore.save(createTestArtifact(id2, 'Artifact 2'));
              await testFileStore.save(createTestArtifact(id3, 'Artifact 3'));

              // Create explicit cycle: id1 -> id2 -> id3 -> id1
              await testLinkService.createLink(id1, id2, linkType);
              await testLinkService.createLink(id2, id3, linkType);
              await testLinkService.createLink(id3, id1, linkType);

              // Detect cycles
              const cycles = await testGraphService.detectCircularDependencies();

              // Property: At least one cycle should be detected
              expect(cycles.length).toBeGreaterThan(0);

              // Property: The cycle should contain all three nodes
              // (Note: due to bidirectional linking, there may be multiple cycles)
              const allCycleNodes = new Set(cycles.flatMap(c => c.cycle));
              expect(allCycleNodes.has(id1)).toBe(true);
              expect(allCycleNodes.has(id2)).toBe(true);
              expect(allCycleNodes.has(id3)).toBe(true);
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
