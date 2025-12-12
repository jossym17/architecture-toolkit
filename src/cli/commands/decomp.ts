// Decomposition Plan commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { DecompositionPlanService } from '../../services/decomposition/decomposition-service.js';
import { PromptService, InteractiveError } from '../../services/prompt/prompt-service.js';

export function registerDecompCommands(program: Command): void {
  const decomp = program
    .command('decomp')
    .description('Manage System Decomposition Plans');

  // Create Decomposition Plan
  decomp
    .command('create')
    .description('Create a new Decomposition Plan')
    .option('-t, --title <title>', 'Plan title')
    .option('-o, --owner <owner>', 'Plan owner')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--rationale <rationale>', 'Plan rationale (use editor for multi-line in interactive mode)')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new DecompositionPlanService(options.path);
        await service.initialize();
        
        const promptService = new PromptService(options.path);
        
        // Build provided fields from command line options
        const providedFields: Record<string, unknown> = {};
        if (options.title) providedFields.title = options.title;
        if (options.owner) providedFields.owner = options.owner;
        if (options.tags) providedFields.tags = options.tags.split(',').map((t: string) => t.trim());
        
        // Get smart defaults for prompting
        const smartDefaults = await promptService.getSmartDefaults();
        
        // Get existing decomposition plans for tag suggestions and title validation
        const existingPlans = await service.list();
        const tagSuggestions = promptService.getTagSuggestions('decomposition', existingPlans);
        
        // Build prompt options with defaults and suggestions
        const promptOptions = {
          defaults: smartDefaults,
          suggestions: { tags: tagSuggestions },
          validators: {
            title: (value: string) => {
              const result = promptService.validateTitleUniqueness(value, existingPlans);
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
        const input = await promptService.promptForMissingFields('decomposition', providedFields, promptOptions);
        
        // Handle rationale - prompt for multi-line input if not provided and in interactive mode
        let rationale = options.rationale;
        if (!rationale && promptService.isInteractive()) {
          const shouldAddRationale = await promptService.promptForConfirmation(
            'Would you like to add a rationale for this decomposition plan? (opens editor)'
          );
          if (shouldAddRationale) {
            rationale = await promptService.promptForMultiLineContent(
              'rationale',
              'Enter the rationale for this decomposition:',
              '[Describe the rationale for this decomposition]'
            );
          }
        }
        
        const plan = await service.create({
          title: input.title,
          owner: input.owner,
          tags: input.tags,
          rationale: rationale || undefined
        });
        
        console.log(`✓ Created Decomposition Plan: ${plan.id}`);
        console.log(`  Title: ${plan.title}`);
        console.log(`  Owner: ${plan.owner}`);
        console.log(`  Phases: ${plan.phases.length}`);
      } catch (error) {
        if (error instanceof InteractiveError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
        console.error('Error creating plan:', (error as Error).message);
        process.exit(1);
      }
    });

  // List Decomposition Plans
  decomp
    .command('list')
    .description('List all Decomposition Plans')
    .option('--owner <owner>', 'Filter by owner')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new DecompositionPlanService(options.path);
        await service.initialize();

        const plans = await service.list({
          owner: options.owner
        });
        
        if (plans.length === 0) {
          console.log('No Decomposition Plans found');
          return;
        }
        
        console.log(`Found ${plans.length} Decomposition Plan(s):\n`);
        for (const p of plans) {
          console.log(`  ${p.id} - ${p.title}`);
          console.log(`    Owner: ${p.owner} | Phases: ${p.phases.length}`);
          if (p.tags.length > 0) {
            console.log(`    Tags: ${p.tags.join(', ')}`);
          }
          console.log();
        }
      } catch (error) {
        console.error('Error listing plans:', (error as Error).message);
        process.exit(1);
      }
    });

  // Show Decomposition Plan
  decomp
    .command('show <id>')
    .description('Show Decomposition Plan details')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new DecompositionPlanService(options.path);
        await service.initialize();
        
        const p = await service.get(id);
        if (!p) {
          console.error(`Decomposition Plan not found: ${id}`);
          process.exit(1);
        }
        
        console.log(`Decomposition Plan: ${p.id}`);
        console.log(`Title: ${p.title}`);
        console.log(`Owner: ${p.owner}`);
        console.log(`Created: ${p.createdAt.toISOString()}`);
        console.log(`Updated: ${p.updatedAt.toISOString()}`);
        if (p.tags.length > 0) {
          console.log(`Tags: ${p.tags.join(', ')}`);
        }
        console.log(`\n--- Rationale ---\n${p.rationale}`);
        console.log(`\n--- Success Metrics ---`);
        p.successMetrics.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
        console.log(`\n--- Phases ---`);
        for (const phase of p.phases) {
          console.log(`  ${phase.id}: ${phase.name} [${phase.status}]`);
          console.log(`    ${phase.description}`);
          console.log(`    Duration: ${phase.estimatedDuration}`);
          if (phase.dependencies.length > 0) {
            console.log(`    Dependencies: ${phase.dependencies.join(', ')}`);
          }
          if (phase.completedAt) {
            console.log(`    Completed: ${phase.completedAt.toISOString()}`);
          }
        }
        if (p.teamModuleMapping.length > 0) {
          console.log(`\n--- Team-Module Mapping ---`);
          for (const tm of p.teamModuleMapping) {
            console.log(`  ${tm.teamName} (${tm.teamId}): ${tm.modules.join(', ')}`);
          }
        }
        if (p.migrationTasks.length > 0) {
          console.log(`\n--- Migration Tasks ---`);
          for (const task of p.migrationTasks) {
            console.log(`  ${task.id}: ${task.description} [${task.status}]`);
            if (task.assignee) {
              console.log(`    Assignee: ${task.assignee}`);
            }
          }
        }
      } catch (error) {
        console.error('Error showing plan:', (error as Error).message);
        process.exit(1);
      }
    });

  // Update Decomposition Plan
  decomp
    .command('update <id>')
    .description('Update a Decomposition Plan')
    .option('-t, --title <title>', 'New title')
    .option('--owner <owner>', 'New owner')
    .option('--tags <tags>', 'New comma-separated tags')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (id, options) => {
      try {
        const service = new DecompositionPlanService(options.path);
        await service.initialize();
        
        const updateData: Record<string, unknown> = {};
        if (options.title) updateData.title = options.title;
        if (options.owner) updateData.owner = options.owner;
        if (options.tags) updateData.tags = options.tags.split(',').map((t: string) => t.trim());
        
        const p = await service.update(id, updateData);
        console.log(`✓ Updated Decomposition Plan: ${p.id}`);
        console.log(`  Title: ${p.title}`);
      } catch (error) {
        console.error('Error updating plan:', (error as Error).message);
        process.exit(1);
      }
    });

  // Delete Decomposition Plan
  decomp
    .command('delete <id>')
    .description('Delete a Decomposition Plan')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (id, options) => {
      try {
        const service = new DecompositionPlanService(options.path);
        await service.initialize();
        
        const deleted = await service.delete(id);
        if (deleted) {
          console.log(`✓ Deleted Decomposition Plan: ${id}`);
        } else {
          console.error(`Decomposition Plan not found: ${id}`);
          process.exit(1);
        }
      } catch (error) {
        console.error('Error deleting plan:', (error as Error).message);
        process.exit(1);
      }
    });
}
