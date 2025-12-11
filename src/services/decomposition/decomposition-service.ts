// Decomposition Plan Service for Architecture Documentation Toolkit

import { DecompositionPlan, Phase, TeamModuleMapping, MigrationTask } from '../../models/decomposition.js';
import { PhaseStatus, TaskStatus } from '../../models/types.js';
import { Reference } from '../../models/reference.js';
import { ValidationResult } from '../../models/validation.js';
import { IdGenerator } from '../id-generator.js';
import { FileStore, ArtifactFilters } from '../storage/file-store.js';
import { ArtifactValidator } from '../validation/validator.js';

/**
 * Data for creating a new Decomposition Plan
 */
export interface CreateDecompositionPlanData {
  title: string;
  owner: string;
  rationale?: string;
  successMetrics?: string[];
  phases?: Phase[];
  teamModuleMapping?: TeamModuleMapping[];
  migrationTasks?: MigrationTask[];
  tags?: string[];
  references?: Reference[];
}

/**
 * Data for updating an existing Decomposition Plan
 */
export interface UpdateDecompositionPlanData {
  title?: string;
  owner?: string;
  rationale?: string;
  successMetrics?: string[];
  phases?: Phase[];
  teamModuleMapping?: TeamModuleMapping[];
  migrationTasks?: MigrationTask[];
  tags?: string[];
  references?: Reference[];
}

/**
 * Data for adding a new phase
 */
export interface AddPhaseData {
  name: string;
  description: string;
  dependencies?: string[];
  estimatedDuration: string;
}

/**
 * Data for updating a phase
 */
export interface UpdatePhaseData {
  name?: string;
  description?: string;
  dependencies?: string[];
  estimatedDuration?: string;
  status?: PhaseStatus;
}


/**
 * Data for adding a migration task
 */
export interface AddMigrationTaskData {
  phaseId: string;
  description: string;
  assignee?: string;
}

/**
 * Decomposition Plan Service for managing system decomposition plans
 * Implements CRUD operations with template generation, phase management,
 * team-module mapping, and migration task tracking
 */
export class DecompositionPlanService {
  private idGenerator: IdGenerator;
  private fileStore: FileStore;
  private validator: ArtifactValidator;
  private phaseCounter: number = 0;
  private taskCounter: number = 0;

  /**
   * Creates a new DecompositionPlanService instance
   * @param basePath - Base path for the .arch directory (defaults to current working directory)
   */
  constructor(basePath: string = process.cwd()) {
    this.idGenerator = new IdGenerator(basePath);
    this.fileStore = new FileStore({ baseDir: `${basePath}/.arch` });
    this.validator = new ArtifactValidator();
  }

  /**
   * Initializes the file store (creates directory structure)
   */
  async initialize(): Promise<void> {
    await this.fileStore.initialize();
  }

  /**
   * Generates a unique phase ID
   */
  private generatePhaseId(): string {
    this.phaseCounter++;
    return `phase-${this.phaseCounter.toString().padStart(3, '0')}`;
  }

  /**
   * Generates a unique migration task ID
   */
  private generateTaskId(): string {
    this.taskCounter++;
    return `task-${this.taskCounter.toString().padStart(3, '0')}`;
  }

  /**
   * Creates a new Decomposition Plan with template generation
   * Generates a unique ID and populates default template sections
   * 
   * @param data - The Decomposition Plan creation data
   * @returns The created Decomposition Plan
   * @throws Error if validation fails
   */
  async create(data: CreateDecompositionPlanData): Promise<DecompositionPlan> {
    const now = new Date();
    const id = this.idGenerator.generateId('decomposition');

    // Generate default phase if none provided
    const defaultPhase: Phase = {
      id: this.generatePhaseId(),
      name: 'Phase 1',
      description: '[Describe what this phase accomplishes]',
      dependencies: [],
      estimatedDuration: '[e.g., 2 weeks]',
      status: 'pending'
    };

    const plan: DecompositionPlan = {
      id,
      type: 'decomposition',
      title: data.title,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      owner: data.owner,
      tags: data.tags ?? [],
      references: data.references ?? [],
      rationale: data.rationale ?? '[Describe the rationale for this decomposition]',
      successMetrics: data.successMetrics ?? ['[Define measurable success metrics]'],
      phases: data.phases ?? [defaultPhase],
      teamModuleMapping: data.teamModuleMapping ?? [],
      migrationTasks: data.migrationTasks ?? []
    };

    // Update phase/task counters based on provided data
    this.updateCountersFromPlan(plan);

    // Validate the plan
    const validationResult = this.validator.validateDecompositionPlan(plan);
    if (!validationResult.valid) {
      throw new Error(`Decomposition Plan validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(plan);

    return plan;
  }


  /**
   * Updates internal counters based on existing plan data
   */
  private updateCountersFromPlan(plan: DecompositionPlan): void {
    // Update phase counter
    for (const phase of plan.phases) {
      const match = phase.id.match(/^phase-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > this.phaseCounter) {
          this.phaseCounter = num;
        }
      }
    }

    // Update task counter
    for (const task of plan.migrationTasks) {
      const match = task.id.match(/^task-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > this.taskCounter) {
          this.taskCounter = num;
        }
      }
    }
  }

  /**
   * Gets a Decomposition Plan by ID
   * 
   * @param id - The plan ID (e.g., DECOMP-0001)
   * @returns The plan or null if not found
   */
  async get(id: string): Promise<DecompositionPlan | null> {
    const artifact = await this.fileStore.load(id);
    if (!artifact || artifact.type !== 'decomposition') {
      return null;
    }
    const plan = artifact as DecompositionPlan;
    this.updateCountersFromPlan(plan);
    return plan;
  }

  /**
   * Updates an existing Decomposition Plan
   * 
   * @param id - The plan ID to update
   * @param data - The update data
   * @returns The updated plan
   * @throws Error if plan not found or validation fails
   */
  async update(id: string, data: UpdateDecompositionPlanData): Promise<DecompositionPlan> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${id}`);
    }

    const now = new Date();
    
    const updatedPlan: DecompositionPlan = {
      ...existing,
      title: data.title ?? existing.title,
      owner: data.owner ?? existing.owner,
      rationale: data.rationale ?? existing.rationale,
      successMetrics: data.successMetrics ?? existing.successMetrics,
      phases: data.phases ?? existing.phases,
      teamModuleMapping: data.teamModuleMapping ?? existing.teamModuleMapping,
      migrationTasks: data.migrationTasks ?? existing.migrationTasks,
      tags: data.tags ?? existing.tags,
      references: data.references ?? existing.references,
      updatedAt: now
    };

    // Validate the updated plan
    const validationResult = this.validator.validateDecompositionPlan(updatedPlan);
    if (!validationResult.valid) {
      throw new Error(`Decomposition Plan validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
    }

    // Save to file store
    await this.fileStore.save(updatedPlan);

    return updatedPlan;
  }

  /**
   * Deletes a Decomposition Plan by ID
   * 
   * @param id - The plan ID to delete
   * @returns true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    return await this.fileStore.delete(id);
  }

  /**
   * Lists Decomposition Plans with optional filtering
   * 
   * @param filters - Optional filters to apply
   * @returns Array of plans matching the filters
   */
  async list(filters?: ArtifactFilters): Promise<DecompositionPlan[]> {
    const artifacts = await this.fileStore.list({
      ...filters,
      type: 'decomposition'
    });
    return artifacts as DecompositionPlan[];
  }

  /**
   * Validates a Decomposition Plan without saving
   * 
   * @param plan - The plan to validate
   * @returns Validation result
   */
  validate(plan: DecompositionPlan): ValidationResult {
    return this.validator.validateDecompositionPlan(plan);
  }


  // ==================== Phase Management ====================

  /**
   * Adds a new phase to a Decomposition Plan
   * 
   * @param planId - The plan ID
   * @param phaseData - The phase data
   * @returns The updated plan with the new phase
   * @throws Error if plan not found
   */
  async addPhase(planId: string, phaseData: AddPhaseData): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const newPhase: Phase = {
      id: this.generatePhaseId(),
      name: phaseData.name,
      description: phaseData.description,
      dependencies: phaseData.dependencies ?? [],
      estimatedDuration: phaseData.estimatedDuration,
      status: 'pending'
    };

    const phases = [...existing.phases, newPhase];
    return await this.update(planId, { phases });
  }

  /**
   * Updates an existing phase in a Decomposition Plan
   * 
   * @param planId - The plan ID
   * @param phaseId - The phase ID to update
   * @param phaseData - The update data
   * @returns The updated plan
   * @throws Error if plan or phase not found
   */
  async updatePhase(planId: string, phaseId: string, phaseData: UpdatePhaseData): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const phaseIndex = existing.phases.findIndex(p => p.id === phaseId);
    if (phaseIndex === -1) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    const existingPhase = existing.phases[phaseIndex];
    const updatedPhase: Phase = {
      ...existingPhase,
      name: phaseData.name ?? existingPhase.name,
      description: phaseData.description ?? existingPhase.description,
      dependencies: phaseData.dependencies ?? existingPhase.dependencies,
      estimatedDuration: phaseData.estimatedDuration ?? existingPhase.estimatedDuration,
      status: phaseData.status ?? existingPhase.status
    };

    const phases = [...existing.phases];
    phases[phaseIndex] = updatedPhase;

    return await this.update(planId, { phases });
  }

  /**
   * Marks a phase as complete and updates dependent phases
   * Records completion timestamp and unblocks dependent phases
   * 
   * @param planId - The plan ID
   * @param phaseId - The phase ID to complete
   * @returns The updated plan
   * @throws Error if plan or phase not found
   */
  async completePhase(planId: string, phaseId: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const phaseIndex = existing.phases.findIndex(p => p.id === phaseId);
    if (phaseIndex === -1) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    const now = new Date();
    const phases = [...existing.phases];
    
    // Mark the phase as completed with timestamp
    phases[phaseIndex] = {
      ...phases[phaseIndex],
      status: 'completed',
      completedAt: now
    };

    // Update dependent phases - unblock phases that only depended on this one
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].status === 'blocked' && phases[i].dependencies.includes(phaseId)) {
        // Check if all dependencies are now completed
        const allDepsCompleted = phases[i].dependencies.every(depId => {
          const depPhase = phases.find(p => p.id === depId);
          return depPhase?.status === 'completed';
        });

        if (allDepsCompleted) {
          phases[i] = {
            ...phases[i],
            status: 'pending'
          };
        }
      }
    }

    return await this.update(planId, { phases });
  }

  /**
   * Removes a phase from a Decomposition Plan
   * 
   * @param planId - The plan ID
   * @param phaseId - The phase ID to remove
   * @returns The updated plan
   * @throws Error if plan or phase not found
   */
  async removePhase(planId: string, phaseId: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const phaseIndex = existing.phases.findIndex(p => p.id === phaseId);
    if (phaseIndex === -1) {
      throw new Error(`Phase not found: ${phaseId}`);
    }

    // Remove the phase
    const phases = existing.phases.filter(p => p.id !== phaseId);

    // Remove this phase from dependencies of other phases
    for (let i = 0; i < phases.length; i++) {
      if (phases[i].dependencies.includes(phaseId)) {
        phases[i] = {
          ...phases[i],
          dependencies: phases[i].dependencies.filter(d => d !== phaseId)
        };
      }
    }

    // Also remove migration tasks associated with this phase
    const migrationTasks = existing.migrationTasks.filter(t => t.phaseId !== phaseId);

    return await this.update(planId, { phases, migrationTasks });
  }


  // ==================== Team-Module Mapping ====================

  /**
   * Adds a team-module mapping to a Decomposition Plan
   * 
   * @param planId - The plan ID
   * @param teamId - The team ID
   * @param teamName - The team display name
   * @param modules - The modules to assign to the team
   * @returns The updated plan
   * @throws Error if plan not found
   */
  async addTeamModuleMapping(
    planId: string,
    teamId: string,
    teamName: string,
    modules: string[]
  ): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    // Check if team already exists
    const existingMapping = existing.teamModuleMapping.find(m => m.teamId === teamId);
    if (existingMapping) {
      throw new Error(`Team mapping already exists for team: ${teamId}`);
    }

    const newMapping: TeamModuleMapping = {
      teamId,
      teamName,
      modules
    };

    const teamModuleMapping = [...existing.teamModuleMapping, newMapping];
    return await this.update(planId, { teamModuleMapping });
  }

  /**
   * Updates a team-module mapping
   * 
   * @param planId - The plan ID
   * @param teamId - The team ID to update
   * @param teamName - Optional new team name
   * @param modules - Optional new modules list
   * @returns The updated plan
   * @throws Error if plan or team mapping not found
   */
  async updateTeamModuleMapping(
    planId: string,
    teamId: string,
    teamName?: string,
    modules?: string[]
  ): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const mappingIndex = existing.teamModuleMapping.findIndex(m => m.teamId === teamId);
    if (mappingIndex === -1) {
      throw new Error(`Team mapping not found: ${teamId}`);
    }

    const existingMapping = existing.teamModuleMapping[mappingIndex];
    const updatedMapping: TeamModuleMapping = {
      teamId,
      teamName: teamName ?? existingMapping.teamName,
      modules: modules ?? existingMapping.modules
    };

    const teamModuleMapping = [...existing.teamModuleMapping];
    teamModuleMapping[mappingIndex] = updatedMapping;

    return await this.update(planId, { teamModuleMapping });
  }

  /**
   * Removes a team-module mapping
   * 
   * @param planId - The plan ID
   * @param teamId - The team ID to remove
   * @returns The updated plan
   * @throws Error if plan or team mapping not found
   */
  async removeTeamModuleMapping(planId: string, teamId: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const mappingIndex = existing.teamModuleMapping.findIndex(m => m.teamId === teamId);
    if (mappingIndex === -1) {
      throw new Error(`Team mapping not found: ${teamId}`);
    }

    const teamModuleMapping = existing.teamModuleMapping.filter(m => m.teamId !== teamId);
    return await this.update(planId, { teamModuleMapping });
  }

  /**
   * Assigns a module to a team
   * 
   * @param planId - The plan ID
   * @param teamId - The team ID
   * @param module - The module to assign
   * @returns The updated plan
   * @throws Error if plan or team mapping not found
   */
  async assignModuleToTeam(planId: string, teamId: string, module: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const mappingIndex = existing.teamModuleMapping.findIndex(m => m.teamId === teamId);
    if (mappingIndex === -1) {
      throw new Error(`Team mapping not found: ${teamId}`);
    }

    const existingMapping = existing.teamModuleMapping[mappingIndex];
    if (existingMapping.modules.includes(module)) {
      return existing; // Module already assigned
    }

    const modules = [...existingMapping.modules, module];
    return await this.updateTeamModuleMapping(planId, teamId, undefined, modules);
  }

  /**
   * Unassigns a module from a team
   * 
   * @param planId - The plan ID
   * @param teamId - The team ID
   * @param module - The module to unassign
   * @returns The updated plan
   * @throws Error if plan or team mapping not found
   */
  async unassignModuleFromTeam(planId: string, teamId: string, module: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const mappingIndex = existing.teamModuleMapping.findIndex(m => m.teamId === teamId);
    if (mappingIndex === -1) {
      throw new Error(`Team mapping not found: ${teamId}`);
    }

    const existingMapping = existing.teamModuleMapping[mappingIndex];
    const modules = existingMapping.modules.filter(m => m !== module);
    return await this.updateTeamModuleMapping(planId, teamId, undefined, modules);
  }


  // ==================== Migration Task Tracking ====================

  /**
   * Adds a migration task to a Decomposition Plan
   * 
   * @param planId - The plan ID
   * @param taskData - The task data
   * @returns The updated plan with the new task
   * @throws Error if plan not found or phase doesn't exist
   */
  async addMigrationTask(planId: string, taskData: AddMigrationTaskData): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    // Validate that the phase exists
    const phase = existing.phases.find(p => p.id === taskData.phaseId);
    if (!phase) {
      throw new Error(`Phase not found: ${taskData.phaseId}`);
    }

    const newTask: MigrationTask = {
      id: this.generateTaskId(),
      phaseId: taskData.phaseId,
      description: taskData.description,
      assignee: taskData.assignee,
      status: 'todo'
    };

    const migrationTasks = [...existing.migrationTasks, newTask];
    return await this.update(planId, { migrationTasks });
  }

  /**
   * Updates a migration task
   * 
   * @param planId - The plan ID
   * @param taskId - The task ID to update
   * @param description - Optional new description
   * @param assignee - Optional new assignee
   * @param status - Optional new status
   * @returns The updated plan
   * @throws Error if plan or task not found
   */
  async updateMigrationTask(
    planId: string,
    taskId: string,
    description?: string,
    assignee?: string,
    status?: TaskStatus
  ): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const taskIndex = existing.migrationTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Migration task not found: ${taskId}`);
    }

    const existingTask = existing.migrationTasks[taskIndex];
    const updatedTask: MigrationTask = {
      ...existingTask,
      description: description ?? existingTask.description,
      assignee: assignee !== undefined ? assignee : existingTask.assignee,
      status: status ?? existingTask.status
    };

    const migrationTasks = [...existing.migrationTasks];
    migrationTasks[taskIndex] = updatedTask;

    return await this.update(planId, { migrationTasks });
  }

  /**
   * Changes the status of a migration task
   * 
   * @param planId - The plan ID
   * @param taskId - The task ID
   * @param status - The new status
   * @returns The updated plan
   * @throws Error if plan or task not found
   */
  async changeTaskStatus(planId: string, taskId: string, status: TaskStatus): Promise<DecompositionPlan> {
    return await this.updateMigrationTask(planId, taskId, undefined, undefined, status);
  }

  /**
   * Assigns a migration task to a person
   * 
   * @param planId - The plan ID
   * @param taskId - The task ID
   * @param assignee - The person to assign
   * @returns The updated plan
   * @throws Error if plan or task not found
   */
  async assignTask(planId: string, taskId: string, assignee: string): Promise<DecompositionPlan> {
    return await this.updateMigrationTask(planId, taskId, undefined, assignee, undefined);
  }

  /**
   * Removes a migration task
   * 
   * @param planId - The plan ID
   * @param taskId - The task ID to remove
   * @returns The updated plan
   * @throws Error if plan or task not found
   */
  async removeMigrationTask(planId: string, taskId: string): Promise<DecompositionPlan> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    const taskIndex = existing.migrationTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Migration task not found: ${taskId}`);
    }

    const migrationTasks = existing.migrationTasks.filter(t => t.id !== taskId);
    return await this.update(planId, { migrationTasks });
  }

  /**
   * Gets all migration tasks for a specific phase
   * 
   * @param planId - The plan ID
   * @param phaseId - The phase ID
   * @returns Array of migration tasks for the phase
   * @throws Error if plan not found
   */
  async getTasksForPhase(planId: string, phaseId: string): Promise<MigrationTask[]> {
    const existing = await this.get(planId);
    if (!existing) {
      throw new Error(`Decomposition Plan not found: ${planId}`);
    }

    return existing.migrationTasks.filter(t => t.phaseId === phaseId);
  }

  /**
   * Checks if a Decomposition Plan exists
   * 
   * @param id - The plan ID to check
   * @returns true if the plan exists
   */
  async exists(id: string): Promise<boolean> {
    return await this.fileStore.exists(id);
  }
}
