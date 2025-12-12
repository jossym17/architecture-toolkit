// Verify command - check artifact integrity

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { computeChecksum } from '../../core/integrity.js';
import { handleError } from '../utils/error-handler.js';

export const verifyCommand = new Command('verify')
  .description('Verify artifact integrity')
  .argument('[id]', 'Artifact ID to verify (or "all" for all artifacts)')
  .option('-t, --type <type>', 'Filter by artifact type (rfc, adr, decomposition)')
  .action(async (id: string | undefined, options: { type?: string }) => {
    try {
      const store = new FileStore();
      
      if (id && id !== 'all') {
        // Verify single artifact
        const artifact = await store.load(id);
        if (!artifact) {
          console.error(`Artifact not found: ${id}`);
          process.exit(1);
        }
        
        const checksum = computeChecksum(artifact);
        console.log(`✓ ${artifact.id}: ${artifact.title}`);
        console.log(`  Type: ${artifact.type}`);
        console.log(`  Status: ${artifact.status}`);
        console.log(`  Checksum: ${checksum.substring(0, 16)}...`);
      } else {
        // Verify all artifacts
        const filters = options.type ? { type: options.type as 'rfc' | 'adr' | 'decomposition' } : undefined;
        const artifacts = await store.list(filters);
        
        if (artifacts.length === 0) {
          console.log('No artifacts found.');
          return;
        }
        
        console.log(`Verifying ${artifacts.length} artifact(s)...\n`);
        
        let valid = 0;
        let invalid = 0;
        
        for (const artifact of artifacts) {
          try {
            const checksum = computeChecksum(artifact);
            console.log(`✓ ${artifact.id}: ${checksum.substring(0, 16)}...`);
            valid++;
          } catch (error) {
            console.log(`✗ ${artifact.id}: INVALID - ${(error as Error).message}`);
            invalid++;
          }
        }
        
        console.log(`\nSummary: ${valid} valid, ${invalid} invalid`);
        
        if (invalid > 0) {
          process.exit(1);
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
