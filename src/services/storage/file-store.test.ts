// Tests for FileStore service

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStore } from './file-store.js';
import { RFC } from '../../models/rfc.js';

describe('FileStore', () => {
  const testDir = './test-file-store/.arch';
  let store: FileStore;

  const createTestRFC = (id: string): RFC => ({
    id,
    type: 'rfc',
    title: 'Test RFC',
    status: 'draft',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
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
  });

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm('./test-file-store', { recursive: true });
    } catch {
      // Directory doesn't exist
    }
    store = new FileStore({ baseDir: testDir });
    await store.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm('./test-file-store', { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    it('should create directory structure', async () => {
      const rfcDir = path.join(testDir, 'rfc');
      const adrDir = path.join(testDir, 'adr');
      const decompDir = path.join(testDir, 'decomposition');
      const templatesDir = path.join(testDir, 'templates');

      const [rfcStat, adrStat, decompStat, templatesStat] = await Promise.all([
        fs.stat(rfcDir),
        fs.stat(adrDir),
        fs.stat(decompDir),
        fs.stat(templatesDir)
      ]);

      expect(rfcStat.isDirectory()).toBe(true);
      expect(adrStat.isDirectory()).toBe(true);
      expect(decompStat.isDirectory()).toBe(true);
      expect(templatesStat.isDirectory()).toBe(true);
    });
  });

  describe('save and load', () => {
    it('should save and load an RFC', async () => {
      const rfc = createTestRFC('RFC-0001');
      
      await store.save(rfc);
      const loaded = await store.load('RFC-0001');

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('RFC-0001');
      expect(loaded?.title).toBe('Test RFC');
      expect(loaded?.type).toBe('rfc');
    });

    it('should return null for non-existent artifact', async () => {
      const loaded = await store.load('RFC-9999');
      expect(loaded).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing artifact', async () => {
      const rfc = createTestRFC('RFC-0001');
      await store.save(rfc);

      const deleted = await store.delete('RFC-0001');
      expect(deleted).toBe(true);

      const loaded = await store.load('RFC-0001');
      expect(loaded).toBeNull();
    });

    it('should return false for non-existent artifact', async () => {
      const deleted = await store.delete('RFC-9999');
      expect(deleted).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all artifacts', async () => {
      await store.save(createTestRFC('RFC-0001'));
      await store.save(createTestRFC('RFC-0002'));

      const artifacts = await store.list();
      expect(artifacts.length).toBe(2);
    });

    it('should filter by type', async () => {
      await store.save(createTestRFC('RFC-0001'));

      const rfcs = await store.list({ type: 'rfc' });
      const adrs = await store.list({ type: 'adr' });

      expect(rfcs.length).toBe(1);
      expect(adrs.length).toBe(0);
    });

    it('should filter by status', async () => {
      const rfc1 = createTestRFC('RFC-0001');
      const rfc2 = { ...createTestRFC('RFC-0002'), status: 'approved' as const };

      await store.save(rfc1);
      await store.save(rfc2);

      const drafts = await store.list({ status: 'draft' });
      expect(drafts.length).toBe(1);
      expect(drafts[0].id).toBe('RFC-0001');
    });

    it('should filter by owner', async () => {
      const rfc1 = createTestRFC('RFC-0001');
      const rfc2 = { ...createTestRFC('RFC-0002'), owner: 'other-owner' };

      await store.save(rfc1);
      await store.save(rfc2);

      const filtered = await store.list({ owner: 'test-owner' });
      expect(filtered.length).toBe(1);
    });
  });

  describe('exists', () => {
    it('should return true for existing artifact', async () => {
      await store.save(createTestRFC('RFC-0001'));
      expect(await store.exists('RFC-0001')).toBe(true);
    });

    it('should return false for non-existent artifact', async () => {
      expect(await store.exists('RFC-9999')).toBe(false);
    });
  });
});
