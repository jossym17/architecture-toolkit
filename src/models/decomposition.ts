// System Decomposition Plan model

import { Artifact } from './artifact.js';
import { PhaseStatus, TaskStatus } from './types.js';

/**
 * Represents a phase in the decomposition plan
 */
export interface Phase {
  /** Unique identifier for the phase */
  id: string;
  /** Name of the phase */
  name: string;
  /** Description of what the phase accomplishes */
  description: string;
  /** IDs of phases this phase depends on */
  dependencies: string[];
  /** Estimated duration (e.g., "2 weeks", "1 month") */
  estimatedDuration: string;
  /** Current status of the phase */
  status: PhaseStatus;
  /** Completion timestamp (set when status becomes 'completed') */
  completedAt?: Date;
}

/**
 * Represents a mapping between a team and their assigned modules
 */
export interface TeamModuleMapping {
  /** Unique identifier for the team */
  teamId: string;
  /** Display name of the team */
  teamName: string;
  /** List of modules assigned to this team */
  modules: string[];
}

/**
 * Represents a migration task within a phase
 */
export interface MigrationTask {
  /** Unique identifier for the task */
  id: string;
  /** ID of the phase this task belongs to */
  phaseId: string;
  /** Description of the task */
  description: string;
  /** Person assigned to the task */
  assignee?: string;
  /** Current status of the task */
  status: TaskStatus;
}

/**
 * System Decomposition Plan
 * A phased plan for breaking down a system into components
 */
export interface DecompositionPlan extends Artifact {
  type: 'decomposition';
  /** Rationale for the decomposition */
  rationale: string;
  /** Success metrics for the decomposition */
  successMetrics: string[];
  /** Phases of the decomposition */
  phases: Phase[];
  /** Team to module assignments */
  teamModuleMapping: TeamModuleMapping[];
  /** Migration tasks */
  migrationTasks: MigrationTask[];
}
