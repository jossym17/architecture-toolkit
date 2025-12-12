/**
 * Property-Based Tests for Interactive Prompt Service
 * 
 * Tests the correctness properties defined in the design document
 * for the interactive prompting functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  PromptService, 
  InteractiveError, 
  REQUIRED_FIELDS,
  type ArtifactInput,
  type TitleValidationResult
} from './prompt-service.js';
import type { ArtifactType } from '../../models/types.js';

// Mock inquirer to avoid actual TTY prompts during tests
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn()
  }
}));

// Mock simple-git for git config tests
vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    getConfig: vi.fn()
  }))
}));

import inquirer from 'inquirer';
import { simpleGit } from 'simple-git';

describe('PromptService', () => {
  let service: PromptService;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    service = new PromptService();
    originalIsTTY = process.stdin.isTTY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original TTY state
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true
    });
  });

  describe('isInteractive', () => {
    it('should return true when stdin is TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true
      });
      expect(service.isInteractive()).toBe(true);
    });

    it('should return false when stdin is not TTY', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });
      expect(service.isInteractive()).toBe(false);
    });

    it('should return false when stdin.isTTY is undefined', () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true
      });
      expect(service.isInteractive()).toBe(false);
    });
  });

  describe('getMissingRequiredFields', () => {
    it('should return all required fields when none provided', () => {
      const missing = service.getMissingRequiredFields('rfc', {});
      expect(missing).toEqual(['title', 'owner']);
    });

    it('should return empty array when all required fields provided', () => {
      const missing = service.getMissingRequiredFields('rfc', {
        title: 'Test Title',
        owner: 'Test Owner',
        tags: []
      });
      expect(missing).toEqual([]);
    });

    it('should detect empty string as missing', () => {
      const missing = service.getMissingRequiredFields('rfc', {
        title: '',
        owner: 'Test Owner'
      });
      expect(missing).toContain('title');
      expect(missing).not.toContain('owner');
    });

    it('should detect whitespace-only string as missing', () => {
      const missing = service.getMissingRequiredFields('rfc', {
        title: '   ',
        owner: 'Test Owner'
      });
      expect(missing).toContain('title');
    });
  });

  /**
   * **Feature: interactive-mode, Property 1: Interactive mode prompts for exactly missing fields**
   * **Validates: Requirements 1.1, 1.5, 1.6**
   * 
   * For any artifact type and set of provided flags, when entering interactive mode,
   * the system SHALL prompt for exactly the fields that are required but not provided,
   * and SHALL NOT prompt for fields that were provided.
   */
  describe('Property 1: Interactive mode prompts for exactly missing fields', () => {
    // Arbitrary for artifact types
    const artifactTypeArb = fc.constantFrom<ArtifactType>('rfc', 'adr', 'decomposition');

    // Arbitrary for non-empty strings (valid field values)
    const validFieldValueArb = fc.string({ minLength: 1 }).filter(s => s.trim().length > 0);

    // Arbitrary for partial artifact input with random subset of fields
    const partialInputArb = fc.record({
      title: fc.option(validFieldValueArb, { nil: undefined }),
      owner: fc.option(validFieldValueArb, { nil: undefined }),
      tags: fc.option(fc.array(fc.string()), { nil: undefined })
    }).map(obj => {
      // Remove undefined values to simulate partial input
      const result: Partial<ArtifactInput> = {};
      if (obj.title !== undefined) result.title = obj.title;
      if (obj.owner !== undefined) result.owner = obj.owner;
      if (obj.tags !== undefined) result.tags = obj.tags;
      return result;
    });

    it('should identify exactly the missing required fields (property test)', () => {
      fc.assert(
        fc.property(
          artifactTypeArb,
          partialInputArb,
          (artifactType, providedFields) => {
            const requiredFields = REQUIRED_FIELDS[artifactType];
            const missingFields = service.getMissingRequiredFields(artifactType, providedFields);

            // Property: missing fields should be exactly those required fields not provided
            for (const field of requiredFields) {
              const value = providedFields[field];
              const isMissing = value === undefined || value === null || 
                (typeof value === 'string' && value.trim() === '');
              
              if (isMissing) {
                expect(missingFields).toContain(field);
              } else {
                expect(missingFields).not.toContain(field);
              }
            }

            // Property: no extra fields should be in missing list
            for (const field of missingFields) {
              expect(requiredFields).toContain(field);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw InteractiveError with exactly missing fields in non-TTY mode (property test)', async () => {
      // Set non-TTY mode
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });

      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          partialInputArb,
          async (artifactType, providedFields) => {
            const expectedMissing = service.getMissingRequiredFields(artifactType, providedFields);

            if (expectedMissing.length > 0) {
              // Should throw InteractiveError with exactly the missing fields
              try {
                await service.promptForMissingFields(artifactType, providedFields);
                // Should not reach here
                expect.fail('Expected InteractiveError to be thrown');
              } catch (error) {
                expect(error).toBeInstanceOf(InteractiveError);
                const interactiveError = error as InteractiveError;
                expect(interactiveError.missingFields.sort()).toEqual(expectedMissing.sort());
              }
            } else {
              // No missing fields, should return without prompting
              const result = await service.promptForMissingFields(artifactType, providedFields);
              expect(result.title).toBe(providedFields.title);
              expect(result.owner).toBe(providedFields.owner);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prompt only for missing fields in TTY mode (property test)', async () => {
      // Set TTY mode
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true
      });

      await fc.assert(
        fc.asyncProperty(
          artifactTypeArb,
          partialInputArb,
          async (artifactType, providedFields) => {
            // Clear mocks before each iteration
            vi.clearAllMocks();
            
            const expectedMissing = service.getMissingRequiredFields(artifactType, providedFields);

            // Mock inquirer to return values for missing fields
            const mockAnswers: Record<string, string> = {};
            for (const field of expectedMissing) {
              mockAnswers[field] = `prompted-${field}`;
            }
            vi.mocked(inquirer.prompt).mockResolvedValue(mockAnswers);

            const result = await service.promptForMissingFields(artifactType, providedFields);

            if (expectedMissing.length > 0) {
              // Verify inquirer was called exactly once
              expect(inquirer.prompt).toHaveBeenCalledTimes(1);
              
              // Get the questions passed to inquirer from the most recent call
              const lastCallIndex = vi.mocked(inquirer.prompt).mock.calls.length - 1;
              const callArgs = vi.mocked(inquirer.prompt).mock.calls[lastCallIndex][0] as unknown as Array<{ name: string }>;
              const promptedFields = callArgs.map(q => q.name);

              // Property: prompted fields should be exactly the missing fields
              expect(promptedFields.sort()).toEqual(expectedMissing.sort());

              // Property: provided fields should be preserved
              if (providedFields.title !== undefined && providedFields.title.trim() !== '') {
                expect(result.title).toBe(providedFields.title);
              }
              if (providedFields.owner !== undefined && providedFields.owner.trim() !== '') {
                expect(result.owner).toBe(providedFields.owner);
              }
            } else {
              // No missing fields, inquirer should not be called
              expect(inquirer.prompt).not.toHaveBeenCalled();
              
              // All provided fields should be preserved
              expect(result.title).toBe(providedFields.title);
              expect(result.owner).toBe(providedFields.owner);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('promptForMissingFields - unit tests', () => {
    it('should return provided fields when all required fields are present', async () => {
      const providedFields: Partial<ArtifactInput> = {
        title: 'Test Title',
        owner: 'Test Owner',
        tags: ['tag1', 'tag2']
      };

      const result = await service.promptForMissingFields('rfc', providedFields);

      expect(result.title).toBe('Test Title');
      expect(result.owner).toBe('Test Owner');
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('should throw InteractiveError in non-TTY mode with missing fields', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });

      await expect(
        service.promptForMissingFields('rfc', { title: 'Test' })
      ).rejects.toThrow(InteractiveError);
    });

    it('should include missing fields in InteractiveError', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true
      });

      try {
        await service.promptForMissingFields('rfc', {});
        expect.fail('Expected InteractiveError');
      } catch (error) {
        expect(error).toBeInstanceOf(InteractiveError);
        const interactiveError = error as InteractiveError;
        expect(interactiveError.missingFields).toContain('title');
        expect(interactiveError.missingFields).toContain('owner');
      }
    });
  });

  describe('getGitUserName', () => {
    it('should return git user.name when available', async () => {
      const mockGit = {
        getConfig: vi.fn().mockResolvedValue({ value: 'John Doe' })
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const result = await testService.getGitUserName();
      
      expect(result).toBe('John Doe');
      expect(mockGit.getConfig).toHaveBeenCalledWith('user.name', 'global');
    });

    it('should fall back to git user.email when user.name is not set', async () => {
      const mockGit = {
        getConfig: vi.fn()
          .mockResolvedValueOnce({ value: '' }) // user.name empty
          .mockResolvedValueOnce({ value: 'john@example.com' }) // user.email
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const result = await testService.getGitUserName();
      
      expect(result).toBe('john@example.com');
    });

    it('should return undefined when git is not configured', async () => {
      const mockGit = {
        getConfig: vi.fn()
          .mockResolvedValueOnce({ value: null })
          .mockResolvedValueOnce({ value: null })
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const result = await testService.getGitUserName();
      
      expect(result).toBeUndefined();
    });

    it('should return undefined when git throws an error', async () => {
      const mockGit = {
        getConfig: vi.fn().mockRejectedValue(new Error('Git not found'))
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const result = await testService.getGitUserName();
      
      expect(result).toBeUndefined();
    });
  });

  describe('getSmartDefaults', () => {
    it('should include owner from git user.name', async () => {
      const mockGit = {
        getConfig: vi.fn().mockResolvedValue({ value: 'Jane Smith' })
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const defaults = await testService.getSmartDefaults();
      
      expect(defaults.owner).toBe('Jane Smith');
    });

    it('should return empty object when git user is not available', async () => {
      const mockGit = {
        getConfig: vi.fn().mockRejectedValue(new Error('Git not found'))
      };
      vi.mocked(simpleGit).mockReturnValue(mockGit as unknown as ReturnType<typeof simpleGit>);
      
      const testService = new PromptService();
      const defaults = await testService.getSmartDefaults();
      
      expect(defaults).toEqual({});
    });
  });

  describe('getTagSuggestionsFromArtifacts', () => {
    it('should extract unique tags from artifacts', () => {
      const artifacts = [
        { tags: ['api', 'backend'] },
        { tags: ['api', 'frontend'] },
        { tags: ['database'] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

      expect(suggestions).toContain('api');
      expect(suggestions).toContain('backend');
      expect(suggestions).toContain('frontend');
      expect(suggestions).toContain('database');
    });

    it('should sort tags by frequency', () => {
      const artifacts = [
        { tags: ['api', 'backend'] },
        { tags: ['api', 'frontend'] },
        { tags: ['api', 'database'] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

      // 'api' appears 3 times, should be first
      expect(suggestions[0]).toBe('api');
    });

    it('should limit results to specified count', () => {
      const artifacts = [
        { tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'] },
        { tags: ['tag6', 'tag7', 'tag8', 'tag9', 'tag10'] },
        { tags: ['tag11', 'tag12'] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts, 5);

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should handle empty artifacts array', () => {
      const suggestions = service.getTagSuggestionsFromArtifacts([]);
      expect(suggestions).toEqual([]);
    });

    it('should handle artifacts with no tags', () => {
      const artifacts = [
        { tags: [] },
        { tags: [] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);
      expect(suggestions).toEqual([]);
    });

    it('should normalize tags to lowercase', () => {
      const artifacts = [
        { tags: ['API', 'Backend'] },
        { tags: ['api', 'BACKEND'] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

      // Should have deduplicated case-insensitive tags
      expect(suggestions.filter(t => t === 'api').length).toBe(1);
      expect(suggestions.filter(t => t === 'backend').length).toBe(1);
    });

    it('should trim whitespace from tags', () => {
      const artifacts = [
        { tags: ['  api  ', 'backend  '] }
      ];

      const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

      expect(suggestions).toContain('api');
      expect(suggestions).toContain('backend');
    });
  });

  describe('getTagSuggestions', () => {
    it('should return tag suggestions for artifact type', () => {
      const recentArtifacts = [
        { tags: ['architecture', 'rfc'] },
        { tags: ['architecture', 'proposal'] }
      ];

      const suggestions = service.getTagSuggestions('rfc', recentArtifacts);

      expect(suggestions).toContain('architecture');
      expect(suggestions[0]).toBe('architecture'); // Most frequent
    });
  });

  describe('validateTitleUniqueness', () => {
    it('should return isUnique true when no duplicates exist', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'First RFC' },
        { id: 'RFC-0002', title: 'Second RFC' }
      ];

      const result = service.validateTitleUniqueness('Third RFC', existingArtifacts);

      expect(result.isUnique).toBe(true);
      expect(result.duplicates).toEqual([]);
    });

    it('should detect exact title matches', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'My RFC Title' },
        { id: 'RFC-0002', title: 'Another RFC' }
      ];

      const result = service.validateTitleUniqueness('My RFC Title', existingArtifacts);

      expect(result.isUnique).toBe(false);
      expect(result.duplicates.length).toBe(1);
      expect(result.duplicates[0].matchType).toBe('exact');
      expect(result.duplicates[0].id).toBe('RFC-0001');
    });

    it('should detect case-insensitive exact matches', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'My RFC Title' }
      ];

      const result = service.validateTitleUniqueness('my rfc title', existingArtifacts);

      expect(result.isUnique).toBe(false);
      expect(result.duplicates[0].matchType).toBe('exact');
    });

    it('should detect fuzzy matches with high similarity', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'Implement User Authentication' }
      ];

      // Very similar title (typo)
      const result = service.validateTitleUniqueness('Implement User Authentcation', existingArtifacts);

      expect(result.isUnique).toBe(false);
      expect(result.duplicates.length).toBe(1);
      expect(result.duplicates[0].matchType).toBe('fuzzy');
      expect(result.duplicates[0].similarity).toBeGreaterThanOrEqual(0.8);
    });

    it('should not flag dissimilar titles', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'Database Migration Strategy' }
      ];

      const result = service.validateTitleUniqueness('API Gateway Design', existingArtifacts);

      expect(result.isUnique).toBe(true);
      expect(result.duplicates).toEqual([]);
    });

    it('should handle empty title', () => {
      const existingArtifacts = [
        { id: 'RFC-0001', title: 'Some Title' }
      ];

      const result = service.validateTitleUniqueness('', existingArtifacts);

      expect(result.isUnique).toBe(true);
    });

    it('should handle empty existing artifacts', () => {
      const result = service.validateTitleUniqueness('New Title', []);

      expect(result.isUnique).toBe(true);
      expect(result.duplicates).toEqual([]);
    });
  });

  /**
   * **Feature: interactive-mode, Property 2: Tag suggestions come from recent artifacts**
   * **Validates: Requirements 1.3**
   * 
   * For any artifact type and set of existing artifacts, when prompting for tags,
   * all suggested tags SHALL be present in at least one recently created artifact of the same type.
   */
  describe('Property 2: Tag suggestions come from recent artifacts', () => {
    // Arbitrary for non-empty tag strings
    const tagArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => s.trim().length > 0 && !s.includes(','));

    // Arbitrary for artifact with tags
    const artifactWithTagsArb = fc.record({
      tags: fc.array(tagArb, { minLength: 0, maxLength: 5 })
    });

    // Arbitrary for array of artifacts
    const artifactsArb = fc.array(artifactWithTagsArb, { minLength: 0, maxLength: 20 });

    it('should only suggest tags that exist in input artifacts (property test)', () => {
      fc.assert(
        fc.property(
          artifactsArb,
          (artifacts) => {
            const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

            // Collect all tags from input artifacts (normalized)
            const allInputTags = new Set<string>();
            for (const artifact of artifacts) {
              for (const tag of artifact.tags) {
                const normalized = tag.trim().toLowerCase();
                if (normalized) {
                  allInputTags.add(normalized);
                }
              }
            }

            // Property: every suggested tag must exist in the input artifacts
            for (const suggestion of suggestions) {
              expect(allInputTags.has(suggestion)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return unique tags (property test)', () => {
      fc.assert(
        fc.property(
          artifactsArb,
          (artifacts) => {
            const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

            // Property: no duplicate tags in suggestions
            const uniqueSuggestions = new Set(suggestions);
            expect(suggestions.length).toBe(uniqueSuggestions.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect the limit parameter (property test)', () => {
      fc.assert(
        fc.property(
          artifactsArb,
          fc.integer({ min: 1, max: 50 }),
          (artifacts, limit) => {
            const suggestions = service.getTagSuggestionsFromArtifacts(artifacts, limit);

            // Property: number of suggestions should not exceed limit
            expect(suggestions.length).toBeLessThanOrEqual(limit);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort by frequency - most frequent first (property test)', () => {
      fc.assert(
        fc.property(
          artifactsArb,
          (artifacts) => {
            const suggestions = service.getTagSuggestionsFromArtifacts(artifacts);

            if (suggestions.length < 2) return; // Need at least 2 to compare

            // Count frequencies
            const tagCounts = new Map<string, number>();
            for (const artifact of artifacts) {
              for (const tag of artifact.tags) {
                const normalized = tag.trim().toLowerCase();
                if (normalized) {
                  tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
                }
              }
            }

            // Property: suggestions should be sorted by frequency (descending)
            for (let i = 0; i < suggestions.length - 1; i++) {
              const currentCount = tagCounts.get(suggestions[i]) || 0;
              const nextCount = tagCounts.get(suggestions[i + 1]) || 0;
              expect(currentCount).toBeGreaterThanOrEqual(nextCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: interactive-mode, Property 3: Title uniqueness validation**
   * **Validates: Requirements 1.4**
   * 
   * For any set of existing artifacts and a new title, if the title exactly matches
   * an existing artifact's title, the system SHALL issue a duplicate warning.
   */
  describe('Property 3: Title uniqueness validation', () => {
    // Arbitrary for artifact ID
    const artifactIdArb = fc.constantFrom('RFC-0001', 'RFC-0002', 'ADR-0001', 'ADR-0002', 'DECOMP-0001');

    // Arbitrary for non-empty title strings
    const titleArb = fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => s.trim().length > 0);

    // Arbitrary for existing artifact
    const existingArtifactArb = fc.record({
      id: artifactIdArb,
      title: titleArb
    });

    // Arbitrary for array of existing artifacts
    const existingArtifactsArb = fc.array(existingArtifactArb, { minLength: 0, maxLength: 10 });

    it('should detect exact matches regardless of case (property test)', () => {
      fc.assert(
        fc.property(
          existingArtifactsArb,
          fc.integer({ min: 0, max: 9 }),
          (existingArtifacts, index) => {
            if (existingArtifacts.length === 0) return;

            // Pick an existing title and vary its case
            const targetIndex = index % existingArtifacts.length;
            const existingTitle = existingArtifacts[targetIndex].title;
            const variedCaseTitle = existingTitle.toUpperCase();

            const result = service.validateTitleUniqueness(variedCaseTitle, existingArtifacts);

            // Property: exact match (case-insensitive) should be detected
            const hasExactMatch = result.duplicates.some(d => d.matchType === 'exact');
            expect(hasExactMatch).toBe(true);
            expect(result.isUnique).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return isUnique true when title is not in existing artifacts (property test)', () => {
      fc.assert(
        fc.property(
          existingArtifactsArb,
          titleArb,
          (existingArtifacts, newTitle) => {
            // Ensure the new title is not in existing artifacts
            const normalizedNew = newTitle.trim().toLowerCase();
            const existsInArtifacts = existingArtifacts.some(
              a => a.title.trim().toLowerCase() === normalizedNew
            );

            if (existsInArtifacts) return; // Skip if title already exists

            const result = service.validateTitleUniqueness(newTitle, existingArtifacts);

            // Property: if title doesn't exist, no exact match should be found
            const hasExactMatch = result.duplicates.some(d => d.matchType === 'exact');
            expect(hasExactMatch).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include artifact ID in duplicate info (property test)', () => {
      fc.assert(
        fc.property(
          existingArtifactsArb,
          (existingArtifacts) => {
            if (existingArtifacts.length === 0) return;

            // Use the first artifact's title
            const title = existingArtifacts[0].title;
            const result = service.validateTitleUniqueness(title, existingArtifacts);

            // Property: all duplicates should have valid IDs from the input
            const inputIds = new Set(existingArtifacts.map(a => a.id));
            for (const duplicate of result.duplicates) {
              expect(inputIds.has(duplicate.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty existing artifacts (property test)', () => {
      fc.assert(
        fc.property(
          titleArb,
          (title) => {
            const result = service.validateTitleUniqueness(title, []);

            // Property: with no existing artifacts, title is always unique
            expect(result.isUnique).toBe(true);
            expect(result.duplicates).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
