// ADR (Architecture Decision Record) model

import { Artifact } from './artifact.js';
import { ADRStatus } from './types.js';

/**
 * Represents an alternative that was considered but not chosen
 */
export interface Alternative {
  /** Name of the alternative */
  name: string;
  /** Description of the alternative */
  description: string;
  /** Reason for rejection */
  rejectionReason: string;
}

/**
 * ADR (Architecture Decision Record)
 * A lightweight record capturing a single architectural decision
 */
export interface ADR extends Artifact {
  type: 'adr';
  status: ADRStatus;
  /** Context and background for the decision */
  context: string;
  /** The decision that was made */
  decision: string;
  /** Consequences of the decision */
  consequences: string[];
  /** Alternatives that were considered */
  alternativesConsidered: Alternative[];
  /** ID of the ADR that supersedes this one (if superseded) */
  supersededBy?: string;
}
