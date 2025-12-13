// Hooks commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GitHooksService, HookError } from '../../services/hooks/hooks-service.js';
import { FileStore } from '../../services/storage/file-store.js';

/**
 * Registers the hooks command and subcommands
 * 
 * Supports:
 * - arch hooks install [--husky] [--ci]
 * - arch hooks uninstall
 */
export function registerHooksCommand(program: Command): void {
  const hooksCommand = program
    .command('hooks')
    .description('Manage git hooks for architecture artifact validation');

  // Install subcommand
  hooksCommand
    .command('install')
    .description('Install git hooks for architecture artifact validation')
    .option('--husky', 'Configure hooks compatible with Husky')
    .option('--ci [platform]', 'Generate CI-compatible validation script (github or gitlab)', false)
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const basePath = options.path;
        const fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
        const hooksService = new GitHooksService(fileStore, basePath);

        // Install hooks
        console.log('Installing git hooks...');
        
        await hooksService.install({
          husky: options.husky,
          ci: !!options.ci,
          hooks: ['pre-commit']
        });

        if (options.husky) {
          console.log('✓ Installed Husky-compatible pre-commit hook');
        } else {
          console.log('✓ Installed pre-commit hook in .git/hooks');
        }

        // Generate CI script if requested
        if (options.ci) {
          const platform = typeof options.ci === 'string' ? options.ci : 'github';
          
          if (platform !== 'github' && platform !== 'gitlab') {
            console.error(`Error: Unsupported CI platform '${platform}'`);
            console.error('Supported platforms: github, gitlab');
            process.exit(1);
          }

          const ciScript = hooksService.generateCIScript(platform as 'github' | 'gitlab');
          
          // Determine output path based on platform
          let outputPath: string;
          let outputDir: string;
          
          if (platform === 'github') {
            outputDir = path.join(basePath, '.github', 'workflows');
            outputPath = path.join(outputDir, 'arch-validate.yml');
          } else {
            outputDir = basePath;
            outputPath = path.join(basePath, '.gitlab-ci-arch.yml');
          }

          // Create directory if needed
          await fs.mkdir(outputDir, { recursive: true });
          
          // Write CI script
          await fs.writeFile(outputPath, ciScript, 'utf-8');
          
          console.log(`✓ Generated ${platform === 'github' ? 'GitHub Actions' : 'GitLab CI'} workflow at ${outputPath}`);
        }

        console.log('\nHooks installed successfully!');
        console.log('Architecture artifacts will be validated before each commit.');
      } catch (error) {
        if (error instanceof HookError) {
          console.error(`Error: ${error.message}`);
          if (error.details) {
            console.error(`  ${error.details}`);
          }
          process.exit(1);
        }
        console.error('Error installing hooks:', (error as Error).message);
        process.exit(1);
      }
    });

  // Uninstall subcommand
  hooksCommand
    .command('uninstall')
    .description('Remove all installed architecture validation hooks')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const basePath = options.path;
        const fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
        const hooksService = new GitHooksService(fileStore, basePath);

        console.log('Removing git hooks...');
        
        await hooksService.uninstall();

        console.log('✓ Removed architecture validation hooks');
        console.log('\nHooks uninstalled successfully!');
      } catch (error) {
        if (error instanceof HookError) {
          console.error(`Error: ${error.message}`);
          if (error.details) {
            console.error(`  ${error.details}`);
          }
          process.exit(1);
        }
        console.error('Error uninstalling hooks:', (error as Error).message);
        process.exit(1);
      }
    });
}
