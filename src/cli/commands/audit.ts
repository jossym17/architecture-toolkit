// Audit and Compliance commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { AuditService } from '../../services/audit/audit-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { ConfigService } from '../../services/config/config-service.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Audit command options
 */
interface AuditOptions {
  export?: string;
  output?: string;
  json?: boolean;
  path?: string;
}

/**
 * Registers the audit command
 * 
 * Supports:
 * - arch audit <artifact-id> - Display artifact history
 * - arch audit --export <format> - Export audit report
 * 
 * Requirements: 10.2, 10.3
 */
export function registerAuditCommand(program: Command): Command {
  return program
    .command('audit [artifact-id]')
    .description('Display audit history for an artifact or export audit report')
    .option('-e, --export <format>', 'Export audit report (html, json, pdf)')
    .option('-o, --output <file>', 'Output file path for export')
    .option('--json', 'Output results as JSON')
    .option('-p, --path <path>', 'Base path for .arch directory', process.cwd())
    .action(async (artifactId: string | undefined, options: AuditOptions) => {
      try {
        const basePath = options.path || process.cwd();
        const archPath = `${basePath}/.arch`;
        
        const fileStore = new FileStore({ baseDir: archPath });
        const configService = new ConfigService({ baseDir: archPath });
        const auditService = new AuditService({ 
          baseDir: archPath, 
          fileStore, 
          configService 
        });

        if (options.export) {
          // Export audit report (Requirements: 10.3)
          await handleExportReport(auditService, options);
        } else if (artifactId) {
          // Display artifact history (Requirements: 10.2)
          await handleArtifactHistory(auditService, fileStore, artifactId, options);
        } else {
          // Show all audit entries
          await handleAllAuditEntries(auditService, options);
        }
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * Handle export report command
 */
async function handleExportReport(
  auditService: AuditService,
  options: AuditOptions
): Promise<void> {
  const format = options.export as 'html' | 'json' | 'pdf';
  const report = await auditService.exportReport({ format });

  if (options.output) {
    const fs = await import('fs/promises');
    await fs.writeFile(options.output, report, 'utf-8');
    // eslint-disable-next-line no-console
    console.log(`Audit report exported to ${options.output}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(report);
  }
}

/**
 * Handle artifact history command
 */
async function handleArtifactHistory(
  auditService: AuditService,
  fileStore: FileStore,
  artifactId: string,
  options: AuditOptions
): Promise<void> {
  // Verify artifact exists
  const artifact = await fileStore.load(artifactId);
  if (!artifact) {
    console.error(`Artifact not found: ${artifactId}`);
    process.exit(1);
  }

  const history = await auditService.getHistory(artifactId);

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(history, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(`\nAudit History for ${artifactId}:`);
    // eslint-disable-next-line no-console
    console.log('='.repeat(50));

    if (history.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No audit entries found.');
    } else {
      for (const entry of history) {
        const timestamp =
          entry.timestamp instanceof Date
            ? entry.timestamp.toISOString()
            : entry.timestamp;
        // eslint-disable-next-line no-console
        console.log(`\n[${timestamp}] ${entry.action.toUpperCase()}`);
        // eslint-disable-next-line no-console
        console.log(`  User: ${entry.user}`);
        if (entry.changes) {
          // eslint-disable-next-line no-console
          console.log('  Changes:');
          for (const [key, value] of Object.entries(entry.changes)) {
            // eslint-disable-next-line no-console
            console.log(
              `    ${key}: ${JSON.stringify(value.old)} → ${JSON.stringify(value.new)}`
            );
          }
        }
      }
    }
  }
}

/**
 * Handle all audit entries command
 */
async function handleAllAuditEntries(
  auditService: AuditService,
  options: AuditOptions
): Promise<void> {
  const entries = await auditService.getAllEntries();

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entries, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log('\nAll Audit Entries:');
    // eslint-disable-next-line no-console
    console.log('='.repeat(50));

    if (entries.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No audit entries found.');
    } else {
      for (const entry of entries) {
        const timestamp =
          entry.timestamp instanceof Date
            ? entry.timestamp.toISOString()
            : entry.timestamp;
        // eslint-disable-next-line no-console
        console.log(
          `[${timestamp}] ${entry.artifactId} - ${entry.action.toUpperCase()} by ${entry.user}`
        );
      }
    }
  }
}
