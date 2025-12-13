/**
 * Git Hooks Service
 * 
 * Manages git hook installation, validation of staged artifacts,
 * and CI script generation.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import type { LinkType } from '../link/link-service.js';
import { FileStore } from '../storage/file-store.js';
import { ArtifactValidator } from '../validation/validator.js';
import { Artifact } from '../../models/artifact.js';

/**
 * Options for hook installation
 */
export interface HooksInstallOptions {
  husky?: boolean;
  ci?: boolean;
  hooks?: ('pre-commit' | 'pre-push')[];
}

/**
 * Validation error details for hooks
 */
export interface HooksValidationError {
  artifactId: string;
  file: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Broken link information
 */
export interface BrokenLink {
  sourceId: string;
  targetId: string;
  type: LinkType;
}

/**
 * Result of artifact validation
 */
export interface HooksValidationResult {
  valid: boolean;
  errors: HooksValidationError[];
  brokenLinks: BrokenLink[];
}

/**
 * Git Hooks Service Interface
 */
export interface IGitHooksService {
  install(options?: HooksInstallOptions): Promise<void>;
  uninstall(): Promise<void>;
  validateStagedArtifacts(): Promise<HooksValidationResult>;
  generateCIScript(platform?: 'github' | 'gitlab'): string;
  detectBrokenLinks(artifacts: Artifact[]): Promise<BrokenLink[]>;
}


/**
 * Pre-commit hook script content
 */
const PRE_COMMIT_HOOK_SCRIPT = `#!/bin/sh
# Architecture Toolkit Pre-commit Hook
# Validates staged architecture artifacts before commit

# Run arch verify on staged .arch files
STAGED_ARCH_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "^\\.arch/.*\\.md$" || true)

if [ -n "$STAGED_ARCH_FILES" ]; then
  echo "Validating staged architecture artifacts..."
  npx arch verify
  if [ $? -ne 0 ]; then
    echo "Architecture artifact validation failed. Please fix the errors before committing."
    exit 1
  fi
fi

exit 0
`;

/**
 * Pre-push hook script content
 */
const PRE_PUSH_HOOK_SCRIPT = `#!/bin/sh
# Architecture Toolkit Pre-push Hook
# Validates all architecture artifacts before push

echo "Validating architecture artifacts..."
npx arch verify
if [ $? -ne 0 ]; then
  echo "Architecture artifact validation failed. Please fix the errors before pushing."
  exit 1
fi

exit 0
`;

/**
 * Husky pre-commit hook content
 */
const HUSKY_PRE_COMMIT_SCRIPT = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Architecture Toolkit Pre-commit Hook
STAGED_ARCH_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "^\\.arch/.*\\.md$" || true)

if [ -n "$STAGED_ARCH_FILES" ]; then
  echo "Validating staged architecture artifacts..."
  npx arch verify
fi
`;

/**
 * GitHub Actions CI script
 */
const GITHUB_ACTIONS_SCRIPT = `name: Architecture Validation

on:
  push:
    paths:
      - '.arch/**'
  pull_request:
    paths:
      - '.arch/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Validate architecture artifacts
        run: npx arch verify
        
      - name: Check artifact health
        run: npx arch health --threshold 80
`;

/**
 * GitLab CI script
 */
const GITLAB_CI_SCRIPT = `# Architecture Validation Pipeline

stages:
  - validate

validate-architecture:
  stage: validate
  image: node:20
  rules:
    - changes:
        - .arch/**/*
  script:
    - npm ci
    - npx arch verify
    - npx arch health --threshold 80
`;

/**
 * Hook error for git-related issues
 */
export class HookError extends Error {
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = 'HookError';
  }
}


/**
 * Git Hooks Service Implementation
 */
export class GitHooksService implements IGitHooksService {
  private git: SimpleGit;
  private fileStore: FileStore;
  private validator: ArtifactValidator;
  private baseDir: string;

  constructor(fileStore?: FileStore, baseDir: string = '.') {
    this.git = simpleGit(baseDir);
    this.fileStore = fileStore || new FileStore();
    this.validator = new ArtifactValidator();
    this.baseDir = baseDir;
  }

  /**
   * Detects if the current directory is a git repository
   */
  private async isGitRepository(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the path to the .git/hooks directory
   */
  private async getGitHooksDir(): Promise<string> {
    const gitDir = await this.git.revparse(['--git-dir']);
    return path.join(gitDir.trim(), 'hooks');
  }

  /**
   * Detects if Husky is installed
   */
  private async isHuskyInstalled(): Promise<boolean> {
    const huskyDir = path.join(this.baseDir, '.husky');
    try {
      const stat = await fs.stat(huskyDir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Installs git hooks
   * 
   * @param options - Installation options
   * @throws HookError if not a git repository or permission denied
   */
  async install(options: HooksInstallOptions = {}): Promise<void> {
    // Check if this is a git repository
    if (!await this.isGitRepository()) {
      throw new HookError('Not a git repository', 'Initialize git with "git init" first');
    }

    const hooks = options.hooks || ['pre-commit'];

    if (options.husky) {
      await this.installHuskyHooks(hooks);
    } else {
      await this.installGitHooks(hooks);
    }

    if (options.ci) {
      // CI script generation is handled separately via generateCIScript
      console.log('Use generateCIScript() to get CI configuration');
    }
  }

  /**
   * Installs hooks directly in .git/hooks
   */
  private async installGitHooks(hooks: ('pre-commit' | 'pre-push')[]): Promise<void> {
    const hooksDir = await this.getGitHooksDir();

    // Ensure hooks directory exists
    await fs.mkdir(hooksDir, { recursive: true });

    for (const hook of hooks) {
      const hookPath = path.join(hooksDir, hook);
      const script = hook === 'pre-commit' ? PRE_COMMIT_HOOK_SCRIPT : PRE_PUSH_HOOK_SCRIPT;

      try {
        await fs.writeFile(hookPath, script, { mode: 0o755 });
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EACCES') {
          throw new HookError(`Permission denied writing to ${hookPath}`, 'Check file permissions');
        }
        throw error;
      }
    }
  }

  /**
   * Installs hooks using Husky
   */
  private async installHuskyHooks(hooks: ('pre-commit' | 'pre-push')[]): Promise<void> {
    const huskyInstalled = await this.isHuskyInstalled();
    
    if (!huskyInstalled) {
      throw new HookError(
        'Husky is not installed',
        'Install Husky first with "npx husky init" or "npm install husky --save-dev"'
      );
    }

    const huskyDir = path.join(this.baseDir, '.husky');

    for (const hook of hooks) {
      const hookPath = path.join(huskyDir, hook);
      const script = hook === 'pre-commit' ? HUSKY_PRE_COMMIT_SCRIPT : PRE_PUSH_HOOK_SCRIPT;

      try {
        await fs.writeFile(hookPath, script, { mode: 0o755 });
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EACCES') {
          throw new HookError(`Permission denied writing to ${hookPath}`, 'Check file permissions');
        }
        throw error;
      }
    }
  }


  /**
   * Uninstalls git hooks
   * Removes installed hook scripts and cleans up Husky configuration if applicable
   */
  async uninstall(): Promise<void> {
    if (!await this.isGitRepository()) {
      throw new HookError('Not a git repository');
    }

    const hooks: ('pre-commit' | 'pre-push')[] = ['pre-commit', 'pre-push'];

    // Remove from .git/hooks
    try {
      const hooksDir = await this.getGitHooksDir();
      for (const hook of hooks) {
        const hookPath = path.join(hooksDir, hook);
        try {
          const content = await fs.readFile(hookPath, 'utf-8');
          // Only remove if it's our hook
          if (content.includes('Architecture Toolkit')) {
            await fs.unlink(hookPath);
          }
        } catch {
          // Hook doesn't exist, skip
        }
      }
    } catch {
      // Git hooks dir doesn't exist
    }

    // Remove from .husky if it exists
    const huskyDir = path.join(this.baseDir, '.husky');
    try {
      for (const hook of hooks) {
        const hookPath = path.join(huskyDir, hook);
        try {
          const content = await fs.readFile(hookPath, 'utf-8');
          // Only remove if it's our hook
          if (content.includes('Architecture Toolkit')) {
            await fs.unlink(hookPath);
          }
        } catch {
          // Hook doesn't exist, skip
        }
      }
    } catch {
      // Husky dir doesn't exist
    }
  }

  /**
   * Gets list of staged .arch files from git
   */
  async getStagedArchFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      const stagedFiles = status.staged;
      
      // Filter for .arch/*.md files
      return stagedFiles.filter(file => 
        file.startsWith('.arch/') && file.endsWith('.md')
      );
    } catch {
      return [];
    }
  }

  /**
   * Validates all staged architecture artifacts
   * 
   * @returns Validation result with errors and broken links
   */
  async validateStagedArtifacts(): Promise<HooksValidationResult> {
    const errors: HooksValidationError[] = [];
    const brokenLinks: BrokenLink[] = [];

    // Get staged .arch files
    const stagedFiles = await this.getStagedArchFiles();
    
    if (stagedFiles.length === 0) {
      return { valid: true, errors: [], brokenLinks: [] };
    }

    // Load and validate each staged artifact
    const artifacts: Artifact[] = [];
    
    for (const file of stagedFiles) {
      // Extract artifact ID from file path (e.g., .arch/rfc/RFC-0001.md -> RFC-0001)
      const fileName = path.basename(file, '.md');
      
      try {
        const artifact = await this.fileStore.load(fileName);
        
        if (artifact) {
          artifacts.push(artifact);
          
          // Validate the artifact
          const validationResult = this.validator.validate(artifact);
          
          if (!validationResult.valid) {
            for (const error of validationResult.errors) {
              errors.push({
                artifactId: artifact.id,
                file,
                message: `${error.field}: ${error.message}`,
                severity: 'error'
              });
            }
          }
        }
      } catch (error) {
        errors.push({
          artifactId: fileName,
          file,
          message: `Failed to load artifact: ${(error as Error).message}`,
          severity: 'error'
        });
      }
    }

    // Check for broken links in staged artifacts
    const detectedBrokenLinks = await this.detectBrokenLinks(artifacts);
    brokenLinks.push(...detectedBrokenLinks);

    // Add broken link errors
    for (const link of brokenLinks) {
      errors.push({
        artifactId: link.sourceId,
        file: '',
        message: `Broken link: ${link.sourceId} -> ${link.targetId} (${link.type})`,
        severity: 'error'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      brokenLinks
    };
  }

  /**
   * Detects broken links in a set of artifacts
   * Checks all references to ensure target artifacts exist
   */
  async detectBrokenLinks(artifacts: Artifact[]): Promise<BrokenLink[]> {
    const brokenLinks: BrokenLink[] = [];

    for (const artifact of artifacts) {
      for (const ref of artifact.references) {
        // Check if target artifact exists
        const targetExists = await this.fileStore.exists(ref.targetId);
        
        if (!targetExists) {
          brokenLinks.push({
            sourceId: artifact.id,
            targetId: ref.targetId,
            type: ref.referenceType as LinkType
          });
        }
      }
    }

    return brokenLinks;
  }


  /**
   * Generates CI script for architecture validation
   * 
   * @param platform - Target CI platform (github or gitlab)
   * @returns CI configuration script content
   */
  generateCIScript(platform: 'github' | 'gitlab' = 'github'): string {
    switch (platform) {
      case 'github':
        return GITHUB_ACTIONS_SCRIPT;
      case 'gitlab':
        return GITLAB_CI_SCRIPT;
      default:
        return GITHUB_ACTIONS_SCRIPT;
    }
  }

  /**
   * Validates all artifacts (not just staged)
   * Useful for CI environments
   */
  async validateAllArtifacts(): Promise<HooksValidationResult> {
    const errors: HooksValidationError[] = [];
    const brokenLinks: BrokenLink[] = [];

    // Load all artifacts
    const artifacts = await this.fileStore.list();

    for (const artifact of artifacts) {
      // Validate the artifact
      const validationResult = this.validator.validate(artifact);
      
      if (!validationResult.valid) {
        for (const error of validationResult.errors) {
          errors.push({
            artifactId: artifact.id,
            file: `.arch/${artifact.type}/${artifact.id}.md`,
            message: `${error.field}: ${error.message}`,
            severity: 'error'
          });
        }
      }
    }

    // Check for broken links
    const detectedBrokenLinks = await this.detectBrokenLinks(artifacts);
    brokenLinks.push(...detectedBrokenLinks);

    // Add broken link errors
    for (const link of brokenLinks) {
      errors.push({
        artifactId: link.sourceId,
        file: '',
        message: `Broken link: ${link.sourceId} -> ${link.targetId} (${link.type})`,
        severity: 'error'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      brokenLinks
    };
  }
}
