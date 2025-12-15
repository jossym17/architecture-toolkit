/**
 * Property-Based Tests for Audit Service
 * 
 * Tests the correctness properties defined in the design document
 * for the audit logging and compliance functionality.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import { AuditService, AuditAction, AuditActionType } from './audit-service.js';
import { FileStore } from '../storage/file-store.js';
import { ConfigService } from '../config/config-service.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-audit-${process.pid}-${++testCounter}`;
}

/**
 * Creates a complete test RFC artifact
 */
function createTestRFC(id: string, title: string = 'Test RFC', tags: string[] = ['test']): RFC {
  return {
    id,
    type: 'rfc',
    title,
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
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
function createTestADR(id: string, title: string = 'Test ADR', tags: string[] = ['test']): ADR {
  return {
    id,
    type: 'adr',
    title,
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags,
    references: [],
    context: 'Test context',
    decision: 'Test decision',
    consequences: ['Consequence 1'],
    alternativesConsidered: []
  };
}


describe('AuditService', () => {
  /**
   * **Feature: interactive-mode, Property 22: Audit logging completeness**
   * **Validates: Requirements 10.1**
   * 
   * For any artifact operation (create, update, delete), an audit log entry
   * SHALL be created with timestamp, user, and change details.
   */
  describe('Property 22: Audit logging completeness', () => {
    // Arbitrary for valid artifact IDs
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);

    // Arbitrary for action types
    const actionTypeArb = fc.constantFrom<AuditActionType>('create', 'update', 'delete', 'approve', 'reject', 'link', 'unlink');

    // Arbitrary for user names (alphanumeric)
    const userArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/);

    // Arbitrary for changes
    const changesArb = fc.option(
      fc.record({
        status: fc.record({
          old: fc.constantFrom('draft', 'review', 'approved'),
          new: fc.constantFrom('draft', 'review', 'approved')
        })
      }),
      { nil: undefined }
    );

    it('should log all artifact operations with required fields (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          actionTypeArb,
          userArb,
          changesArb,
          async (artifactId, action, user, changes) => {
            const testDir = getTestDir();
            try {
              const auditService = new AuditService({ baseDir: testDir });
              
              const auditAction: AuditAction = {
                artifactId,
                action,
                user,
                timestamp: new Date(),
                changes
              };

              // Log the action
              await auditService.logAction(auditAction);

              // Retrieve all entries
              const entries = await auditService.getAllEntries();

              // Property: At least one entry should exist
              expect(entries.length).toBeGreaterThanOrEqual(1);

              // Property: The logged entry should have all required fields
              const loggedEntry = entries.find(e => 
                e.artifactId === artifactId && 
                e.action === action && 
                e.user === user
              );
              
              expect(loggedEntry).toBeDefined();
              expect(loggedEntry!.id).toBeDefined();
              expect(loggedEntry!.timestamp).toBeDefined();
              expect(loggedEntry!.artifactId).toBe(artifactId);
              expect(loggedEntry!.action).toBe(action);
              expect(loggedEntry!.user).toBe(user);
              
              // If changes were provided, they should be logged
              if (changes) {
                expect(loggedEntry!.changes).toEqual(changes);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log multiple operations for the same artifact (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(actionTypeArb, { minLength: 2, maxLength: 5 }),
          userArb,
          async (artifactId, actions, user) => {
            const testDir = getTestDir();
            try {
              const auditService = new AuditService({ baseDir: testDir });
              
              // Log multiple actions
              for (const action of actions) {
                await auditService.logAction({
                  artifactId,
                  action,
                  user,
                  timestamp: new Date()
                });
              }

              // Retrieve all entries
              const entries = await auditService.getAllEntries();

              // Property: All actions should be logged
              expect(entries.length).toBe(actions.length);

              // Property: Each action should have a unique ID
              const ids = entries.map(e => e.id);
              const uniqueIds = new Set(ids);
              expect(uniqueIds.size).toBe(actions.length);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should persist audit logs across service instances (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          actionTypeArb,
          userArb,
          async (artifactId, action, user) => {
            const testDir = getTestDir();
            try {
              // First service instance logs the action
              const auditService1 = new AuditService({ baseDir: testDir });
              await auditService1.logAction({
                artifactId,
                action,
                user,
                timestamp: new Date()
              });

              // Second service instance should see the logged action
              const auditService2 = new AuditService({ baseDir: testDir });
              const entries = await auditService2.getAllEntries();

              // Property: Entry should persist across instances
              expect(entries.length).toBe(1);
              expect(entries[0].artifactId).toBe(artifactId);
              expect(entries[0].action).toBe(action);
              expect(entries[0].user).toBe(user);
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
   * **Feature: interactive-mode, Property 23: Audit history retrieval**
   * **Validates: Requirements 10.2**
   * 
   * For any artifact, the audit history SHALL return all logged operations
   * for that artifact in chronological order.
   */
  describe('Property 23: Audit history retrieval', () => {
    // Arbitrary for valid artifact IDs
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);
    const adrIdArb = fc.integer({ min: 1, max: 50 }).map(n => `ADR-${n.toString().padStart(4, '0')}`);
    const artifactIdArb = fc.oneof(rfcIdArb, adrIdArb);

    // Arbitrary for action types
    const actionTypeArb = fc.constantFrom<AuditActionType>('create', 'update', 'delete', 'approve', 'reject');

    // Arbitrary for user names
    const userArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/);

    it('should return history for specific artifact only (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          artifactIdArb,
          fc.array(actionTypeArb, { minLength: 1, maxLength: 3 }),
          fc.array(actionTypeArb, { minLength: 1, maxLength: 3 }),
          userArb,
          async (artifactId1, artifactId2, actions1, actions2, user) => {
            // Ensure different artifact IDs
            if (artifactId1 === artifactId2) return;

            const testDir = getTestDir();
            try {
              const auditService = new AuditService({ baseDir: testDir });
              
              // Log actions for first artifact
              for (const action of actions1) {
                await auditService.logAction({
                  artifactId: artifactId1,
                  action,
                  user,
                  timestamp: new Date()
                });
              }

              // Log actions for second artifact
              for (const action of actions2) {
                await auditService.logAction({
                  artifactId: artifactId2,
                  action,
                  user,
                  timestamp: new Date()
                });
              }

              // Get history for first artifact
              const history1 = await auditService.getHistory(artifactId1);

              // Property: History should only contain entries for the requested artifact
              expect(history1.length).toBe(actions1.length);
              for (const entry of history1) {
                expect(entry.artifactId).toBe(artifactId1);
              }

              // Get history for second artifact
              const history2 = await auditService.getHistory(artifactId2);

              // Property: History should only contain entries for the requested artifact
              expect(history2.length).toBe(actions2.length);
              for (const entry of history2) {
                expect(entry.artifactId).toBe(artifactId2);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return history in chronological order (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          fc.array(actionTypeArb, { minLength: 2, maxLength: 5 }),
          userArb,
          async (artifactId, actions, user) => {
            const testDir = getTestDir();
            try {
              const auditService = new AuditService({ baseDir: testDir });
              
              // Log actions with increasing timestamps
              const timestamps: Date[] = [];
              for (let i = 0; i < actions.length; i++) {
                const timestamp = new Date(Date.now() + i * 1000); // 1 second apart
                timestamps.push(timestamp);
                await auditService.logAction({
                  artifactId,
                  action: actions[i],
                  user,
                  timestamp
                });
              }

              // Get history
              const history = await auditService.getHistory(artifactId);

              // Property: History should be in chronological order
              expect(history.length).toBe(actions.length);
              for (let i = 1; i < history.length; i++) {
                const prevTime = new Date(history[i - 1].timestamp).getTime();
                const currTime = new Date(history[i].timestamp).getTime();
                expect(currTime).toBeGreaterThanOrEqual(prevTime);
              }
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty history for artifact with no entries (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactIdArb,
          async (artifactId) => {
            const testDir = getTestDir();
            try {
              const auditService = new AuditService({ baseDir: testDir });
              
              // Get history for artifact with no entries
              const history = await auditService.getHistory(artifactId);

              // Property: History should be empty
              expect(history).toEqual([]);
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
   * **Feature: interactive-mode, Property 24: Compliance flagging**
   * **Validates: Requirements 10.5**
   * 
   * For any artifact lacking required approvals, the compliance check
   * SHALL flag it as non-compliant.
   */
  describe('Property 24: Compliance flagging', () => {
    // Arbitrary for valid artifact IDs
    const rfcIdArb = fc.integer({ min: 1, max: 50 }).map(n => `RFC-${n.toString().padStart(4, '0')}`);

    // Arbitrary for user names
    const userArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/);

    // Arbitrary for required approvals count
    const requiredApprovalsArb = fc.integer({ min: 1, max: 3 });

    it('should flag artifacts without required approvals as non-compliant (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          requiredApprovalsArb,
          async (artifactId, requiredApprovals) => {
            const testDir = getTestDir();
            try {
              // Create config with required approvals
              const configService = new ConfigService({ baseDir: testDir });
              await fs.mkdir(testDir, { recursive: true });
              await fs.writeFile(
                `${testDir}/config.yaml`,
                `compliance:\n  requiredApprovals: ${requiredApprovals}\n`,
                'utf-8'
              );
              configService.clearCache();

              const auditService = new AuditService({ 
                baseDir: testDir,
                configService 
              });

              // Log a create action but no approvals
              await auditService.logAction({
                artifactId,
                action: 'create',
                user: 'creator',
                timestamp: new Date()
              });

              // Check compliance
              const result = await auditService.checkApprovalCompliance(artifactId);

              // Property: Artifact without approvals should be non-compliant
              expect(result.compliant).toBe(false);
              expect(result.reason).toContain(`Requires ${requiredApprovals}`);
              expect(result.reason).toContain('has 0');
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mark artifacts with sufficient approvals as compliant (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          requiredApprovalsArb,
          fc.array(userArb, { minLength: 1, maxLength: 5 }),
          async (artifactId, requiredApprovals, approvers) => {
            // Ensure we have enough unique approvers
            const uniqueApprovers = [...new Set(approvers)];
            if (uniqueApprovers.length < requiredApprovals) return;

            const testDir = getTestDir();
            try {
              // Create config with required approvals
              const configService = new ConfigService({ baseDir: testDir });
              await fs.mkdir(testDir, { recursive: true });
              await fs.writeFile(
                `${testDir}/config.yaml`,
                `compliance:\n  requiredApprovals: ${requiredApprovals}\n`,
                'utf-8'
              );
              configService.clearCache();

              const auditService = new AuditService({ 
                baseDir: testDir,
                configService 
              });

              // Log approvals from unique approvers
              for (let i = 0; i < requiredApprovals; i++) {
                await auditService.logAction({
                  artifactId,
                  action: 'approve',
                  user: uniqueApprovers[i],
                  timestamp: new Date()
                });
              }

              // Check compliance
              const result = await auditService.checkApprovalCompliance(artifactId);

              // Property: Artifact with sufficient approvals should be compliant
              expect(result.compliant).toBe(true);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should count unique approvers only (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          rfcIdArb,
          userArb,
          fc.integer({ min: 2, max: 5 }),
          async (artifactId, singleApprover, duplicateCount) => {
            const testDir = getTestDir();
            try {
              // Create config requiring 2 approvals
              const configService = new ConfigService({ baseDir: testDir });
              await fs.mkdir(testDir, { recursive: true });
              await fs.writeFile(
                `${testDir}/config.yaml`,
                `compliance:\n  requiredApprovals: 2\n`,
                'utf-8'
              );
              configService.clearCache();

              const auditService = new AuditService({ 
                baseDir: testDir,
                configService 
              });

              // Log multiple approvals from the same user
              for (let i = 0; i < duplicateCount; i++) {
                await auditService.logAction({
                  artifactId,
                  action: 'approve',
                  user: singleApprover,
                  timestamp: new Date()
                });
              }

              // Check compliance
              const result = await auditService.checkApprovalCompliance(artifactId);

              // Property: Multiple approvals from same user should count as 1
              expect(result.compliant).toBe(false);
              expect(result.reason).toContain('has 1');
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Unit tests', () => {
    it('should export report as JSON', async () => {
      const testDir = getTestDir();
      try {
        const auditService = new AuditService({ baseDir: testDir });
        
        await auditService.logAction({
          artifactId: 'RFC-0001',
          action: 'create',
          user: 'test-user',
          timestamp: new Date()
        });

        const report = await auditService.exportReport({ format: 'json' });
        const parsed = JSON.parse(report);

        expect(parsed.totalEntries).toBe(1);
        expect(parsed.entries).toHaveLength(1);
        expect(parsed.entries[0].artifactId).toBe('RFC-0001');
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should export report as HTML', async () => {
      const testDir = getTestDir();
      try {
        const auditService = new AuditService({ baseDir: testDir });
        
        await auditService.logAction({
          artifactId: 'RFC-0001',
          action: 'create',
          user: 'test-user',
          timestamp: new Date()
        });

        const report = await auditService.exportReport({ format: 'html' });

        expect(report).toContain('<!DOCTYPE html>');
        expect(report).toContain('Architecture Audit Report');
        expect(report).toContain('RFC-0001');
        expect(report).toContain('create');
        expect(report).toContain('test-user');
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should check SOC2 compliance', async () => {
      const testDir = getTestDir();
      try {
        const fileStore = new FileStore({ baseDir: testDir });
        await fileStore.initialize();

        // Create artifacts with relevant tags
        const rfc = createTestRFC('RFC-0001', 'Security Policy RFC', ['security', 'policy']);
        await fileStore.save(rfc);

        const adr = createTestADR('ADR-0001', 'Access Control Decision', ['access', 'authentication']);
        await fileStore.save(adr);

        const auditService = new AuditService({ baseDir: testDir, fileStore });
        const report = await auditService.checkCompliance('SOC2');

        expect(report.framework).toBe('SOC2');
        expect(report.mappings.length).toBeGreaterThan(0);
        
        // Check that some controls are mapped
        const securityControl = report.mappings.find(m => m.controlId === 'CC3.1');
        expect(securityControl).toBeDefined();
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('should clear audit logs', async () => {
      const testDir = getTestDir();
      try {
        const auditService = new AuditService({ baseDir: testDir });
        
        await auditService.logAction({
          artifactId: 'RFC-0001',
          action: 'create',
          user: 'test-user',
          timestamp: new Date()
        });

        let entries = await auditService.getAllEntries();
        expect(entries.length).toBe(1);

        await auditService.clearLogs();

        entries = await auditService.getAllEntries();
        expect(entries.length).toBe(0);
      } finally {
        try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });
});
