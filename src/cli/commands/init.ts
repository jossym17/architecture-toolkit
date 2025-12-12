// Init command for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize the .arch directory structure')
    .option('-p, --path <path>', 'Base path for initialization', process.cwd())
    .action(async (options) => {
      try {
        const fileStore = new FileStore({ baseDir: `${options.path}/.arch` });
        await fileStore.initialize();
        console.log('✓ Initialized .arch directory structure');
        console.log('  Created directories:');
        console.log('    - .arch/rfc/');
        console.log('    - .arch/adr/');
        console.log('    - .arch/decomposition/');
        console.log('    - .arch/templates/');
      } catch (error) {
        console.error('Error initializing:', (error as Error).message);
        process.exit(1);
      }
    });
}
