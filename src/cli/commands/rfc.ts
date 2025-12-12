// RFC commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { RFCService } from '../../services/rfc/rfc-service.js';
import { RFCStatus } from '../../models/types.js';
import { PromptService, InteractiveError } from '../../services/prompt/prompt-service.js';

export function registerRfcCommands(program: Command): void {
  const rfc = program
    .command('rfc')
    .description('Manage RFC documents');

  // Create RFC
  rfc
    .command('create')
    .description('Create a new RFC')
    .option('-t, --title <title>', 'RFC title')
    .option('-o, --owner <owner>', 'RFC owner')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();
        
        const promptService = new PromptService(options.path);
        
        // Build provided fields from command line options
        const providedFields: Record<string, unknown> = {};
        if (options.title) providedFields.title = options.title;
        if (options.owner) providedFields.owner = options.owner;
        if (options.tags) providedFields.tags = options.tags.split(',').map((t: string) => t.trim());
        
        // Get smart defaults for prompting
        const smartDefaults = await promptService.getSmartDefaults();
        
        // Get existing RFCs for tag suggestions and title validation
        const existingRfcs = await service.list();
        const tagSuggestions = promptService.getTagSuggestions('rfc', existingRfcs);
        
        // Build prompt options with defaults and suggestions
        const promptOptions = {
          defaults: smartDefaults,
          suggestions: { tags: tagSuggestions },
          validators: {
            title: (value: string) => {
              const result = promptService.validateTitleUniqueness(value, existingRfcs);
              if (!result.isUnique) {
                const duplicates = result.duplicates.map(d => 
                  `${d.id} (${d.matchType}${d.similarity ? ` ${Math.round(d.similarity * 100)}%` : ''})`
                ).join(', ');
                console.warn(`\n⚠ Warning: Similar titles found: ${duplicates}`);
              }
              return { valid: true }; // Allow creation but warn
            }
          }
        };
        
        // Prompt for missing fields (will throw InteractiveError if non-TTY and fields missing)
        const input = await promptService.promptForMissingFields('rfc', providedFields, promptOptions);
        
        const rfcDoc = await service.create({
          title: input.title,
          owner: input.owner,
          tags: input.tags
        });
        
        console.log(`✓ Created RFC: ${rfcDoc.id}`);
        console.log(`  Title: ${rfcDoc.title}`);
        console.log(`  Owner: ${rfcDoc.owner}`);
        console.log(`  Status: ${rfcDoc.status}`);
      } catch (error) {
        if (error instanceof InteractiveError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
        console.error('Error creating RFC:', (error as Error).message);
        process.exit(1);
      }
    });

  // List RFCs
  rfc
    .command('list')
    .description('List all RFCs')
    .option('-s, --status <status>', 'Filter by status')
    .option('--owner <owner>', 'Filter by owner')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();

        const rfcs = await service.list({
          status: options.status,
          owner: options.owner
        });
        
        if (rfcs.length === 0) {
          console.log('No RFCs found');
          return;
        }
        
        console.log(`Found ${rfcs.length} RFC(s):\n`);
        for (const r of rfcs) {
          console.log(`  ${r.id} - ${r.title}`);
          console.log(`    Status: ${r.status} | Owner: ${r.owner}`);
          if (r.tags.length > 0) {
            console.log(`    Tags: ${r.tags.join(', ')}`);
          }
          console.log();
        }
      } catch (error) {
        console.error('Error listing RFCs:', (error as Error).message);
        process.exit(1);
      }
    });

  // Show RFC
  rfc
    .command('show <id>')
    .description('Show RFC details')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();
        
        const r = await service.get(id);
        if (!r) {
          console.error(`RFC not found: ${id}`);
          process.exit(1);
        }
        
        console.log(`RFC: ${r.id}`);
        console.log(`Title: ${r.title}`);
        console.log(`Status: ${r.status}`);
        console.log(`Owner: ${r.owner}`);
        console.log(`Created: ${r.createdAt.toISOString()}`);
        console.log(`Updated: ${r.updatedAt.toISOString()}`);
        if (r.tags.length > 0) {
          console.log(`Tags: ${r.tags.join(', ')}`);
        }
        console.log(`\n--- Problem Statement ---\n${r.problemStatement}`);
        console.log(`\n--- Success Criteria ---`);
        r.successCriteria.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
        console.log(`\n--- Recommended Approach ---\n${r.recommendedApproach}`);
      } catch (error) {
        console.error('Error showing RFC:', (error as Error).message);
        process.exit(1);
      }
    });

  // Update RFC
  rfc
    .command('update <id>')
    .description('Update an RFC')
    .option('-t, --title <title>', 'New title')
    .option('-s, --status <status>', 'New status (draft|review|approved|rejected|implemented)')
    .option('--owner <owner>', 'New owner')
    .option('--tags <tags>', 'New comma-separated tags')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();
        
        const updateData: Record<string, unknown> = {};
        if (options.title) updateData.title = options.title;
        if (options.status) updateData.status = options.status as RFCStatus;
        if (options.owner) updateData.owner = options.owner;
        if (options.tags) updateData.tags = options.tags.split(',').map((t: string) => t.trim());
        
        const r = await service.update(id, updateData);
        console.log(`✓ Updated RFC: ${r.id}`);
        console.log(`  Title: ${r.title}`);
        console.log(`  Status: ${r.status}`);
      } catch (error) {
        console.error('Error updating RFC:', (error as Error).message);
        process.exit(1);
      }
    });

  // Delete RFC
  rfc
    .command('delete <id>')
    .description('Delete an RFC')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (id, options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();
        
        const deleted = await service.delete(id);
        if (deleted) {
          console.log(`✓ Deleted RFC: ${id}`);
        } else {
          console.error(`RFC not found: ${id}`);
          process.exit(1);
        }
      } catch (error) {
        console.error('Error deleting RFC:', (error as Error).message);
        process.exit(1);
      }
    });
}
