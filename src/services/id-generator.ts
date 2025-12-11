// ID Generator Service for Architecture Documentation Toolkit

import { ArtifactType } from '../models/types.js';
import * as fs from 'fs';
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
const DEFAULT_CONFIG: ConfigFile = {
  idCounters: {
    rfc: 0,
    adr: 0,
    decomposition: 0,
  },
};

/**
 * ID Generator class that tracks and generates unique sequential IDs
 * for each artifact type. Persists counters to a config file.
 */
export class IdGenerator {
  private counters: IdCounters;
  private configPath: string;
  private archDir: string;

  /**
   * Creates a new IdGenerator instance
   * @param basePath - Base path for the .arch directory (defaults to current working directory)
   */
  constructor(basePath: string = process.cwd()) {
    this.archDir = path.join(basePath, '.arch');
    this.configPath = path.join(this.archDir, 'config.json');
    this.counters = { ...DEFAULT_CONFIG.idCounters };
    this.loadCounters();
  }


  /**
   * Loads ID counters from the config file if it exists
   */
  private loadCounters(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const config: ConfigFile = JSON.parse(content);
        if (config.idCounters) {
          this.counters = {
            rfc: config.idCounters.rfc ?? 0,
            adr: config.idCounters.adr ?? 0,
            decomposition: config.idCounters.decomposition ?? 0,
          };
        }
      }
    } catch {
      // If loading fails, use default counters
      this.counters = { ...DEFAULT_CONFIG.idCounters };
    }
  }

  /**
   * Saves ID counters to the config file
   */
  private saveCounters(): void {
    try {
      // Ensure .arch directory exists
      if (!fs.existsSync(this.archDir)) {
        fs.mkdirSync(this.archDir, { recursive: true });
      }

      const config: ConfigFile = {
        idCounters: this.counters,
      };
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save ID counters: ${error}`);
    }
  }

  /**
   * Generates the next unique ID for the given artifact type
   * @param type - The artifact type (rfc, adr, or decomposition)
   * @returns A unique ID in the format {TYPE}-NNNN
   */
  generateId(type: ArtifactType): string {
    // Increment the counter for this type
    this.counters[type]++;
    
    // Persist the updated counters
    this.saveCounters();
    
    // Format the ID with zero-padding (4 digits)
    const prefix = TYPE_PREFIXES[type];
    const number = this.counters[type].toString().padStart(4, '0');
    
    return `${prefix}-${number}`;
  }

  /**
   * Gets the current counter value for an artifact type (without incrementing)
   * @param type - The artifact type
   * @returns The current counter value
   */
  getCurrentCounter(type: ArtifactType): number {
    return this.counters[type];
  }

  /**
   * Gets the next ID that would be generated (without actually generating it)
   * @param type - The artifact type
   * @returns The next ID that would be generated
   */
  peekNextId(type: ArtifactType): string {
    const prefix = TYPE_PREFIXES[type];
    const number = (this.counters[type] + 1).toString().padStart(4, '0');
    return `${prefix}-${number}`;
  }

  /**
   * Validates that an ID matches the expected format for its type
   * @param id - The ID to validate
   * @param type - The expected artifact type
   * @returns true if the ID is valid for the type
   */
  static validateIdFormat(id: string, type: ArtifactType): boolean {
    const prefix = TYPE_PREFIXES[type];
    const pattern = new RegExp(`^${prefix}-\\d{4,}$`);
    return pattern.test(id);
  }

  /**
   * Parses an ID to extract its type and number
   * @param id - The ID to parse
   * @returns The parsed type and number, or null if invalid
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
   * Resets the counter for a specific artifact type (useful for testing)
   * @param type - The artifact type to reset
   * @param value - The value to reset to (defaults to 0)
   */
  resetCounter(type: ArtifactType, value: number = 0): void {
    this.counters[type] = value;
    this.saveCounters();
  }

  /**
   * Resets all counters (useful for testing)
   */
  resetAllCounters(): void {
    this.counters = { ...DEFAULT_CONFIG.idCounters };
    this.saveCounters();
  }
}
