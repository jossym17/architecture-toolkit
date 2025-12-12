// Async ID Generator Service for Architecture Documentation Toolkit

import { ArtifactType } from '../models/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Maps artifact types to their ID prefixes
 */
const TYPE_PREFIXES: Record<ArtifactType, string> = {
  rfc: 'RFC',
  adr: 'ADR',
  decomposition: 'DECOMP',
};

/**
 * ID counters for each artifact type
 */
interface IdCounters {
  rfc: number;
  adr: number;
  decomposition: number;
}

/**
 * Configuration file structure
 */
interface ConfigFile {
  idCounters: IdCounters;
}

/**
 * Default configuration
 */
const DEFAULT_COUNTERS: IdCounters = {
  rfc: 0,
  adr: 0,
  decomposition: 0,
};

/**
 * Async ID Generator class that tracks and generates unique sequential IDs
 * for each artifact type. Uses async file operations to avoid blocking.
 */
export class AsyncIdGenerator {
  private counters: IdCounters | null = null;
  private configPath: string;
  private archDir: string;
  private loadPromise: Promise<void> | null = null;

  /**
   * Creates a new AsyncIdGenerator instance
   * @param basePath - Base path for the .arch directory
   */
  constructor(basePath: string = process.cwd()) {
    this.archDir = path.join(basePath, '.arch');
    this.configPath = path.join(this.archDir, 'config.json');
  }

  /**
   * Ensures counters are loaded (lazy initialization)
   */
  private async ensureLoaded(): Promise<void> {
    if (this.counters !== null) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadCounters();
    await this.loadPromise;
    this.loadPromise = null;
  }

  /**
   * Loads ID counters from the config file
   */
  private async loadCounters(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config: ConfigFile = JSON.parse(content);
      if (config.idCounters) {
        this.counters = {
          rfc: config.idCounters.rfc ?? 0,
          adr: config.idCounters.adr ?? 0,
          decomposition: config.idCounters.decomposition ?? 0,
        };
      } else {
        this.counters = { ...DEFAULT_COUNTERS };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.counters = { ...DEFAULT_COUNTERS };
      } else {
        throw error;
      }
    }
  }

  /**
   * Saves ID counters to the config file
   */
  private async saveCounters(): Promise<void> {
    // Ensure .arch directory exists
    await fs.mkdir(this.archDir, { recursive: true });

    const config: ConfigFile = {
      idCounters: this.counters!,
    };
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Generates the next unique ID for the given artifact type
   * @param type - The artifact type (rfc, adr, or decomposition)
   * @returns A unique ID in the format {TYPE}-NNNN
   */
  async generateId(type: ArtifactType): Promise<string> {
    await this.ensureLoaded();

    // Increment the counter for this type
    this.counters![type]++;
    
    // Persist the updated counters
    await this.saveCounters();
    
    // Format the ID with zero-padding (4 digits)
    const prefix = TYPE_PREFIXES[type];
    const number = this.counters![type].toString().padStart(4, '0');
    
    return `${prefix}-${number}`;
  }

  /**
   * Gets the current counter value for an artifact type
   */
  async getCurrentCounter(type: ArtifactType): Promise<number> {
    await this.ensureLoaded();
    return this.counters![type];
  }

  /**
   * Gets the next ID that would be generated (without generating it)
   */
  async peekNextId(type: ArtifactType): Promise<string> {
    await this.ensureLoaded();
    const prefix = TYPE_PREFIXES[type];
    const number = (this.counters![type] + 1).toString().padStart(4, '0');
    return `${prefix}-${number}`;
  }

  /**
   * Validates that an ID matches the expected format
   */
  static validateIdFormat(id: string, type?: ArtifactType): boolean {
    if (type) {
      const prefix = TYPE_PREFIXES[type];
      const pattern = new RegExp(`^${prefix}-\\d{4,}$`);
      return pattern.test(id);
    }
    return /^(RFC|ADR|DECOMP)-\d{4,}$/.test(id);
  }

  /**
   * Parses an ID to extract its type and number
   */
  static parseId(id: string): { type: ArtifactType; number: number } | null {
    const match = id.match(/^(RFC|ADR|DECOMP)-(\d+)$/);
    if (!match) {
      return null;
    }

    const prefixToType: Record<string, ArtifactType> = {
      RFC: 'rfc',
      ADR: 'adr',
      DECOMP: 'decomposition',
    };

    const type = prefixToType[match[1]];
    if (!type) {
      return null;
    }

    return {
      type,
      number: parseInt(match[2], 10),
    };
  }

  /**
   * Resets the counter for a specific artifact type
   */
  async resetCounter(type: ArtifactType, value: number = 0): Promise<void> {
    await this.ensureLoaded();
    this.counters![type] = value;
    await this.saveCounters();
  }

  /**
   * Resets all counters
   */
  async resetAllCounters(): Promise<void> {
    this.counters = { ...DEFAULT_COUNTERS };
    await this.saveCounters();
  }
}
