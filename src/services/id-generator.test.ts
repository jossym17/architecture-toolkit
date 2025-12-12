// Tests for ID Generator service

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { IdGenerator } from './id-generator.js';

describe('IdGenerator', () => {
  const testDir = './test-id-generator';
  let generator: IdGenerator;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    generator = new IdGenerator(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('generateId', () => {
    it('should generate sequential RFC IDs', () => {
      const id1 = generator.generateId('rfc');
      const id2 = generator.generateId('rfc');
      const id3 = generator.generateId('rfc');

      expect(id1).toBe('RFC-0001');
      expect(id2).toBe('RFC-0002');
      expect(id3).toBe('RFC-0003');
    });

    it('should generate sequential ADR IDs', () => {
      const id1 = generator.generateId('adr');
      const id2 = generator.generateId('adr');

      expect(id1).toBe('ADR-0001');
      expect(id2).toBe('ADR-0002');
    });

    it('should generate sequential DECOMP IDs', () => {
      const id1 = generator.generateId('decomposition');
      const id2 = generator.generateId('decomposition');

      expect(id1).toBe('DECOMP-0001');
      expect(id2).toBe('DECOMP-0002');
    });

    it('should maintain separate counters per type', () => {
      const rfc1 = generator.generateId('rfc');
      const adr1 = generator.generateId('adr');
      const rfc2 = generator.generateId('rfc');
      const decomp1 = generator.generateId('decomposition');

      expect(rfc1).toBe('RFC-0001');
      expect(adr1).toBe('ADR-0001');
      expect(rfc2).toBe('RFC-0002');
      expect(decomp1).toBe('DECOMP-0001');
    });
  });

  describe('persistence', () => {
    it('should persist counters across instances', () => {
      generator.generateId('rfc');
      generator.generateId('rfc');
      generator.generateId('adr');

      // Create new instance
      const newGenerator = new IdGenerator(testDir);
      
      expect(newGenerator.generateId('rfc')).toBe('RFC-0003');
      expect(newGenerator.generateId('adr')).toBe('ADR-0002');
    });
  });

  describe('validateIdFormat (static)', () => {
    it('should validate correct RFC format', () => {
      expect(IdGenerator.validateIdFormat('RFC-0001', 'rfc')).toBe(true);
      expect(IdGenerator.validateIdFormat('RFC-9999', 'rfc')).toBe(true);
    });

    it('should validate correct ADR format', () => {
      expect(IdGenerator.validateIdFormat('ADR-0001', 'adr')).toBe(true);
    });

    it('should validate correct DECOMP format', () => {
      expect(IdGenerator.validateIdFormat('DECOMP-0001', 'decomposition')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(IdGenerator.validateIdFormat('INVALID', 'rfc')).toBe(false);
      expect(IdGenerator.validateIdFormat('RFC-1', 'rfc')).toBe(false);
      expect(IdGenerator.validateIdFormat('', 'rfc')).toBe(false);
    });
  });

  describe('parseId (static)', () => {
    it('should extract type from RFC ID', () => {
      const result = IdGenerator.parseId('RFC-0001');
      expect(result?.type).toBe('rfc');
      expect(result?.number).toBe(1);
    });

    it('should extract type from ADR ID', () => {
      const result = IdGenerator.parseId('ADR-0001');
      expect(result?.type).toBe('adr');
    });

    it('should extract type from DECOMP ID', () => {
      const result = IdGenerator.parseId('DECOMP-0001');
      expect(result?.type).toBe('decomposition');
    });

    it('should return null for invalid IDs', () => {
      expect(IdGenerator.parseId('INVALID')).toBeNull();
    });
  });
});
