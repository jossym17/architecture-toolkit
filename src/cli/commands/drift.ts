// Drift detection commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { DriftDetectionService, DriftReport } from '../../services/drift/drift-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { ConfigService } from '../../services/config/config-service.js';

/**
 * Registers the drift command
 * 
 * Supports:
 * - arch drift [--watch] [--adr <id>] [--path <path>]
 * 
 * Requirements: 8.1, 8.3, 8.4, 8.5
 */
export function registerDriftCommand(program: Command): void {
  program
    .command('drift')
    .description('Detect architecture drift between ADRs and codebase')
    .option('-w, --watch', 'Watch for changes and continuously monitor for drift')
    .option('-a, --adr <ids...>', 'Specific ADR IDs to check (comma-separated or multiple flags)')
    .option('-s, --scan <paths...>', 'Specific paths to scan (comma-separated or multiple flags)')
    .option('-p, --path <path>', 'Base path for .arch directory', process.cwd())
    .option('-q, --quiet', 'Only output violations, no summary')
    .option('--json', 'Output results as JSON')
    .option('--ci', 'Output in CI-friendly format with annotations')
    .option('--detailed', 'Show detailed report with remediation steps')
    .action(async (options) => {
      try {
        const basePath = options.path;
        const archPath = `${basePath}/.arch`;
        
        const fileStore = new FileStore({ baseDir: archPath });
        const configService = new ConfigService({ baseDir: archPath });
        const driftService = new DriftDetectionService(fileStore, configService, basePath);

        // Parse ADR IDs if provided
        const adrIds = options.adr ? parseMultipleValues(options.adr) : undefined;
        
        // Parse scan paths if provided
        const scanPaths = options.scan ? parseMultipleValues(options.scan) : undefined;

        if (options.watch) {
          // Watch mode - continuous monitoring
          console.log('Watching for architecture drift...');
          console.log('Press Ctrl+C to stop\n');

          driftService.watchForDrift((report: DriftReport) => {
            if (options.json) {
              const detailedReport = driftService.getDetailedReport(report);
              console.log(JSON.stringify(detailedReport, null, 2));
            } else if (options.ci) {
              console.log(`\n[${new Date().toLocaleTimeString()}] Drift detected!`);
              console.log(driftService.formatReportForCI(report));
            } else {
              console.log(`\n[${new Date().toLocaleTimeString()}] Drift detected!`);
              console.log(driftService.formatReport(report));
            }
          });

          // Keep process running
          process.on('SIGINT', () => {
            console.log('\nStopping drift watch...');
            driftService.stopWatching();
            process.exit(0);
          });

          // Initial scan
          const initialReport = await driftService.detectDrift({ adrIds, paths: scanPaths });
          if (initialReport.violations.length > 0) {
            if (options.json) {
              const detailedReport = driftService.getDetailedReport(initialReport);
              console.log(JSON.stringify(detailedReport, null, 2));
            } else if (options.ci) {
              console.log('Initial scan results:');
              console.log(driftService.formatReportForCI(initialReport));
            } else {
              console.log('Initial scan results:');
              console.log(driftService.formatReport(initialReport));
            }
          } else if (!options.quiet) {
            console.log('Initial scan: No drift detected.');
          }
        } else {
          // Single scan mode
          if (!options.quiet && !options.json && !options.ci) {
            console.log('Scanning for architecture drift...\n');
          }

          const report = await driftService.detectDrift({ adrIds, paths: scanPaths });

          if (options.json) {
            // JSON output - use detailed report for comprehensive data
            const detailedReport = driftService.getDetailedReport(report);
            console.log(JSON.stringify(detailedReport, null, 2));
          } else if (options.ci) {
            // CI-friendly output with annotations (Requirements: 8.3, 8.5)
            console.log(driftService.formatReportForCI(report));
          } else if (options.detailed) {
            // Detailed output with remediation steps
            console.log(driftService.formatReport(report));
            
            if (report.violations.length > 0) {
              console.log('\n');
              const remediations = driftService.generateRemediationSuggestions(report);
              console.log('Detailed Remediation Plan:');
              console.log('='.repeat(50));
              
              for (const remediation of remediations) {
                console.log(`\n${remediation.adrId}: ${remediation.adrTitle}`);
                console.log(`Priority: ${remediation.priority.toUpperCase()}`);
                console.log(`Action: ${remediation.action}`);
                console.log(`Affected files (${remediation.affectedFiles.length}):`);
                for (const file of remediation.affectedFiles) {
                  console.log(`  - ${file}`);
                }
                console.log('\nSteps:');
                for (let i = 0; i < remediation.steps.length; i++) {
                  console.log(`  ${i + 1}. ${remediation.steps[i]}`);
                }
              }
            }
          } else {
            // Standard output
            console.log(driftService.formatReport(report));
            
            // Print summary if not quiet
            if (!options.quiet && report.violations.length > 0) {
              const summary = driftService.getSummary(report);
              console.log(`\nSummary:`);
              console.log(`  Total violations: ${summary.totalViolations}`);
              console.log(`  Affected ADRs: ${summary.affectedADRs.length}`);
              console.log(`  Affected files: ${summary.affectedFiles.length}`);
            }
          }

          // Exit with error code if violations found
          if (report.violations.length > 0) {
            process.exit(1);
          }
        }
      } catch (error) {
        console.error('Error detecting drift:', (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Parse multiple values from command line options
 * Handles both comma-separated and multiple flag formats
 */
function parseMultipleValues(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    // Split by comma and trim whitespace
    const parts = value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    result.push(...parts);
  }
  return result;
}
