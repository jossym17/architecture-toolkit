// Health Check Service - Identify stale, orphaned, or problematic artifacts

import { Artifact } from '../../models/artifact.js';
import { FileStore } from '../storage/file-store.js';

/**
 * Health issue severity
 */
export type HealthSeverity = 'error' | 'warning' | 'info';

/**
 * Health issue types
 */
export type HealthIssueType = 
  | 'stale'
  | 'orphaned'
  | 'broken-reference'
  | 'missing-owner'
  | 'no-tags'
  | 'draft-too-long'
  | 'circular-dependency'
  | 'superseded-active'
  | 'missing-content';

/**
 * Health issue
 */
export interface HealthIssue {
  type: HealthIssueType;
  severity: HealthSeverity;
  artifactId: string;
  message: string;
  suggestion: string;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Days after which an artifact is considered stale */
  staleDays: number;
  /** Days after which a draft is considered too old */
  draftMaxDays: number;
  /** Minimum required tags */
  minTags: number;
}

/**
 * Health report
 */
export interface HealthReport {
  timestamp: Date;
  totalArtifacts: number;
  healthyArtifacts: number;
  issues: HealthIssue[];
  score: number; // 0-100
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
  byType: Record<string, { total: number; healthy: number; issues: number }>;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  staleDays: 90,
  draftMaxDays: 30,
  minTags: 1
};

/**
 * Health Checker Service
 */
export class HealthChecker {
  private store: FileStore;
  private config: HealthCheckConfig;

  constructor(store: FileStore, config: Partial<HealthCheckConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a complete health check
   */
  async runHealthCheck(): Promise<HealthReport> {
    const artifacts = await this.store.list();
    const issues: HealthIssue[] = [];
    const now = new Date();

    // Build reference map for orphan detection
    const referencedIds = new Set<string>();
    const allIds = new Set(artifacts.map(a => a.id));

    for (const artifact of artifacts) {
      for (const ref of artifact.references) {
        referencedIds.add(ref.targetId);
      }
    }

    // Check each artifact
    for (const artifact of artifacts) {
      // Check for stale artifacts
      const daysSinceUpdate = this.daysBetween(artifact.updatedAt, now);
      if (daysSinceUpdate > this.config.staleDays) {
        issues.push({
          type: 'stale',
          severity: 'warning',
          artifactId: artifact.id,
          message: `Not updated in ${daysSinceUpdate} days`,
          suggestion: 'Review and update or mark as deprecated'
        });
      }

      // Check for drafts that are too old
      if (['draft', 'proposed'].includes(artifact.status)) {
        const daysSinceCreate = this.daysBetween(artifact.createdAt, now);
        if (daysSinceCreate > this.config.draftMaxDays) {
          issues.push({
            type: 'draft-too-long',
            severity: 'warning',
            artifactId: artifact.id,
            message: `Draft for ${daysSinceCreate} days`,
            suggestion: 'Move to review or close if abandoned'
          });
        }
      }

      // Check for broken references
      for (const ref of artifact.references) {
        if (!allIds.has(ref.targetId)) {
          issues.push({
            type: 'broken-reference',
            severity: 'error',
            artifactId: artifact.id,
            message: `References non-existent artifact: ${ref.targetId}`,
            suggestion: 'Remove or fix the broken reference'
          });
        }
      }

      // Check for missing tags
      if (artifact.tags.length < this.config.minTags) {
        issues.push({
          type: 'no-tags',
          severity: 'info',
          artifactId: artifact.id,
          message: 'No tags assigned',
          suggestion: 'Add relevant tags for better discoverability'
        });
      }

      // Check for superseded but still active
      if (artifact.status === 'superseded') {
        const hasSupersedingRef = artifact.references.some(r => r.referenceType === 'supersedes');
        if (!hasSupersedingRef) {
          issues.push({
            type: 'superseded-active',
            severity: 'warning',
            artifactId: artifact.id,
            message: 'Marked as superseded but no superseding artifact linked',
            suggestion: 'Link to the superseding artifact'
          });
        }
      }
    }

    // Check for orphaned artifacts (not referenced by anything and not a root)
    for (const artifact of artifacts) {
      const isReferenced = referencedIds.has(artifact.id);
      const hasReferences = artifact.references.length > 0;
      
      if (!isReferenced && !hasReferences && artifacts.length > 1) {
        issues.push({
          type: 'orphaned',
          severity: 'info',
          artifactId: artifact.id,
          message: 'Not connected to any other artifacts',
          suggestion: 'Consider linking to related artifacts'
        });
      }
    }

    // Check for circular dependencies
    const cycles = await this.detectCircularDependencies(artifacts);
    for (const cycle of cycles) {
      issues.push({
        type: 'circular-dependency',
        severity: 'error',
        artifactId: cycle[0],
        message: `Circular dependency: ${cycle.join(' → ')} → ${cycle[0]}`,
        suggestion: 'Break the circular dependency'
      });
    }

    // Calculate summary
    const summary = {
      errors: issues.filter(i => i.severity === 'error').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length
    };

    // Calculate by type
    const byType: Record<string, { total: number; healthy: number; issues: number }> = {};
    for (const artifact of artifacts) {
      if (!byType[artifact.type]) {
        byType[artifact.type] = { total: 0, healthy: 0, issues: 0 };
      }
      byType[artifact.type].total++;
      
      const artifactIssues = issues.filter(i => i.artifactId === artifact.id);
      if (artifactIssues.length === 0) {
        byType[artifact.type].healthy++;
      } else {
        byType[artifact.type].issues++;
      }
    }

    // Calculate health score
    const artifactsWithIssues = new Set(issues.map(i => i.artifactId)).size;
    const healthyArtifacts = artifacts.length - artifactsWithIssues;
    const score = artifacts.length > 0 
      ? Math.round((healthyArtifacts / artifacts.length) * 100 - (summary.errors * 5) - (summary.warnings * 2))
      : 100;

    return {
      timestamp: now,
      totalArtifacts: artifacts.length,
      healthyArtifacts,
      issues,
      score: Math.max(0, Math.min(100, score)),
      summary,
      byType
    };
  }

  /**
   * Get quick health status
   */
  async getQuickStatus(): Promise<{ status: 'healthy' | 'warning' | 'critical'; score: number; issueCount: number }> {
    const report = await this.runHealthCheck();
    
    let status: 'healthy' | 'warning' | 'critical';
    if (report.summary.errors > 0 || report.score < 50) {
      status = 'critical';
    } else if (report.summary.warnings > 0 || report.score < 80) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    return {
      status,
      score: report.score,
      issueCount: report.issues.length
    };
  }

  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private async detectCircularDependencies(artifacts: Artifact[]): Promise<string[][]> {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const artifactMap = new Map(artifacts.map(a => [a.id, a]));

    const dfs = (id: string, path: string[]): void => {
      if (recursionStack.has(id)) {
        const cycleStart = path.indexOf(id);
        if (cycleStart !== -1) {
          cycles.push(path.slice(cycleStart));
        }
        return;
      }

      if (visited.has(id)) return;

      visited.add(id);
      recursionStack.add(id);
      path.push(id);

      const artifact = artifactMap.get(id);
      if (artifact) {
        for (const ref of artifact.references) {
          dfs(ref.targetId, [...path]);
        }
      }

      recursionStack.delete(id);
    };

    for (const artifact of artifacts) {
      if (!visited.has(artifact.id)) {
        dfs(artifact.id, []);
      }
    }

    return cycles;
  }
}
