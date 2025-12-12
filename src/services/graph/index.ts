/**
 * Graph Service Module
 * 
 * Provides dependency graph visualization capabilities
 * with Mermaid and DOT format output.
 * 
 * @module services/graph
 */

export {
  GraphService,
  type IGraphService,
  type GraphFormat,
  type GraphOptions,
  type CircularDependency
} from './graph-service.js';
