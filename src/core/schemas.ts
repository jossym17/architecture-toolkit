// Zod schemas for artifact validation

import { z } from 'zod';

/**
 * Artifact type enum
 */
export const ArtifactTypeSchema = z.enum(['rfc', 'adr', 'decomposition']);

/**
 * RFC status enum
 */
export const RFCStatusSchema = z.enum(['draft', 'review', 'approved', 'rejected', 'implemented']);

/**
 * ADR status enum
 */
export const ADRStatusSchema = z.enum(['proposed', 'accepted', 'deprecated', 'superseded']);

/**
 * Phase status enum
 */
export const PhaseStatusSchema = z.enum(['pending', 'in-progress', 'completed', 'blocked']);

/**
 * Task status enum
 */
export const TaskStatusSchema = z.enum(['todo', 'in-progress', 'done']);

/**
 * Reference type enum
 */
export const ReferenceTypeSchema = z.enum(['implements', 'supersedes', 'relates-to', 'depends-on']);

/**
 * Reference schema
 */
export const ReferenceSchema = z.object({
  targetId: z.string().regex(/^(RFC|ADR|DECOMP)-\d{4}$/, 'Invalid target ID format'),
  targetType: ArtifactTypeSchema,
  referenceType: ReferenceTypeSchema
});

/**
 * Base artifact schema (common fields)
 */
export const BaseArtifactSchema = z.object({
  id: z.string().regex(/^(RFC|ADR|DECOMP)-\d{4}$/, 'Invalid ID format'),
  type: ArtifactTypeSchema,
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  owner: z.string().min(1, 'Owner is required').max(100, 'Owner too long'),
  tags: z.array(z.string().max(50)).max(20, 'Too many tags'),
  references: z.array(ReferenceSchema)
});

/**
 * Option schema for RFC
 */
export const OptionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string())
});

/**
 * Signoff schema for RFC
 */
export const SignoffSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  date: z.coerce.date().nullable(),
  approved: z.boolean()
});

/**
 * RFC schema
 */
export const RFCSchema = BaseArtifactSchema.extend({
  type: z.literal('rfc'),
  status: RFCStatusSchema,
  problemStatement: z.string().min(1, 'Problem statement is required'),
  successCriteria: z.array(z.string()),
  options: z.array(OptionSchema),
  recommendedApproach: z.string(),
  migrationPath: z.string(),
  rollbackPlan: z.string(),
  securityNotes: z.string(),
  costModel: z.string(),
  timeline: z.string(),
  signoffs: z.array(SignoffSchema)
});

/**
 * Alternative schema for ADR
 */
export const AlternativeSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  rejectionReason: z.string()
});

/**
 * ADR schema
 */
export const ADRSchema = BaseArtifactSchema.extend({
  type: z.literal('adr'),
  status: ADRStatusSchema,
  context: z.string().min(1, 'Context is required'),
  decision: z.string().min(1, 'Decision is required'),
  consequences: z.array(z.string()),
  alternativesConsidered: z.array(AlternativeSchema),
  supersededBy: z.string().regex(/^ADR-\d{4}$/).optional()
});

/**
 * Phase schema for decomposition
 */
export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string(),
  dependencies: z.array(z.string()),
  estimatedDuration: z.string(),
  status: PhaseStatusSchema,
  completedAt: z.coerce.date().optional()
});

/**
 * Team module mapping schema
 */
export const TeamModuleMappingSchema = z.object({
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  modules: z.array(z.string())
});

/**
 * Migration task schema
 */
export const MigrationTaskSchema = z.object({
  id: z.string(),
  phaseId: z.string(),
  description: z.string().min(1),
  assignee: z.string().optional(),
  status: TaskStatusSchema
});

/**
 * Decomposition plan schema
 */
export const DecompositionPlanSchema = BaseArtifactSchema.extend({
  type: z.literal('decomposition'),
  status: ADRStatusSchema, // Uses same status as ADR
  rationale: z.string().min(1, 'Rationale is required'),
  successMetrics: z.array(z.string()),
  phases: z.array(PhaseSchema).min(1, 'At least one phase is required'),
  teamModuleMapping: z.array(TeamModuleMappingSchema),
  migrationTasks: z.array(MigrationTaskSchema)
});

/**
 * Template section schema
 */
export const TemplateSectionSchema = z.object({
  name: z.string().min(1),
  required: z.boolean(),
  description: z.string().min(1),
  defaultContent: z.string().optional()
});

/**
 * Template schema
 */
export const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artifactType: ArtifactTypeSchema,
  sections: z.array(TemplateSectionSchema).min(1)
});

/**
 * Union of all artifact schemas
 */
export const ArtifactSchema = z.discriminatedUnion('type', [
  RFCSchema,
  ADRSchema,
  DecompositionPlanSchema
]);

/**
 * Type exports
 */
export type ValidatedRFC = z.infer<typeof RFCSchema>;
export type ValidatedADR = z.infer<typeof ADRSchema>;
export type ValidatedDecompositionPlan = z.infer<typeof DecompositionPlanSchema>;
export type ValidatedArtifact = z.infer<typeof ArtifactSchema>;
export type ValidatedTemplate = z.infer<typeof TemplateSchema>;

/**
 * Validation helper functions
 */
export function validateRFC(data: unknown): ValidatedRFC {
  return RFCSchema.parse(data);
}

export function validateADR(data: unknown): ValidatedADR {
  return ADRSchema.parse(data);
}

export function validateDecompositionPlan(data: unknown): ValidatedDecompositionPlan {
  return DecompositionPlanSchema.parse(data);
}

export function validateArtifact(data: unknown): ValidatedArtifact {
  return ArtifactSchema.parse(data);
}

export function validateTemplate(data: unknown): ValidatedTemplate {
  return TemplateSchema.parse(data);
}

/**
 * Safe validation (returns result instead of throwing)
 */
export function safeValidateArtifact(data: unknown) {
  return ArtifactSchema.safeParse(data);
}

export function safeValidateTemplate(data: unknown) {
  return TemplateSchema.safeParse(data);
}
