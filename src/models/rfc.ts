// RFC (Request for Comments) model

import { Artifact } from './artifact.js';
import { RFCStatus } from './types.js';

/**
 * Represents an option in the RFC options analysis
 */
export interface Option {
  /** Name of the option */
  name: string;
  /** Description of the option */
  description: string;
  /** List of advantages */
  pros: string[];
  /** List of disadvantages */
  cons: string[];
}

/**
 * Represents a sign-off from a stakeholder
 */
export interface Signoff {
  /** Name of the person signing off */
  name: string;
  /** Role of the person */
  role: string;
  /** Date of sign-off (null if not yet signed) */
  date: Date | null;
  /** Whether the sign-off is approved */
  approved: boolean;
}

/**
 * RFC (Request for Comments) document
 * A formal document proposing a technical change
 */
export interface RFC extends Artifact {
  type: 'rfc';
  status: RFCStatus;
  /** Problem statement describing the issue to be addressed */
  problemStatement: string;
  /** List of success criteria */
  successCriteria: string[];
  /** Options analysis */
  options: Option[];
  /** Recommended approach */
  recommendedApproach: string;
  /** Migration path */
  migrationPath: string;
  /** Rollback plan */
  rollbackPlan: string;
  /** Security considerations */
  securityNotes: string;
  /** Cost model */
  costModel: string;
  /** Timeline */
  timeline: string;
  /** Sign-off tracking */
  signoffs: Signoff[];
}
