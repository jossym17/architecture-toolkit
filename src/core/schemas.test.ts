// Tests for Zod schemas

import { describe, it, expect } from 'vitest';
import {
  RFCSchema,
  ADRSchema,
  DecompositionPlanSchema,
  TemplateSchema,
  safeValidateArtifact,
  validateRFC,
  validateADR
} from './schemas.js';
import { ZodError } from 'zod';

describe('RFCSchema', () => {
  const validRFC = {
    id: 'RFC-0001',
    type: 'rfc',
    title: 'Test RFC',
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: ['test'],
    references: [],
    problemStatement: 'Test problem',
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

  it('should validate a valid RFC', () => {
    const result = RFCSchema.safeParse(validRFC);
    expect(result.success).toBe(true);
  });

  it('should reject RFC with invalid ID format', () => {
    const invalid = { ...validRFC, id: 'INVALID' };
    const result = RFCSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject RFC with empty title', () => {
    const invalid = { ...validRFC, title: '' };
    const result = RFCSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject RFC with invalid status', () => {
    const invalid = { ...validRFC, status: 'invalid' };
    const result = RFCSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject RFC with empty problem statement', () => {
    const invalid = { ...validRFC, problemStatement: '' };
    const result = RFCSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should coerce date strings to Date objects', () => {
    const withStringDates = {
      ...validRFC,
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z'
    };
    const result = RFCSchema.safeParse(withStringDates);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createdAt).toBeInstanceOf(Date);
    }
  });
});

describe('ADRSchema', () => {
  const validADR = {
    id: 'ADR-0001',
    type: 'adr',
    title: 'Test ADR',
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: [],
    references: [],
    context: 'Test context',
    decision: 'Test decision',
    consequences: ['Consequence 1'],
    alternativesConsidered: []
  };

  it('should validate a valid ADR', () => {
    const result = ADRSchema.safeParse(validADR);
    expect(result.success).toBe(true);
  });

  it('should validate ADR with supersededBy', () => {
    const superseded = {
      ...validADR,
      status: 'superseded',
      supersededBy: 'ADR-0002'
    };
    const result = ADRSchema.safeParse(superseded);
    expect(result.success).toBe(true);
  });

  it('should reject ADR with invalid supersededBy format', () => {
    const invalid = {
      ...validADR,
      supersededBy: 'INVALID'
    };
    const result = ADRSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject ADR with empty context', () => {
    const invalid = { ...validADR, context: '' };
    const result = ADRSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('DecompositionPlanSchema', () => {
  const validPlan = {
    id: 'DECOMP-0001',
    type: 'decomposition',
    title: 'Test Plan',
    status: 'proposed',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-owner',
    tags: [],
    references: [],
    rationale: 'Test rationale',
    successMetrics: ['Metric 1'],
    phases: [
      {
        id: 'phase-001',
        name: 'Phase 1',
        description: 'Test phase',
        dependencies: [],
        estimatedDuration: '2 weeks',
        status: 'pending'
      }
    ],
    teamModuleMapping: [],
    migrationTasks: []
  };

  it('should validate a valid decomposition plan', () => {
    const result = DecompositionPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it('should reject plan with no phases', () => {
    const invalid = { ...validPlan, phases: [] };
    const result = DecompositionPlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject plan with empty rationale', () => {
    const invalid = { ...validPlan, rationale: '' };
    const result = DecompositionPlanSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('TemplateSchema', () => {
  const validTemplate = {
    id: 'test-template',
    name: 'Test Template',
    artifactType: 'rfc',
    sections: [
      {
        name: 'problemStatement',
        required: true,
        description: 'Problem description'
      }
    ]
  };

  it('should validate a valid template', () => {
    const result = TemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it('should reject template with no sections', () => {
    const invalid = { ...validTemplate, sections: [] };
    const result = TemplateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject template with invalid artifact type', () => {
    const invalid = { ...validTemplate, artifactType: 'invalid' };
    const result = TemplateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('safeValidateArtifact', () => {
  it('should discriminate between artifact types', () => {
    const rfc = {
      id: 'RFC-0001',
      type: 'rfc',
      title: 'Test',
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: 'owner',
      tags: [],
      references: [],
      problemStatement: 'Problem',
      successCriteria: [],
      options: [],
      recommendedApproach: '',
      migrationPath: '',
      rollbackPlan: '',
      securityNotes: '',
      costModel: '',
      timeline: '',
      signoffs: []
    };

    const result = safeValidateArtifact(rfc);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('rfc');
    }
  });
});

describe('validateRFC', () => {
  it('should throw ZodError for invalid RFC', () => {
    expect(() => validateRFC({ invalid: true })).toThrow(ZodError);
  });
});

describe('validateADR', () => {
  it('should throw ZodError for invalid ADR', () => {
    expect(() => validateADR({ invalid: true })).toThrow(ZodError);
  });
});
