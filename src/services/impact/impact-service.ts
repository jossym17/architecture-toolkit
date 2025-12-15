/**
 * Impact Analysis Service
 * 
 * Analyzes the impact of changing or deprecating artifacts
 * by traversing dependency graphs and calculating risk scores.
 */

import { FileStore } from '../storage/file-store.js';
import { LinkService } from '../link/link-service.js';
import { Artifact } from '../../models/artifact.js';

/**
 * Impact analysis report
 */
export interface ImpactReport {
  artifactId: string;
  directDependents: string[];
  transitiveDependents: string[];
  riskScore: number;
  maxDepth: number;
}

/**
 * Impact migration task for deprecation
 */
export interface ImpactMigrationTask {
  artifactId: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Impact migration checklist for deprecation
 */
export interface ImpactMigrationChecklist {
  artifactId: string;
  tasks: ImpactMigrationTask[];
}

/**
 * Internal structure for tracking dependent with depth
 */
interface DependentInfo {
  id: string;
  depth: number;
  artifact?: Artifact;
}

/**
 * Criticality weights for artifact types
 */
const TYPE_CRITICALITY: Record<string, number> = {
  rfc: 3,      // RFCs are high-level decisions, high impact
  adr: 2,      // ADRs are important decisions
  decomposition: 1  // Decomposition plans are implementation details
};

/**
 * Status criticality weights
 */
const STATUS_CRITICALITY: Record<string, number> = {
  approved: 3,
  accepted: 3,
  implemented: 3,
  review: 2,
  proposed: 2,
  draft: 1,
  pending: 1,
  deprecated: 0,
  superseded: 0,
  rejected: 0
};

/**
 * Impact Analysis Service Interface
 */
export interface IImpactAnalysisService {
  analyzeImpact(artifactId: string): Promise<ImpactReport>;
  generateDeprecationChecklist(artifactId: string): Promise<ImpactMigrationChecklist>;
  calculateRiskScore(artifactId: string): Promise<number>;
}

/**
 * Impact Analysis Service Implementation
 */
export class ImpactAnalysisService implements IImpactAnalysisService {
  private fileStore: FileStore;
  private linkService: LinkService;

  constructor(fileStore?: FileStore, linkService?: LinkService) {
    this.fileStore = fileStore || new FileStore();
    this.linkService = linkService || new LinkService(this.fileStore);
  }

  /**
   * Analyzes the impact of changing or deprecating an artifact
   * 
   * Traverses the dependency graph to find all artifacts that depend on
   * the specified artifact, classifying them as direct or transitive dependents.
   * 
   * @param artifactId - The artifact ID to analyze
   * @returns Impact report with dependents, risk score, and max depth
   */
  async analyzeImpact(artifactId: string): Promise<ImpactReport> {
    const dependents = await this.traverseDependents(artifactId);
    
    // Separate direct (depth 1) from transitive (depth > 1) dependents
    const directDependents: string[] = [];
    const transitiveDependents: string[] = [];
    let maxDepth = 0;

    for (const dep of dependents) {
      if (dep.depth === 1) {
        directDependents.push(dep.id);
      } else {
        transitiveDependents.push(dep.id);
      }
      maxDepth = Math.max(maxDepth, dep.depth);
    }

    // Calculate risk score based on dependents
    const riskScore = await this.calculateRiskScoreFromDependents(dependents);

    return {
      artifactId,
      directDependents,
      transitiveDependents,
      riskScore,
      maxDepth
    };
  }


  /**
   * Traverses the dependency graph to find all dependents of an artifact
   * Uses BFS to track depth levels
   * 
   * @param artifactId - The artifact ID to find dependents for
   * @returns Array of dependent info with depth
   */
  private async traverseDependents(artifactId: string): Promise<DependentInfo[]> {
    const visited = new Set<string>();
    const dependents: DependentInfo[] = [];
    const queue: Array<{ id: string; depth: number }> = [];

    // Start with the target artifact
    visited.add(artifactId);

    // Get all artifacts that have incoming links TO the target artifact
    // These are the artifacts that depend on the target
    const links = await this.linkService.getLinks(artifactId);
    
    // Incoming links represent artifacts that reference this artifact
    // (i.e., they depend on this artifact)
    for (const link of links.incoming) {
      if (!visited.has(link.sourceId)) {
        visited.add(link.sourceId);
        queue.push({ id: link.sourceId, depth: 1 });
      }
    }

    // BFS to find transitive dependents
    while (queue.length > 0) {
      const current = queue.shift()!;
      
      // Load artifact for criticality calculation
      const artifact = await this.fileStore.load(current.id);
      
      dependents.push({
        id: current.id,
        depth: current.depth,
        artifact: artifact || undefined
      });

      // Find artifacts that depend on this dependent (transitive dependents)
      const dependentLinks = await this.linkService.getLinks(current.id);
      
      for (const link of dependentLinks.incoming) {
        if (!visited.has(link.sourceId)) {
          visited.add(link.sourceId);
          queue.push({ id: link.sourceId, depth: current.depth + 1 });
        }
      }
    }

    return dependents;
  }

  /**
   * Calculates risk score based on dependents
   * 
   * Risk score formula:
   * - Base score: number of direct dependents * 10
   * - Transitive score: number of transitive dependents * 5
   * - Criticality bonus: sum of (type_weight * status_weight) for each dependent
   * - Depth penalty: max_depth * 2
   * 
   * Score is capped at 100
   * 
   * @param dependents - Array of dependent info
   * @returns Risk score (0-100)
   */
  private async calculateRiskScoreFromDependents(dependents: DependentInfo[]): Promise<number> {
    if (dependents.length === 0) {
      return 0;
    }

    let score = 0;
    let maxDepth = 0;

    for (const dep of dependents) {
      // Base score by depth
      if (dep.depth === 1) {
        score += 10; // Direct dependent
      } else {
        score += 5;  // Transitive dependent
      }

      // Criticality bonus
      if (dep.artifact) {
        const typeCriticality = TYPE_CRITICALITY[dep.artifact.type] || 1;
        const statusCriticality = STATUS_CRITICALITY[dep.artifact.status] || 1;
        score += typeCriticality * statusCriticality;
      }

      maxDepth = Math.max(maxDepth, dep.depth);
    }

    // Depth penalty (deeper chains are more risky)
    score += maxDepth * 2;

    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Calculates the risk score for deprecating an artifact
   * 
   * @param artifactId - The artifact ID to calculate risk for
   * @returns Risk score (0-100)
   */
  async calculateRiskScore(artifactId: string): Promise<number> {
    const dependents = await this.traverseDependents(artifactId);
    return this.calculateRiskScoreFromDependents(dependents);
  }

  /**
   * Generates a deprecation checklist for an artifact
   * 
   * Creates migration tasks for each dependent artifact, prioritized by risk.
   * 
   * @param artifactId - The artifact ID to generate checklist for
   * @returns Migration checklist with prioritized tasks
   */
  async generateDeprecationChecklist(artifactId: string): Promise<ImpactMigrationChecklist> {
    const dependents = await this.traverseDependents(artifactId);
    const tasks: ImpactMigrationTask[] = [];

    // Sort dependents by criticality (highest first)
    const sortedDependents = [...dependents].sort((a, b) => {
      const aCriticality = this.getArtifactCriticality(a.artifact);
      const bCriticality = this.getArtifactCriticality(b.artifact);
      return bCriticality - aCriticality;
    });

    for (const dep of sortedDependents) {
      const criticality = this.getArtifactCriticality(dep.artifact);
      const priority = this.getPriorityFromCriticality(criticality);
      
      const action = dep.depth === 1
        ? `Update ${dep.id} to remove direct dependency on ${artifactId}`
        : `Review ${dep.id} for transitive dependency on ${artifactId} (depth: ${dep.depth})`;

      tasks.push({
        artifactId: dep.id,
        action,
        priority
      });
    }

    return {
      artifactId,
      tasks
    };
  }

  /**
   * Gets the criticality score for an artifact
   */
  private getArtifactCriticality(artifact?: Artifact): number {
    if (!artifact) return 1;
    
    const typeCriticality = TYPE_CRITICALITY[artifact.type] || 1;
    const statusCriticality = STATUS_CRITICALITY[artifact.status] || 1;
    
    return typeCriticality * statusCriticality;
  }

  /**
   * Converts criticality score to priority level
   */
  private getPriorityFromCriticality(criticality: number): 'high' | 'medium' | 'low' {
    if (criticality >= 6) return 'high';
    if (criticality >= 3) return 'medium';
    return 'low';
  }
}
