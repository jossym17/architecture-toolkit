// YAML frontmatter parser for Markdown artifacts

import * as yaml from 'yaml';
import { ArtifactType, ReferenceType, ArtifactStatus } from '../../models/types.js';
import { Reference } from '../../models/reference.js';

/**
 * Error that includes line number information for parse failures
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column?: number
  ) {
    super(`${message} at line ${line}${column !== undefined ? `, column ${column}` : ''}`);
    this.name = 'ParseError';
  }
}

/**
 * Parsed frontmatter metadata from an artifact
 */
export interface ParsedFrontmatter {
  id: string;
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
  owner: string;
  tags: string[];
  references: Reference[];
  /** Additional type-specific fields */
  [key: string]: unknown;
}

/**
 * Result of parsing a Markdown file with YAML frontmatter
 */
export interface ParseResult {
  frontmatter: ParsedFrontmatter;
  content: string;
  /** Line number where content starts (after frontmatter) */
  contentStartLine: number;
}


/**
 * Parses YAML frontmatter from a Markdown string
 * 
 * Frontmatter must be delimited by `---` at the start and end.
 * Returns the parsed metadata and remaining Markdown content.
 * 
 * @param input - The full Markdown string with YAML frontmatter
 * @returns ParseResult with frontmatter, content, and line information
 * @throws ParseError if frontmatter is missing or malformed
 */
export function parseFrontmatter(input: string): ParseResult {
  const lines = input.split('\n');
  
  // Check for opening delimiter
  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw new ParseError('Missing opening frontmatter delimiter (---)', 1);
  }
  
  // Find closing delimiter
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }
  
  if (closingIndex === -1) {
    throw new ParseError('Missing closing frontmatter delimiter (---)', lines.length);
  }
  
  // Extract YAML content (between delimiters)
  const yamlContent = lines.slice(1, closingIndex).join('\n');
  
  // Parse YAML
  let parsed: Record<string, unknown>;
  try {
    parsed = yaml.parse(yamlContent) || {};
  } catch (err) {
    if (err instanceof yaml.YAMLParseError) {
      // YAML library provides line info relative to YAML content
      // Add 2 to account for the opening delimiter line (1-indexed)
      const line = (err.linePos?.[0]?.line ?? 1) + 1;
      throw new ParseError(`YAML parse error: ${err.message}`, line);
    }
    throw new ParseError(`YAML parse error: ${String(err)}`, 2);
  }
  
  // Validate and extract required fields
  const frontmatter = extractFrontmatter(parsed, closingIndex);
  
  // Extract content (everything after closing delimiter)
  const contentLines = lines.slice(closingIndex + 1);
  const content = contentLines.join('\n').trim();
  
  return {
    frontmatter,
    content,
    contentStartLine: closingIndex + 2 // 1-indexed, line after closing ---
  };
}

/**
 * Extracts and validates frontmatter fields from parsed YAML
 */
function extractFrontmatter(parsed: Record<string, unknown>, _closingLine: number): ParsedFrontmatter {
  // Validate required fields
  const requiredFields = ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt', 'owner'];
  for (const field of requiredFields) {
    if (!(field in parsed) || parsed[field] === null || parsed[field] === undefined) {
      throw new ParseError(`Missing required field: ${field}`, 2);
    }
  }
  
  // Validate and parse type
  const type = parsed.type as string;
  if (!isValidArtifactType(type)) {
    throw new ParseError(`Invalid artifact type: ${type}. Must be 'rfc', 'adr', or 'decomposition'`, 2);
  }
  
  // Parse dates
  const createdAt = parseDate(parsed.createdAt, 'createdAt');
  const updatedAt = parseDate(parsed.updatedAt, 'updatedAt');
  
  // Parse tags (default to empty array)
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
  
  // Parse references
  const references = parseReferences(parsed.references);
  
  // Build frontmatter object with all fields
  const frontmatter: ParsedFrontmatter = {
    id: String(parsed.id),
    type: type as ArtifactType,
    title: String(parsed.title),
    status: String(parsed.status) as ArtifactStatus,
    createdAt,
    updatedAt,
    owner: String(parsed.owner),
    tags,
    references
  };
  
  // Copy any additional fields (type-specific)
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in frontmatter)) {
      frontmatter[key] = value;
    }
  }
  
  return frontmatter;
}

function isValidArtifactType(type: string): type is ArtifactType {
  return type === 'rfc' || type === 'adr' || type === 'decomposition';
}

function parseDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ParseError(`Invalid date format for ${fieldName}: ${value}`, 2);
    }
    return date;
  }
  throw new ParseError(`Invalid date format for ${fieldName}`, 2);
}

function parseReferences(refs: unknown): Reference[] {
  if (!refs || !Array.isArray(refs)) {
    return [];
  }
  
  return refs.map((ref, index) => {
    if (typeof ref !== 'object' || ref === null) {
      throw new ParseError(`Invalid reference at index ${index}`, 2);
    }
    
    const refObj = ref as Record<string, unknown>;
    
    if (!refObj.targetId || !refObj.targetType || !refObj.referenceType) {
      throw new ParseError(`Reference at index ${index} missing required fields`, 2);
    }
    
    const targetType = String(refObj.targetType);
    if (!isValidArtifactType(targetType)) {
      throw new ParseError(`Invalid targetType in reference at index ${index}`, 2);
    }
    
    const referenceType = String(refObj.referenceType);
    if (!isValidReferenceType(referenceType)) {
      throw new ParseError(`Invalid referenceType in reference at index ${index}`, 2);
    }
    
    return {
      targetId: String(refObj.targetId),
      targetType: targetType as ArtifactType,
      referenceType: referenceType as ReferenceType
    };
  });
}

function isValidReferenceType(type: string): type is ReferenceType {
  return type === 'implements' || type === 'supersedes' || type === 'relates-to' || type === 'depends-on';
}
