// Impact Analysis Service - Analyze what's affected when changing an artifact

import { Artifact } from '../../models/artifact.js';
import { FileStore } from '../storage/file-store.js';

/**
 * Impact severity levels
 */
export type ImpactSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Impact analysis result for a single artifact
 */
export interface ImpactItem {
  artifact: Artifact;
  relationship: 'depends-on' | 'depended-by' | 'related' | 'supersedes' | 'superseded-by';
  severity: ImpactSeverity;
  reason: string;
}

/**
 * Complete impact analysis result
 */
export interface ImpactAnalysis {
  sourceArtifact: Artifact;
  directImpacts: ImpactItem[];
  transitiveImpacts: ImpactItem[];
  totalAffected: number;
  riskScore: number;
  recommendations: string[];
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  id: string;
  type: string;
  title: string;
  status: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
}

/**
 * Dependency graph
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  roots: string[];
  leaves: string[];
  cycles: string[][];
}

/**
 * Impact Analyzer Service
 */
export class ImpactAnalyzer {
  private store: FileStore;

  constructor(store: FileStore) {
    this.store = store;
  }

  /**
   * Analyze the impact of changing an artifact
   */
  async analyzeImpact(artifactId: string): Promise<ImpactAnalysis> {
    const artifact = await this.store.load(artifactId);
    if (!artifact) {
      throw new Error(`Artifact not found: ${artifactId}`);
    }

    const allArtifacts = await this.store.list();
    const directImpacts: ImpactItem[] = [];
    const transitiveImpacts: ImpactItem[] = [];
    const visited = new Set<string>([artifactId]);

    // Find direct dependencies (what this artifact depends on)
    for (const ref of artifact.references) {
      const target = allArtifacts.find(a => a.id === ref.targetId);
      if (target) {
        directImpacts.push({
          artifact: target,
          relationship: 'depends-on',
          severity: this.calculateSeverity(artifact, target),
          reason: `${artifact.id} directly references ${target.id}`
        });
      }
    }

    // Find dependents (what depends on this artifact)
    for (const other of allArtifacts) {
      if (other.id === artifactId) continue;
      
      const hasReference = other.references.some(r => r.targetId === artifactId);
      if (hasReference) {
        directImpacts.push({
          artifact: other,
          relationship: 'depended-by',
          severity: this.calculateSeverity(other, artifact),
          reason: `${other.id} depends on ${artifact.id}`
        });
        visited.add(other.id);

        // Find transitive dependents
        await this.findTransitiveDependents(other.id, allArtifacts, transitiveImpacts, visited);
      }
    }

    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(directImpacts, transitiveImpacts);

    // Generate recommendations
    const recommendations = this.generateRecommendations(artifact, directImpacts, transitiveImpacts, riskScore);

    return {
      sourceArtifact: artifact,
      directImpacts,
      transitiveImpacts,
      totalAffected: directImpacts.length + transitiveImpacts.length,
      riskScore,
      recommendations
    };
  }

  /**
   * Build a complete dependency graph
   */
  async buildDependencyGraph(): Promise<DependencyGraph> {
    const allArtifacts = await this.store.list();
    const nodes = new Map<string, DependencyNode>();

    // Initialize nodes
    for (const artifact of allArtifacts) {
      nodes.set(artifact.id, {
        id: artifact.id,
        type: artifact.type,
        title: artifact.title,
        status: artifact.status,
        dependencies: artifact.references.map(r => r.targetId),
        dependents: [],
        depth: 0
      });
    }

    // Build reverse dependencies
    for (const artifact of allArtifacts) {
      for (const ref of artifact.references) {
        const targetNode = nodes.get(ref.targetId);
        if (targetNode) {
          targetNode.dependents.push(artifact.id);
        }
      }
    }

    // Find roots (no dependencies) and leaves (no dependents)
    const roots: string[] = [];
    const leaves: string[] = [];

    for (const [id, node] of nodes) {
      if (node.dependencies.length === 0) roots.push(id);
      if (node.dependents.length === 0) leaves.push(id);
    }

    // Calculate depths
    this.calculateDepths(nodes, roots);

    // Detect cycles
    const cycles = this.detectCycles(nodes);

    return { nodes, roots, leaves, cycles };
  }

  /**
   * Find artifacts that would be orphaned if this artifact is deleted
   */
  async findOrphans(artifactId: string): Promise<Artifact[]> {
    const allArtifacts = await this.store.list();
    const orphans: Artifact[] = [];

    for (const artifact of allArtifacts) {
      if (artifact.id === artifactId) continue;

      // Check if this artifact only depends on the target
      const dependencies = artifact.references.map(r => r.targetId);
      if (dependencies.length === 1 && dependencies[0] === artifactId) {
        orphans.push(artifact);
      }
    }

    return orphans;
  }

  private async findTransitiveDependents(
    artifactId: string,
    allArtifacts: Artifact[],
    transitiveImpacts: ImpactItem[],
    visited: Set<string>
  ): Promise<void> {
    for (const other of allArtifacts) {
      if (visited.has(other.id)) continue;

      const hasReference = other.references.some(r => r.targetId === artifactId);
      if (hasReference) {
        transitiveImpacts.push({
          artifact: other,
          relationship: 'depended-by',
          severity: 'low',
          reason: `Transitively affected through ${artifactId}`
        });
        visited.add(other.id);

        await this.findTransitiveDependents(other.id, allArtifacts, transitiveImpacts, visited);
      }
    }
  }

  private calculateSeverity(source: Artifact, target: Artifact): ImpactSeverity {
    // Critical: Approved/Implemented artifacts depending on draft
    if (['approved', 'implemented', 'accepted'].includes(source.status) && 
        ['draft', 'proposed'].includes(target.status)) {
      return 'critical';
    }

    // High: Same type dependencies
    if (source.type === target.type) {
      return 'high';
    }

    // Medium: Cross-type dependencies
    if (source.type !== target.type) {
      return 'medium';
    }

    return 'low';
  }

  private calculateRiskScore(direct: ImpactItem[], transitive: ImpactItem[]): number {
    let score = 0;

    for (const impact of direct) {
      switch (impact.severity) {
        case 'critical': score += 25; break;
        case 'high': score += 15; break;
        case 'medium': score += 10; break;
        case 'low': score += 5; break;
      }
    }

    // Transitive impacts have lower weight
    score += transitive.length * 2;

    return Math.min(100, score);
  }

  private generateRecommendations(
    artifact: Artifact,
    direct: ImpactItem[],
    transitive: ImpactItem[],
    riskScore: number
  ): string[] {
    const recommendations: string[] = [];

    if (riskScore >= 75) {
      recommendations.push('HIGH RISK: Consider creating a new version instead of modifying');
      recommendations.push('Schedule a review meeting with all stakeholders');
    }

    if (riskScore >= 50) {
      recommendations.push('Notify owners of dependent artifacts before making changes');
    }

    const criticalImpacts = direct.filter(i => i.severity === 'critical');
    if (criticalImpacts.length > 0) {
      recommendations.push(`Review ${criticalImpacts.length} critical dependencies before proceeding`);
    }

    if (transitive.length > 5) {
      recommendations.push('Consider breaking down changes into smaller increments');
    }

    if (artifact.status === 'approved' || artifact.status === 'accepted') {
      recommendations.push('Document the reason for changing an approved artifact');
    }

    if (recommendations.length === 0) {
      recommendations.push('Low risk change - proceed with standard review process');
    }

    return recommendations;
  }

  private calculateDepths(nodes: Map<string, DependencyNode>, roots: string[]): void {
    const queue = roots.map(id => ({ id, depth: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = nodes.get(id);
      if (node) {
        node.depth = Math.max(node.depth, depth);
        for (const depId of node.dependents) {
          queue.push({ id: depId, depth: depth + 1 });
        }
      }
    }
  }

  private detectCycles(nodes: Map<string, DependencyNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (id: string, path: string[]): void => {
      if (recursionStack.has(id)) {
        const cycleStart = path.indexOf(id);
        cycles.push(path.slice(cycleStart));
        return;
      }

      if (visited.has(id)) return;

      visited.add(id);
      recursionStack.add(id);
      path.push(id);

      const node = nodes.get(id);
      if (node) {
        for (const depId of node.dependencies) {
          dfs(depId, [...path]);
        }
      }

      recursionStack.delete(id);
    };

    for (const id of nodes.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return cycles;
  }
}
