// Stats command - Show artifact statistics and analytics

import { Command } from 'commander';
import { FileStore } from '../../services/storage/file-store.js';
import { handleError } from '../utils/error-handler.js';

interface ArtifactStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byOwner: Record<string, number>;
  byMonth: Record<string, number>;
  avgAge: number;
  oldestArtifact?: { id: string; title: string; createdAt: Date };
  newestArtifact?: { id: string; title: string; createdAt: Date };
}

export const statsCommand = new Command('stats')
  .description('Show artifact statistics and analytics')
  .option('-t, --type <type>', 'Filter by artifact type')
  .option('--json', 'Output as JSON')
  .action(async (options: { type?: string; json?: boolean }) => {
    try {
      const store = new FileStore();
      const filters = options.type ? { type: options.type as 'rfc' | 'adr' | 'decomposition' } : undefined;
      const artifacts = await store.list(filters);

      if (artifacts.length === 0) {
        console.log('No artifacts found.'); // eslint-disable-line no-console
        return;
      }

      const stats: ArtifactStats = {
        total: artifacts.length,
        byType: {},
        byStatus: {},
        byOwner: {},
        byMonth: {},
        avgAge: 0
      };

      let totalAge = 0;
      const now = new Date();

      for (const artifact of artifacts) {
        // By type
        stats.byType[artifact.type] = (stats.byType[artifact.type] || 0) + 1;

        // By status
        stats.byStatus[artifact.status] = (stats.byStatus[artifact.status] || 0) + 1;

        // By owner
        stats.byOwner[artifact.owner] = (stats.byOwner[artifact.owner] || 0) + 1;

        // By month
        const monthKey = `${artifact.createdAt.getFullYear()}-${String(artifact.createdAt.getMonth() + 1).padStart(2, '0')}`;
        stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + 1;

        // Age calculation
        const age = now.getTime() - artifact.createdAt.getTime();
        totalAge += age;

        // Track oldest/newest
        if (!stats.oldestArtifact || artifact.createdAt < stats.oldestArtifact.createdAt) {
          stats.oldestArtifact = { id: artifact.id, title: artifact.title, createdAt: artifact.createdAt };
        }
        if (!stats.newestArtifact || artifact.createdAt > stats.newestArtifact.createdAt) {
          stats.newestArtifact = { id: artifact.id, title: artifact.title, createdAt: artifact.createdAt };
        }
      }

      stats.avgAge = Math.round(totalAge / artifacts.length / (1000 * 60 * 60 * 24)); // Days

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2)); // eslint-disable-line no-console
        return;
      }

      // Pretty print
      console.log('\n📊 Architecture Artifacts Statistics\n'); // eslint-disable-line no-console
      console.log(`Total Artifacts: ${stats.total}`); // eslint-disable-line no-console
      console.log(`Average Age: ${stats.avgAge} days\n`); // eslint-disable-line no-console

      console.log('By Type:'); // eslint-disable-line no-console
      for (const [type, count] of Object.entries(stats.byType)) {
        const bar = '█'.repeat(Math.ceil(count / stats.total * 20));
        console.log(`  ${type.padEnd(15)} ${bar} ${count}`); // eslint-disable-line no-console
      }

      console.log('\nBy Status:'); // eslint-disable-line no-console
      for (const [status, count] of Object.entries(stats.byStatus)) {
        const bar = '█'.repeat(Math.ceil(count / stats.total * 20));
        console.log(`  ${status.padEnd(15)} ${bar} ${count}`); // eslint-disable-line no-console
      }

      console.log('\nTop Contributors:'); // eslint-disable-line no-console
      const sortedOwners = Object.entries(stats.byOwner).sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [owner, count] of sortedOwners) {
        console.log(`  ${owner.padEnd(20)} ${count} artifact(s)`); // eslint-disable-line no-console
      }

      if (stats.oldestArtifact) {
        console.log(`\nOldest: ${stats.oldestArtifact.id} - ${stats.oldestArtifact.title}`); // eslint-disable-line no-console
        console.log(`        Created: ${stats.oldestArtifact.createdAt.toLocaleDateString()}`); // eslint-disable-line no-console
      }

      if (stats.newestArtifact) {
        console.log(`\nNewest: ${stats.newestArtifact.id} - ${stats.newestArtifact.title}`); // eslint-disable-line no-console
        console.log(`        Created: ${stats.newestArtifact.createdAt.toLocaleDateString()}`); // eslint-disable-line no-console
      }

      console.log(''); // eslint-disable-line no-console
    } catch (error) {
      handleError(error);
    }
  });
