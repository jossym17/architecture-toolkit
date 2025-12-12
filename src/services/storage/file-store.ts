// File store service for artifact persistence

import * as fs from 'fs/promises';
import * as path from 'path';
import { Artifact } from '../../models/artifact.js';
import { ArtifactType } from '../../models/types.js';
import { serialize } from '../serialization/serializer.js';
import { deserialize } from '../serialization/deserializer.js';
import { ArtifactCache, CacheConfig } from './cache.js';

/**
 * Valid ID patterns for security validation
 */
const VALID_ID_PATTERNS: Record<string, RegExp> = {
  rfc: /^RFC-\d{4}$/,
  adr: /^ADR-\d{4}$/,
  decomposition: /^DECOMP-\d{4}$/
};

/**
 * Validates an artifact ID to prevent path traversal attacks
 */
function validateId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Check for path traversal attempts
  if (id.includes('..') || id.includes('/') || id.includes('\\')) {
    return false;
  }
  
  // Check for null bytes
  if (id.includes('\0')) {
    return false;
  }
  
  // Validate against known patterns
  const upperCaseId = id.toUpperCase();
  return Object.values(VALID_ID_PATTERNS).some(pattern => pattern.test(upperCaseId));
}

/**
 * Configuration for the file store
 */
export interface FileStoreConfig {
  /** Base directory for artifact storage (default: .arch) */
  baseDir: string;
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
}

/**
 * Filters for listing artifacts
 */
export interface ArtifactFilters {
  /** Filter by artifact status */
  status?: string;
  /** Filter by owner */
  owner?: string;
  /** Filter by creation date (from) */
  dateFrom?: Date;
  /** Filter by creation date (to) */
  dateTo?: Date;
  /** Filter by tags (artifact must have all specified tags) */
  tags?: string[];
  /** Filter by artifact type */
  type?: ArtifactType;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FileStoreConfig = {
  baseDir: '.arch'
};

/**
 * Maps artifact types to their subdirectory names
 */
const TYPE_DIRECTORIES: Record<ArtifactType, string> = {
  'rfc': 'rfc',
  'adr': 'adr',
  'decomposition': 'decomposition'
};

/**
 * File store service for persisting artifacts to the filesystem
 */
export class FileStore {
  private config: FileStoreConfig;
  private cache: ArtifactCache;

  constructor(config: Partial<FileStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new ArtifactCache(config.cache);
  }


  /**
   * Initializes the .arch/ directory structure
   * Creates the base directory and type-specific subdirectories
   */
  async initialize(): Promise<void> {
    // Create base directory
    await fs.mkdir(this.config.baseDir, { recursive: true });

    // Create subdirectories for each artifact type
    for (const subdir of Object.values(TYPE_DIRECTORIES)) {
      await fs.mkdir(path.join(this.config.baseDir, subdir), { recursive: true });
    }

    // Create templates directory
    await fs.mkdir(path.join(this.config.baseDir, 'templates'), { recursive: true });

    // Create config file if it doesn't exist
    const configPath = path.join(this.config.baseDir, 'config.yaml');
    try {
      await fs.access(configPath);
    } catch {
      await fs.writeFile(configPath, '# Architecture Toolkit Configuration\n');
    }
  }

  /**
   * Gets the file path for an artifact
   */
  private getArtifactPath(id: string, type: ArtifactType): string {
    const subdir = TYPE_DIRECTORIES[type];
    return path.join(this.config.baseDir, subdir, `${id}.md`);
  }

  /**
   * Extracts artifact type from ID prefix
   */
  private getTypeFromId(id: string): ArtifactType | null {
    const prefix = id.split('-')[0]?.toUpperCase();
    switch (prefix) {
      case 'RFC':
        return 'rfc';
      case 'ADR':
        return 'adr';
      case 'DECOMP':
        return 'decomposition';
      default:
        return null;
    }
  }

  /**
   * Saves an artifact to the filesystem
   * 
   * @param artifact - The artifact to save
   * @throws Error if the artifact cannot be saved or ID is invalid
   */
  async save(artifact: Artifact): Promise<void> {
    // Security: Validate ID before using in file path
    if (!validateId(artifact.id)) {
      throw new Error(`Invalid artifact ID: ${artifact.id}`);
    }
    
    const filePath = this.getArtifactPath(artifact.id, artifact.type);
    const content = serialize(artifact);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Invalidate cache for this artifact type
    this.cache.invalidateByType(artifact.type);
  }

  /**
   * Loads an artifact by ID
   * 
   * @param id - The artifact ID (e.g., RFC-0001, ADR-0001)
   * @returns The loaded artifact or null if not found
   */
  async load(id: string): Promise<Artifact | null> {
    // Security: Validate ID before using in file path
    if (!validateId(id)) {
      return null;
    }
    
    const type = this.getTypeFromId(id);
    if (!type) {
      return null;
    }

    const filePath = this.getArtifactPath(id, type);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return deserialize(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Deletes an artifact by ID
   * 
   * @param id - The artifact ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    // Security: Validate ID before using in file path
    if (!validateId(id)) {
      return false;
    }
    
    const type = this.getTypeFromId(id);
    if (!type) {
      return false;
    }

    const filePath = this.getArtifactPath(id, type);
    
    try {
      await fs.unlink(filePath);
      // Invalidate cache for this artifact type
      this.cache.invalidateByType(type);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }


  /**
   * Lists all artifacts, optionally filtered
   * 
   * @param filters - Optional filters to apply
   * @returns Array of artifacts matching the filters
   */
  async list(filters?: ArtifactFilters): Promise<Artifact[]> {
    // Check cache first
    const cacheKey = filters as Record<string, unknown> | undefined;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const artifacts: Artifact[] = [];
    
    // Determine which directories to scan
    const typesToScan: ArtifactType[] = filters?.type 
      ? [filters.type]
      : ['rfc', 'adr', 'decomposition'];

    for (const type of typesToScan) {
      const subdir = TYPE_DIRECTORIES[type];
      const dirPath = path.join(this.config.baseDir, subdir);
      
      try {
        const files = await fs.readdir(dirPath);
        
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          
          const filePath = path.join(dirPath, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const artifact = deserialize(content);
            
            // Apply filters
            if (this.matchesFilters(artifact, filters)) {
              artifacts.push(artifact);
            }
          } catch {
            // Skip files that can't be parsed
            continue;
          }
        }
      } catch (error) {
        // Directory doesn't exist, skip
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Sort by creation date (newest first)
    artifacts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Store in cache
    this.cache.set(artifacts, cacheKey);
    
    return artifacts;
  }

  /**
   * Checks if an artifact matches the given filters
   */
  private matchesFilters(artifact: Artifact, filters?: ArtifactFilters): boolean {
    if (!filters) return true;

    // Filter by type
    if (filters.type && artifact.type !== filters.type) {
      return false;
    }

    // Filter by status
    if (filters.status && artifact.status !== filters.status) {
      return false;
    }

    // Filter by owner
    if (filters.owner && artifact.owner !== filters.owner) {
      return false;
    }

    // Filter by date range (using createdAt)
    if (filters.dateFrom && artifact.createdAt < filters.dateFrom) {
      return false;
    }
    if (filters.dateTo && artifact.createdAt > filters.dateTo) {
      return false;
    }

    // Filter by tags (artifact must have ALL specified tags)
    if (filters.tags && filters.tags.length > 0) {
      const artifactTags = new Set(artifact.tags);
      for (const tag of filters.tags) {
        if (!artifactTags.has(tag)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Checks if an artifact exists
   * 
   * @param id - The artifact ID to check
   * @returns true if the artifact exists
   */
  async exists(id: string): Promise<boolean> {
    // Security: Validate ID before using in file path
    if (!validateId(id)) {
      return false;
    }
    
    const type = this.getTypeFromId(id);
    if (!type) {
      return false;
    }

    const filePath = this.getArtifactPath(id, type);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the base directory path
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }

  /**
   * Clears the artifact cache
   */
  clearCache(): void {
    this.cache.invalidate();
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean; ttl: number } {
    return this.cache.getStats();
  }

  /**
   * Configures the cache
   */
  configureCache(config: Partial<CacheConfig>): void {
    this.cache.configure(config);
  }
}
