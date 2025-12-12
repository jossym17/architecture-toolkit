/**
 * Drift Detection Service
 * 
 * Scans codebase for patterns that contradict documented
 * architecture decisions (ADRs).
 */

/**
 * Options for drift detection
 */
export interface DriftOptions {
  adrIds?: string[];
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
 * Drift Detection Service Interface
 */
export interface IDriftDetectionService {
  detectDrift(options?: DriftOptions): Promise<DriftReport>;
  watchForDrift(callback: (drift: DriftReport) => void): void;
  stopWatching(): void;
}

/**
 * Drift Detection Service Implementation
 */
export class DriftDetectionService implements IDriftDetectionService {
  private watcher: unknown = null;

  async detectDrift(_options?: DriftOptions): Promise<DriftReport> {
    // Placeholder implementation - will be fully implemented in task 18
    return {
      violations: [],
      suggestions: []
    };
  }

  watchForDrift(_callback: (drift: DriftReport) => void): void {
    // Placeholder implementation - will be fully implemented in task 18
  }

  stopWatching(): void {
    // Placeholder implementation - will be fully implemented in task 18
    this.watcher = null;
  }
}
