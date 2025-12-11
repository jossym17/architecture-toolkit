// Markdown deserializer for artifacts

import { Artifact } from '../../models/artifact.js';
import { RFC, Option, Signoff } from '../../models/rfc.js';
import { ADR, Alternative } from '../../models/adr.js';
import { DecompositionPlan, Phase, TeamModuleMapping, MigrationTask } from '../../models/decomposition.js';
import { parseFrontmatter, ParseResult, ParseError } from './parser.js';
import { RFCStatus, ADRStatus, PhaseStatus, TaskStatus } from '../../models/types.js';

/**
 * Deserializes a Markdown string with YAML frontmatter into an artifact
 * 
 * @param input - The Markdown string to deserialize
 * @returns The deserialized artifact
 * @throws ParseError if the input is malformed
 */
export function deserialize(input: string): Artifact {
  const parseResult = parseFrontmatter(input);
  
  switch (parseResult.frontmatter.type) {
    case 'rfc':
      return deserializeRFC(parseResult);
    case 'adr':
      return deserializeADR(parseResult);
    case 'decomposition':
      return deserializeDecompositionPlan(parseResult);
    default:
      throw new ParseError(`Unknown artifact type: ${parseResult.frontmatter.type}`, 2);
  }
}

/**
 * Deserializes an RFC from parsed Markdown
 */
function deserializeRFC(parseResult: ParseResult): RFC {
  const { frontmatter, content } = parseResult;
  const sections = parseSections(content);
  
  return {
    id: frontmatter.id,
    type: 'rfc',
    title: frontmatter.title,
    status: frontmatter.status as RFCStatus,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
    owner: frontmatter.owner,
    tags: frontmatter.tags,
    references: frontmatter.references,
    problemStatement: sections['Problem Statement'] || '',
    successCriteria: parseListSection(sections['Success Criteria']),
    options: parseOptions(sections['Options']),
    recommendedApproach: sections['Recommended Approach'] || '',
    migrationPath: sections['Migration Path'] || '',
    rollbackPlan: sections['Rollback Plan'] || '',
    securityNotes: sections['Security Notes'] || '',
    costModel: sections['Cost Model'] || '',
    timeline: sections['Timeline'] || '',
    signoffs: parseSignoffs(sections['Sign-offs'])
  };
}


/**
 * Deserializes an ADR from parsed Markdown
 */
function deserializeADR(parseResult: ParseResult): ADR {
  const { frontmatter, content } = parseResult;
  const sections = parseSections(content);
  
  const adr: ADR = {
    id: frontmatter.id,
    type: 'adr',
    title: frontmatter.title,
    status: frontmatter.status as ADRStatus,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
    owner: frontmatter.owner,
    tags: frontmatter.tags,
    references: frontmatter.references,
    context: sections['Context'] || '',
    decision: sections['Decision'] || '',
    consequences: parseListSection(sections['Consequences']),
    alternativesConsidered: parseAlternatives(sections['Alternatives Considered'])
  };
  
  if (frontmatter.supersededBy) {
    adr.supersededBy = String(frontmatter.supersededBy);
  }
  
  return adr;
}

/**
 * Deserializes a DecompositionPlan from parsed Markdown
 */
function deserializeDecompositionPlan(parseResult: ParseResult): DecompositionPlan {
  const { frontmatter, content } = parseResult;
  const sections = parseSections(content);
  
  return {
    id: frontmatter.id,
    type: 'decomposition',
    title: frontmatter.title,
    status: frontmatter.status as RFCStatus,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
    owner: frontmatter.owner,
    tags: frontmatter.tags,
    references: frontmatter.references,
    rationale: sections['Rationale'] || '',
    successMetrics: parseListSection(sections['Success Metrics']),
    phases: parsePhases(sections['Phases']),
    teamModuleMapping: parseTeamModuleMapping(sections['Team-Module Mapping']),
    migrationTasks: parseMigrationTasks(sections['Migration Tasks'])
  };
}

/**
 * Parses Markdown content into sections by H2 headers
 */
function parseSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split('\n');
  
  let currentSection = '';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = h2Match[1];
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  return sections;
}

/**
 * Parses a list section (lines starting with -)
 */
function parseListSection(content: string | undefined): string[] {
  if (!content) return [];
  
  return content
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.trim().replace(/^-\s*/, ''));
}


/**
 * Parses RFC options from the Options section
 */
function parseOptions(content: string | undefined): Option[] {
  if (!content) return [];
  
  const options: Option[] = [];
  const lines = content.split('\n');
  
  let currentOption: Partial<Option> | null = null;
  let currentField: 'description' | 'pros' | 'cons' | null = null;
  
  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      if (currentOption && currentOption.name) {
        options.push({
          name: currentOption.name,
          description: currentOption.description || '',
          pros: currentOption.pros || [],
          cons: currentOption.cons || []
        });
      }
      currentOption = { name: h3Match[1], pros: [], cons: [] };
      currentField = null;
      continue;
    }
    
    if (!currentOption) continue;
    
    const descMatch = line.match(/^\*\*Description:\*\*\s*(.*)$/);
    if (descMatch) {
      currentOption.description = descMatch[1];
      currentField = 'description';
      continue;
    }
    
    if (line.match(/^\*\*Pros:\*\*$/)) {
      currentField = 'pros';
      continue;
    }
    
    if (line.match(/^\*\*Cons:\*\*$/)) {
      currentField = 'cons';
      continue;
    }
    
    if (line.trim().startsWith('-') && currentField) {
      const item = line.trim().replace(/^-\s*/, '');
      if (currentField === 'pros') {
        currentOption.pros = currentOption.pros || [];
        currentOption.pros.push(item);
      } else if (currentField === 'cons') {
        currentOption.cons = currentOption.cons || [];
        currentOption.cons.push(item);
      }
    }
  }
  
  // Add last option
  if (currentOption && currentOption.name) {
    options.push({
      name: currentOption.name,
      description: currentOption.description || '',
      pros: currentOption.pros || [],
      cons: currentOption.cons || []
    });
  }
  
  return options;
}

/**
 * Parses signoffs from a Markdown table
 */
function parseSignoffs(content: string | undefined): Signoff[] {
  if (!content) return [];
  
  const signoffs: Signoff[] = [];
  const lines = content.split('\n').filter(line => line.trim().startsWith('|'));
  
  // Skip header and separator rows
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 4) {
      signoffs.push({
        name: cells[0],
        role: cells[1],
        date: cells[2] === 'Pending' ? null : new Date(cells[2]),
        approved: cells[3] === '✓'
      });
    }
  }
  
  return signoffs;
}

/**
 * Parses ADR alternatives from the Alternatives Considered section
 */
function parseAlternatives(content: string | undefined): Alternative[] {
  if (!content) return [];
  
  const alternatives: Alternative[] = [];
  const lines = content.split('\n');
  
  let currentAlt: Partial<Alternative> | null = null;
  let descriptionLines: string[] = [];
  
  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      if (currentAlt && currentAlt.name) {
        alternatives.push({
          name: currentAlt.name,
          description: descriptionLines.join('\n').trim(),
          rejectionReason: currentAlt.rejectionReason || ''
        });
      }
      currentAlt = { name: h3Match[1] };
      descriptionLines = [];
      continue;
    }
    
    if (!currentAlt) continue;
    
    const rejectionMatch = line.match(/^\*\*Rejection Reason:\*\*\s*(.*)$/);
    if (rejectionMatch) {
      currentAlt.rejectionReason = rejectionMatch[1];
      continue;
    }
    
    if (line.trim()) {
      descriptionLines.push(line);
    }
  }
  
  // Add last alternative
  if (currentAlt && currentAlt.name) {
    alternatives.push({
      name: currentAlt.name,
      description: descriptionLines.join('\n').trim(),
      rejectionReason: currentAlt.rejectionReason || ''
    });
  }
  
  return alternatives;
}


/**
 * Parses phases from the Phases section
 */
function parsePhases(content: string | undefined): Phase[] {
  if (!content) return [];
  
  const phases: Phase[] = [];
  const lines = content.split('\n');
  
  let currentPhase: Partial<Phase> | null = null;
  let descriptionLines: string[] = [];
  let inDescription = false;
  
  for (const line of lines) {
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      if (currentPhase && currentPhase.id) {
        currentPhase.description = descriptionLines.join('\n').trim();
        phases.push(currentPhase as Phase);
      }
      currentPhase = {
        name: h3Match[1],
        dependencies: [],
        status: 'pending'
      };
      descriptionLines = [];
      inDescription = false;
      continue;
    }
    
    if (!currentPhase) continue;
    
    const idMatch = line.match(/^\*\*ID:\*\*\s*(.+)$/);
    if (idMatch) {
      currentPhase.id = idMatch[1];
      inDescription = true;
      continue;
    }
    
    const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+)$/);
    if (statusMatch) {
      currentPhase.status = statusMatch[1] as PhaseStatus;
      inDescription = false;
      continue;
    }
    
    const durationMatch = line.match(/^\*\*Estimated Duration:\*\*\s*(.+)$/);
    if (durationMatch) {
      currentPhase.estimatedDuration = durationMatch[1];
      continue;
    }
    
    const depsMatch = line.match(/^\*\*Dependencies:\*\*\s*(.+)$/);
    if (depsMatch) {
      currentPhase.dependencies = depsMatch[1].split(',').map(d => d.trim());
      continue;
    }
    
    const completedMatch = line.match(/^\*\*Completed:\*\*\s*(.+)$/);
    if (completedMatch) {
      currentPhase.completedAt = new Date(completedMatch[1]);
      continue;
    }
    
    if (inDescription && line.trim() && !line.startsWith('**')) {
      descriptionLines.push(line);
    }
  }
  
  // Add last phase
  if (currentPhase && currentPhase.id) {
    currentPhase.description = descriptionLines.join('\n').trim();
    phases.push(currentPhase as Phase);
  }
  
  return phases;
}

/**
 * Parses team-module mapping from a Markdown table
 */
function parseTeamModuleMapping(content: string | undefined): TeamModuleMapping[] {
  if (!content) return [];
  
  const mappings: TeamModuleMapping[] = [];
  const lines = content.split('\n').filter(line => line.trim().startsWith('|'));
  
  // Skip header and separator rows
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 2) {
      // Parse team name and ID from format "Team Name (team-id)"
      const teamMatch = cells[0].match(/^(.+)\s*\(([^)]+)\)$/);
      if (teamMatch) {
        mappings.push({
          teamName: teamMatch[1].trim(),
          teamId: teamMatch[2].trim(),
          modules: cells[1].split(',').map(m => m.trim())
        });
      }
    }
  }
  
  return mappings;
}

/**
 * Parses migration tasks from a Markdown table
 */
function parseMigrationTasks(content: string | undefined): MigrationTask[] {
  if (!content) return [];
  
  const tasks: MigrationTask[] = [];
  const lines = content.split('\n').filter(line => line.trim().startsWith('|'));
  
  // Skip header and separator rows
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
    if (cells.length >= 5) {
      const task: MigrationTask = {
        id: cells[0],
        phaseId: cells[1],
        description: cells[2],
        status: cells[4] as TaskStatus
      };
      if (cells[3] !== 'Unassigned') {
        task.assignee = cells[3];
      }
      tasks.push(task);
    }
  }
  
  return tasks;
}
