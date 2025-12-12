// Analyze command - Impact analysis and dependency visualization

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { ImpactAnalyzer } from '../../services/analysis/impact-analyzer.js';
import { handleError } from '../utils/error-handler.js';

export function registerAnalyzeCommands(program: Command): void {
  const analyze = program
    .command('analyze')
    .description('Analyze artifact dependencies and impact');

  // Impact analysis
  analyze
    .command('impact')
    .description('Analyze impact of changing an artifact')
    .argument('<id>', 'Artifact ID to analyze')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      try {
        const store = new FileStore();
        const analyzer = new ImpactAnalyzer(store);
        const analysis = await analyzer.analyzeImpact(id);

        if (options.json) {
          console.log(JSON.stringify(analysis, null, 2)); // eslint-disable-line no-console
          return;
        }

        // Pretty print
        console.log(`\n🔍 Impact Analysis: ${analysis.sourceArtifact.id}\n`); // eslint-disable-line no-console
        console.log(`Title: ${analysis.sourceArtifact.title}`); // eslint-disable-line no-console
        console.log(`Status: ${analysis.sourceArtifact.status}`); // eslint-disable-line no-console
        console.log(`Risk Score: ${getRiskEmoji(analysis.riskScore)} ${analysis.riskScore}/100\n`); // eslint-disable-line no-console

        if (analysis.directImpacts.length > 0) {
          console.log('Direct Impacts:'); // eslint-disable-line no-console
          for (const impact of analysis.directImpacts) {
            const icon = getSeverityIcon(impact.severity);
            console.log(`  ${icon} ${impact.artifact.id} (${impact.relationship})`); // eslint-disable-line no-console
            console.log(`     ${impact.reason}`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }

        if (analysis.transitiveImpacts.length > 0) {
          console.log(`Transitive Impacts (${analysis.transitiveImpacts.length}):`); // eslint-disable-line no-console
          for (const impact of analysis.transitiveImpacts.slice(0, 5)) {
            console.log(`  → ${impact.artifact.id}: ${impact.reason}`); // eslint-disable-line no-console
          }
          if (analysis.transitiveImpacts.length > 5) {
            console.log(`  ... and ${analysis.transitiveImpacts.length - 5} more`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }

        console.log('Recommendations:'); // eslint-disable-line no-console
        for (const rec of analysis.recommendations) {
          console.log(`  • ${rec}`); // eslint-disable-line no-console
        }
        console.log(''); // eslint-disable-line no-console
      } catch (error) {
        handleError(error);
      }
    });

  // Dependency graph
  analyze
    .command('graph')
    .description('Show dependency graph')
    .option('--format <format>', 'Output format (text, mermaid, dot)', 'text')
    .action(async (options: { format: string }) => {
      try {
        const store = new FileStore();
        const analyzer = new ImpactAnalyzer(store);
        const graph = await analyzer.buildDependencyGraph();

        if (options.format === 'mermaid') {
          console.log('graph TD'); // eslint-disable-line no-console
          for (const [id, node] of graph.nodes) {
            const shape = node.type === 'rfc' ? '([' : node.type === 'adr' ? '{{' : '[[';
            const closeShape = node.type === 'rfc' ? '])' : node.type === 'adr' ? '}}' : ']]';
            console.log(`  ${id}${shape}"${node.title}"${closeShape}`); // eslint-disable-line no-console
          }
          for (const [id, node] of graph.nodes) {
            for (const dep of node.dependencies) {
              console.log(`  ${id} --> ${dep}`); // eslint-disable-line no-console
            }
          }
          return;
        }

        if (options.format === 'dot') {
          console.log('digraph ArchitectureArtifacts {'); // eslint-disable-line no-console
          console.log('  rankdir=TB;'); // eslint-disable-line no-console
          for (const [id, node] of graph.nodes) {
            const shape = node.type === 'rfc' ? 'ellipse' : node.type === 'adr' ? 'diamond' : 'box';
            console.log(`  "${id}" [label="${node.title}", shape=${shape}];`); // eslint-disable-line no-console
          }
          for (const [id, node] of graph.nodes) {
            for (const dep of node.dependencies) {
              console.log(`  "${id}" -> "${dep}";`); // eslint-disable-line no-console
            }
          }
          console.log('}'); // eslint-disable-line no-console
          return;
        }

        // Text format
        console.log('\n📊 Dependency Graph\n'); // eslint-disable-line no-console
        console.log(`Total Nodes: ${graph.nodes.size}`); // eslint-disable-line no-console
        console.log(`Root Nodes: ${graph.roots.length}`); // eslint-disable-line no-console
        console.log(`Leaf Nodes: ${graph.leaves.length}`); // eslint-disable-line no-console

        if (graph.cycles.length > 0) {
          console.log(`\n⚠️  Circular Dependencies Detected: ${graph.cycles.length}`); // eslint-disable-line no-console
          for (const cycle of graph.cycles) {
            console.log(`  ${cycle.join(' → ')} → ${cycle[0]}`); // eslint-disable-line no-console
          }
        }

        console.log('\nArtifacts by Depth:'); // eslint-disable-line no-console
        const byDepth = new Map<number, string[]>();
        for (const [id, node] of graph.nodes) {
          if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
          byDepth.get(node.depth)!.push(id);
        }

        for (const [depth, ids] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
          console.log(`  Level ${depth}: ${ids.join(', ')}`); // eslint-disable-line no-console
        }
        console.log(''); // eslint-disable-line no-console
      } catch (error) {
        handleError(error);
      }
    });

  // Find orphans
  analyze
    .command('orphans')
    .description('Find artifacts that would be orphaned if an artifact is deleted')
    .argument('<id>', 'Artifact ID')
    .action(async (id: string) => {
      try {
        const store = new FileStore();
        const analyzer = new ImpactAnalyzer(store);
        const orphans = await analyzer.findOrphans(id);

        if (orphans.length === 0) {
          console.log(`No artifacts would be orphaned if ${id} is deleted.`); // eslint-disable-line no-console
          return;
        }

        console.log(`\n⚠️  ${orphans.length} artifact(s) would be orphaned:\n`); // eslint-disable-line no-console
        for (const orphan of orphans) {
          console.log(`  ${orphan.id}: ${orphan.title}`); // eslint-disable-line no-console
        }
        console.log(''); // eslint-disable-line no-console
      } catch (error) {
        handleError(error);
      }
    });
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

function getRiskEmoji(score: number): string {
  if (score >= 75) return '🔴';
  if (score >= 50) return '🟠';
  if (score >= 25) return '🟡';
  return '🟢';
}
