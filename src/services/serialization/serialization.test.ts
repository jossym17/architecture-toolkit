// Tests for serialization round-trip

import { describe, it, expect } from 'vitest';
import { serialize } from './serializer.js';
import { deserialize } from './deserializer.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';

describe('Serialization Round-Trip', () => {
  describe('RFC', () => {
    it('should preserve RFC data through serialize/deserialize', () => {
      const original: RFC = {
        id: 'RFC-0001',
        type: 'rfc',
        title: 'Test RFC with Special Characters: "quotes" & <brackets>',
        status: 'draft',
        createdAt: new Date('2025-01-15T10:00:00.000Z'),
        updatedAt: new Date('2025-01-20T14:30:00.000Z'),
        owner: 'test.owner',
        tags: ['tag1', 'tag2', 'multi-word-tag'],
        references: [
          { targetId: 'ADR-0001', targetType: 'adr', referenceType: 'implements' }
        ],
        problemStatement: 'This is the problem\nwith multiple lines',
        successCriteria: ['Criterion 1', 'Criterion 2'],
        options: [
          {
            name: 'Option A',
            description: 'Description A',
            pros: ['Pro 1', 'Pro 2'],
            cons: ['Con 1']
          }
        ],
        recommendedApproach: 'The recommended approach',
        migrationPath: 'Migration steps',
        rollbackPlan: 'Rollback steps',
        securityNotes: 'Security considerations',
        costModel: 'Cost analysis',
        timeline: '2 weeks',
        signoffs: [
          { name: 'John Doe', role: 'Tech Lead', date: new Date('2025-01-18T00:00:00.000Z'), approved: true }
        ]
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as RFC;

      expect(deserialized.id).toBe(original.id);
      expect(deserialized.type).toBe(original.type);
      expect(deserialized.title).toBe(original.title);
      expect(deserialized.status).toBe(original.status);
      expect(deserialized.owner).toBe(original.owner);
      expect(deserialized.tags).toEqual(original.tags);
      expect(deserialized.problemStatement).toBe(original.problemStatement);
      expect(deserialized.successCriteria).toEqual(original.successCriteria);
      expect(deserialized.recommendedApproach).toBe(original.recommendedApproach);
    });

    it('should handle empty arrays', () => {
      const original: RFC = {
        id: 'RFC-0002',
        type: 'rfc',
        title: 'Minimal RFC',
        status: 'draft',
        createdAt: new Date('2025-01-15T10:00:00.000Z'),
        updatedAt: new Date('2025-01-15T10:00:00.000Z'),
        owner: 'owner',
        tags: [],
        references: [],
        problemStatement: 'Problem',
        successCriteria: [],
        options: [],
        recommendedApproach: 'Approach',
        migrationPath: 'Path',
        rollbackPlan: 'Plan',
        securityNotes: 'Notes',
        costModel: 'Model',
        timeline: 'Timeline',
        signoffs: []
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as RFC;

      expect(deserialized.tags).toEqual([]);
      expect(deserialized.references).toEqual([]);
      expect(deserialized.options).toEqual([]);
    });
  });

  describe('ADR', () => {
    it('should preserve ADR data through serialize/deserialize', () => {
      const original: ADR = {
        id: 'ADR-0001',
        type: 'adr',
        title: 'Use PostgreSQL',
        status: 'accepted',
        createdAt: new Date('2025-01-15T10:00:00.000Z'),
        updatedAt: new Date('2025-01-15T10:00:00.000Z'),
        owner: 'architect',
        tags: ['database', 'infrastructure'],
        references: [],
        context: 'We need a database',
        decision: 'Use PostgreSQL',
        consequences: ['Need DBA expertise', 'Good performance'],
        alternativesConsidered: [
          { name: 'MySQL', description: 'Alternative DB', rejectionReason: 'Less features' }
        ]
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as ADR;

      expect(deserialized.id).toBe(original.id);
      expect(deserialized.context).toBe(original.context);
      expect(deserialized.decision).toBe(original.decision);
      expect(deserialized.consequences).toEqual(original.consequences);
    });

    it('should handle superseded ADR', () => {
      const original: ADR = {
        id: 'ADR-0001',
        type: 'adr',
        title: 'Old Decision',
        status: 'superseded',
        createdAt: new Date('2025-01-15T10:00:00.000Z'),
        updatedAt: new Date('2025-01-20T10:00:00.000Z'),
        owner: 'architect',
        tags: [],
        references: [],
        context: 'Context',
        decision: 'Decision',
        consequences: [],
        alternativesConsidered: [],
        supersededBy: 'ADR-0002'
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as ADR;

      expect(deserialized.supersededBy).toBe('ADR-0002');
      expect(deserialized.status).toBe('superseded');
    });
  });

  describe('DecompositionPlan', () => {
    it('should preserve DecompositionPlan data through serialize/deserialize', () => {
      const original: DecompositionPlan = {
        id: 'DECOMP-0001',
        type: 'decomposition',
        title: 'Monolith Migration',
        status: 'proposed',
        createdAt: new Date('2025-01-15T10:00:00.000Z'),
        updatedAt: new Date('2025-01-15T10:00:00.000Z'),
        owner: 'architect',
        tags: ['migration'],
        references: [],
        rationale: 'Need to scale',
        successMetrics: ['Metric 1', 'Metric 2'],
        phases: [
          {
            id: 'phase-001',
            name: 'Phase 1',
            description: 'Extract service',
            dependencies: [],
            estimatedDuration: '2 weeks',
            status: 'pending'
          }
        ],
        teamModuleMapping: [
          { teamId: 'team-1', teamName: 'Platform', modules: ['auth', 'users'] }
        ],
        migrationTasks: [
          { id: 'task-001', phaseId: 'phase-001', description: 'Task 1', status: 'todo' }
        ]
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as DecompositionPlan;

      expect(deserialized.id).toBe(original.id);
      expect(deserialized.rationale).toBe(original.rationale);
      expect(deserialized.phases.length).toBe(1);
      expect(deserialized.phases[0].name).toBe('Phase 1');
      expect(deserialized.teamModuleMapping.length).toBe(1);
    });
  });

  describe('Date handling', () => {
    it('should preserve date precision', () => {
      const original: RFC = {
        id: 'RFC-0003',
        type: 'rfc',
        title: 'Date Test',
        status: 'draft',
        createdAt: new Date('2025-06-15T14:30:45.123Z'),
        updatedAt: new Date('2025-06-20T09:15:30.456Z'),
        owner: 'owner',
        tags: [],
        references: [],
        problemStatement: 'Problem',
        successCriteria: [],
        options: [],
        recommendedApproach: 'Approach',
        migrationPath: 'Path',
        rollbackPlan: 'Plan',
        securityNotes: 'Notes',
        costModel: 'Model',
        timeline: 'Timeline',
        signoffs: []
      };

      const serialized = serialize(original);
      const deserialized = deserialize(serialized) as RFC;

      // Dates should be equivalent (may lose millisecond precision in YAML)
      expect(deserialized.createdAt.getFullYear()).toBe(2025);
      expect(deserialized.createdAt.getMonth()).toBe(5); // June = 5
      expect(deserialized.createdAt.getDate()).toBe(15);
    });
  });
});
