// In-memory cache for artifact list operations

import { Artifact } from '../../models/artifact.js';

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Time-to-live in milliseconds (default: 30 seconds) */
  ttl: number;
  /** Maximum number of entries (default: 100) */
  maxEntries: number;
  /** Enable/disable cache (default: true) */
  enabled: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  ttl: 30000, // 30 seconds
  maxEntries: 100,
  enabled: true
};

/**
 * Simple in-memory cache with TTL and LRU eviction
 */
export class ArtifactCache {
  private cache: Map<string, CacheEntry<Artifact[]>> = new Map();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generates a cache key from filter parameters
   */
  private generateKey(filters?: Record<string, unknown>): string {
    if (!filters) return '__all__';
    return JSON.stringify(filters, Object.keys(filters).sort());
  }

  /**
   * Gets cached artifacts if available and not expired
   */
  get(filters?: Record<string, unknown>): Artifact[] | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(filters);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Stores artifacts in cache
   */
  set(artifacts: Artifact[], filters?: Record<string, unknown>): void {
    if (!this.config.enabled) return;

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const key = this.generateKey(filters);
    const now = Date.now();

    this.cache.set(key, {
      data: artifacts,
      timestamp: now,
      expiresAt: now + this.config.ttl
    });
  }

  /**
   * Invalidates all cache entries
   */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Invalidates cache entries matching a specific type
   */
  invalidateByType(type: string): void {
    for (const [key] of this.cache) {
      if (key.includes(`"type":"${type}"`) || key === '__all__') {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evicts the oldest cache entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Gets cache statistics
   */
  getStats(): { size: number; enabled: boolean; ttl: number } {
    return {
      size: this.cache.size,
      enabled: this.config.enabled,
      ttl: this.config.ttl
    };
  }

  /**
   * Updates cache configuration
   */
  configure(config: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.invalidate();
    }
  }
}
