// Input validation and sanitization utilities

import { ValidationError, SecurityError } from './errors.js';

/**
 * Valid artifact ID patterns
 */
const ID_PATTERNS: Record<string, RegExp> = {
  rfc: /^RFC-\d{4}$/,
  adr: /^ADR-\d{4}$/,
  decomposition: /^DECOMP-\d{4}$/
};

/**
 * Characters not allowed in filenames (Windows + Unix)
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,           // Parent directory
  /^[/\\]/,         // Absolute path
  /^[a-zA-Z]:/,     // Windows drive letter
  /\0/,             // Null byte
];

/**
 * Maximum lengths for various fields
 */
export const MAX_LENGTHS = {
  id: 20,
  title: 200,
  owner: 100,
  tag: 50,
  tags: 20,        // Max number of tags
  summary: 1000,
  content: 100000
};

/**
 * Validates and sanitizes an artifact ID
 */
export function validateId(id: string, type?: string): string {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('ID is required', 'id');
  }

  const trimmed = id.trim().toUpperCase();
  
  if (trimmed.length > MAX_LENGTHS.id) {
    throw new ValidationError(`ID exceeds maximum length of ${MAX_LENGTHS.id}`, 'id');
  }

  // Check for path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new SecurityError(`Invalid ID: potential path traversal detected`, { id });
    }
  }

  // Validate format if type is known
  if (type && ID_PATTERNS[type]) {
    if (!ID_PATTERNS[type].test(trimmed)) {
      throw new ValidationError(
        `Invalid ${type.toUpperCase()} ID format. Expected: ${type.toUpperCase()}-NNNN`,
        'id'
      );
    }
  } else {
    // Check against all patterns
    const validFormat = Object.values(ID_PATTERNS).some(p => p.test(trimmed));
    if (!validFormat) {
      throw new ValidationError(
        'Invalid ID format. Expected: RFC-NNNN, ADR-NNNN, or DECOMP-NNNN',
        'id'
      );
    }
  }

  return trimmed;
}

/**
 * Validates and sanitizes a title
 */
export function validateTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    throw new ValidationError('Title is required', 'title');
  }

  const trimmed = title.trim();
  
  if (trimmed.length === 0) {
    throw new ValidationError('Title cannot be empty', 'title');
  }

  if (trimmed.length > MAX_LENGTHS.title) {
    throw new ValidationError(`Title exceeds maximum length of ${MAX_LENGTHS.title}`, 'title');
  }

  return trimmed;
}

/**
 * Validates and sanitizes an owner name
 */
export function validateOwner(owner: string): string {
  if (!owner || typeof owner !== 'string') {
    throw new ValidationError('Owner is required', 'owner');
  }

  const trimmed = owner.trim();
  
  if (trimmed.length === 0) {
    throw new ValidationError('Owner cannot be empty', 'owner');
  }

  if (trimmed.length > MAX_LENGTHS.owner) {
    throw new ValidationError(`Owner exceeds maximum length of ${MAX_LENGTHS.owner}`, 'owner');
  }

  // Remove illegal filename characters from owner (used in paths)
  return trimmed.replace(ILLEGAL_FILENAME_CHARS, '_');
}

/**
 * Validates and sanitizes tags
 */
export function validateTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) {
    throw new ValidationError('Tags must be an array', 'tags');
  }

  if (tags.length > MAX_LENGTHS.tags) {
    throw new ValidationError(`Maximum ${MAX_LENGTHS.tags} tags allowed`, 'tags');
  }

  return tags.map((tag, index) => {
    if (typeof tag !== 'string') {
      throw new ValidationError(`Tag at index ${index} must be a string`, 'tags');
    }

    const trimmed = tag.trim().toLowerCase();
    
    if (trimmed.length === 0) {
      throw new ValidationError(`Tag at index ${index} cannot be empty`, 'tags');
    }

    if (trimmed.length > MAX_LENGTHS.tag) {
      throw new ValidationError(`Tag "${trimmed}" exceeds maximum length of ${MAX_LENGTHS.tag}`, 'tags');
    }

    // Remove special characters, keep alphanumeric and hyphens
    return trimmed.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  });
}

/**
 * Sanitizes a path component to prevent traversal
 */
export function sanitizePath(pathComponent: string): string {
  if (!pathComponent || typeof pathComponent !== 'string') {
    throw new SecurityError('Invalid path component');
  }

  // Check for traversal attempts
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(pathComponent)) {
      throw new SecurityError('Path traversal detected', { path: pathComponent });
    }
  }

  // Remove illegal characters
  return pathComponent.replace(ILLEGAL_FILENAME_CHARS, '_');
}

/**
 * Validates artifact type
 */
export function validateArtifactType(type: string): 'rfc' | 'adr' | 'decomposition' {
  const normalized = type?.toLowerCase?.();
  
  if (!['rfc', 'adr', 'decomposition'].includes(normalized)) {
    throw new ValidationError(
      'Invalid artifact type. Must be: rfc, adr, or decomposition',
      'type'
    );
  }

  return normalized as 'rfc' | 'adr' | 'decomposition';
}

/**
 * Validates status for a given artifact type
 */
export function validateStatus(status: string, artifactType: string): string {
  const validStatuses: Record<string, string[]> = {
    rfc: ['draft', 'review', 'approved', 'rejected', 'implemented'],
    adr: ['proposed', 'accepted', 'deprecated', 'superseded'],
    decomposition: ['proposed', 'accepted', 'deprecated', 'superseded']
  };

  const normalized = status?.toLowerCase?.();
  const allowed = validStatuses[artifactType] || [];

  if (!allowed.includes(normalized)) {
    throw new ValidationError(
      `Invalid status "${status}" for ${artifactType}. Allowed: ${allowed.join(', ')}`,
      'status'
    );
  }

  return normalized;
}
