/**
 * Audit Service
 * 
 * Logs all artifact operations and provides compliance
 * reporting for regulated environments.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStore } from '../storage/file-store.js';
import { ConfigService } from '../config/config-service.js';

/**
 * Audit action types
 */
export type AuditActionType = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'link' | 'unlink';

/**
 * Audit action to be logged
 */
export interface AuditAction {
  artifactId: string;
  action: AuditActionType;
  user: string;
  timestamp: Date;
  changes?: Record<string, { old: unknown; new: unknown }>;
}

/**
 * Stored audit entry
 */
export interface AuditEntry extends AuditAction {
  id: string;
}

/**
 * Supported compliance frameworks
 */
export type ComplianceFramework = 'SOC2' | 'ISO27001' | 'HIPAA';

/**
 * Control mapping for compliance
 */
export interface ControlMapping {
  controlId: string;
  controlName: string;
  artifacts: string[];
  status: 'covered' | 'partial' | 'missing';
}

/**
 * Compliance gap information
 */
export interface ComplianceGap {
  controlId: string;
  issue: string;
  recommendation: string;
}

/**
 * Compliance report
 */
export interface ComplianceReport {
  framework: ComplianceFramework;
  compliant: boolean;
  mappings: ControlMapping[];
  gaps: ComplianceGap[];
}

/**
 * Export options for audit reports
 */
export interface ExportOptions {
  format: 'html' | 'pdf' | 'json';
  outputPath?: string;
}

/**
 * Audit Service Interface
 */
export interface IAuditService {
  logAction(action: AuditAction): Promise<void>;
  getHistory(artifactId: string): Promise<AuditEntry[]>;
  getAllEntries(): Promise<AuditEntry[]>;
  exportReport(options?: ExportOptions): Promise<string>;
  checkCompliance(framework: ComplianceFramework): Promise<ComplianceReport>;
  checkApprovalCompliance(artifactId: string): Promise<{ compliant: boolean; reason?: string }>;
}

/**
 * SOC2 control definitions for compliance mapping
 */
const SOC2_CONTROLS: Array<{ id: string; name: string; keywords: string[] }> = [
  { id: 'CC1.1', name: 'Control Environment', keywords: ['governance', 'policy', 'standard'] },
  { id: 'CC2.1', name: 'Communication and Information', keywords: ['documentation', 'communication', 'information'] },
  { id: 'CC3.1', name: 'Risk Assessment', keywords: ['risk', 'assessment', 'security', 'threat'] },
  { id: 'CC4.1', name: 'Monitoring Activities', keywords: ['monitoring', 'audit', 'review', 'health'] },
  { id: 'CC5.1', name: 'Control Activities', keywords: ['control', 'process', 'procedure'] },
  { id: 'CC6.1', name: 'Logical and Physical Access', keywords: ['access', 'authentication', 'authorization'] },
  { id: 'CC7.1', name: 'System Operations', keywords: ['operations', 'deployment', 'infrastructure'] },
  { id: 'CC8.1', name: 'Change Management', keywords: ['change', 'migration', 'update', 'version'] },
  { id: 'CC9.1', name: 'Risk Mitigation', keywords: ['mitigation', 'backup', 'recovery', 'rollback'] }
];

/**
 * Generate a simple UUID without external dependency
 */
function generateId(): string {
  // Use crypto if available, otherwise fallback to timestamp-based ID
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback
  }
  // Fallback: timestamp + random
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Audit Service Implementation
 * 
 * Provides comprehensive audit logging and compliance reporting
 * for architectural artifacts.
 */
export class AuditService implements IAuditService {
  private baseDir: string;
  private auditDir: string;
  private auditLogPath: string;
  private fileStore?: FileStore;
  private configService?: ConfigService;

  constructor(options: { baseDir?: string; fileStore?: FileStore; configService?: ConfigService } = {}) {
    this.baseDir = options.baseDir || '.arch';
    this.auditDir = path.join(this.baseDir, '.audit');
    this.auditLogPath = path.join(this.auditDir, 'audit.jsonl');
    this.fileStore = options.fileStore;
    this.configService = options.configService;
  }

  /**
   * Ensure the audit directory exists
   */
  private async ensureAuditDir(): Promise<void> {
    await fs.mkdir(this.auditDir, { recursive: true });
  }

  /**
   * Log an artifact operation
   * 
   * Requirements: 10.1
   * 
   * @param action - The audit action to log
   */
  async logAction(action: AuditAction): Promise<void> {
    await this.ensureAuditDir();

    const entry: AuditEntry = {
      id: generateId(),
      ...action,
      timestamp: action.timestamp || new Date()
    };

    // Append to JSONL file (one JSON object per line)
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.auditLogPath, line, 'utf-8');
  }

  /**
   * Get audit history for a specific artifact
   * 
   * Requirements: 10.2
   * 
   * @param artifactId - The artifact ID to get history for
   * @returns Array of audit entries in chronological order
   */
  async getHistory(artifactId: string): Promise<AuditEntry[]> {
    const allEntries = await this.getAllEntries();
    
    // Filter by artifact ID and sort chronologically
    return allEntries
      .filter(entry => entry.artifactId === artifactId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get all audit entries
   * 
   * @returns Array of all audit entries
   */
  async getAllEntries(): Promise<AuditEntry[]> {
    try {
      const content = await fs.readFile(this.auditLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const entry = JSON.parse(line) as AuditEntry;
        // Ensure timestamp is a Date object
        entry.timestamp = new Date(entry.timestamp);
        return entry;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }


  /**
   * Export audit report in specified format
   * 
   * Requirements: 10.3
   * 
   * @param options - Export options including format and output path
   * @returns The generated report content
   */
  async exportReport(options: ExportOptions = { format: 'html' }): Promise<string> {
    const entries = await this.getAllEntries();
    
    switch (options.format) {
      case 'json':
        return this.exportAsJson(entries);
      case 'html':
        return this.exportAsHtml(entries);
      case 'pdf':
        // PDF generation would require additional dependencies
        // For now, return HTML that can be converted to PDF
        return this.exportAsHtml(entries);
      default:
        return this.exportAsJson(entries);
    }
  }

  /**
   * Export entries as JSON
   */
  private exportAsJson(entries: AuditEntry[]): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      totalEntries: entries.length,
      entries: entries.map(e => ({
        ...e,
        timestamp: e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp
      }))
    }, null, 2);
  }

  /**
   * Export entries as HTML report
   */
  private exportAsHtml(entries: AuditEntry[]): string {
    const groupedByArtifact = this.groupEntriesByArtifact(entries);
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Audit Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #007bff; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .action-create { color: #28a745; }
    .action-update { color: #ffc107; }
    .action-delete { color: #dc3545; }
    .action-approve { color: #17a2b8; }
    .action-reject { color: #6c757d; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Architecture Audit Report</h1>
  <div class="summary">
    <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    <p><strong>Total Entries:</strong> ${entries.length}</p>
    <p><strong>Artifacts Tracked:</strong> ${Object.keys(groupedByArtifact).length}</p>
  </div>
`;

    for (const [artifactId, artifactEntries] of Object.entries(groupedByArtifact)) {
      html += `
  <h2>${artifactId}</h2>
  <table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Action</th>
        <th>User</th>
        <th>Changes</th>
      </tr>
    </thead>
    <tbody>
`;
      for (const entry of artifactEntries) {
        const timestamp = entry.timestamp instanceof Date 
          ? entry.timestamp.toISOString() 
          : entry.timestamp;
        const changes = entry.changes 
          ? Object.entries(entry.changes)
              .map(([key, val]) => `${key}: ${JSON.stringify(val.old)} → ${JSON.stringify(val.new)}`)
              .join('<br>')
          : '-';
        
        html += `      <tr>
        <td class="timestamp">${timestamp}</td>
        <td class="action-${entry.action}">${entry.action}</td>
        <td>${entry.user}</td>
        <td>${changes}</td>
      </tr>
`;
      }
      html += `    </tbody>
  </table>
`;
    }

    html += `</body>
</html>`;

    return html;
  }

  /**
   * Group entries by artifact ID
   */
  private groupEntriesByArtifact(entries: AuditEntry[]): Record<string, AuditEntry[]> {
    const grouped: Record<string, AuditEntry[]> = {};
    
    for (const entry of entries) {
      if (!grouped[entry.artifactId]) {
        grouped[entry.artifactId] = [];
      }
      grouped[entry.artifactId].push(entry);
    }
    
    // Sort entries within each group chronologically
    for (const artifactId of Object.keys(grouped)) {
      grouped[artifactId].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
    }
    
    return grouped;
  }

  /**
   * Check compliance against a framework
   * 
   * Requirements: 10.4
   * 
   * @param framework - The compliance framework to check against
   * @returns Compliance report with mappings and gaps
   */
  async checkCompliance(framework: ComplianceFramework): Promise<ComplianceReport> {
    if (!this.fileStore) {
      return {
        framework,
        compliant: false,
        mappings: [],
        gaps: [{ controlId: 'N/A', issue: 'FileStore not configured', recommendation: 'Initialize AuditService with FileStore' }]
      };
    }

    const artifacts = await this.fileStore.list();
    const mappings: ControlMapping[] = [];
    const gaps: ComplianceGap[] = [];

    // Get controls based on framework
    const controls = this.getControlsForFramework(framework);

    for (const control of controls) {
      // Find artifacts that match this control's keywords
      const matchingArtifacts = artifacts.filter(artifact => {
        const searchText = `${artifact.title} ${artifact.tags.join(' ')}`.toLowerCase();
        return control.keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
      });

      const status: 'covered' | 'partial' | 'missing' = 
        matchingArtifacts.length >= 2 ? 'covered' :
        matchingArtifacts.length === 1 ? 'partial' : 'missing';

      mappings.push({
        controlId: control.id,
        controlName: control.name,
        artifacts: matchingArtifacts.map(a => a.id),
        status
      });

      if (status === 'missing') {
        gaps.push({
          controlId: control.id,
          issue: `No artifacts found addressing ${control.name}`,
          recommendation: `Create ADR or RFC addressing ${control.keywords.join(', ')}`
        });
      } else if (status === 'partial') {
        gaps.push({
          controlId: control.id,
          issue: `Only one artifact addresses ${control.name}`,
          recommendation: `Consider additional documentation for ${control.keywords.join(', ')}`
        });
      }
    }

    // Check for approval compliance on all artifacts
    const approvalGaps = await this.checkAllArtifactsApprovalCompliance(artifacts);
    gaps.push(...approvalGaps);

    const compliant = gaps.filter(g => !g.issue.includes('Only one')).length === 0;

    return {
      framework,
      compliant,
      mappings,
      gaps
    };
  }

  /**
   * Get controls for a specific framework
   */
  private getControlsForFramework(framework: ComplianceFramework): Array<{ id: string; name: string; keywords: string[] }> {
    switch (framework) {
      case 'SOC2':
        return SOC2_CONTROLS;
      case 'ISO27001':
        // Simplified ISO27001 controls
        return [
          { id: 'A.5', name: 'Information Security Policies', keywords: ['policy', 'security', 'governance'] },
          { id: 'A.6', name: 'Organization of Information Security', keywords: ['organization', 'responsibility', 'role'] },
          { id: 'A.8', name: 'Asset Management', keywords: ['asset', 'inventory', 'classification'] },
          { id: 'A.9', name: 'Access Control', keywords: ['access', 'authentication', 'authorization'] },
          { id: 'A.12', name: 'Operations Security', keywords: ['operations', 'monitoring', 'logging'] },
          { id: 'A.14', name: 'System Development', keywords: ['development', 'testing', 'deployment'] }
        ];
      case 'HIPAA':
        // Simplified HIPAA controls
        return [
          { id: '164.308', name: 'Administrative Safeguards', keywords: ['policy', 'procedure', 'training'] },
          { id: '164.310', name: 'Physical Safeguards', keywords: ['physical', 'facility', 'workstation'] },
          { id: '164.312', name: 'Technical Safeguards', keywords: ['access', 'audit', 'encryption', 'integrity'] },
          { id: '164.314', name: 'Organizational Requirements', keywords: ['agreement', 'contract', 'organization'] }
        ];
      default:
        return SOC2_CONTROLS;
    }
  }

  /**
   * Check approval compliance for all artifacts
   */
  private async checkAllArtifactsApprovalCompliance(artifacts: Array<{ id: string; status: string }>): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];
    
    for (const artifact of artifacts) {
      const result = await this.checkApprovalCompliance(artifact.id);
      if (!result.compliant) {
        gaps.push({
          controlId: 'APPROVAL',
          issue: `${artifact.id}: ${result.reason}`,
          recommendation: `Ensure ${artifact.id} receives required approvals before implementation`
        });
      }
    }
    
    return gaps;
  }

  /**
   * Check if an artifact has required approvals
   * 
   * Requirements: 10.5
   * 
   * @param artifactId - The artifact ID to check
   * @returns Compliance status with reason if non-compliant
   */
  async checkApprovalCompliance(artifactId: string): Promise<{ compliant: boolean; reason?: string }> {
    // Get required approvals from config
    let requiredApprovals = 1;
    if (this.configService) {
      const complianceConfig = await this.configService.getComplianceConfig();
      requiredApprovals = complianceConfig.requiredApprovals;
    }

    // Get approval history for this artifact
    const history = await this.getHistory(artifactId);
    const approvals = history.filter(entry => entry.action === 'approve');

    // Get unique approvers
    const uniqueApprovers = new Set(approvals.map(a => a.user));

    if (uniqueApprovers.size < requiredApprovals) {
      return {
        compliant: false,
        reason: `Requires ${requiredApprovals} approval(s), has ${uniqueApprovers.size}`
      };
    }

    return { compliant: true };
  }

  /**
   * Clear all audit logs (useful for testing)
   */
  async clearLogs(): Promise<void> {
    try {
      await fs.unlink(this.auditLogPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
