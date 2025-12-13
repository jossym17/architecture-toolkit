#!/usr/bin/env node
// Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerRfcCommands } from './commands/rfc.js';
import { registerAdrCommands } from './commands/adr.js';
import { registerDecompCommands } from './commands/decomp.js';
import { registerSearchCommand } from './commands/search.js';
import { registerTemplateCommands } from './commands/template.js';
import { registerPluginCommands } from './commands/plugin.js';
import { registerAnalyzeCommands } from './commands/analyze.js';
import { registerLinkCommands } from './commands/link.js';
import { registerGraphCommand } from './commands/graph.js';
import { registerHooksCommand } from './commands/hooks.js';
import { verifyCommand } from './commands/verify.js';
import { exportCommand } from './commands/export.js';
import { statsCommand } from './commands/stats.js';
import { healthCommand } from './commands/health.js';

const program = new Command();

program
  .name('arch')
  .description('Architecture Documentation Toolkit - Manage RFCs, ADRs, and Decomposition Plans')
  .version('0.1.0');

// Register all commands
registerInitCommand(program);
registerRfcCommands(program);
registerAdrCommands(program);
registerDecompCommands(program);
registerSearchCommand(program);
registerTemplateCommands(program);
registerPluginCommands(program);
registerAnalyzeCommands(program);
registerLinkCommands(program);
registerGraphCommand(program);
registerHooksCommand(program);
program.addCommand(verifyCommand);
program.addCommand(exportCommand);
program.addCommand(statsCommand);
program.addCommand(healthCommand);

program.parse();
