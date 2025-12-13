/**
 * Drift Detection Service
 *
 * Scans codebase for patterns that contradict documented
 * architecture decisions (ADRs).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { watch, FSWatcher } from 'chokidar';
import { ADR } from '../../models/adr.js';
import { FileStore } from '../storage/file-store.js';
import { ConfigService } from '../config/config-service.js';

/**
 * Options for drift detection
 */
export interface DriftOptions {
  /** Specific ADR IDs to check (if not provided, checks all ADRs) */
  adrIds?: string[];
  /** Specific paths to scan (if not provided, scans common source directories) */
  paths?: string[];
}

/**
 * Location of code that violates an ADR
 */
export interface CodeLocation {
  file: string;
  line: number;
  snippet: string;
}

/**
 * A single drift violation
 */
export interface DriftViolation {
  adrId: string;
  adrTitle: string;
  constraint: string;
  violations: CodeLocation[];
}

/**
 * Complete drift detection report
 */
export interface DriftReport {
  violations: DriftViolation[];
  suggestions: string[];
}

/**
 * Drift rule configuration from config.yaml
 */
export interface DriftRule {
  /** Pattern to match ADR ID or title */
  adrPattern: string;
  /** Forbidden import patterns */
  forbiddenImports?: string[];
  /** Required patterns that should be present */
  requiredPatterns?: string[];
}

/**
 * Drift Detection Service Interface
 */
export interface IDriftDetectionService {
  detectDrift(options?: DriftOptions): Promise<DriftReport>;
  watchForDrift(callback: (drift: DriftReport) => void): void;
  stopWatching(): void;
}


/**
 * Default source directories to scan for drift
 */
const DEFAULT_SCAN_PATHS = ['src', 'lib', 'app', 'packages'];

/**
 * File extensions to scan for imports/dependencies
 */
const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs'];

/**
 * Drift Detection Service Implementation
 * 
 * Parses ADRs for technology constraints and scans codebase for violations.
 */
export class DriftDetectionService implements IDriftDetectionService {
  private fileStore: FileStore;
  private configService: ConfigService;
  private baseDir: string;
  private watcher: FSWatcher | null = null;
  private watchCallback: ((drift: DriftReport) => void) | null = null;

  constructor(
    fileStore?: FileStore,
    configService?: ConfigService,
    baseDir: string = process.cwd()
  ) {
    this.baseDir = baseDir;
    this.fileStore = fileStore || new FileStore({ baseDir: path.join(baseDir, '.arch') });
    this.configService = configService || new ConfigService({ baseDir: path.join(baseDir, '.arch') });
  }

  /**
   * Detect drift between ADRs and codebase
   * 
   * Requirements: 8.1, 8.2
   */
  async detectDrift(options?: DriftOptions): Promise<DriftReport> {
    const violations: DriftViolation[] = [];
    const suggestions: string[] = [];

    // Get ADRs to check
    const adrs = await this.getADRsToCheck(options?.adrIds);
    if (adrs.length === 0) {
      return { violations, suggestions };
    }

    // Get drift rules from config
    const driftRules = await this.getDriftRules();

    // Get paths to scan
    const scanPaths = options?.paths || await this.getDefaultScanPaths();

    // For each ADR, check for drift
    for (const adr of adrs) {
      const adrViolations = await this.checkADRDrift(adr, driftRules, scanPaths);
      violations.push(...adrViolations);
    }

    // Generate suggestions based on violations
    for (const violation of violations) {
      const suggestion = this.generateSuggestion(violation);
      if (suggestion && !suggestions.includes(suggestion)) {
        suggestions.push(suggestion);
      }
    }

    return { violations, suggestions };
  }

  /**
   * Watch for drift continuously
   * 
   * Requirements: 8.4
   */
  watchForDrift(callback: (drift: DriftReport) => void): void {
    if (this.watcher) {
      this.stopWatching();
    }

    this.watchCallback = callback;
    const scanPaths = DEFAULT_SCAN_PATHS.map(p => path.join(this.baseDir, p));

    // Watch source directories for changes
    this.watcher = watch(scanPaths, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    // Debounce drift checks
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerCheck = async () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(async () => {
        const report = await this.detectDrift();
        if (this.watchCallback && report.violations.length > 0) {
          this.watchCallback(report);
        }
      }, 500);
    };

    this.watcher.on('change', triggerCheck);
    this.watcher.on('add', triggerCheck);
  }

  /**
   * Stop watching for drift
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.watchCallback = null;
  }

  /**
   * Get ADRs to check based on provided IDs or all ADRs
   */
  private async getADRsToCheck(adrIds?: string[]): Promise<ADR[]> {
    const allArtifacts = await this.fileStore.list({ type: 'adr' });
    const adrs = allArtifacts as ADR[];

    if (adrIds && adrIds.length > 0) {
      return adrs.filter(adr => adrIds.includes(adr.id));
    }

    // Only check active ADRs (not deprecated or superseded)
    return adrs.filter(adr => adr.status !== 'deprecated' && adr.status !== 'superseded');
  }

  /**
   * Get drift rules from configuration
   */
  private async getDriftRules(): Promise<DriftRule[]> {
    try {
      const configPath = path.join(this.baseDir, '.arch', 'config.yaml');
      const content = await fs.readFile(configPath, 'utf-8');
      const yaml = await import('yaml');
      const config = yaml.parse(content);
      return config?.drift?.rules || [];
    } catch {
      return [];
    }
  }

  /**
   * Get default scan paths that exist
   */
  private async getDefaultScanPaths(): Promise<string[]> {
    const existingPaths: string[] = [];
    
    for (const scanPath of DEFAULT_SCAN_PATHS) {
      const fullPath = path.join(this.baseDir, scanPath);
      try {
        await fs.access(fullPath);
        existingPaths.push(fullPath);
      } catch {
        // Path doesn't exist, skip
      }
    }

    return existingPaths;
  }


  /**
   * Check a single ADR for drift violations
   */
  private async checkADRDrift(
    adr: ADR,
    driftRules: DriftRule[],
    scanPaths: string[]
  ): Promise<DriftViolation[]> {
    const violations: DriftViolation[] = [];

    // Find matching drift rules for this ADR
    const matchingRules = driftRules.filter(rule => 
      this.matchesADRPattern(adr, rule.adrPattern)
    );

    // Also extract constraints from ADR content
    const extractedConstraints = this.extractConstraintsFromADR(adr);

    // Combine configured rules with extracted constraints
    const allConstraints = [
      ...matchingRules.map(rule => ({
        forbiddenImports: rule.forbiddenImports || [],
        requiredPatterns: rule.requiredPatterns || []
      })),
      ...extractedConstraints
    ];

    if (allConstraints.length === 0) {
      return violations;
    }

    // Scan files for violations
    for (const scanPath of scanPaths) {
      const files = await this.getScannableFiles(scanPath);
      
      for (const file of files) {
        const fileViolations = await this.checkFileForViolations(
          file,
          adr,
          allConstraints
        );
        
        // Merge violations by constraint
        for (const violation of fileViolations) {
          const existing = violations.find(
            v => v.adrId === violation.adrId && v.constraint === violation.constraint
          );
          
          if (existing) {
            existing.violations.push(...violation.violations);
          } else {
            violations.push(violation);
          }
        }
      }
    }

    return violations;
  }

  /**
   * Check if an ADR matches a pattern
   */
  private matchesADRPattern(adr: ADR, pattern: string): boolean {
    const lowerPattern = pattern.toLowerCase();
    return (
      adr.id.toLowerCase().includes(lowerPattern) ||
      adr.title.toLowerCase().includes(lowerPattern)
    );
  }

  /**
   * Extract technology constraints from ADR content
   * 
   * Looks for patterns like:
   * - "use PostgreSQL" -> forbids mysql, mongodb
   * - "must use" / "shall use" patterns
   * - "do not use" / "avoid" patterns
   */
  private extractConstraintsFromADR(adr: ADR): Array<{
    forbiddenImports: string[];
    requiredPatterns: string[];
  }> {
    const constraints: Array<{
      forbiddenImports: string[];
      requiredPatterns: string[];
    }> = [];

    const content = `${adr.decision} ${adr.context}`.toLowerCase();

    // Common technology choice patterns
    const techChoices: Record<string, { alternatives: string[] }> = {
      'postgresql': { alternatives: ['mysql', 'mongodb', 'sqlite', 'mariadb'] },
      'postgres': { alternatives: ['mysql', 'mongodb', 'sqlite', 'mariadb'] },
      'mysql': { alternatives: ['postgresql', 'postgres', 'mongodb', 'sqlite'] },
      'mongodb': { alternatives: ['postgresql', 'postgres', 'mysql', 'sqlite'] },
      'react': { alternatives: ['vue', 'angular', 'svelte'] },
      'vue': { alternatives: ['react', 'angular', 'svelte'] },
      'angular': { alternatives: ['react', 'vue', 'svelte'] },
      'typescript': { alternatives: [] },
      'rest': { alternatives: ['graphql', 'grpc'] },
      'graphql': { alternatives: ['rest'] },
      'kafka': { alternatives: ['rabbitmq', 'activemq', 'sqs'] },
      'rabbitmq': { alternatives: ['kafka', 'activemq', 'sqs'] }
    };

    // Look for "use X" patterns
    for (const [tech, { alternatives }] of Object.entries(techChoices)) {
      const usePatterns = [
        `use ${tech}`,
        `using ${tech}`,
        `chose ${tech}`,
        `chosen ${tech}`,
        `adopt ${tech}`,
        `adopting ${tech}`
      ];

      for (const pattern of usePatterns) {
        if (content.includes(pattern) && alternatives.length > 0) {
          constraints.push({
            forbiddenImports: alternatives,
            requiredPatterns: []
          });
          break;
        }
      }
    }

    // Look for explicit "do not use" patterns
    const avoidPatterns = [
      /do not use (\w+)/gi,
      /avoid (\w+)/gi,
      /don't use (\w+)/gi,
      /shall not use (\w+)/gi,
      /must not use (\w+)/gi
    ];

    for (const pattern of avoidPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          constraints.push({
            forbiddenImports: [match[1].toLowerCase()],
            requiredPatterns: []
          });
        }
      }
    }

    return constraints;
  }

  /**
   * Get all scannable files in a directory recursively
   */
  private async getScannableFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip node_modules, .git, and other common non-source directories
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__'].includes(entry.name)) {
            const subFiles = await this.getScannableFiles(fullPath);
            files.push(...subFiles);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SCANNABLE_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }


  /**
   * Check a single file for violations against constraints
   */
  private async checkFileForViolations(
    filePath: string,
    adr: ADR,
    constraints: Array<{
      forbiddenImports: string[];
      requiredPatterns: string[];
    }>
  ): Promise<DriftViolation[]> {
    const violations: DriftViolation[] = [];

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const constraint of constraints) {
        // Check for forbidden imports
        for (const forbidden of constraint.forbiddenImports) {
          const importViolations = this.findForbiddenImports(
            filePath,
            lines,
            forbidden
          );

          if (importViolations.length > 0) {
            violations.push({
              adrId: adr.id,
              adrTitle: adr.title,
              constraint: `Forbidden import: ${forbidden}`,
              violations: importViolations
            });
          }
        }
      }
    } catch {
      // File can't be read, skip
    }

    return violations;
  }

  /**
   * Find forbidden imports in file content
   */
  private findForbiddenImports(
    filePath: string,
    lines: string[],
    forbidden: string
  ): CodeLocation[] {
    const violations: CodeLocation[] = [];
    const lowerForbidden = forbidden.toLowerCase();

    // Import patterns for different languages
    const importPatterns = [
      // JavaScript/TypeScript
      new RegExp(`import\\s+.*['"\`]${this.escapeRegex(lowerForbidden)}`, 'i'),
      new RegExp(`from\\s+['"\`]${this.escapeRegex(lowerForbidden)}`, 'i'),
      new RegExp(`require\\s*\\(\\s*['"\`]${this.escapeRegex(lowerForbidden)}`, 'i'),
      // Python
      new RegExp(`^\\s*import\\s+${this.escapeRegex(lowerForbidden)}`, 'i'),
      new RegExp(`^\\s*from\\s+${this.escapeRegex(lowerForbidden)}`, 'i'),
      // Java
      new RegExp(`^\\s*import\\s+.*\\.${this.escapeRegex(lowerForbidden)}`, 'i'),
      // Go
      new RegExp(`^\\s*import\\s+["'].*${this.escapeRegex(lowerForbidden)}`, 'i'),
      // General package.json / requirements.txt style
      new RegExp(`["']${this.escapeRegex(lowerForbidden)}["']\\s*:`, 'i')
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();

      for (const pattern of importPatterns) {
        if (pattern.test(lowerLine)) {
          violations.push({
            file: filePath,
            line: i + 1,
            snippet: line.trim().substring(0, 100)
          });
          break; // Only report once per line
        }
      }
    }

    return violations;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate remediation suggestion for a violation
   * 
   * Requirements: 8.5
   */
  private generateSuggestion(violation: DriftViolation): string {
    const { adrId, adrTitle, constraint } = violation;
    
    if (constraint.startsWith('Forbidden import:')) {
      const forbidden = constraint.replace('Forbidden import:', '').trim();
      return `Remove usage of '${forbidden}' to comply with ${adrId} (${adrTitle}). ` +
        `Consider using the technology specified in the ADR instead.`;
    }

    return `Review ${adrId} (${adrTitle}) and update code to comply with: ${constraint}`;
  }

  /**
   * Parse ADRs for technology constraints (public method for testing)
   * 
   * Requirements: 8.1
   */
  parseADRConstraints(adr: ADR): Array<{
    forbiddenImports: string[];
    requiredPatterns: string[];
  }> {
    return this.extractConstraintsFromADR(adr);
  }

  /**
   * Scan a specific file for violations (public method for testing)
   * 
   * Requirements: 8.2
   */
  async scanFileForViolations(
    filePath: string,
    adr: ADR,
    constraints: Array<{
      forbiddenImports: string[];
      requiredPatterns: string[];
    }>
  ): Promise<DriftViolation[]> {
    return this.checkFileForViolations(filePath, adr, constraints);
  }

  /**
   * Format drift report for display
   * 
   * Requirements: 8.3
   */
  formatReport(report: DriftReport): string {
    if (report.violations.length === 0) {
      return 'No architecture drift detected.';
    }

    const lines: string[] = [];
    lines.push(`Architecture Drift Report`);
    lines.push(`${'='.repeat(50)}`);
    lines.push(`Found ${report.violations.length} violation(s)\n`);

    for (const violation of report.violations) {
      lines.push(`ADR: ${violation.adrId} - ${violation.adrTitle}`);
      lines.push(`Constraint: ${violation.constraint}`);
      lines.push(`Locations:`);
      
      for (const loc of violation.violations) {
        lines.push(`  - ${loc.file}:${loc.line}`);
        lines.push(`    ${loc.snippet}`);
      }
      lines.push('');
    }

    if (report.suggestions.length > 0) {
      lines.push(`Remediation Suggestions:`);
      lines.push(`${'-'.repeat(30)}`);
      for (const suggestion of report.suggestions) {
        lines.push(`• ${suggestion}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get a summary of the drift report
   * 
   * Requirements: 8.3
   */
  getSummary(report: DriftReport): {
    totalViolations: number;
    affectedADRs: string[];
    affectedFiles: string[];
  } {
    const affectedADRs = [...new Set(report.violations.map(v => v.adrId))];
    const affectedFiles = [...new Set(
      report.violations.flatMap(v => v.violations.map(loc => loc.file))
    )];

    return {
      totalViolations: report.violations.reduce(
        (sum, v) => sum + v.violations.length,
        0
      ),
      affectedADRs,
      affectedFiles
    };
  }
}
