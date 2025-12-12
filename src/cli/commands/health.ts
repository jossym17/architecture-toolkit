// Health command - Check artifact health and identify issues

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { HealthChecker } from '../../services/analysis/health-checker.js';
import { handleError } from '../utils/error-handler.js';

export const healthCommand = new Command('health')
  .description('Check artifact health and identify issues')
  .option('--json', 'Output as JSON')
  .option('--stale-days <days>', 'Days after which artifact is stale', '90')
  .option('--draft-max-days <days>', 'Max days for draft status', '30')
  .action(async (options: { json?: boolean; staleDays: string; draftMaxDays: string }) => {
    try {
      const store = new FileStore();
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
