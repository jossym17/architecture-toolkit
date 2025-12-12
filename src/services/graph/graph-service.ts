/**
 * Graph Service
 * 
 * Generates dependency graph visualizations in Mermaid
 * and DOT formats with artifact type coloring and status styling.
 */

import type { ArtifactType, ArtifactStatus } from '../../models/types.js';
import { FileStore } from '../storage/file-store.js';
import { LinkService } from '../link/link-service.js';

/**
 * Graph output format options
 */
export type GraphFormat = 'mermaid' | 'dot';

/**
 * Options for graph generation
 */
export interface GraphOptions {
  format: GraphFormat;
  rootId?: string;
  includeTypes?: ArtifactType[];
}

/**
 * Represents a circular dependency in the graph
 */
export interface CircularDependency {
  cycle: string[];
  severity: 'warning' | 'critical';
}

/**
 * Internal representation of a graph node
 */
interface GraphNode {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
}

/**
 * Internal representation of a graph edge
 */
interface GraphEdge {
  sourceId: string;
  targetId: string;
  type: string;
}

/**
 * Color mapping for artifact types (DOT)
 */
const DOT_TYPE_COLORS: Record<ArtifactType, string> = {
  rfc: 'blue',
  adr: 'green',
  decomposition: 'orange'
};

/**
 * Status to style mapping for DOT
 */
const DOT_STATUS_STYLES: Record<string, string> = {
  draft: 'style=dashed',
  proposed: 'style=dashed',
  review: 'style=dashed',
  approved: 'style=solid',
  accepted: 'style=solid',
  implemented: 'style=solid',
  rejected: 'style=filled, fillcolor=gray',
  deprecated: 'style=filled, fillcolor=gray',
  superseded: 'style=filled, fillcolor=gray'
};

/**
 * Graph Service Interface
 */
export interface IGraphService {
  generateGraph(options?: GraphOptions): Promise<string>;
  getConnectedArtifacts(rootId: string): Promise<string[]>;
  detectCircularDependencies(): Promise<CircularDependency[]>;
}

/**
 * Graph Service Implementation
 */
export class GraphService implements IGraphService {
  private fileStore: FileStore;
  private linkService: LinkService;

  constructor(fileStore?: FileStore, linkService?: LinkService) {
    this.fileStore = fileStore || new FileStore();
    this.linkService = linkService || new LinkService(this.fileStore);
  }

  /**
   * Generates a graph visualization of all artifacts and their relationships
   * 
   * @param options - Graph generation options
   * @returns Graph output in the specified format (Mermaid or DOT)
   */
  async generateGraph(options?: GraphOptions): Promise<string> {
    const format = options?.format ?? 'mermaid';
    const rootId = options?.rootId;
    const includeTypes = options?.includeTypes;

    // Get all artifacts
    let artifacts = await this.fileStore.list();

    // Filter by types if specified
    if (includeTypes && includeTypes.length > 0) {
      artifacts = artifacts.filter(a => includeTypes.includes(a.type));
    }

    // If rootId is specified, get only connected artifacts
    let artifactIds: Set<string>;
    if (rootId) {
      const connectedIds = await this.getConnectedArtifacts(rootId);
      artifactIds = new Set([rootId, ...connectedIds]);
      artifacts = artifacts.filter(a => artifactIds.has(a.id));
    } else {
      artifactIds = new Set(artifacts.map(a => a.id));
    }

    // Build nodes and edges
    const nodes: GraphNode[] = artifacts.map(a => ({
      id: a.id,
      title: a.title,
      type: a.type,
      status: a.status
    }));

    const edges: GraphEdge[] = [];
    const seenEdges = new Set<string>();

    for (const artifact of artifacts) {
      const links = await this.linkService.getLinks(artifact.id);
      
      // Add outgoing edges
      for (const link of links.outgoing) {
        if (artifactIds.has(link.targetId)) {
          const edgeKey = `${link.sourceId}->${link.targetId}`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            edges.push({
              sourceId: link.sourceId,
              targetId: link.targetId,
              type: link.type
            });
          }
        }
      }
    }

    // Generate output in the specified format
    if (format === 'mermaid') {
      return this.generateMermaidGraph(nodes, edges);
    } else {
      return this.generateDotGraph(nodes, edges);
    }
  }

  /**
   * Generates Mermaid flowchart syntax
   */
  private generateMermaidGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
    const lines: string[] = ['graph TB'];

    // Add style definitions
    lines.push('');
    lines.push('%% Style definitions');
    lines.push('classDef rfc fill:#3498db,stroke:#2980b9,color:#fff');
    lines.push('classDef adr fill:#27ae60,stroke:#229954,color:#fff');
    lines.push('classDef decomposition fill:#e67e22,stroke:#d35400,color:#fff');
    lines.push('classDef draft stroke-dasharray: 5 5');
    lines.push('classDef proposed stroke-dasharray: 5 5');
    lines.push('classDef deprecated fill:#95a5a6,stroke:#7f8c8d');
    lines.push('classDef superseded fill:#95a5a6,stroke:#7f8c8d');
    lines.push('classDef rejected fill:#95a5a6,stroke:#7f8c8d');
    lines.push('');

    // Add nodes
    lines.push('%% Nodes');
    for (const node of nodes) {
      const safeTitle = this.escapeMermaidText(node.title);
      const nodeId = this.sanitizeNodeId(node.id);
      lines.push(`${nodeId}["${node.id}: ${safeTitle}"]`);
    }
    lines.push('');

    // Add edges
    if (edges.length > 0) {
      lines.push('%% Edges');
      for (const edge of edges) {
        const sourceId = this.sanitizeNodeId(edge.sourceId);
        const targetId = this.sanitizeNodeId(edge.targetId);
        const label = edge.type;
        lines.push(`${sourceId} -->|${label}| ${targetId}`);
      }
      lines.push('');
    }

    // Apply classes to nodes
    lines.push('%% Apply styles');
    for (const node of nodes) {
      const nodeId = this.sanitizeNodeId(node.id);
      // Apply type class
      lines.push(`class ${nodeId} ${node.type}`);
      // Apply status class if it has special styling
      if (['draft', 'proposed', 'deprecated', 'superseded', 'rejected'].includes(node.status)) {
        lines.push(`class ${nodeId} ${node.status}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generates Graphviz DOT syntax
   */
  private generateDotGraph(nodes: GraphNode[], edges: GraphEdge[]): string {
    const lines: string[] = ['digraph G {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box];');
    lines.push('');

    // Add nodes with styling
    for (const node of nodes) {
      const safeTitle = this.escapeDotText(node.title);
      const nodeId = this.sanitizeNodeId(node.id);
      const color = DOT_TYPE_COLORS[node.type];
      const statusStyle = DOT_STATUS_STYLES[node.status] || 'style=solid';
      
      lines.push(`  ${nodeId} [label="${node.id}\\n${safeTitle}", color=${color}, ${statusStyle}];`);
    }
    lines.push('');

    // Add edges
    if (edges.length > 0) {
      for (const edge of edges) {
        const sourceId = this.sanitizeNodeId(edge.sourceId);
        const targetId = this.sanitizeNodeId(edge.targetId);
        lines.push(`  ${sourceId} -> ${targetId} [label="${edge.type}"];`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Gets all artifacts connected to a root artifact (traverses the graph)
   * 
   * @param rootId - The root artifact ID to start traversal from
   * @returns Array of connected artifact IDs
   */
  async getConnectedArtifacts(rootId: string): Promise<string[]> {
    const visited = new Set<string>();
    const queue: string[] = [rootId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      // Get links for current artifact
      const links = await this.linkService.getLinks(currentId);

      // Add all connected artifacts to queue
      for (const link of links.outgoing) {
        if (!visited.has(link.targetId)) {
          queue.push(link.targetId);
        }
      }
      for (const link of links.incoming) {
        if (!visited.has(link.sourceId)) {
          queue.push(link.sourceId);
        }
      }
    }

    // Remove the root from the result
    visited.delete(rootId);
    return Array.from(visited);
  }

  /**
   * Detects circular dependencies in the artifact graph using DFS
   * 
   * @returns Array of detected circular dependencies
   */
  async detectCircularDependencies(): Promise<CircularDependency[]> {
    const artifacts = await this.fileStore.list();
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    // Build adjacency list for directed graph (outgoing links only)
    const adjacencyList = new Map<string, string[]>();
    for (const artifact of artifacts) {
      const links = await this.linkService.getLinks(artifact.id);
      adjacencyList.set(
        artifact.id,
        links.outgoing.map(l => l.targetId)
      );
    }

    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle - extract it from the path
          const cycleStartIndex = path.indexOf(neighbor);
          if (cycleStartIndex !== -1) {
            const cycle = [...path.slice(cycleStartIndex), neighbor];
            
            // Check if this cycle is already recorded (cycles can be found multiple times)
            const cycleKey = [...cycle].sort().join(',');
            const isDuplicate = cycles.some(c => 
              [...c.cycle].sort().join(',') === cycleKey
            );
            
            if (!isDuplicate) {
              cycles.push({
                cycle,
                severity: cycle.length > 3 ? 'critical' : 'warning'
              });
            }
          }
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
    };

    // Run DFS from each unvisited node
    for (const artifact of artifacts) {
      if (!visited.has(artifact.id)) {
        dfs(artifact.id);
      }
    }

    return cycles;
  }

  /**
   * Sanitizes a node ID for use in graph syntax
   */
  private sanitizeNodeId(id: string): string {
    return id.replace(/-/g, '_');
  }

  /**
   * Escapes text for Mermaid syntax
   */
  private escapeMermaidText(text: string): string {
    return text
      .replace(/"/g, "'")
      .replace(/\[/g, '(')
      .replace(/\]/g, ')')
      .replace(/\n/g, ' ');
  }

  /**
   * Escapes text for DOT syntax
   */
  private escapeDotText(text: string): string {
    return text
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }
}
