/**
 * Property-Based Tests for Configuration Service
 * 
 * Tests the correctness properties defined in the design document
 * for the configuration service functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import { ConfigService, ArchConfig } from './config-service.js';
import { ArtifactType } from '../../models/types.js';

// Test directory for isolated file operations
let testCounter = 0;
function getTestDir(): string {
  return `.arch-test-config-${process.pid}-${++testCounter}`;
}
const TEST_DIR = '.arch-test-config-unit';

describe('ConfigService', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
    await fs.mkdir(TEST_DIR, { recursive: true });
    configService = new ConfigService({ baseDir: TEST_DIR });
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('getDefaults - unit tests', () => {
    it('should return empty defaults when no config file exists', async () => {
      const defaults = await configService.getDefaults();
      expect(defaults).toEqual({});
    });

    it('should return configured owner default', async () => {
      const config: ArchConfig = {
        defaults: {
          owner: 'test-owner'
        }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));
      configService.clearCache();

      const defaults = await configService.getDefaults();
      expect(defaults.owner).toBe('test-owner');
    });

    it('should return configured tags per artifact type', async () => {
      const config: ArchConfig = {
        defaults: {
          tags: {
            rfc: ['architecture', 'proposal'],
            adr: ['decision']
          }
        }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));
      configService.clearCache();

      const defaults = await configService.getDefaults();
      expect(defaults.tags?.rfc).toEqual(['architecture', 'proposal']);
      expect(defaults.tags?.adr).toEqual(['decision']);
    });
  });


  describe('getHealthConfig - unit tests', () => {
    it('should return default health config when no config file exists', async () => {
      const healthConfig = await configService.getHealthConfig();
      
      expect(healthConfig.threshold).toBe(80);
      expect(healthConfig.stalenessThresholdDays).toBe(90);
      expect(healthConfig.noLinksPenalty).toBe(10);
      expect(healthConfig.staleReferencePenalty).toBe(15);
      expect(healthConfig.stalenessPenaltyPerMonth).toBe(5);
    });

    it('should return configured health threshold', async () => {
      const config: ArchConfig = {
        health: {
          threshold: 70
        }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));
      configService.clearCache();

      const healthConfig = await configService.getHealthConfig();
      expect(healthConfig.threshold).toBe(70);
      // Other values should be defaults
      expect(healthConfig.stalenessThresholdDays).toBe(90);
    });

    it('should return configured staleness threshold', async () => {
      const config: ArchConfig = {
        health: {
          stalenessThresholdDays: 60
        }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));
      configService.clearCache();

      const healthConfig = await configService.getHealthConfig();
      expect(healthConfig.stalenessThresholdDays).toBe(60);
    });
  });

  describe('getValidationConfig - unit tests', () => {
    it('should return default validation config when no config file exists', async () => {
      const validationConfig = await configService.getValidationConfig();
      
      expect(validationConfig.requiredSections.rfc).toContain('problemStatement');
      expect(validationConfig.requiredSections.adr).toContain('context');
      expect(validationConfig.requiredSections.decomposition).toContain('rationale');
    });

    it('should return configured required sections', async () => {
      const config: ArchConfig = {
        validation: {
          requiredSections: {
            rfc: ['customSection1', 'customSection2']
          }
        }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));
      configService.clearCache();

      const validationConfig = await configService.getValidationConfig();
      expect(validationConfig.requiredSections.rfc).toEqual(['customSection1', 'customSection2']);
      // Other types should still have defaults
      expect(validationConfig.requiredSections.adr).toContain('context');
    });
  });

  describe('getRequiredSections - unit tests', () => {
    it('should return required sections for specific artifact type', async () => {
      const sections = await configService.getRequiredSections('rfc');
      expect(sections).toContain('problemStatement');
    });

    it('should return empty array for unknown artifact type', async () => {
      const sections = await configService.getRequiredSections('unknown' as ArtifactType);
      expect(sections).toEqual([]);
    });
  });

  describe('caching', () => {
    it('should cache configuration after first load', async () => {
      const config: ArchConfig = {
        defaults: { owner: 'cached-owner' }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(config));

      // First load
      const defaults1 = await configService.getDefaults();
      expect(defaults1.owner).toBe('cached-owner');

      // Modify file
      const newConfig: ArchConfig = {
        defaults: { owner: 'new-owner' }
      };
      await fs.writeFile(`${TEST_DIR}/config.yaml`, yaml.stringify(newConfig));

      // Should still return cached value
      const defaults2 = await configService.getDefaults();
      expect(defaults2.owner).toBe('cached-owner');

      // Clear cache and reload
      configService.clearCache();
      const defaults3 = await configService.getDefaults();
      expect(defaults3.owner).toBe('new-owner');
    });
  });


  /**
   * **Feature: interactive-mode, Property 16: Configuration defaults application**
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
   * 
   * For any configuration with default values, when creating artifacts interactively,
   * the defaults SHALL be used as initial values in prompts.
   */
  describe('Property 16: Configuration defaults application', () => {
    // Arbitraries for generating test data
    const ownerArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/).filter(s => s.length >= 3);
    const tagArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/).filter(s => s.length >= 2);
    const tagsArb = fc.array(tagArb, { minLength: 0, maxLength: 5 });
    const artifactTypeArb = fc.constantFrom<ArtifactType>('rfc', 'adr', 'decomposition');
    const thresholdArb = fc.integer({ min: 0, max: 100 });
    const daysArb = fc.integer({ min: 1, max: 365 });

    it('should return configured owner as default (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          ownerArb,
          async (owner) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create config with owner
              const config: ArchConfig = {
                defaults: { owner }
              };
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: getDefaultOwner should return the configured owner
              const defaultOwner = await testConfigService.getDefaultOwner();
              expect(defaultOwner).toBe(owner);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return configured tags for artifact type (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          tagsArb,
          async (artifactType, tags) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create config with tags for the artifact type
              const config: ArchConfig = {
                defaults: {
                  tags: {
                    [artifactType]: tags
                  }
                }
              };
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: getDefaultTags should return the configured tags
              const defaultTags = await testConfigService.getDefaultTags(artifactType);
              expect(defaultTags).toEqual(tags);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return configured health threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          thresholdArb,
          async (threshold) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create config with health threshold
              const config: ArchConfig = {
                health: { threshold }
              };
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: getHealthThreshold should return the configured threshold
              const configuredThreshold = await testConfigService.getHealthThreshold();
              expect(configuredThreshold).toBe(threshold);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return configured staleness threshold (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysArb,
          async (days) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create config with staleness threshold
              const config: ArchConfig = {
                health: { stalenessThresholdDays: days }
              };
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: getStalenessThresholdDays should return the configured days
              const configuredDays = await testConfigService.getStalenessThresholdDays();
              expect(configuredDays).toBe(days);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return configured required sections (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          fc.array(fc.stringMatching(/^[a-z][a-zA-Z]{2,20}$/), { minLength: 1, maxLength: 5 }),
          async (artifactType, sections) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create config with required sections
              const config: ArchConfig = {
                validation: {
                  requiredSections: {
                    [artifactType]: sections
                  }
                }
              };
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: getRequiredSections should return the configured sections
              const configuredSections = await testConfigService.getRequiredSections(artifactType);
              expect(configuredSections).toEqual(sections);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use defaults when config values are not specified (property test)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate partial config - some values present, some missing
          fc.record({
            hasOwner: fc.boolean(),
            hasThreshold: fc.boolean(),
            hasStaleness: fc.boolean()
          }),
          ownerArb,
          thresholdArb,
          daysArb,
          async ({ hasOwner, hasThreshold, hasStaleness }, owner, threshold, days) => {
            const testDir = getTestDir();
            try {
              await fs.mkdir(testDir, { recursive: true });
              const testConfigService = new ConfigService({ baseDir: testDir });

              // Create partial config
              const config: ArchConfig = {};
              if (hasOwner) {
                config.defaults = { owner };
              }
              if (hasThreshold || hasStaleness) {
                config.health = {};
                if (hasThreshold) config.health.threshold = threshold;
                if (hasStaleness) config.health.stalenessThresholdDays = days;
              }
              await fs.writeFile(`${testDir}/config.yaml`, yaml.stringify(config));

              // Property: Values should be from config if present, defaults otherwise
              const healthConfig = await testConfigService.getHealthConfig();
              
              if (hasThreshold) {
                expect(healthConfig.threshold).toBe(threshold);
              } else {
                expect(healthConfig.threshold).toBe(80); // default
              }
              
              if (hasStaleness) {
                expect(healthConfig.stalenessThresholdDays).toBe(days);
              } else {
                expect(healthConfig.stalenessThresholdDays).toBe(90); // default
              }
              
              // Penalties should always be defaults since we didn't set them
              expect(healthConfig.noLinksPenalty).toBe(10);
              expect(healthConfig.staleReferencePenalty).toBe(15);
              expect(healthConfig.stalenessPenaltyPerMonth).toBe(5);
            } finally {
              try { await fs.rm(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
