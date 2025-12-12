// Template commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import * as fs from 'fs/promises';
import { TemplateService } from '../../services/template/template-service.js';

export function registerTemplateCommands(program: Command): void {
  const template = program
    .command('template')
    .description('Manage artifact templates');

  // Export template
  template
    .command('export <templateId>')
    .description('Export a template to JSON')
    .option('-o, --output <file>', 'Output file path')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (templateId, options) => {
      try {
        const service = new TemplateService({ baseDir: `${options.path}/.arch` });
        await service.loadAllTemplates();
        
        const json = service.exportTemplate(templateId);
        
        if (options.output) {
          await fs.writeFile(options.output, json, 'utf-8');
          console.log(`✓ Exported template to: ${options.output}`);
        } else {
          console.log(json);
        }
      } catch (error) {
        console.error('Error exporting template:', (error as Error).message);
        process.exit(1);
      }
    });

  // Import template
  template
    .command('import <file>')
    .description('Import a template from JSON file')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (file, options) => {
      try {
        const service = new TemplateService({ baseDir: `${options.path}/.arch` });
        
        const content = await fs.readFile(file, 'utf-8');
        const result = service.importTemplate(content);
        
        if (!result.success) {
          console.error('Error importing template:');
          for (const err of result.errors) {
            console.error(`  - ${err.field}: ${err.message}`);
          }
          process.exit(1);
        }
        
        // Save the imported template
        await service.saveTemplate(result.template!.id);
        
        console.log(`✓ Imported template: ${result.template!.id}`);
        console.log(`  Name: ${result.template!.name}`);
        console.log(`  Type: ${result.template!.artifactType}`);
        console.log(`  Sections: ${result.template!.sections.length}`);
      } catch (error) {
        console.error('Error importing template:', (error as Error).message);
        process.exit(1);
      }
    });

  // List templates
  template
    .command('list')
    .description('List all available templates')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (options) => {
      try {
        const service = new TemplateService({ baseDir: `${options.path}/.arch` });
        await service.loadAllTemplates();
        
        const templates = service.listTemplates();
        
        console.log(`Available templates:\n`);
        for (const t of templates) {
          const requiredCount = t.sections.filter(s => s.required).length;
          const optionalCount = t.sections.length - requiredCount;
          console.log(`  ${t.id}`);
          console.log(`    Name: ${t.name}`);
          console.log(`    Type: ${t.artifactType}`);
          console.log(`    Sections: ${requiredCount} required, ${optionalCount} optional`);
          console.log();
        }
      } catch (error) {
        console.error('Error listing templates:', (error as Error).message);
        process.exit(1);
      }
    });
}
