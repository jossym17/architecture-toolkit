/**
 * Property-Based Tests for Drift Detection Service
 * 
 * Tests the correctness properties defined in the design document
 * for the drift detection functionality.
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DriftDetectionService } from './drift-service.js';
import { FileStore } from '../storage/file-store.js';
import type { ADR } from '../../models/adr.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-drift-${process.pid}-${++testCounter}`;
}

/**
 * Creates a test ADR with technology constraints
 */
function createTestADR(
  id: string,
  title: string,
  decision: string,
  context: string = 'Test context'
): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: 'accepted',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
    references: [],
    context,
    decision,
    consequences: ['Test consequence'],
    alternativesConsidered: []
  };
}

/**
 * Creates a test source file with imports
 */
async function createTestSourceFile(
  baseDir: string,
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = path.join(baseDir, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
}


describe('DriftDetectionService', () => {
  describe('parseADRConstraints - unit tests', () => {
    it('should extract constraints from "use postgresql" decision', () => {
      const adr = createTestADR(
        'ADR-0001',
        'Use PostgreSQL',
        'We will use PostgreSQL as our primary database.'
      );

      const service = new DriftDetectionService();
      const constraints = service.parseADRConstraints(adr);

      expect(constraints.length).toBeGreaterThan(0);
      const forbiddenImports = constraints.flatMap(c => c.forbiddenImports);
      expect(forbiddenImports).toContain('mysql');
      expect(forbiddenImports).toContain('mongodb');
    });

    it('should extract constraints from "do not use" patterns', () => {
      const adr = createTestADR(
        'ADR-0002',
        'Avoid Legacy Database',
        'We shall not use mysql in new services. Do not use mongodb either.'
      );

      const service = new DriftDetectionService();
      const constraints = service.parseADRConstraints(adr);

      const forbiddenImports = constraints.flatMap(c => c.forbiddenImports);
      expect(forbiddenImports).toContain('mysql');
      expect(forbiddenImports).toContain('mongodb');
    });

    it('should return empty constraints for ADR without technology choices', () => {
      const adr = createTestADR(
        'ADR-0003',
        'Code Review Process',
        'All code changes must be reviewed by at least two team members.'
      );

      const service = new DriftDetectionService();
      const constraints = service.parseADRConstraints(adr);

      expect(constraints.length).toBe(0);
    });
  });

  describe('scanFileForViolations - unit tests', () => {
    it('should detect forbidden JavaScript imports', async () => {
      const testDir = getTestDir();
      try {
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        
        const filePath = await createTestSourceFile(
          testDir,
          'src/database.ts',
          `import mysql from 'mysql2';
const connection = mysql.createConnection({});`
        );

        const adr = createTestADR('ADR-0001', 'Use PostgreSQL', 'Use PostgreSQL');
        const constraints = [{ forbiddenImports: ['mysql'], requiredPatterns: [] }];

        const service = new DriftDetectionService(undefined, undefined, testDir);
        const violations = await service.scanFileForViolations(filePath, adr, constraints);

        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].adrId).toBe('ADR-0001');
        expect(violations[0].constraint).toContain('mysql');
        expect(violations[0].violations[0].line).toBe(1);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should detect forbidden Python imports', async () => {
      const testDir = getTestDir();
      try {
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        
        const filePath = await createTestSourceFile(
          testDir,
          'src/database.py',
          `import pymongo
from pymongo import MongoClient`
        );

        const adr = createTestADR('ADR-0001', 'Use PostgreSQL', 'Use PostgreSQL');
        const constraints = [{ forbiddenImports: ['pymongo'], requiredPatterns: [] }];

        const service = new DriftDetectionService(undefined, undefined, testDir);
        const violations = await service.scanFileForViolations(filePath, adr, constraints);

        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].violations.length).toBe(2); // Both import lines
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should not report violations for compliant code', async () => {
      const testDir = getTestDir();
      try {
        await fs.mkdir(path.join(testDir, 'src'), { recursive: true });
        
        const filePath = await createTestSourceFile(
          testDir,
          'src/database.ts',
          `import pg from 'pg';
const pool = new pg.Pool({});`
        );

        const adr = createTestADR('ADR-0001', 'Use PostgreSQL', 'Use PostgreSQL');
        const constraints = [{ forbiddenImports: ['mysql', 'mongodb'], requiredPatterns: [] }];

        const service = new DriftDetectionService(undefined, undefined, testDir);
        const violations = await service.scanFileForViolations(filePath, adr, constraints);

        expect(violations.length).toBe(0);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });


  /**
   * **Feature: interactive-mode, Property 19: Drift detection accuracy**
   * **Validates: Requirements 8.1, 8.3**
   * 
   * For any ADR with technology constraints and codebase with violations,
   * drift detection SHALL identify all violations and report the specific
   * ADR and code locations.
   */
  describe('Property 19: Drift detection accuracy', () => {
    // Arbitrary for ADR IDs
    const adrIdArb = fc.integer({ min: 1, max: 50 })
      .map(n => `ADR-${n.toString().padStart(4, '0')}`);

    // Arbitrary for technology choices and their alternatives
    const techChoiceArb = fc.constantFrom(
      { tech: 'postgresql', forbidden: ['mysql', 'mongodb'] },
      { tech: 'mysql', forbidden: ['postgresql', 'mongodb'] },
      { tech: 'react', forbidden: ['vue', 'angular'] },
      { tech: 'kafka', forbidden: ['rabbitmq'] }
    );

    // Arbitrary for file names
    const fileNameArb = fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/)
      .map(name => `${name}.ts`);

    it('should detect all violations when forbidden imports are present (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          adrIdArb,
          techChoiceArb,
          fileNameArb,
          fc.integer({ min: 1, max: 3 }),
          async (adrId, techChoice, fileName, violationCount) => {
            const testDir = getTestDir();
            try {
              // Setup file store
              const archDir = path.join(testDir, '.arch');
              await fs.mkdir(archDir, { recursive: true });
              const fileStore = new FileStore({ baseDir: archDir });
              await fileStore.initialize();

              // Create ADR with technology choice
              const adr = createTestADR(
                adrId,
                `Use ${techChoice.tech}`,
                `We will use ${techChoice.tech} for our application.`
              );
              await fileStore.save(adr);

              // Create source directory
              const srcDir = path.join(testDir, 'src');
              await fs.mkdir(srcDir, { recursive: true });

              // Create source file with violations using ONE specific forbidden tech
              const forbiddenTech = techChoice.forbidden[0];
              const importLines = Array(violationCount)
                .fill(null)
                .map((_, i) => `import { thing${i} } from '${forbiddenTech}';`)
                .join('\n');

              await createTestSourceFile(
                testDir,
                `src/${fileName}`,
                importLines
              );

              // Run drift detection
              const service = new DriftDetectionService(fileStore, undefined, testDir);
              const report = await service.detectDrift({ adrIds: [adrId] });

              // Property: All violations should be detected
              expect(report.violations.length).toBeGreaterThan(0);

              // Property: Violations should reference the correct ADR
              const adrViolations = report.violations.filter(v => v.adrId === adrId);
              expect(adrViolations.length).toBeGreaterThan(0);

              // Property: Violations for the specific forbidden tech should exist
              // (Note: ADR may have multiple forbidden imports, we only check the one we used)
              const forbiddenTechViolations = adrViolations.filter(
                v => v.constraint.toLowerCase().includes(forbiddenTech.toLowerCase())
              );
              expect(forbiddenTechViolations.length).toBeGreaterThan(0);
              
              // Property: The number of code locations for this specific forbidden tech
              // should be at least the number of import lines we created
              const totalCodeLocations = forbiddenTechViolations.reduce(
                (sum, v) => sum + v.violations.length,
                0
              );
              expect(totalCodeLocations).toBeGreaterThanOrEqual(violationCount);

              // Property: Each violation should have file and line info
              for (const violation of adrViolations) {
                for (const loc of violation.violations) {
                  expect(loc.file).toBeTruthy();
                  expect(loc.line).toBeGreaterThan(0);
                  expect(loc.snippet).toBeTruthy();
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

    it('should not report false positives for compliant code (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          adrIdArb,
          techChoiceArb,
          fileNameArb,
          async (adrId, techChoice, fileName) => {
            const testDir = getTestDir();
            try {
              // Setup file store
              const archDir = path.join(testDir, '.arch');
              await fs.mkdir(archDir, { recursive: true });
              const fileStore = new FileStore({ baseDir: archDir });
              await fileStore.initialize();

              // Create ADR with technology choice
              const adr = createTestADR(
                adrId,
                `Use ${techChoice.tech}`,
                `We will use ${techChoice.tech} for our application.`
              );
              await fileStore.save(adr);

              // Create source directory
              const srcDir = path.join(testDir, 'src');
              await fs.mkdir(srcDir, { recursive: true });

              // Create compliant source file (using the chosen tech, not forbidden ones)
              await createTestSourceFile(
                testDir,
                `src/${fileName}`,
                `import { Client } from '${techChoice.tech}';
const client = new Client();
export default client;`
              );

              // Run drift detection
              const service = new DriftDetectionService(fileStore, undefined, testDir);
              const report = await service.detectDrift({ adrIds: [adrId] });

              // Property: No violations should be reported for compliant code
              const adrViolations = report.violations.filter(v => v.adrId === adrId);
              expect(adrViolations.length).toBe(0);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect violations across multiple files (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          adrIdArb,
          techChoiceArb,
          fc.array(fileNameArb, { minLength: 2, maxLength: 4 }),
          async (adrId, techChoice, fileNames) => {
            // Ensure unique file names
            const uniqueFileNames = [...new Set(fileNames)];
            if (uniqueFileNames.length < 2) return;

            const testDir = getTestDir();
            try {
              // Setup file store
              const archDir = path.join(testDir, '.arch');
              await fs.mkdir(archDir, { recursive: true });
              const fileStore = new FileStore({ baseDir: archDir });
              await fileStore.initialize();

              // Create ADR
              const adr = createTestADR(
                adrId,
                `Use ${techChoice.tech}`,
                `We will use ${techChoice.tech} for our application.`
              );
              await fileStore.save(adr);

              // Create source directory
              const srcDir = path.join(testDir, 'src');
              await fs.mkdir(srcDir, { recursive: true });

              // Create multiple files with violations
              const forbiddenTech = techChoice.forbidden[0];
              for (const fileName of uniqueFileNames) {
                await createTestSourceFile(
                  testDir,
                  `src/${fileName}`,
                  `import { something } from '${forbiddenTech}';`
                );
              }

              // Run drift detection
              const service = new DriftDetectionService(fileStore, undefined, testDir);
              const report = await service.detectDrift({ adrIds: [adrId] });

              // Property: Violations should be detected in all files
              const adrViolations = report.violations.filter(v => v.adrId === adrId);
              const violatedFiles = new Set(
                adrViolations.flatMap(v => v.violations.map(loc => loc.file))
              );

              expect(violatedFiles.size).toBe(uniqueFileNames.length);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate remediation suggestions for violations (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          adrIdArb,
          techChoiceArb,
          async (adrId, techChoice) => {
            const testDir = getTestDir();
            try {
              // Setup file store
              const archDir = path.join(testDir, '.arch');
              await fs.mkdir(archDir, { recursive: true });
              const fileStore = new FileStore({ baseDir: archDir });
              await fileStore.initialize();

              // Create ADR
              const adrTitle = `Use ${techChoice.tech}`;
              const adr = createTestADR(
                adrId,
                adrTitle,
                `We will use ${techChoice.tech} for our application.`
              );
              await fileStore.save(adr);

              // Create source with violation
              const srcDir = path.join(testDir, 'src');
              await fs.mkdir(srcDir, { recursive: true });
              
              const forbiddenTech = techChoice.forbidden[0];
              await createTestSourceFile(
                testDir,
                'src/test.ts',
                `import { db } from '${forbiddenTech}';`
              );

              // Run drift detection
              const service = new DriftDetectionService(fileStore, undefined, testDir);
              const report = await service.detectDrift({ adrIds: [adrId] });

              // Property: Suggestions should be generated for violations
              if (report.violations.length > 0) {
                expect(report.suggestions.length).toBeGreaterThan(0);
                
                // Property: Suggestions should reference the ADR
                const hasAdrReference = report.suggestions.some(
                  s => s.includes(adrId) || s.includes(adrTitle)
                );
                expect(hasAdrReference).toBe(true);
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
});


describe('DriftDetectionService - Watch Mode', () => {
  describe('watchForDrift - unit tests', () => {
    it('should start watching without errors', async () => {
      const testDir = getTestDir();
      try {
        // Setup
        const archDir = path.join(testDir, '.arch');
        await fs.mkdir(archDir, { recursive: true });
        const srcDir = path.join(testDir, 'src');
        await fs.mkdir(srcDir, { recursive: true });
        
        const fileStore = new FileStore({ baseDir: archDir });
        await fileStore.initialize();

        const service = new DriftDetectionService(fileStore, undefined, testDir);
        
        // Start watching
        let callbackCalled = false;
        service.watchForDrift(() => {
          callbackCalled = true;
        });

        // Give it a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Stop watching
        service.stopWatching();

        // The callback should not have been called since we didn't make changes
        expect(callbackCalled).toBe(false);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should stop watching cleanly', async () => {
      const testDir = getTestDir();
      try {
        const archDir = path.join(testDir, '.arch');
        await fs.mkdir(archDir, { recursive: true });
        
        const fileStore = new FileStore({ baseDir: archDir });
        await fileStore.initialize();

        const service = new DriftDetectionService(fileStore, undefined, testDir);
        
        // Start and stop watching multiple times
        service.watchForDrift(() => {});
        service.stopWatching();
        service.watchForDrift(() => {});
        service.stopWatching();

        // Should not throw
        expect(true).toBe(true);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });
});

describe('DriftDetectionService - Reporting', () => {
  describe('formatReport - unit tests', () => {
    it('should format empty report correctly', () => {
      const service = new DriftDetectionService();
      const report = { violations: [], suggestions: [] };
      
      const formatted = service.formatReport(report);
      
      expect(formatted).toBe('No architecture drift detected.');
    });

    it('should format report with violations', () => {
      const service = new DriftDetectionService();
      const report = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Use PostgreSQL',
          constraint: 'Forbidden import: mysql',
          violations: [{
            file: 'src/db.ts',
            line: 5,
            snippet: "import mysql from 'mysql2';"
          }]
        }],
        suggestions: ['Remove usage of mysql']
      };
      
      const formatted = service.formatReport(report);
      
      expect(formatted).toContain('ADR-0001');
      expect(formatted).toContain('Use PostgreSQL');
      expect(formatted).toContain('Forbidden import: mysql');
      expect(formatted).toContain('src/db.ts:5');
      expect(formatted).toContain('Remove usage of mysql');
    });
  });

  describe('getSummary - unit tests', () => {
    it('should return correct summary for empty report', () => {
      const service = new DriftDetectionService();
      const report = { violations: [], suggestions: [] };
      
      const summary = service.getSummary(report);
      
      expect(summary.totalViolations).toBe(0);
      expect(summary.affectedADRs).toHaveLength(0);
      expect(summary.affectedFiles).toHaveLength(0);
    });

    it('should return correct summary for report with violations', () => {
      const service = new DriftDetectionService();
      const report = {
        violations: [
          {
            adrId: 'ADR-0001',
            adrTitle: 'Use PostgreSQL',
            constraint: 'Forbidden import: mysql',
            violations: [
              { file: 'src/db.ts', line: 5, snippet: 'import mysql' },
              { file: 'src/repo.ts', line: 10, snippet: 'import mysql' }
            ]
          },
          {
            adrId: 'ADR-0002',
            adrTitle: 'Use React',
            constraint: 'Forbidden import: vue',
            violations: [
              { file: 'src/app.ts', line: 1, snippet: 'import vue' }
            ]
          }
        ],
        suggestions: []
      };
      
      const summary = service.getSummary(report);
      
      expect(summary.totalViolations).toBe(3);
      expect(summary.affectedADRs).toContain('ADR-0001');
      expect(summary.affectedADRs).toContain('ADR-0002');
      expect(summary.affectedFiles).toContain('src/db.ts');
      expect(summary.affectedFiles).toContain('src/repo.ts');
      expect(summary.affectedFiles).toContain('src/app.ts');
    });
  });

  /**
   * Tests for drift reporting functionality
   * 
   * Requirements: 8.3, 8.5
   */
  describe('formatReportForCI - unit tests', () => {
    it('should format empty report for CI correctly', () => {
      const service = new DriftDetectionService();
      const report = { violations: [], suggestions: [] };
      
      const formatted = service.formatReportForCI(report);
      
      expect(formatted).toBe('✅ No architecture drift detected.');
    });

    it('should format report with violations for CI with annotations', () => {
      const service = new DriftDetectionService();
      const report = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Use PostgreSQL',
          constraint: 'Forbidden import: mysql',
          violations: [{
            file: 'src/db.ts',
            line: 5,
            snippet: "import mysql from 'mysql2';"
          }]
        }],
        suggestions: ['Remove usage of mysql']
      };
      
      const formatted = service.formatReportForCI(report);
      
      // Should contain CI-friendly error annotation format
      expect(formatted).toContain('❌ Architecture Drift Detected');
      expect(formatted).toContain('ADR-0001');
      expect(formatted).toContain('Use PostgreSQL');
      expect(formatted).toContain('::error file=src/db.ts,line=5::');
      expect(formatted).toContain('Remediation Steps');
    });
  });

  describe('formatViolation - unit tests', () => {
    it('should format a single violation with detailed information', () => {
      const service = new DriftDetectionService();
      const violation = {
        adrId: 'ADR-0001',
        adrTitle: 'Use PostgreSQL',
        constraint: 'Forbidden import: mysql',
        violations: [
          { file: 'src/db.ts', line: 5, snippet: "import mysql from 'mysql2';" },
          { file: 'src/repo.ts', line: 10, snippet: "import { Connection } from 'mysql';" }
        ]
      };
      
      const formatted = service.formatViolation(violation);
      
      expect(formatted).toContain('ADR ID:     ADR-0001');
      expect(formatted).toContain('ADR Title:  Use PostgreSQL');
      expect(formatted).toContain('Constraint: Forbidden import: mysql');
      expect(formatted).toContain('Code Locations (2)');
      expect(formatted).toContain('src/db.ts');
      expect(formatted).toContain('Line 5');
      expect(formatted).toContain('src/repo.ts');
      expect(formatted).toContain('Line 10');
    });
  });

  describe('generateRemediationSuggestions - unit tests', () => {
    it('should generate remediation suggestions for forbidden imports', () => {
      const service = new DriftDetectionService();
      const report = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Use PostgreSQL',
          constraint: 'Forbidden import: mysql',
          violations: [
            { file: 'src/db.ts', line: 5, snippet: 'import mysql' },
            { file: 'src/repo.ts', line: 10, snippet: 'import mysql' }
          ]
        }],
        suggestions: []
      };
      
      const remediations = service.generateRemediationSuggestions(report);
      
      expect(remediations).toHaveLength(1);
      expect(remediations[0].adrId).toBe('ADR-0001');
      expect(remediations[0].adrTitle).toBe('Use PostgreSQL');
      expect(remediations[0].action).toContain("Remove all usages of 'mysql'");
      expect(remediations[0].affectedFiles).toContain('src/db.ts');
      expect(remediations[0].affectedFiles).toContain('src/repo.ts');
      expect(remediations[0].steps.length).toBeGreaterThan(0);
    });

    it('should set priority based on number of violations', () => {
      const service = new DriftDetectionService();
      
      // Low priority (2 or fewer violations)
      const lowReport = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Test',
          constraint: 'Forbidden import: test',
          violations: [
            { file: 'src/a.ts', line: 1, snippet: 'import test' },
            { file: 'src/b.ts', line: 1, snippet: 'import test' }
          ]
        }],
        suggestions: []
      };
      
      // High priority (more than 5 violations)
      const highReport = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Test',
          constraint: 'Forbidden import: test',
          violations: [
            { file: 'src/a.ts', line: 1, snippet: 'import test' },
            { file: 'src/b.ts', line: 1, snippet: 'import test' },
            { file: 'src/c.ts', line: 1, snippet: 'import test' },
            { file: 'src/d.ts', line: 1, snippet: 'import test' },
            { file: 'src/e.ts', line: 1, snippet: 'import test' },
            { file: 'src/f.ts', line: 1, snippet: 'import test' }
          ]
        }],
        suggestions: []
      };
      
      const lowRemediations = service.generateRemediationSuggestions(lowReport);
      const highRemediations = service.generateRemediationSuggestions(highReport);
      
      expect(lowRemediations[0].priority).toBe('low');
      expect(highRemediations[0].priority).toBe('high');
    });
  });

  describe('getDetailedReport - unit tests', () => {
    it('should return detailed report with all information', () => {
      const service = new DriftDetectionService();
      const report = {
        violations: [{
          adrId: 'ADR-0001',
          adrTitle: 'Use PostgreSQL',
          constraint: 'Forbidden import: mysql',
          violations: [{
            file: 'src/db.ts',
            line: 5,
            snippet: "import mysql from 'mysql2';"
          }]
        }],
        suggestions: ['Remove usage of mysql']
      };
      
      const detailed = service.getDetailedReport(report);
      
      // Check summary
      expect(detailed.summary.totalViolations).toBe(1);
      expect(detailed.summary.affectedADRs).toContain('ADR-0001');
      expect(detailed.summary.affectedFiles).toContain('src/db.ts');
      expect(detailed.summary.timestamp).toBeTruthy();
      
      // Check violations
      expect(detailed.violations).toHaveLength(1);
      expect(detailed.violations[0].adrId).toBe('ADR-0001');
      expect(detailed.violations[0].codeLocations).toHaveLength(1);
      expect(detailed.violations[0].codeLocations[0].file).toBe('src/db.ts');
      expect(detailed.violations[0].codeLocations[0].line).toBe(5);
      
      // Check remediations
      expect(detailed.remediations).toHaveLength(1);
      expect(detailed.remediations[0].steps.length).toBeGreaterThan(0);
      
      // Check suggestions
      expect(detailed.suggestions).toContain('Remove usage of mysql');
    });
  });
});
