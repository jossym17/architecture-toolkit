#!/usr/bin/env node
// Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerRfcCommands } from './commands/rfc.js';
import { registerAdrCommands } from './commands/adr.js';
import { registerDecompCommands } from './commands/decomp.js';
import { registerSearchCommand } from './commands/search.js';
import { registerTemplateCommands } from './commands/template.js';

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

program.parse();
