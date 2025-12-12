// ADR commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { ADRService } from '../../services/adr/adr-service.js';
import { ADRStatus } from '../../models/types.js';
import { PromptService, InteractiveError } from '../../services/prompt/prompt-service.js';

export function registerAdrCommands(program: Command): void {
  const adr = program
    .command('adr')
    .description('Manage Architecture Decision Records');

  // Create ADR
  adr
    .command('create')
    .description('Create a new ADR')
    .option('-t, --title <title>', 'ADR title')
    .option('-o, --owner <owner>', 'ADR owner')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--context <context>', 'ADR context (use editor for multi-line in interactive mode)')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new ADRService(options.path);
        await service.initialize();
        
        const promptService = new PromptService(options.path);
        
        // Build provided fields from command line options
        const providedFields: Record<string, unknown> = {};
        if (options.title) providedFields.title = options.title;
        if (options.owner) providedFields.owner = options.owner;
        if (options.tags) providedFields.tags = options.tags.split(',').map((t: string) => t.trim());
        
        // Get smart defaults for prompting
        const smartDefaults = await promptService.getSmartDefaults();
        
        // Get existing ADRs for tag suggestions and title validation
        const existingAdrs = await service.list();
        const tagSuggestions = promptService.getTagSuggestions('adr', existingAdrs);
        
        // Build prompt options with defaults and suggestions
        const promptOptions = {
          defaults: smartDefaults,
          suggestions: { tags: tagSuggestions },
          validators: {
            title: (value: string) => {
              const result = promptService.validateTitleUniqueness(value, existingAdrs);
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
        const input = await promptService.promptForMissingFields('adr', providedFields, promptOptions);
        
        // Handle context - prompt for multi-line input if not provided and in interactive mode
        let context = options.context;
        if (!context && promptService.isInteractive()) {
          const shouldAddContext = await promptService.promptForConfirmation(
            'Would you like to add context for this ADR? (opens editor)'
          );
          if (shouldAddContext) {
            context = await promptService.promptForMultiLineContent(
              'context',
              'Enter the context and background for this decision:',
              '[Describe the context and background for this decision]'
            );
          }
        }
        
        const adrDoc = await service.create({
          title: input.title,
          owner: input.owner,
          tags: input.tags,
          context: context || undefined
        });
        
        console.log(`✓ Created ADR: ${adrDoc.id}`);
        console.log(`  Title: ${adrDoc.title}`);
        console.log(`  Owner: ${adrDoc.owner}`);
        console.log(`  Status: ${adrDoc.status}`);
      } catch (error) {
        if (error instanceof InteractiveError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
        console.error('Error creating ADR:', (error as Error).message);
        process.exit(1);
      }
    });

  // List ADRs
  adr
    .command('list')
    .description('List all ADRs')
    .option('-s, --status <status>', 'Filter by status')
    .option('--owner <owner>', 'Filter by owner')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new ADRService(options.path);
        await service.initialize();

        const adrs = await service.list({
          status: options.status,
          owner: options.owner
        });
        
        if (adrs.length === 0) {
          console.log('No ADRs found');
          return;
        }
        
        console.log(`Found ${adrs.length} ADR(s):\n`);
        for (const a of adrs) {
          console.log(`  ${a.id} - ${a.title}`);
          console.log(`    Status: ${a.status} | Owner: ${a.owner}`);
          if (a.supersededBy) {
            console.log(`    Superseded by: ${a.supersededBy}`);
          }
          if (a.tags.length > 0) {
            console.log(`    Tags: ${a.tags.join(', ')}`);
          }
          console.log();
        }
      } catch (error) {
        console.error('Error listing ADRs:', (error as Error).message);
        process.exit(1);
      }
    });

  // Show ADR
  adr
    .command('show <id>')
    .description('Show ADR details')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new ADRService(options.path);
        await service.initialize();
        
        const a = await service.get(id);
        if (!a) {
          console.error(`ADR not found: ${id}`);
          process.exit(1);
        }
        
        console.log(`ADR: ${a.id}`);
        console.log(`Title: ${a.title}`);
        console.log(`Status: ${a.status}`);
        console.log(`Owner: ${a.owner}`);
        console.log(`Created: ${a.createdAt.toISOString()}`);
        console.log(`Updated: ${a.updatedAt.toISOString()}`);
        if (a.supersededBy) {
          console.log(`Superseded by: ${a.supersededBy}`);
        }
        if (a.tags.length > 0) {
          console.log(`Tags: ${a.tags.join(', ')}`);
        }
        console.log(`\n--- Context ---\n${a.context}`);
        console.log(`\n--- Decision ---\n${a.decision}`);
        console.log(`\n--- Consequences ---`);
        a.consequences.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
      } catch (error) {
        console.error('Error showing ADR:', (error as Error).message);
        process.exit(1);
      }
    });

  // Update ADR
  adr
    .command('update <id>')
    .description('Update an ADR')
    .option('-t, --title <title>', 'New title')
    .option('-s, --status <status>', 'New status (proposed|accepted|deprecated|superseded)')
    .option('--owner <owner>', 'New owner')
    .option('--superseded-by <id>', 'ID of superseding ADR (required when status is superseded)')
    .option('--tags <tags>', 'New comma-separated tags')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new ADRService(options.path);
        await service.initialize();
        
        // Handle superseded status specially
        if (options.status === 'superseded') {
          if (!options.supersededBy) {
            console.error('Error: --superseded-by is required when status is superseded');
            process.exit(1);
          }
          const a = await service.markSuperseded(id, options.supersededBy);
          console.log(`✓ Updated ADR: ${a.id}`);
          console.log(`  Status: ${a.status}`);
          console.log(`  Superseded by: ${a.supersededBy}`);
          return;
        }
        
        const updateData: Record<string, unknown> = {};
        if (options.title) updateData.title = options.title;
        if (options.status) updateData.status = options.status as ADRStatus;
        if (options.owner) updateData.owner = options.owner;
        if (options.tags) updateData.tags = options.tags.split(',').map((t: string) => t.trim());
        
        const a = await service.update(id, updateData);
        console.log(`✓ Updated ADR: ${a.id}`);
        console.log(`  Title: ${a.title}`);
        console.log(`  Status: ${a.status}`);
      } catch (error) {
        console.error('Error updating ADR:', (error as Error).message);
        process.exit(1);
      }
    });

  // Delete ADR
  adr
    .command('delete <id>')
    .description('Delete an ADR')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (id, options) => {
      try {
        const service = new ADRService(options.path);
        await service.initialize();
        
        const deleted = await service.delete(id);
        if (deleted) {
          console.log(`✓ Deleted ADR: ${id}`);
        } else {
          console.error(`ADR not found: ${id}`);
          process.exit(1);
        }
      } catch (error) {
        console.error('Error deleting ADR:', (error as Error).message);
        process.exit(1);
      }
    });
}
