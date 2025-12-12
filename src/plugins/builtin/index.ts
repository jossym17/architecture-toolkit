// Built-in plugins for architecture toolkit

import { Plugin } from '../plugin-manager.js';
import { Artifact } from '../../models/artifact.js';

/**
 * JSON Export Plugin - Export artifacts to JSON format
 */
export const jsonExportPlugin: Plugin = {
  id: 'builtin-json-export',
  name: 'JSON Export',
  version: '1.0.0',
  description: 'Export artifacts to JSON format',
  exportFormats: [
    {
      id: 'json',
      name: 'JSON',
      extension: '.json',
      export: async (artifacts: Artifact[]): Promise<string> => {
        return JSON.stringify(artifacts, null, 2);
      }
    },
    {
      id: 'json-compact',
      name: 'JSON (Compact)',
      extension: '.json',
      export: async (artifacts: Artifact[]): Promise<string> => {
        return JSON.stringify(artifacts);
      }
    }
  ]
};

/**
 * CSV Export Plugin - Export artifacts to CSV format
 */
export const csvExportPlugin: Plugin = {
  id: 'builtin-csv-export',
  name: 'CSV Export',
  version: '1.0.0',
  description: 'Export artifacts to CSV format',
  exportFormats: [
    {
      id: 'csv',
      name: 'CSV',
      extension: '.csv',
      export: async (artifacts: Artifact[]): Promise<string> => {
        if (artifacts.length === 0) return '';
        
        const headers = ['id', 'type', 'title', 'status', 'owner', 'createdAt', 'updatedAt', 'tags'];
        const rows = artifacts.map(a => [
          a.id,
          a.type,
          `"${a.title.replace(/"/g, '""')}"`,
          a.status,
          a.owner,
          a.createdAt.toISOString(),
          a.updatedAt.toISOString(),
          `"${a.tags.join(', ')}"`
        ].join(','));
        
        return [headers.join(','), ...rows].join('\n');
      }
    }
  ]
};

/**
 * HTML Export Plugin - Export artifacts to HTML format
 */
export const htmlExportPlugin: Plugin = {
  id: 'builtin-html-export',
  name: 'HTML Export',
  version: '1.0.0',
  description: 'Export artifacts to HTML format',
  exportFormats: [
    {
      id: 'html',
      name: 'HTML',
      extension: '.html',
      export: async (artifacts: Artifact[]): Promise<string> => {
        const rows = artifacts.map(a => `
          <tr>
            <td>${a.id}</td>
            <td>${a.type}</td>
            <td>${a.title}</td>
            <td><span class="status status-${a.status}">${a.status}</span></td>
            <td>${a.owner}</td>
            <td>${a.createdAt.toLocaleDateString()}</td>
          </tr>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Artifacts</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:hover { background: #f9f9f9; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status-draft { background: #fef3c7; color: #92400e; }
    .status-review { background: #dbeafe; color: #1e40af; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .status-proposed { background: #e0e7ff; color: #3730a3; }
    .status-accepted { background: #d1fae5; color: #065f46; }
  </style>
</head>
<body>
  <h1>Architecture Artifacts</h1>
  <p>Generated: ${new Date().toLocaleString()}</p>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Type</th>
        <th>Title</th>
        <th>Status</th>
        <th>Owner</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
      }
    }
  ]
};

/**
 * Mermaid Diagram Plugin - Generate dependency diagrams
 */
export const mermaidPlugin: Plugin = {
  id: 'builtin-mermaid',
  name: 'Mermaid Diagrams',
  version: '1.0.0',
  description: 'Generate Mermaid diagrams from artifact relationships',
  exportFormats: [
    {
      id: 'mermaid',
      name: 'Mermaid Diagram',
      extension: '.mmd',
      export: async (artifacts: Artifact[]): Promise<string> => {
        const lines = ['graph TD'];
        
        // Add nodes
        for (const artifact of artifacts) {
          const shape = artifact.type === 'rfc' ? '([' : artifact.type === 'adr' ? '{{' : '[[';
          const closeShape = artifact.type === 'rfc' ? '])' : artifact.type === 'adr' ? '}}' : ']]';
          lines.push(`  ${artifact.id}${shape}"${artifact.title}"${closeShape}`);
        }
        
        // Add relationships
        for (const artifact of artifacts) {
          for (const ref of artifact.references) {
            lines.push(`  ${artifact.id} --> ${ref.targetId}`);
          }
        }
        
        return lines.join('\n');
      }
    }
  ]
};

/**
 * Audit Trail Plugin - Track all changes
 */
export const auditTrailPlugin: Plugin = {
  id: 'builtin-audit-trail',
  name: 'Audit Trail',
  version: '1.0.0',
  description: 'Track all artifact changes for compliance',
  hooks: {
    afterCreate: async (artifact: Artifact): Promise<void> => {
      const entry = {
        timestamp: new Date().toISOString(),
        action: 'CREATE',
        artifactId: artifact.id,
        artifactType: artifact.type,
        user: artifact.owner
      };
      // In production, this would write to an audit log
      if (process.env.DEBUG) {
        console.log('[AUDIT]', JSON.stringify(entry)); // eslint-disable-line no-console
      }
    },
    afterUpdate: async (artifact: Artifact): Promise<void> => {
      const entry = {
        timestamp: new Date().toISOString(),
        action: 'UPDATE',
        artifactId: artifact.id,
        artifactType: artifact.type,
        user: artifact.owner
      };
      if (process.env.DEBUG) {
        console.log('[AUDIT]', JSON.stringify(entry)); // eslint-disable-line no-console
      }
    },
    afterDelete: async (id: string): Promise<void> => {
      const entry = {
        timestamp: new Date().toISOString(),
        action: 'DELETE',
        artifactId: id
      };
      if (process.env.DEBUG) {
        console.log('[AUDIT]', JSON.stringify(entry)); // eslint-disable-line no-console
      }
    },
    onStatusChange: async (artifact: Artifact, oldStatus: string, newStatus: string): Promise<void> => {
      const entry = {
        timestamp: new Date().toISOString(),
        action: 'STATUS_CHANGE',
        artifactId: artifact.id,
        oldStatus,
        newStatus,
        user: artifact.owner
      };
      if (process.env.DEBUG) {
        console.log('[AUDIT]', JSON.stringify(entry)); // eslint-disable-line no-console
      }
    }
  }
};

/**
 * All built-in plugins
 */
export const builtinPlugins: Plugin[] = [
  jsonExportPlugin,
  csvExportPlugin,
  htmlExportPlugin,
  mermaidPlugin,
  auditTrailPlugin
];
