// Link commands for Architecture Documentation Toolkit CLI

import { Command } from 'commander';
import { LinkService, LinkType, LINK_TYPES, LinkDisplay } from '../../services/link/link-service.js';
import { FileStore } from '../../services/storage/file-store.js';
import { PromptService, InteractiveError } from '../../services/prompt/prompt-service.js';
import { NotFoundError } from '../../core/errors.js';

/**
 * Validates that a link type is valid
 */
function isValidLinkType(type: string): type is LinkType {
  return LINK_TYPES.includes(type as LinkType);
}

/**
 * Formats a link display for tree output
 */
function formatLinkDisplay(link: LinkDisplay, indent: string = ''): string {
  const direction = link.direction === 'incoming' ? '←' : '→';
  const typeLabel = link.linkType.replace('-', ' ');
  return `${indent}${direction} [${typeLabel}] ${link.id} - ${link.title} (${link.type})`;
}

/**
 * Displays all relationships for an artifact in tree format
 */
async function displayArtifactLinks(artifactId: string, basePath: string): Promise<void> {
  const fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
  const linkService = new LinkService(fileStore);

  // Verify artifact exists
  const artifact = await fileStore.load(artifactId);
  if (!artifact) {
    console.error(`Error: Artifact not found: ${artifactId}`);
    process.exit(1);
  }

  // Get links for display
  const links = await linkService.getLinksForDisplay(artifactId);

  if (links.length === 0) {
    console.log(`No relationships found for ${artifactId}`);
    return;
  }

  // Separate incoming and outgoing links
  const incoming = links.filter(l => l.direction === 'incoming');
  const outgoing = links.filter(l => l.direction === 'outgoing');

  console.log(`\nRelationships for ${artifactId} - ${artifact.title}\n`);

  if (outgoing.length > 0) {
    console.log('Outgoing Links (this artifact references):');
    for (const link of outgoing) {
      console.log(formatLinkDisplay(link, '  '));
    }
    console.log();
  }

  if (incoming.length > 0) {
    console.log('Incoming Links (referenced by):');
    for (const link of incoming) {
      console.log(formatLinkDisplay(link, '  '));
    }
    console.log();
  }

  console.log(`Total: ${links.length} relationship(s)`);
}

export function registerLinkCommands(program: Command): void {
  // Main link command - supports `arch link <source-id> <target-id>` and `arch link --list <artifact-id>`
  program
    .command('link [source-id] [target-id]')
    .description('Create a link between artifacts or list relationships')
    .option('-l, --list <artifact-id>', 'Display all relationships for an artifact in tree format')
    .option('-t, --type <type>', 'Relationship type (implements, supersedes, relates-to, depends-on, blocks, enables)')
    .option('-p, --path <path>', 'Base path', process.cwd())
    .action(async (sourceId: string | undefined, targetId: string | undefined, options) => {
      try {
        // Handle --list flag: `arch link --list <artifact-id>`
        if (options.list) {
          await displayArtifactLinks(options.list, options.path);
          return;
        }

        // Handle link creation: `arch link <source-id> <target-id>`
        if (!sourceId || !targetId) {
          console.error('Error: Both source-id and target-id are required to create a link');
          console.error('Usage: arch link <source-id> <target-id> [--type <type>]');
          console.error('       arch link --list <artifact-id>');
          process.exit(1);
        }

        const fileStore = new FileStore({ baseDir: `${options.path}/.arch` });
        const linkService = new LinkService(fileStore);
        const promptService = new PromptService(options.path);

        let linkType: LinkType;

        // If type is provided, validate it
        if (options.type) {
          if (!isValidLinkType(options.type)) {
            console.error(`Error: Invalid link type '${options.type}'`);
            console.error(`Valid types: ${LINK_TYPES.join(', ')}`);
            process.exit(1);
          }
          linkType = options.type;
        } else {
          // Prompt for type if not provided (interactive mode)
          try {
            linkType = await promptService.promptForLinkType();
          } catch (error) {
            if (error instanceof InteractiveError) {
              console.error('Error: --type flag is required in non-interactive mode');
              console.error(`Valid types: ${LINK_TYPES.join(', ')}`);
              process.exit(1);
            }
            throw error;
          }
        }

        // Create the link
        const result = await linkService.createLink(sourceId, targetId, linkType);

        // Display warning if duplicate was detected
        if (result.warning) {
          console.warn(`⚠ Warning: ${result.warning}`);
        }

        console.log(`✓ Created link: ${sourceId} → ${targetId}`);
        console.log(`  Type: ${linkType}`);
        console.log(`  Created: ${result.link.createdAt.toISOString()}`);
      } catch (error) {
        if (error instanceof NotFoundError) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
        console.error('Error creating link:', (error as Error).message);
        process.exit(1);
      }
    });
}
