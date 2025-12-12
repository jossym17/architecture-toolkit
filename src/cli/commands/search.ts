// Search command for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { SearchService } from '../../services/search/search-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { ArtifactType } from '../../models/types.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search across all artifacts')
    .option('-t, --type <type>', 'Filter by artifact type (rfc|adr|decomposition)')
    .option('--from <date>', 'Filter by creation date (from)')
    .option('--to <date>', 'Filter by creation date (to)')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (query, options) => {
      try {
        const fileStore = new FileStore({ baseDir: `${options.path}/.arch` });
        await fileStore.initialize();
        
        const searchService = new SearchService(fileStore);
        
        const filters: {
          type?: ArtifactType;
          dateFrom?: Date;
          dateTo?: Date;
        } = {};
        
        if (options.type) {
          filters.type = options.type as ArtifactType;
        }
        if (options.from) {
          filters.dateFrom = new Date(options.from);
        }
        if (options.to) {
          filters.dateTo = new Date(options.to);
        }
        
        const results = await searchService.search(query, filters);
        
        if (results.length === 0) {
          console.log(`No results found for: "${query}"`);
          return;
        }
        
        console.log(`Found ${results.length} result(s) for "${query}":\n`);
        for (const result of results) {
          const a = result.artifact;
          console.log(`  ${a.id} - ${a.title}`);
          console.log(`    Type: ${a.type} | Status: ${a.status} | Score: ${result.score}`);
          if (result.snippet) {
            console.log(`    "${result.snippet}"`);
          }
          console.log();
        }
      } catch (error) {
        console.error('Error searching:', (error as Error).message);
        process.exit(1);
      }
    });
}
