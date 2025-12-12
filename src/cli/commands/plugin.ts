// Plugin command - Manage plugins

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PluginManager, builtinPlugins, Plugin } from '../../plugins/index.js';
import { handleError } from '../utils/error-handler.js';

export function registerPluginCommands(program: Command): void {
  const plugin = program
    .command('plugin')
    .description('Manage plugins');

  // List plugins
  plugin
    .command('list')
    .description('List all registered plugins')
    .action(async () => {
      try {
        const pluginManager = new PluginManager();

        // Register built-in plugins
        for (const p of builtinPlugins) {
          await pluginManager.register(p);
        }

        // Load custom plugins
        await pluginManager.loadFromConfig();

        const plugins = pluginManager.getPlugins();

        if (plugins.length === 0) {
          console.log('No plugins registered.'); // eslint-disable-line no-console
          return;
        }

        console.log('\nRegistered Plugins:\n'); // eslint-disable-line no-console
        for (const p of plugins) {
          const isBuiltin = p.id.startsWith('builtin-');
          const badge = isBuiltin ? '[built-in]' : '[custom]';
          console.log(`  ${p.name} v${p.version} ${badge}`); // eslint-disable-line no-console
          console.log(`    ID: ${p.id}`); // eslint-disable-line no-console
          if (p.description) {
            console.log(`    ${p.description}`); // eslint-disable-line no-console
          }
          if (p.exportFormats && p.exportFormats.length > 0) {
            console.log(`    Export formats: ${p.exportFormats.map(f => f.id).join(', ')}`); // eslint-disable-line no-console
          }
          if (p.hooks) {
            const hookNames = Object.keys(p.hooks).filter(k => p.hooks![k as keyof typeof p.hooks]);
            if (hookNames.length > 0) {
              console.log(`    Hooks: ${hookNames.join(', ')}`); // eslint-disable-line no-console
            }
          }
          console.log(''); // eslint-disable-line no-console
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Create plugin scaffold
  plugin
    .command('create')
    .description('Create a new plugin scaffold')
    .argument('<name>', 'Plugin name')
    .option('-d, --dir <dir>', 'Output directory', '.')
    .action(async (name: string, options: { dir: string }) => {
      try {
        const pluginId = name.toLowerCase().replace(/\s+/g, '-');
        const pluginConfig: Plugin = {
          id: pluginId,
          name: name,
          version: '1.0.0',
          description: `Custom plugin: ${name}`,
          hooks: {},
          exportFormats: []
        };

        const outputPath = path.join(options.dir, `${pluginId}.json`);
        await fs.writeFile(outputPath, JSON.stringify(pluginConfig, null, 2), 'utf-8');

        console.log(`Created plugin scaffold: ${outputPath}`); // eslint-disable-line no-console
        console.log('\nTo install, copy to .arch/plugins/'); // eslint-disable-line no-console
      } catch (error) {
        handleError(error);
      }
    });

  // Install plugin
  plugin
    .command('install')
    .description('Install a plugin from file')
    .argument('<file>', 'Plugin JSON file')
    .action(async (file: string) => {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const pluginConfig = JSON.parse(content) as Plugin;

        const pluginManager = new PluginManager();
        const result = await pluginManager.register(pluginConfig);

        if (result.success) {
          await pluginManager.savePluginConfig(pluginConfig);
          console.log(`Installed plugin: ${pluginConfig.name} v${pluginConfig.version}`); // eslint-disable-line no-console
        } else {
          console.error(`Failed to install plugin: ${result.error}`); // eslint-disable-line no-console
          process.exit(1);
        }
      } catch (error) {
        handleError(error);
      }
    });

  // Uninstall plugin
  plugin
    .command('uninstall')
    .description('Uninstall a plugin')
    .argument('<id>', 'Plugin ID')
    .action(async (id: string) => {
      try {
        if (id.startsWith('builtin-')) {
          console.error('Cannot uninstall built-in plugins'); // eslint-disable-line no-console
          process.exit(1);
        }

        const pluginsDir = path.join('.arch', 'plugins');
        const configPath = path.join(pluginsDir, `${id}.json`);

        try {
          await fs.unlink(configPath);
          console.log(`Uninstalled plugin: ${id}`); // eslint-disable-line no-console
        } catch {
          console.error(`Plugin not found: ${id}`); // eslint-disable-line no-console
          process.exit(1);
        }
      } catch (error) {
        handleError(error);
      }
    });
}
