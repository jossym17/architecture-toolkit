/**
 * Update command for Architecture Documentation Toolkit CLI
 * 
 * Provides batch update operations for artifacts with filter expressions,
 * preview mode, and confirmation prompts.
 * 
 * Requirements: 7.1, 7.4
 */

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { BatchService, BatchUpdate } from '../../services/batch/batch-service.js';
import { PromptService } from '../../services/prompt/prompt-service.js';
import path from 'path';

/**
 * Register the update command with the CLI program
 */
export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update artifacts (supports batch operations with --filter)')
    .option('-f, --filter <expression>', 'Filter expression for batch updates (e.g., "type:rfc status:draft owner:john")')
    .option('-s, --status <status>', 'New status to set')
    .option('-o, --owner <owner>', 'New owner to set')
    .option('--add-tags <tags>', 'Comma-separated tags to add')
    .option('--remove-tags <tags>', 'Comma-separated tags to remove')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Preview changes without applying them')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        await executeUpdate(options);
      } catch (error) {
        console.error('Error updating artifacts:', (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Execute the update command
 */
async function executeUpdate(options: {
  filter?: string;
  status?: string;
  owner?: string;
  addTags?: string;
  removeTags?: string;
  yes?: boolean;
  dryRun?: boolean;
  path: string;
}): Promise<void> {
  // Validate that at least one update option is provided
  if (!options.status && !options.owner && !options.addTags && !options.removeTags) {
    console.error('Error: At least one update option is required (--status, --owner, --add-tags, or --remove-tags)');
    process.exit(1);
  }

  // Validate that filter is provided for batch operations
  if (!options.filter) {
    console.error('Error: --filter is required for batch updates');
    console.error('Example: arch update --filter "type:rfc status:draft" --status approved');
    process.exit(1);
  }

  const basePath = path.resolve(options.path);
  const archPath = path.join(basePath, '.arch');
  
  const fileStore = new FileStore({ baseDir: archPath });
  const batchService = new BatchService(fileStore);
  const promptService = new PromptService(basePath);

  // Parse the filter expression
  const filter = batchService.parseFilter(options.filter);

  // Build the update object
  const updates: BatchUpdate = {};
  
  if (options.status) {
    updates.status = options.status;
  }
  
  if (options.owner) {
    updates.owner = options.owner;
  }
  
  if (options.addTags) {
    updates.addTags = options.addTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }
  
  if (options.removeTags) {
    updates.removeTags = options.removeTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }

  // Get preview of changes
  const preview = await batchService.preview(filter, updates);

  if (preview.count === 0) {
    console.log('No artifacts match the specified filter.');
    return;
  }

  // Display preview
  console.log(batchService.formatPreview(preview));
  console.log();

  // If dry run, stop here
  if (options.dryRun) {
    console.log('Dry run complete. No changes were made.');
    return;
  }

  // If no actual changes would be made
  if (preview.changes.length === 0) {
    console.log('No changes needed. Artifacts already have the specified values.');
    return;
  }

  // Confirm unless --yes flag is provided
  if (!options.yes) {
    const confirmed = await promptService.promptForConfirmation(
      `Apply these changes to ${preview.changes.length} artifact(s)?`
    );
    
    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }
  }

  // Execute the batch update
  const result = await batchService.update(filter, updates);

  // Display results
  if (result.success) {
    console.log(`✓ Successfully updated ${result.updatedCount} artifact(s):`);
    for (const id of result.updatedIds) {
      console.log(`  - ${id}`);
    }
  } else {
    console.log(`Updated ${result.updatedCount} artifact(s) with ${result.errors.length} error(s):`);
    
    if (result.updatedIds.length > 0) {
      console.log('\nSuccessfully updated:');
      for (const id of result.updatedIds) {
        console.log(`  ✓ ${id}`);
      }
    }
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  ✗ ${error.artifactId}: ${error.message}`);
      }
    }
    
    process.exit(1);
  }
}

export { executeUpdate };
