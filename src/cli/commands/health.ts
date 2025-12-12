// Health command - Check artifact health and identify issues

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { HealthChecker } from '../../services/analysis/health-checker.js';
import { EnhancedHealthService } from '../../services/analysis/enhanced-health-service.js';
import { handleError } from '../utils/error-handler.js';

interface HealthOptions {
  json?: boolean;
  staleDays: string;
  draftMaxDays: string;
  threshold?: string;
  detailed?: boolean;
}

export const healthCommand = new Command('health')
  .description('Check artifact health and identify issues')
  .option('--json', 'Output as JSON')
  .option('--stale-days <days>', 'Days after which artifact is stale', '90')
  .option('--draft-max-days <days>', 'Max days for draft status', '30')
  .option('--threshold <score>', 'Minimum health score threshold (0-100). Returns non-zero exit code if any artifact is below')
  .option('--detailed', 'Show detailed health breakdown by category')
  .action(async (options: HealthOptions) => {
    try {
      const store = new FileStore();
      const threshold = options.threshold ? parseInt(options.threshold, 10) : undefined;

      // Use enhanced health service if threshold or detailed is specified
      if (threshold !== undefined || options.detailed) {
        const enhancedService = new EnhancedHealthService(store, undefined, undefined, {
          stalenessThresholdDays: parseInt(options.staleDays, 10),
          threshold: threshold ?? 80
        });

        const report = await enhancedService.calculateAllHealth({ threshold, detailed: options.detailed });

        if (options.json) {
          console.log(JSON.stringify(report, null, 2)); // eslint-disable-line no-console
          // Exit with non-zero if below threshold
          if (threshold !== undefined && report.summary.belowThreshold > 0) {
            process.exit(1);
          }
          return;
        }

        // Pretty print enhanced report
        const avgScore = report.summary.average;
        const statusEmoji = avgScore >= 80 ? '✅' : avgScore >= 50 ? '⚠️' : '❌';
        
        console.log(`\n${statusEmoji} Enhanced Architecture Health Report\n`); // eslint-disable-line no-console
        console.log(`Average Health Score: ${getScoreBar(avgScore)} ${avgScore}/100`); // eslint-disable-line no-console
        console.log(`Total Artifacts: ${report.artifacts.length}`); // eslint-disable-line no-console
        
        if (threshold !== undefined) {
          console.log(`Threshold: ${threshold} | Below Threshold: ${report.summary.belowThreshold}`); // eslint-disable-line no-console
        }
        console.log(`Critical Issues: ${report.summary.criticalIssues}\n`); // eslint-disable-line no-console

        // Show detailed breakdown if requested
        if (options.detailed) {
          console.log('Artifact Health Breakdown:\n'); // eslint-disable-line no-console
          for (const artifact of report.artifacts) {
            const breakdown = await enhancedService.getHealthBreakdown(artifact.artifactId);
            const scoreEmoji = artifact.score >= 80 ? '✅' : artifact.score >= 50 ? '⚠️' : '❌';
            
            console.log(`${scoreEmoji} ${artifact.artifactId}: ${artifact.score}/100`); // eslint-disable-line no-console
            console.log(`   Completeness: ${breakdown.completeness}/100`); // eslint-disable-line no-console
            console.log(`   Freshness: ${breakdown.freshness}/100`); // eslint-disable-line no-console
            console.log(`   Relationships: ${breakdown.relationships}/100`); // eslint-disable-line no-console
            
            if (breakdown.penalties.length > 0) {
              console.log('   Penalties:'); // eslint-disable-line no-console
              for (const penalty of breakdown.penalties) {
                console.log(`     - ${penalty.reason}: -${penalty.points} points`); // eslint-disable-line no-console
                if (penalty.details) {
                  console.log(`       ${penalty.details}`); // eslint-disable-line no-console
                }
              }
            }
            console.log(''); // eslint-disable-line no-console
          }
        }

        // Show circular dependencies
        if (report.circularDependencies.length > 0) {
          console.log('🔄 Circular Dependencies Detected:\n'); // eslint-disable-line no-console
          for (const cycle of report.circularDependencies) {
            const severity = cycle.severity === 'critical' ? '❌' : '⚠️';
            console.log(`  ${severity} ${cycle.cycle.join(' → ')}`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }

        // Exit with non-zero if below threshold
        if (threshold !== undefined && report.summary.belowThreshold > 0) {
          console.log(`\n❌ ${report.summary.belowThreshold} artifact(s) below threshold of ${threshold}\n`); // eslint-disable-line no-console
          process.exit(1);
        }

        return;
      }

      // Use original health checker for basic health check
      const checker = new HealthChecker(store, {
        staleDays: parseInt(options.staleDays, 10),
        draftMaxDays: parseInt(options.draftMaxDays, 10)
      });

      const report = await checker.runHealthCheck();

      if (options.json) {
        console.log(JSON.stringify(report, null, 2)); // eslint-disable-line no-console
        return;
      }

      // Pretty print
      const statusEmoji = report.score >= 80 ? '✅' : report.score >= 50 ? '⚠️' : '❌';
      
      console.log(`\n${statusEmoji} Architecture Health Report\n`); // eslint-disable-line no-console
      console.log(`Health Score: ${getScoreBar(report.score)} ${report.score}/100`); // eslint-disable-line no-console
      console.log(`Total Artifacts: ${report.totalArtifacts}`); // eslint-disable-line no-console
      console.log(`Healthy: ${report.healthyArtifacts} | With Issues: ${report.totalArtifacts - report.healthyArtifacts}\n`); // eslint-disable-line no-console

      // Summary by type
      console.log('By Type:'); // eslint-disable-line no-console
      for (const [type, stats] of Object.entries(report.byType)) {
        const healthPct = stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 100;
        console.log(`  ${type.padEnd(15)} ${stats.healthy}/${stats.total} healthy (${healthPct}%)`); // eslint-disable-line no-console
      }

      // Issues summary
      if (report.issues.length > 0) {
        console.log(`\nIssues Found: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.info} info\n`); // eslint-disable-line no-console

        // Group by severity
        const errors = report.issues.filter(i => i.severity === 'error');
        const warnings = report.issues.filter(i => i.severity === 'warning');
        const infos = report.issues.filter(i => i.severity === 'info');

        if (errors.length > 0) {
          console.log('❌ Errors:'); // eslint-disable-line no-console
          for (const issue of errors) {
            console.log(`  ${issue.artifactId}: ${issue.message}`); // eslint-disable-line no-console
            console.log(`    💡 ${issue.suggestion}`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }

        if (warnings.length > 0) {
          console.log('⚠️  Warnings:'); // eslint-disable-line no-console
          for (const issue of warnings) {
            console.log(`  ${issue.artifactId}: ${issue.message}`); // eslint-disable-line no-console
            console.log(`    💡 ${issue.suggestion}`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }

        if (infos.length > 0) {
          console.log('ℹ️  Info:'); // eslint-disable-line no-console
          for (const issue of infos.slice(0, 5)) {
            console.log(`  ${issue.artifactId}: ${issue.message}`); // eslint-disable-line no-console
          }
          if (infos.length > 5) {
            console.log(`  ... and ${infos.length - 5} more`); // eslint-disable-line no-console
          }
          console.log(''); // eslint-disable-line no-console
        }
      } else {
        console.log('\n✨ No issues found! Your architecture documentation is healthy.\n'); // eslint-disable-line no-console
      }
    } catch (error) {
      handleError(error);
    }
  });

function getScoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const color = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴';
  return `${color} [${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}
