// Search service for artifact discovery

import { Artifact } from '../../models/artifact.js';
import { RFC } from '../../models/rfc.js';
import { ADR } from '../../models/adr.js';
import { DecompositionPlan } from '../../models/decomposition.js';
import { ArtifactType } from '../../models/types.js';
import { FileStore } from '../storage/file-store.js';

/**
 * Search filters for narrowing results
 */
export interface SearchFilters {
  /** Filter by artifact type */
  type?: ArtifactType;
  /** Filter by creation date (from) */
  dateFrom?: Date;
  /** Filter by creation date (to) */
  dateTo?: Date;
}

/**
 * A single search result with relevance scoring
 */
export interface SearchResult {
  /** The matching artifact */
  artifact: Artifact;
  /** Relevance score (higher is more relevant) */
  score: number;
  /** Content snippet showing the match context */
  snippet: string;
}

/**
 * Field weights for relevance scoring
 * Higher weights mean matches in that field are more important
 */
const FIELD_WEIGHTS: Record<string, number> = {
  title: 10,
  tags: 8,
  problemStatement: 5,  // RFC
  context: 5,           // ADR
  rationale: 5,         // Decomposition
  decision: 4,          // ADR
  recommendedApproach: 4, // RFC
  content: 1            // General content
};

/**
 * Search service for full-text search across artifacts
 */
export class SearchService {
  private fileStore: FileStore;
  private index: Map<string, IndexEntry> = new Map();


  constructor(fileStore: FileStore) {
    this.fileStore = fileStore;
  }

  /**
   * Rebuilds the search index from all artifacts
   */
  async reindex(): Promise<void> {
    this.index.clear();
    const artifacts = await this.fileStore.list();
    
    for (const artifact of artifacts) {
      this.indexArtifact(artifact);
    }
  }

  /**
   * Indexes a single artifact
   */
  private indexArtifact(artifact: Artifact): void {
    const entry: IndexEntry = {
      artifact,
      searchableFields: this.extractSearchableFields(artifact)
    };
    this.index.set(artifact.id, entry);
  }

  /**
   * Extracts searchable fields from an artifact based on its type
   */
  private extractSearchableFields(artifact: Artifact): SearchableField[] {
    const fields: SearchableField[] = [];

    // Common fields for all artifacts
    fields.push({ name: 'title', content: artifact.title, weight: FIELD_WEIGHTS.title });
    fields.push({ name: 'tags', content: artifact.tags.join(' '), weight: FIELD_WEIGHTS.tags });

    // Type-specific fields
    switch (artifact.type) {
      case 'rfc':
        this.extractRFCFields(artifact as RFC, fields);
        break;
      case 'adr':
        this.extractADRFields(artifact as ADR, fields);
        break;
      case 'decomposition':
        this.extractDecompositionFields(artifact as DecompositionPlan, fields);
        break;
    }

    return fields;
  }

  /**
   * Extracts searchable fields from an RFC
   */
  private extractRFCFields(rfc: RFC, fields: SearchableField[]): void {
    fields.push({ name: 'problemStatement', content: rfc.problemStatement, weight: FIELD_WEIGHTS.problemStatement });
    fields.push({ name: 'recommendedApproach', content: rfc.recommendedApproach, weight: FIELD_WEIGHTS.recommendedApproach });
    fields.push({ name: 'successCriteria', content: rfc.successCriteria.join(' '), weight: FIELD_WEIGHTS.content });
    fields.push({ name: 'migrationPath', content: rfc.migrationPath, weight: FIELD_WEIGHTS.content });
    fields.push({ name: 'rollbackPlan', content: rfc.rollbackPlan, weight: FIELD_WEIGHTS.content });
    fields.push({ name: 'securityNotes', content: rfc.securityNotes, weight: FIELD_WEIGHTS.content });
    fields.push({ name: 'costModel', content: rfc.costModel, weight: FIELD_WEIGHTS.content });
    fields.push({ name: 'timeline', content: rfc.timeline, weight: FIELD_WEIGHTS.content });
    
    // Index options
    for (const option of rfc.options) {
      fields.push({ name: 'option', content: `${option.name} ${option.description}`, weight: FIELD_WEIGHTS.content });
    }
  }

  /**
   * Extracts searchable fields from an ADR
   */
  private extractADRFields(adr: ADR, fields: SearchableField[]): void {
    fields.push({ name: 'context', content: adr.context, weight: FIELD_WEIGHTS.context });
    fields.push({ name: 'decision', content: adr.decision, weight: FIELD_WEIGHTS.decision });
    fields.push({ name: 'consequences', content: adr.consequences.join(' '), weight: FIELD_WEIGHTS.content });
    
    // Index alternatives
    for (const alt of adr.alternativesConsidered) {
      fields.push({ name: 'alternative', content: `${alt.name} ${alt.description}`, weight: FIELD_WEIGHTS.content });
    }
  }

  /**
   * Extracts searchable fields from a Decomposition Plan
   */
  private extractDecompositionFields(plan: DecompositionPlan, fields: SearchableField[]): void {
    fields.push({ name: 'rationale', content: plan.rationale, weight: FIELD_WEIGHTS.rationale });
    fields.push({ name: 'successMetrics', content: plan.successMetrics.join(' '), weight: FIELD_WEIGHTS.content });
    
    // Index phases
    for (const phase of plan.phases) {
      fields.push({ name: 'phase', content: `${phase.name} ${phase.description}`, weight: FIELD_WEIGHTS.content });
    }
    
    // Index migration tasks
    for (const task of plan.migrationTasks) {
      fields.push({ name: 'task', content: task.description, weight: FIELD_WEIGHTS.content });
    }
    
    // Index team mappings
    for (const mapping of plan.teamModuleMapping) {
      fields.push({ name: 'team', content: `${mapping.teamName} ${mapping.modules.join(' ')}`, weight: FIELD_WEIGHTS.content });
    }
  }


  /**
   * Performs a full-text search across all indexed artifacts
   * 
   * @param query - The search query string
   * @param filters - Optional filters to narrow results
   * @returns Array of search results ranked by relevance
   */
  async search(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    // Ensure index is populated
    if (this.index.size === 0) {
      await this.reindex();
    }

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return [];
    }

    const queryTerms = this.tokenize(normalizedQuery);
    const results: SearchResult[] = [];

    for (const entry of this.index.values()) {
      // Apply type filter
      if (filters?.type && entry.artifact.type !== filters.type) {
        continue;
      }

      // Apply date filters
      if (filters?.dateFrom && entry.artifact.createdAt < filters.dateFrom) {
        continue;
      }
      if (filters?.dateTo && entry.artifact.createdAt > filters.dateTo) {
        continue;
      }

      // Calculate relevance score
      const { score, matchedContent } = this.calculateScore(entry, queryTerms);

      if (score > 0) {
        results.push({
          artifact: entry.artifact,
          score,
          snippet: this.generateSnippet(matchedContent, normalizedQuery)
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Tokenizes a string into searchable terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 0);
  }

  /**
   * Calculates the relevance score for an artifact
   */
  private calculateScore(
    entry: IndexEntry,
    queryTerms: string[]
  ): { score: number; matchedField: string; matchedContent: string } {
    let totalScore = 0;
    let bestMatchField = '';
    let bestMatchContent = '';
    let bestFieldScore = 0;

    for (const field of entry.searchableFields) {
      const normalizedContent = field.content.toLowerCase();
      let fieldScore = 0;
      let matchCount = 0;

      for (const term of queryTerms) {
        // Count occurrences of the term in this field
        const regex = new RegExp(this.escapeRegex(term), 'gi');
        const matches = normalizedContent.match(regex);
        if (matches) {
          matchCount += matches.length;
        }
      }

      if (matchCount > 0) {
        // Score = match count * field weight
        fieldScore = matchCount * field.weight;
        totalScore += fieldScore;

        // Track the best matching field for snippet generation
        if (fieldScore > bestFieldScore) {
          bestFieldScore = fieldScore;
          bestMatchField = field.name;
          bestMatchContent = field.content;
        }
      }
    }

    return {
      score: totalScore,
      matchedField: bestMatchField,
      matchedContent: bestMatchContent
    };
  }

  /**
   * Escapes special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generates a snippet showing the match context
   */
  private generateSnippet(content: string, query: string): string {
    if (!content) {
      return '';
    }

    const maxLength = 150;
    const normalizedContent = content.toLowerCase();
    const queryTerms = this.tokenize(query);

    // Find the first occurrence of any query term
    let firstMatchIndex = -1;
    for (const term of queryTerms) {
      const index = normalizedContent.indexOf(term);
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }

    if (firstMatchIndex === -1) {
      // No match found, return beginning of content
      return content.length > maxLength
        ? content.substring(0, maxLength) + '...'
        : content;
    }

    // Calculate snippet boundaries
    const contextBefore = 30;
    const start = Math.max(0, firstMatchIndex - contextBefore);
    const end = Math.min(content.length, start + maxLength);

    let snippet = content.substring(start, end);

    // Add ellipsis if needed
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < content.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }

  /**
   * Gets the current index size (for testing/debugging)
   */
  getIndexSize(): number {
    return this.index.size;
  }
}

/**
 * Internal structure for indexed artifacts
 */
interface IndexEntry {
  artifact: Artifact;
  searchableFields: SearchableField[];
}

/**
 * A searchable field with its content and weight
 */
interface SearchableField {
  name: string;
  content: string;
  weight: number;
}
