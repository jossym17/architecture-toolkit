// Markdown serializer for artifacts

import * as yaml from 'yaml';
import { Artifact } from '../../models/artifact.js';
import { RFC, Option, Signoff } from '../../models/rfc.js';
import { ADR, Alternative } from '../../models/adr.js';
import { DecompositionPlan, Phase, TeamModuleMapping, MigrationTask } from '../../models/decomposition.js';
import { Reference } from '../../models/reference.js';

/**
 * Serializes an artifact to Markdown with YAML frontmatter
 * 
 * @param artifact - The artifact to serialize
 * @returns Markdown string with YAML frontmatter
 */
export function serialize(artifact: Artifact): string {
  const frontmatter = serializeFrontmatter(artifact);
  const content = serializeContent(artifact);
  
  return `---\n${frontmatter}---\n\n${content}`;
}

/**
 * Serializes artifact metadata to YAML frontmatter
 */
function serializeFrontmatter(artifact: Artifact): string {
  const metadata: Record<string, unknown> = {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    status: artifact.status,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
    owner: artifact.owner,
    tags: artifact.tags,
    references: artifact.references.length > 0 ? artifact.references : undefined
  };
  
  // Add type-specific metadata
  if (artifact.type === 'adr') {
    const adr = artifact as ADR;
    if (adr.supersededBy) {
      metadata.supersededBy = adr.supersededBy;
    }
  }
  
  // Remove undefined values
  for (const key of Object.keys(metadata)) {
    if (metadata[key] === undefined) {
      delete metadata[key];
    }
  }
  
  return yaml.stringify(metadata);
}


/**
 * Serializes artifact content sections to Markdown
 */
function serializeContent(artifact: Artifact): string {
  switch (artifact.type) {
    case 'rfc':
      return serializeRFC(artifact as RFC);
    case 'adr':
      return serializeADR(artifact as ADR);
    case 'decomposition':
      return serializeDecompositionPlan(artifact as DecompositionPlan);
    default:
      throw new Error(`Unknown artifact type: ${artifact.type}`);
  }
}

/**
 * Serializes RFC content to Markdown
 */
function serializeRFC(rfc: RFC): string {
  const sections: string[] = [];
  
  sections.push(`## Problem Statement\n\n${rfc.problemStatement}`);
  
  if (rfc.successCriteria.length > 0) {
    sections.push(`## Success Criteria\n\n${rfc.successCriteria.map(c => `- ${c}`).join('\n')}`);
  }
  
  if (rfc.options.length > 0) {
    sections.push(`## Options\n\n${rfc.options.map(serializeOption).join('\n\n')}`);
  }
  
  sections.push(`## Recommended Approach\n\n${rfc.recommendedApproach}`);
  sections.push(`## Migration Path\n\n${rfc.migrationPath}`);
  sections.push(`## Rollback Plan\n\n${rfc.rollbackPlan}`);
  sections.push(`## Security Notes\n\n${rfc.securityNotes}`);
  sections.push(`## Cost Model\n\n${rfc.costModel}`);
  sections.push(`## Timeline\n\n${rfc.timeline}`);
  
  if (rfc.signoffs.length > 0) {
    sections.push(`## Sign-offs\n\n${serializeSignoffs(rfc.signoffs)}`);
  }
  
  return sections.join('\n\n');
}

function serializeOption(option: Option): string {
  const lines: string[] = [];
  lines.push(`### ${option.name}`);
  lines.push('');
  lines.push(`**Description:** ${option.description}`);
  
  if (option.pros.length > 0) {
    lines.push('');
    lines.push('**Pros:**');
    option.pros.forEach(pro => lines.push(`- ${pro}`));
  }
  
  if (option.cons.length > 0) {
    lines.push('');
    lines.push('**Cons:**');
    option.cons.forEach(con => lines.push(`- ${con}`));
  }
  
  return lines.join('\n');
}

function serializeSignoffs(signoffs: Signoff[]): string {
  const lines: string[] = [];
  lines.push('| Name | Role | Date | Approved |');
  lines.push('|------|------|------|----------|');
  
  for (const signoff of signoffs) {
    const date = signoff.date ? signoff.date.toISOString().split('T')[0] : 'Pending';
    const approved = signoff.approved ? '✓' : '✗';
    lines.push(`| ${signoff.name} | ${signoff.role} | ${date} | ${approved} |`);
  }
  
  return lines.join('\n');
}


/**
 * Serializes ADR content to Markdown
 */
function serializeADR(adr: ADR): string {
  const sections: string[] = [];
  
  sections.push(`## Context\n\n${adr.context}`);
  sections.push(`## Decision\n\n${adr.decision}`);
  
  if (adr.consequences.length > 0) {
    sections.push(`## Consequences\n\n${adr.consequences.map(c => `- ${c}`).join('\n')}`);
  }
  
  if (adr.alternativesConsidered.length > 0) {
    sections.push(`## Alternatives Considered\n\n${adr.alternativesConsidered.map(serializeAlternative).join('\n\n')}`);
  }
  
  return sections.join('\n\n');
}

function serializeAlternative(alt: Alternative): string {
  const lines: string[] = [];
  lines.push(`### ${alt.name}`);
  lines.push('');
  lines.push(alt.description);
  lines.push('');
  lines.push(`**Rejection Reason:** ${alt.rejectionReason}`);
  return lines.join('\n');
}

/**
 * Serializes DecompositionPlan content to Markdown
 */
function serializeDecompositionPlan(plan: DecompositionPlan): string {
  const sections: string[] = [];
  
  sections.push(`## Rationale\n\n${plan.rationale}`);
  
  if (plan.successMetrics.length > 0) {
    sections.push(`## Success Metrics\n\n${plan.successMetrics.map(m => `- ${m}`).join('\n')}`);
  }
  
  if (plan.phases.length > 0) {
    sections.push(`## Phases\n\n${plan.phases.map(serializePhase).join('\n\n')}`);
  }
  
  if (plan.teamModuleMapping.length > 0) {
    sections.push(`## Team-Module Mapping\n\n${serializeTeamModuleMapping(plan.teamModuleMapping)}`);
  }
  
  if (plan.migrationTasks.length > 0) {
    sections.push(`## Migration Tasks\n\n${serializeMigrationTasks(plan.migrationTasks)}`);
  }
  
  return sections.join('\n\n');
}

function serializePhase(phase: Phase): string {
  const lines: string[] = [];
  lines.push(`### ${phase.name}`);
  lines.push('');
  lines.push(`**ID:** ${phase.id}`);
  lines.push('');
  lines.push(phase.description);
  lines.push('');
  lines.push(`**Status:** ${phase.status}`);
  lines.push(`**Estimated Duration:** ${phase.estimatedDuration}`);
  
  if (phase.dependencies.length > 0) {
    lines.push(`**Dependencies:** ${phase.dependencies.join(', ')}`);
  }
  
  if (phase.completedAt) {
    lines.push(`**Completed:** ${phase.completedAt.toISOString().split('T')[0]}`);
  }
  
  return lines.join('\n');
}

function serializeTeamModuleMapping(mappings: TeamModuleMapping[]): string {
  const lines: string[] = [];
  lines.push('| Team | Modules |');
  lines.push('|------|---------|');
  
  for (const mapping of mappings) {
    lines.push(`| ${mapping.teamName} (${mapping.teamId}) | ${mapping.modules.join(', ')} |`);
  }
  
  return lines.join('\n');
}

function serializeMigrationTasks(tasks: MigrationTask[]): string {
  const lines: string[] = [];
  lines.push('| ID | Phase | Description | Assignee | Status |');
  lines.push('|----|-------|-------------|----------|--------|');
  
  for (const task of tasks) {
    const assignee = task.assignee || 'Unassigned';
    lines.push(`| ${task.id} | ${task.phaseId} | ${task.description} | ${assignee} | ${task.status} |`);
  }
  
  return lines.join('\n');
}
