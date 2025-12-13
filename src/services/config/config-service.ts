/**
 * Configuration Service
 * 
 * Loads and provides access to configuration defaults from .arch/config.yaml
 * Supports owner defaults, tags per artifact type, health thresholds, and validation rules.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import { ArtifactType } from '../../models/types.js';

/**
 * Default configuration values for artifact creation
 */
export interface ConfigDefaults {
  owner?: string;
  tags?: Partial<Record<ArtifactType, string[]>>;
}

/**
 * Health scoring configuration
 */
export interface HealthConfig {
  threshold: number;
  stalenessThresholdDays: number;
  noLinksPenalty: number;
  staleReferencePenalty: number;
  stalenessPenaltyPerMonth: number;
}

/**
 * Validation configuration for required sections
 */
export interface ValidationConfig {
  requiredSections: Partial<Record<ArtifactType, string[]>>;
}

/**
 * Compliance configuration
 */
export interface ComplianceConfig {
  requiredApprovals: number;
  frameworks: string[];
}

/**
 * Full configuration schema
 */
export interface ArchConfig {
  defaults?: ConfigDefaults;
  health?: Partial<HealthConfig>;
  validation?: ValidationConfig;
  compliance?: ComplianceConfig;
}


/**
 * Default health configuration values
 */
const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  threshold: 80,
  stalenessThresholdDays: 90,
  noLinksPenalty: 10,
  staleReferencePenalty: 15,
  stalenessPenaltyPerMonth: 5
};

/**
 * Default validation configuration
 */
const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  requiredSections: {
    rfc: ['problemStatement', 'successCriteria', 'recommendedApproach'],
    adr: ['context', 'decision', 'consequences'],
    decomposition: ['rationale', 'successMetrics', 'phases']
  }
};

/**
 * Default compliance configuration
 */
const DEFAULT_COMPLIANCE_CONFIG: ComplianceConfig = {
  requiredApprovals: 1,
  frameworks: []
};

/**
 * Configuration Service
 * 
 * Provides access to configuration values from .arch/config.yaml
 * with sensible defaults when configuration is not present.
 */
export class ConfigService {
  private baseDir: string;
  private configPath: string;
  private cachedConfig: ArchConfig | null = null;

  constructor(options: { baseDir?: string } = {}) {
    this.baseDir = options.baseDir || '.arch';
    this.configPath = path.join(this.baseDir, 'config.yaml');
  }

  /**
   * Load configuration from file, with caching
   */
  private async loadConfig(): Promise<ArchConfig> {
    if (this.cachedConfig !== null) {
      return this.cachedConfig as ArchConfig;
    }

    let config: ArchConfig;
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = yaml.parse(content);
      config = parsed || {};
    } catch {
      // Config file doesn't exist or is invalid, return empty config
      config = {};
    }
    
    this.cachedConfig = config;
    return config;
  }

  /**
   * Clear the cached configuration (useful for testing or after config changes)
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Get default values for artifact creation
   * 
   * Requirements: 6.1, 6.2
   */
  async getDefaults(): Promise<ConfigDefaults> {
    const config = await this.loadConfig();
    return config.defaults || {};
  }

  /**
   * Get default owner for artifact creation
   * 
   * Requirements: 6.1
   */
  async getDefaultOwner(): Promise<string | undefined> {
    const defaults = await this.getDefaults();
    return defaults.owner;
  }

  /**
   * Get default tags for a specific artifact type
   * 
   * Requirements: 6.2
   */
  async getDefaultTags(artifactType: ArtifactType): Promise<string[]> {
    const defaults = await this.getDefaults();
    return defaults.tags?.[artifactType] || [];
  }

  /**
   * Get health scoring configuration
   * 
   * Requirements: 6.3, 6.4
   */
  async getHealthConfig(): Promise<HealthConfig> {
    const config = await this.loadConfig();
    const healthConfig = config.health || {};
    
    return {
      threshold: healthConfig.threshold ?? DEFAULT_HEALTH_CONFIG.threshold,
      stalenessThresholdDays: healthConfig.stalenessThresholdDays ?? DEFAULT_HEALTH_CONFIG.stalenessThresholdDays,
      noLinksPenalty: healthConfig.noLinksPenalty ?? DEFAULT_HEALTH_CONFIG.noLinksPenalty,
      staleReferencePenalty: healthConfig.staleReferencePenalty ?? DEFAULT_HEALTH_CONFIG.staleReferencePenalty,
      stalenessPenaltyPerMonth: healthConfig.stalenessPenaltyPerMonth ?? DEFAULT_HEALTH_CONFIG.stalenessPenaltyPerMonth
    };
  }

  /**
   * Get validation configuration including required sections
   * 
   * Requirements: 6.5
   */
  async getValidationConfig(): Promise<ValidationConfig> {
    const config = await this.loadConfig();
    
    if (config.validation?.requiredSections) {
      // Merge with defaults, config takes precedence
      return {
        requiredSections: {
          ...DEFAULT_VALIDATION_CONFIG.requiredSections,
          ...config.validation.requiredSections
        }
      };
    }
    
    return DEFAULT_VALIDATION_CONFIG;
  }

  /**
   * Get required sections for a specific artifact type
   * 
   * Requirements: 6.5
   */
  async getRequiredSections(artifactType: ArtifactType): Promise<string[]> {
    const validationConfig = await this.getValidationConfig();
    return validationConfig.requiredSections[artifactType] || [];
  }

  /**
   * Get compliance configuration
   */
  async getComplianceConfig(): Promise<ComplianceConfig> {
    const config = await this.loadConfig();
    const complianceConfig = config.compliance;
    
    return {
      requiredApprovals: complianceConfig?.requiredApprovals ?? DEFAULT_COMPLIANCE_CONFIG.requiredApprovals,
      frameworks: complianceConfig?.frameworks ?? DEFAULT_COMPLIANCE_CONFIG.frameworks
    };
  }

  /**
   * Get the health threshold value
   * 
   * Requirements: 6.3
   */
  async getHealthThreshold(): Promise<number> {
    const healthConfig = await this.getHealthConfig();
    return healthConfig.threshold;
  }

  /**
   * Get the staleness threshold in days
   * 
   * Requirements: 6.4
   */
  async getStalenessThresholdDays(): Promise<number> {
    const healthConfig = await this.getHealthConfig();
    return healthConfig.stalenessThresholdDays;
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: ArchConfig): Promise<void> {
    const content = yaml.stringify(config);
    await fs.writeFile(this.configPath, content, 'utf-8');
    this.cachedConfig = config;
  }

  /**
   * Update specific configuration values
   */
  async updateConfig(updates: Partial<ArchConfig>): Promise<void> {
    const currentConfig = await this.loadConfig();
    const newConfig = { ...currentConfig, ...updates };
    await this.saveConfig(newConfig);
  }
}


/**
 * Validates that an artifact has all required sections filled
 * 
 * @param artifact - The artifact to validate
 * @returns Array of missing section names
 */
export async function validateRequiredSections(
  configService: ConfigService,
  artifact: { type: ArtifactType; [key: string]: unknown }
): Promise<string[]> {
  const requiredSections = await configService.getRequiredSections(artifact.type);
  const missingSections: string[] = [];

  for (const section of requiredSections) {
    const value = artifact[section];
    
    // Check if the section is missing or empty
    if (value === undefined || value === null) {
      missingSections.push(section);
    } else if (typeof value === 'string' && value.trim() === '') {
      missingSections.push(section);
    } else if (Array.isArray(value) && value.length === 0) {
      missingSections.push(section);
    }
  }

  return missingSections;
}
