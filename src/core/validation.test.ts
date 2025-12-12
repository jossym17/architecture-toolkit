// Tests for input validation and sanitization

import { describe, it, expect } from 'vitest';
import {
  validateId,
  validateTitle,
  validateOwner,
  validateTags,
  sanitizePath,
  validateArtifactType,
  validateStatus
} from './validation.js';
import { ValidationError, SecurityError } from './errors.js';

describe('validateId', () => {
  it('should accept valid RFC IDs', () => {
    expect(validateId('RFC-0001')).toBe('RFC-0001');
    expect(validateId('rfc-0001')).toBe('RFC-0001');
    expect(validateId('RFC-9999')).toBe('RFC-9999');
  });

  it('should accept valid ADR IDs', () => {
    expect(validateId('ADR-0001')).toBe('ADR-0001');
    expect(validateId('adr-0042')).toBe('ADR-0042');
  });

  it('should accept valid DECOMP IDs', () => {
    expect(validateId('DECOMP-0001')).toBe('DECOMP-0001');
    expect(validateId('decomp-0100')).toBe('DECOMP-0100');
  });

  it('should reject invalid ID formats', () => {
    expect(() => validateId('INVALID')).toThrow(ValidationError);
    expect(() => validateId('RFC-1')).toThrow(ValidationError);
    expect(() => validateId('RFC-00001')).toThrow(ValidationError);
    expect(() => validateId('')).toThrow(ValidationError);
  });

  it('should reject path traversal attempts', () => {
    expect(() => validateId('../RFC-0001')).toThrow(SecurityError);
    expect(() => validateId('RFC-0001/../..')).toThrow(SecurityError);
    expect(() => validateId('/etc/passwd')).toThrow(SecurityError);
    expect(() => validateId('C:\\Windows')).toThrow(SecurityError);
  });

  it('should reject null bytes', () => {
    expect(() => validateId('RFC-0001\x00')).toThrow(SecurityError);
  });
});

describe('validateTitle', () => {
  it('should accept valid titles', () => {
    expect(validateTitle('My RFC Title')).toBe('My RFC Title');
    expect(validateTitle('  Trimmed  ')).toBe('Trimmed');
  });

  it('should reject empty titles', () => {
    expect(() => validateTitle('')).toThrow(ValidationError);
    expect(() => validateTitle('   ')).toThrow(ValidationError);
  });

  it('should reject titles exceeding max length', () => {
    const longTitle = 'a'.repeat(201);
    expect(() => validateTitle(longTitle)).toThrow(ValidationError);
  });
});

describe('validateOwner', () => {
  it('should accept valid owners', () => {
    expect(validateOwner('john.doe')).toBe('john.doe');
    expect(validateOwner('team-platform')).toBe('team-platform');
  });

  it('should sanitize illegal filename characters', () => {
    expect(validateOwner('user<>name')).toBe('user__name');
    expect(validateOwner('user:name')).toBe('user_name');
  });

  it('should reject empty owners', () => {
    expect(() => validateOwner('')).toThrow(ValidationError);
  });
});

describe('validateTags', () => {
  it('should accept valid tags', () => {
    expect(validateTags(['api', 'security'])).toEqual(['api', 'security']);
  });

  it('should normalize tags to lowercase', () => {
    expect(validateTags(['API', 'Security'])).toEqual(['api', 'security']);
  });

  it('should sanitize special characters', () => {
    expect(validateTags(['my tag!'])).toEqual(['my-tag-']);
  });

  it('should reject too many tags', () => {
    const manyTags = Array(21).fill('tag');
    expect(() => validateTags(manyTags)).toThrow(ValidationError);
  });

  it('should reject empty tags', () => {
    expect(() => validateTags(['valid', ''])).toThrow(ValidationError);
  });
});

describe('sanitizePath', () => {
  it('should accept valid path components', () => {
    expect(sanitizePath('RFC-0001')).toBe('RFC-0001');
    expect(sanitizePath('my-file.md')).toBe('my-file.md');
  });

  it('should reject path traversal', () => {
    expect(() => sanitizePath('../parent')).toThrow(SecurityError);
    expect(() => sanitizePath('/absolute')).toThrow(SecurityError);
  });

  it('should sanitize illegal characters', () => {
    expect(sanitizePath('file<name>')).toBe('file_name_');
  });
});

describe('validateArtifactType', () => {
  it('should accept valid types', () => {
    expect(validateArtifactType('rfc')).toBe('rfc');
    expect(validateArtifactType('RFC')).toBe('rfc');
    expect(validateArtifactType('adr')).toBe('adr');
    expect(validateArtifactType('decomposition')).toBe('decomposition');
  });

  it('should reject invalid types', () => {
    expect(() => validateArtifactType('invalid')).toThrow(ValidationError);
    expect(() => validateArtifactType('')).toThrow(ValidationError);
  });
});

describe('validateStatus', () => {
  it('should accept valid RFC statuses', () => {
    expect(validateStatus('draft', 'rfc')).toBe('draft');
    expect(validateStatus('REVIEW', 'rfc')).toBe('review');
    expect(validateStatus('approved', 'rfc')).toBe('approved');
  });

  it('should accept valid ADR statuses', () => {
    expect(validateStatus('proposed', 'adr')).toBe('proposed');
    expect(validateStatus('accepted', 'adr')).toBe('accepted');
    expect(validateStatus('superseded', 'adr')).toBe('superseded');
  });

  it('should reject invalid statuses', () => {
    expect(() => validateStatus('invalid', 'rfc')).toThrow(ValidationError);
    expect(() => validateStatus('draft', 'adr')).toThrow(ValidationError);
  });
});
