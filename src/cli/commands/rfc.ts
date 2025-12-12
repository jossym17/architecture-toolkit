// RFC commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { RFCService } from '../../services/rfc/rfc-service.js';
import { RFCStatus } from '../../models/types.js';

export function registerRfcCommands(program: Command): void {
  const rfc = program
    .command('rfc')
    .description('Manage RFC documents');

  // Create RFC
  rfc
    .command('create')
    .description('Create a new RFC')
    .requiredOption('-t, --title <title>', 'RFC title')
    .requiredOption('-o, --owner <owner>', 'RFC owner')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new RFCService(options.path);
        await service.initialize();
        
        const rfc = await service.create({
          title: options.title,
          owner: options.owner,
          tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : []
        });
        
        console.log(`✓ Created RFC: ${rfc.id}`);
        console.log(`  Title: ${rfc.title}`);
        console.log(`  Owner: ${rfc.owner}`);
        console.log(`  Status: ${rfc.status}`);
      } catch (error) {
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
