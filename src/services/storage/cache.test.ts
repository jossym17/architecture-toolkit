// Cache tests

import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactCache } from './cache.js';
import { Artifact } from '../../models/artifact.js';

describe('ArtifactCache', () => {
  let cache: ArtifactCache;

  const mockArtifact: Artifact = {
    id: 'RFC-0001',
    type: 'rfc',
    title: 'Test RFC',
    status: 'draft',
    owner: 'test@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
    tags: ['test'],
    references: []
  };

  beforeEach(() => {
    cache = new ArtifactCache();
  });

  describe('get/set', () => {
    it('should return null for empty cache', () => {
      expect(cache.get()).toBeNull();
    });

    it('should store and retrieve artifacts', () => {
      const artifacts = [mockArtifact];
      cache.set(artifacts);
      expect(cache.get()).toEqual(artifacts);
    });

    it('should store with filters as key', () => {
      const artifacts = [mockArtifact];
      const filters = { type: 'rfc' };
      cache.set(artifacts, filters);
      expect(cache.get(filters)).toEqual(artifacts);
      expect(cache.get()).toBeNull(); // Different key
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      cache = new ArtifactCache({ ttl: 50 }); // 50ms TTL
      cache.set([mockArtifact]);
      expect(cache.get()).not.toBeNull();
      
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cache.get()).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should clear all entries', () => {
      cache.set([mockArtifact]);
      cache.set([mockArtifact], { type: 'rfc' });
      cache.invalidate();
      expect(cache.get()).toBeNull();
      expect(cache.get({ type: 'rfc' })).toBeNull();
    });
  });

  describe('invalidateByType', () => {
    it('should clear entries matching type', () => {
      cache.set([mockArtifact], { type: 'rfc' });
      cache.set([mockArtifact], { type: 'adr' });
      cache.invalidateByType('rfc');
      expect(cache.get({ type: 'rfc' })).toBeNull();
      expect(cache.get({ type: 'adr' })).not.toBeNull();
    });

    it('should clear __all__ key when invalidating by type', () => {
      cache.set([mockArtifact]); // __all__ key
      cache.invalidateByType('rfc');
      expect(cache.get()).toBeNull();
    });
  });

  describe('disabled cache', () => {
    it('should not store when disabled', () => {
      cache = new ArtifactCache({ enabled: false });
      cache.set([mockArtifact]);
      expect(cache.get()).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set([mockArtifact]);
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.enabled).toBe(true);
      expect(stats.ttl).toBe(30000);
    });
  });
});
