// Export command - Export artifacts to various formats

import { Command } from 'commander';
import * as fs from 'fs/promises';
import { FileStore } from '../../services/storage/file-store.js';
import { PluginManager, builtinPlugins } from '../../plugins/index.js';
import { handleError } from '../utils/error-handler.js';

export const exportCommand = new Command('export')
  .description('Export artifacts to various formats')
  .argument('[output]', 'Output file path')
  .option('-f, --format <format>', 'Export format (json, csv, html, mermaid)', 'json')
  .option('-t, --type <type>', 'Filter by artifact type (rfc, adr, decomposition)')
  .option('-s, --status <status>', 'Filter by status')
  .option('--list-formats', 'List available export formats')
  .action(async (output: string | undefined, options: { format: string; type?: string; status?: string; listFormats?: boolean }) => {
    try {
      const store = new FileStore();
      const pluginManager = new PluginManager();

      // Register built-in plugins
      for (const plugin of builtinPlugins) {
        await pluginManager.register(plugin);
      }

      // Load custom plugins
      await pluginManager.loadFromConfig();

      // List formats
      if (options.listFormats) {
        const formats = pluginManager.getExportFormats();
        console.log('Available export formats:\n'); // eslint-disable-line no-console
        for (const format of formats) {
          console.log(`  ${format.id.padEnd(15)} ${format.name} (${format.extension})`); // eslint-disable-line no-console
        }
        return;
      }

      // Get export format
      const format = pluginManager.getExportFormat(options.format);
      if (!format) {
        console.error(`Unknown format: ${options.format}`); // eslint-disable-line no-console
        console.error('Use --list-formats to see available formats'); // eslint-disable-line no-console
        process.exit(1);
      }

      // Get artifacts
      const filters: { type?: 'rfc' | 'adr' | 'decomposition'; status?: string } = {};
      if (options.type) filters.type = options.type as 'rfc' | 'adr' | 'decomposition';
      if (options.status) filters.status = options.status;

      const artifacts = await store.list(filters);

      if (artifacts.length === 0) {
        console.log('No artifacts found matching filters.'); // eslint-disable-line no-console
        return;
      }

      // Export
      const content = await format.export(artifacts);

      if (output) {
        await fs.writeFile(output, content, 'utf-8');
        console.log(`Exported ${artifacts.length} artifact(s) to ${output}`); // eslint-disable-line no-console
      } else {
        console.log(content); // eslint-disable-line no-console
      }
    } catch (error) {
      handleError(error);
    }
  });
