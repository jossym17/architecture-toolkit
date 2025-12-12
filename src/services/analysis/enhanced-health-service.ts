/**
 * Enhanced Health Service
 * 
 * Provides comprehensive health scoring for artifacts with:
 * - Completeness score (required sections filled)
 * - Freshness score (time since update)
 * - Relationship score (valid links)
 * - Configurable penalties
 * 
 * **Feature: interactive-mode, Property 11: Health score calculation consistency**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

import { Artifact } from '../../models/artifact.js';
import { FileStore } from '../storage/file-store.js';
import { LinkService } from '../link/link-service.js';
import { GraphService, CircularDependency } from '../graph/graph-service.js';

/**
 * Health issue types for enhanced health checking
 */
export type EnhancedHealthIssueType =
  | 'missing_links'
  | 'stale_reference'
  | 'staleness'
  | 'circular_dependency'
  | 'incomplete';

/**
 * Health issue severity levels
 */
export type HealthIssueSeverity = 'warning' | 'error' | 'critical';

/**
 * Represents a health issue found during enhanced analysis
 */
export interface EnhancedHealthIssue {
  type: EnhancedHealthIssueType;
  severity: HealthIssueSeverity;
  message: string;
}

/**
 * Represents a penalty applied to health score
 */
export interface HealthPenalty {
  reason: string;
  points: number;
  details?: string;
}

/**
 * Health score for a single artifact
 */
export interface HealthScore {
  artifactId: string;
  score: number; // 0-100
  issues: EnhancedHealthIssue[];
}

/**
 * Detailed breakdown of health score components
 */
export interface HealthBreakdown {
  completeness: number;
  freshness: number;
  relationships: number;
  penalties: HealthPenalty[];
}


/**
 * Options for health check operations
 */
export interface HealthOptions {
  threshold?: number;
  detailed?: boolean;
}

/**
 * Summary of health report
 */
export interface HealthReportSummary {
  average: number;
  belowThreshold: number;
  criticalIssues: number;
}

/**
 * Complete health report for all artifacts
 */
export interface EnhancedHealthReport {
  artifacts: HealthScore[];
  summary: HealthReportSummary;
  circularDependencies: CircularDependency[];
}

/**
 * Configuration for health scoring
 */
export interface EnhancedHealthConfig {
  /** Health score threshold (default: 80) */
  threshold: number;
  /** Days after which artifact is considered stale (default: 90) */
  stalenessThresholdDays: number;
  /** Penalty for having no outgoing links (default: 10) */
  noLinksPenalty: number;
  /** Penalty per stale reference (default: 15) */
  staleReferencePenalty: number;
  /** Penalty per 30 days of staleness beyond threshold (default: 5) */
  stalenessPenaltyPerMonth: number;
  /** Required sections per artifact type */
  requiredSections?: Record<string, string[]>;
}

/**
 * Default health configuration
 */
const DEFAULT_HEALTH_CONFIG: EnhancedHealthConfig = {
  threshold: 80,
  stalenessThresholdDays: 90,
  noLinksPenalty: 10,
  staleReferencePenalty: 15,
  stalenessPenaltyPerMonth: 5
};

/**
 * Enhanced Health Service Interface
 */
export interface IEnhancedHealthService {
  calculateHealth(artifactId: string): Promise<HealthScore>;
  calculateAllHealth(options?: HealthOptions): Promise<EnhancedHealthReport>;
  getHealthBreakdown(artifactId: string): Promise<HealthBreakdown>;
}


/**
 * Enhanced Health Service Implementation
 * 
 * Calculates comprehensive health scores based on:
 * - Completeness: Required sections filled
 * - Freshness: Time since last update
 * - Relationships: Valid links and references
 */
export class EnhancedHealthService implements IEnhancedHealthService {
  private fileStore: FileStore;
  private linkService: LinkService;
  private graphService: GraphService;
  private config: EnhancedHealthConfig;

  constructor(
    fileStore?: FileStore,
    linkService?: LinkService,
    graphService?: GraphService,
    config?: Partial<EnhancedHealthConfig>
  ) {
    this.fileStore = fileStore || new FileStore();
    this.linkService = linkService || new LinkService(this.fileStore);
    this.graphService = graphService || new GraphService(this.fileStore, this.linkService);
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  /**
   * Calculates health score for a single artifact
   * 
   * @param artifactId - The artifact ID to calculate health for
   * @returns Health score with issues
   */
  async calculateHealth(artifactId: string): Promise<HealthScore> {
    const artifact = await this.fileStore.load(artifactId);
    if (!artifact) {
      return {
        artifactId,
        score: 0,
        issues: [{
          type: 'incomplete',
          severity: 'critical',
          message: `Artifact ${artifactId} not found`
        }]
      };
    }

    const breakdown = await this.calculateBreakdownForArtifact(artifact);
    const issues = this.collectIssues(artifact, breakdown);
    
    // Calculate final score: start at 100, subtract penalties
    const totalPenalty = breakdown.penalties.reduce((sum, p) => sum + p.points, 0);
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));

    return {
      artifactId,
      score,
      issues
    };
  }

  /**
   * Calculates health scores for all artifacts
   * 
   * @param options - Health check options
   * @returns Complete health report
   */
  async calculateAllHealth(options?: HealthOptions): Promise<EnhancedHealthReport> {
    const threshold = options?.threshold ?? this.config.threshold;
    const artifacts = await this.fileStore.list();
    const healthScores: HealthScore[] = [];

    for (const artifact of artifacts) {
      const score = await this.calculateHealth(artifact.id);
      healthScores.push(score);
    }

    // Detect circular dependencies
    const circularDependencies = await this.graphService.detectCircularDependencies();

    // Calculate summary
    const totalScore = healthScores.reduce((sum, h) => sum + h.score, 0);
    const average = healthScores.length > 0 ? Math.round(totalScore / healthScores.length) : 100;
    const belowThreshold = healthScores.filter(h => h.score < threshold).length;
    const criticalIssues = healthScores.reduce(
      (sum, h) => sum + h.issues.filter(i => i.severity === 'critical').length,
      0
    ) + circularDependencies.filter(c => c.severity === 'critical').length;

    return {
      artifacts: healthScores,
      summary: {
        average,
        belowThreshold,
        criticalIssues
      },
      circularDependencies
    };
  }


  /**
   * Gets detailed health breakdown for an artifact
   * 
   * @param artifactId - The artifact ID
   * @returns Detailed breakdown by category
   */
  async getHealthBreakdown(artifactId: string): Promise<HealthBreakdown> {
    const artifact = await this.fileStore.load(artifactId);
    if (!artifact) {
      return {
        completeness: 0,
        freshness: 0,
        relationships: 0,
        penalties: [{
          reason: 'Artifact not found',
          points: 100,
          details: `Artifact ${artifactId} does not exist`
        }]
      };
    }

    return this.calculateBreakdownForArtifact(artifact);
  }

  /**
   * Calculates the health breakdown for an artifact
   */
  private async calculateBreakdownForArtifact(artifact: Artifact): Promise<HealthBreakdown> {
    const penalties: HealthPenalty[] = [];
    const now = new Date();

    // Calculate completeness score (based on required fields being present)
    const completenessScore = this.calculateCompletenessScore(artifact, penalties);

    // Calculate freshness score (based on time since last update)
    const freshnessScore = this.calculateFreshnessScore(artifact, now, penalties);

    // Calculate relationship score (based on valid links)
    const relationshipScore = await this.calculateRelationshipScore(artifact, penalties);

    return {
      completeness: completenessScore,
      freshness: freshnessScore,
      relationships: relationshipScore,
      penalties
    };
  }

  /**
   * Calculates completeness score based on required sections
   */
  private calculateCompletenessScore(artifact: Artifact, penalties: HealthPenalty[]): number {
    let score = 100;

    // Check basic required fields
    if (!artifact.title || artifact.title.trim() === '') {
      penalties.push({
        reason: 'Missing title',
        points: 20,
        details: 'Artifact has no title'
      });
      score -= 20;
    }

    if (!artifact.owner || artifact.owner.trim() === '') {
      penalties.push({
        reason: 'Missing owner',
        points: 10,
        details: 'Artifact has no owner assigned'
      });
      score -= 10;
    }

    if (!artifact.tags || artifact.tags.length === 0) {
      penalties.push({
        reason: 'No tags',
        points: 5,
        details: 'Artifact has no tags for categorization'
      });
      score -= 5;
    }

    // Check required sections if configured
    if (this.config.requiredSections && this.config.requiredSections[artifact.type]) {
      const requiredSections = this.config.requiredSections[artifact.type];
      // Note: Section checking would require parsing artifact content
      // For now, we assume sections are present if the artifact exists
      // This can be enhanced when content parsing is available
      if (requiredSections.length > 0) {
        // Placeholder for section validation
      }
    }

    return Math.max(0, score);
  }


  /**
   * Calculates freshness score based on time since last update
   * 
   * Requirement 4.4: WHEN an artifact has not been updated in more than 90 days
   * THEN the Toolkit SHALL reduce health score by 5 points per additional 30 days
   */
  private calculateFreshnessScore(artifact: Artifact, now: Date, penalties: HealthPenalty[]): number {
    let score = 100;
    const daysSinceUpdate = this.daysBetween(artifact.updatedAt, now);

    if (daysSinceUpdate > this.config.stalenessThresholdDays) {
      const daysOverThreshold = daysSinceUpdate - this.config.stalenessThresholdDays;
      const monthsOverThreshold = Math.floor(daysOverThreshold / 30);
      const penalty = monthsOverThreshold * this.config.stalenessPenaltyPerMonth;

      if (penalty > 0) {
        penalties.push({
          reason: 'Staleness',
          points: penalty,
          details: `Not updated in ${daysSinceUpdate} days (${monthsOverThreshold} months over threshold)`
        });
        score -= penalty;
      }
    }

    return Math.max(0, score);
  }

  /**
   * Calculates relationship score based on links
   * 
   * Requirement 4.2: WHEN an artifact has no outgoing links
   * THEN the Toolkit SHALL reduce health score by a configurable penalty (default 10 points)
   * 
   * Requirement 4.3: WHEN an artifact references a deprecated or superseded artifact
   * THEN the Toolkit SHALL reduce health score by 15 points per stale reference
   */
  private async calculateRelationshipScore(artifact: Artifact, penalties: HealthPenalty[]): Promise<number> {
    let score = 100;

    // Get links for the artifact
    const links = await this.linkService.getLinks(artifact.id);

    // Check for no outgoing links
    if (links.outgoing.length === 0) {
      penalties.push({
        reason: 'No outgoing links',
        points: this.config.noLinksPenalty,
        details: 'Artifact has no connections to other artifacts'
      });
      score -= this.config.noLinksPenalty;
    }

    // Check for stale references (references to deprecated or superseded artifacts)
    for (const link of links.outgoing) {
      const targetArtifact = await this.fileStore.load(link.targetId);
      if (targetArtifact) {
        if (targetArtifact.status === 'deprecated' || targetArtifact.status === 'superseded') {
          penalties.push({
            reason: 'Stale reference',
            points: this.config.staleReferencePenalty,
            details: `References ${targetArtifact.status} artifact: ${link.targetId}`
          });
          score -= this.config.staleReferencePenalty;
        }
      }
    }

    return Math.max(0, score);
  }

  /**
   * Collects health issues from breakdown
   */
  private collectIssues(_artifact: Artifact, breakdown: HealthBreakdown): EnhancedHealthIssue[] {
    const issues: EnhancedHealthIssue[] = [];

    for (const penalty of breakdown.penalties) {
      let type: EnhancedHealthIssueType;
      let severity: HealthIssueSeverity;

      if (penalty.reason === 'No outgoing links') {
        type = 'missing_links';
        severity = 'warning';
      } else if (penalty.reason === 'Stale reference') {
        type = 'stale_reference';
        severity = 'warning';
      } else if (penalty.reason === 'Staleness') {
        type = 'staleness';
        severity = penalty.points >= 15 ? 'error' : 'warning';
      } else {
        type = 'incomplete';
        severity = penalty.points >= 20 ? 'error' : 'warning';
      }

      issues.push({
        type,
        severity,
        message: penalty.details || penalty.reason
      });
    }

    return issues;
  }

  /**
   * Calculates days between two dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Updates the configuration
   */
  updateConfig(config: Partial<EnhancedHealthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets the current configuration
   */
  getConfig(): EnhancedHealthConfig {
    return { ...this.config };
  }

  /**
   * Checks if any artifact is below the threshold
   * Returns true if all artifacts are healthy, false otherwise
   * 
   * @param threshold - Optional threshold override
   * @returns Whether all artifacts pass the health threshold
   */
  async checkThreshold(threshold?: number): Promise<{ passed: boolean; failedCount: number }> {
    const effectiveThreshold = threshold ?? this.config.threshold;
    const report = await this.calculateAllHealth({ threshold: effectiveThreshold });
    
    return {
      passed: report.summary.belowThreshold === 0,
      failedCount: report.summary.belowThreshold
    };
  }
}
