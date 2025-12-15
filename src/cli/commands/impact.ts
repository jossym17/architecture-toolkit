// Impact analysis command for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { ImpactAnalysisService, ImpactReport, ImpactMigrationChecklist } from '../../services/impact/impact-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { LinkService } from '../../services/link/link-service.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Impact command options
 */
interface ImpactOptions {
  deprecate?: boolean;
  json?: boolean;
  path?: string;
}

/**
 * Registers the impact command
 * 
 * Supports:
 * - arch impact <artifact-id> - Display dependents with depth classification
 * - arch impact <artifact-id> --deprecate - Generate migration checklist
 * - arch impact <artifact-id> --json - Output as JSON
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */
export function registerImpactCommand(program: Command): void {
  program
    .command('impact <artifact-id>')
    .description('Analyze the impact of changing or deprecating an artifact')
    .option('-d, --deprecate', 'Generate a deprecation migration checklist')
    .option('--json', 'Output results as JSON')
    .option('-p, --path <path>', 'Base path for .arch directory', process.cwd())
    .action(async (artifactId: string, options: ImpactOptions) => {
      try {
        const basePath = options.path || process.cwd();
        const archPath = `${basePath}/.arch`;
        
        const fileStore = new FileStore({ baseDir: archPath });
        const linkService = new LinkService(fileStore);
        const impactService = new ImpactAnalysisService(fileStore, linkService);

        // Verify artifact exists
        const artifact = await fileStore.load(artifactId);
        if (!artifact) {
          console.error(`Error: Artifact '${artifactId}' not found.`);
          process.exit(1);
        }

        if (options.deprecate) {
          // Generate deprecation checklist (Requirements: 9.3)
          const checklist = await impactService.generateDeprecationChecklist(artifactId);
          
          if (options.json) {
            console.log(JSON.stringify(checklist, null, 2));
          } else {
            printDeprecationChecklist(checklist, artifact.title);
          }
        } else {
          // Standard impact analysis (Requirements: 9.1, 9.2, 9.4)
          const report = await impactService.analyzeImpact(artifactId);
          
          if (options.json) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            await printImpactReport(report, artifact.title, fileStore);
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * Prints the impact report in a human-readable format
 * 
 * Requirements: 9.1, 9.2, 9.4
 */
async function printImpactReport(
  report: ImpactReport, 
  artifactTitle: string,
  fileStore: FileStore
): Promise<void> {
  const totalDependents = report.directDependents.length + report.transitiveDependents.length;
  
  // Header
  console.log('\n📊 Impact Analysis Report\n');
  console.log(`Artifact: ${report.artifactId}`);
  console.log(`Title: ${artifactTitle}\n`);
  
  // Risk score with visual indicator (Requirements: 9.2)
  const riskEmoji = getRiskEmoji(report.riskScore);
  const riskLevel = getRiskLevel(report.riskScore);
  console.log(`${riskEmoji} Risk Score: ${report.riskScore}/100 (${riskLevel})`);
  console.log(`${getRiskBar(report.riskScore)}\n`);
  
  // Summary
  console.log('Summary:');
  console.log(`  Total Dependents: ${totalDependents}`);
  console.log(`  Direct Dependents: ${report.directDependents.length}`);
  console.log(`  Transitive Dependents: ${report.transitiveDependents.length}`);
  console.log(`  Max Dependency Depth: ${report.maxDepth}\n`);
  
  // Direct dependents (Requirements: 9.1, 9.4)
  if (report.directDependents.length > 0) {
    console.log('📍 Direct Dependents (depth: 1):');
    for (const depId of report.directDependents) {
      const depArtifact = await fileStore.load(depId);
      const title = depArtifact?.title || 'Unknown';
      const status = depArtifact?.status || 'unknown';
      console.log(`  • ${depId}: ${title} [${status}]`);
    }
    console.log('');
  }
  
  // Transitive dependents (Requirements: 9.1, 9.4)
  if (report.transitiveDependents.length > 0) {
    console.log('🔗 Transitive Dependents (depth: 2+):');
    for (const depId of report.transitiveDependents) {
      const depArtifact = await fileStore.load(depId);
      const title = depArtifact?.title || 'Unknown';
      const status = depArtifact?.status || 'unknown';
      console.log(`  • ${depId}: ${title} [${status}]`);
    }
    console.log('');
  }
  
  // No dependents message
  if (totalDependents === 0) {
    console.log('✅ No dependents found. This artifact can be safely modified or deprecated.\n');
  } else {
    console.log(`💡 Tip: Use --deprecate flag to generate a migration checklist.\n`);
  }
}

/**
 * Prints the deprecation checklist in a human-readable format
 * 
 * Requirements: 9.3
 */
function printDeprecationChecklist(
  checklist: ImpactMigrationChecklist,
  artifactTitle: string
): void {
  console.log('\n📋 Deprecation Migration Checklist\n');
  console.log(`Artifact: ${checklist.artifactId}`);
  console.log(`Title: ${artifactTitle}\n`);
  
  if (checklist.tasks.length === 0) {
    console.log('✅ No migration tasks required. This artifact has no dependents.\n');
    return;
  }
  
  console.log(`Total Tasks: ${checklist.tasks.length}\n`);
  
  // Group tasks by priority
  const highPriority = checklist.tasks.filter(t => t.priority === 'high');
  const mediumPriority = checklist.tasks.filter(t => t.priority === 'medium');
  const lowPriority = checklist.tasks.filter(t => t.priority === 'low');
  
  // High priority tasks
  if (highPriority.length > 0) {
    console.log('🔴 High Priority:');
    for (let i = 0; i < highPriority.length; i++) {
      const task = highPriority[i];
      console.log(`  ${i + 1}. [${task.artifactId}] ${task.action}`);
    }
    console.log('');
  }
  
  // Medium priority tasks
  if (mediumPriority.length > 0) {
    console.log('🟡 Medium Priority:');
    for (let i = 0; i < mediumPriority.length; i++) {
      const task = mediumPriority[i];
      console.log(`  ${i + 1}. [${task.artifactId}] ${task.action}`);
    }
    console.log('');
  }
  
  // Low priority tasks
  if (lowPriority.length > 0) {
    console.log('🟢 Low Priority:');
    for (let i = 0; i < lowPriority.length; i++) {
      const task = lowPriority[i];
      console.log(`  ${i + 1}. [${task.artifactId}] ${task.action}`);
    }
    console.log('');
  }
  
  console.log('💡 Complete high priority tasks first to minimize disruption.\n');
}

/**
 * Gets the risk emoji based on score
 */
function getRiskEmoji(score: number): string {
  if (score >= 70) return '🔴';
  if (score >= 40) return '🟡';
  return '🟢';
}

/**
 * Gets the risk level description
 */
function getRiskLevel(score: number): string {
  if (score >= 70) return 'High Risk';
  if (score >= 40) return 'Medium Risk';
  if (score > 0) return 'Low Risk';
  return 'No Risk';
}

/**
 * Gets a visual risk bar
 */
function getRiskBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
