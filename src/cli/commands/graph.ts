// Graph command for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { GraphService, GraphFormat } from '../../services/graph/graph-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { LinkService } from '../../services/link/link-service.js';

/**
 * Valid graph output formats
 */
const VALID_FORMATS: GraphFormat[] = ['mermaid', 'dot'];

/**
 * Validates that a format is valid
 */
function isValidFormat(format: string): format is GraphFormat {
  return VALID_FORMATS.includes(format as GraphFormat);
}

export function registerGraphCommand(program: Command): void {
  program
    .command('graph')
    .description('Generate a dependency graph visualization of artifacts')
    .option('-f, --format <format>', 'Output format (mermaid, dot)', 'mermaid')
    .option('-r, --root <artifact-id>', 'Show only artifacts connected to the specified root')
    .option('-o, --output <file>', 'Write output to file instead of stdout')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        // Validate format
        if (!isValidFormat(options.format)) {
          console.error(`Error: Invalid format '${options.format}'`);
          console.error(`Valid formats: ${VALID_FORMATS.join(', ')}`);
          process.exit(1);
        }

        const fileStore = new FileStore({ baseDir: `${options.path}/.arch` });
        const linkService = new LinkService(fileStore);
        const graphService = new GraphService(fileStore, linkService);

        // Verify root artifact exists if specified
        if (options.root) {
          const artifact = await fileStore.load(options.root);
          if (!artifact) {
            console.error(`Error: Root artifact not found: ${options.root}`);
            process.exit(1);
          }
        }

        // Generate the graph
        const graphOutput = await graphService.generateGraph({
          format: options.format,
          rootId: options.root
        });

        // Output to file or stdout
        if (options.output) {
          writeFileSync(options.output, graphOutput, 'utf-8');
          console.log(`✓ Graph written to ${options.output}`);
          console.log(`  Format: ${options.format}`);
          if (options.root) {
            console.log(`  Root: ${options.root}`);
          }
        } else {
          console.log(graphOutput);
        }
      } catch (error) {
        console.error('Error generating graph:', (error as Error).message);
        process.exit(1);
      }
    });
}
