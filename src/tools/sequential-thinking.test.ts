// src/tools/sequential-thinking.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import * as sequentialThinkingModule from './sequential-thinking.js'; // Import module itself to spy on internal function
import { OpenRouterConfig } from '../types/workflow.js';
import { ValidationError, ParsingError, ApiError, AppError } from '../utils/errors.js'; // Import custom errors
import logger from '../logger.js';
import { SequentialThought as ZodSequentialThought } from '../types/sequentialThought.js'; // Import Zod type

// Mock the internal getNextThought function within the module
// We need to spy on the module's exports if getNextThought is not exported,
// or directly mock if it were exported (which it isn't).
// Vitest allows mocking non-exported functions via module mocking or spies if accessible.
// Let's assume we can spy on it for this example. If not, module mocking is needed.
// IMPORTANT: Spying on non-exported functions is tricky. This approach assumes vi.spyOn can reach it.
// If this fails at runtime, the sequential-thinking.ts module might need refactoring.
// Using 'any' here to bypass complex type inference issues with vi.spyOn on internal functions.
let getNextThoughtMock: any;

// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

// Mock config
const mockConfig: OpenRouterConfig = {
    baseUrl: 'mock-url', apiKey: 'mock-key', geminiModel: 'mock-gemini', perplexityModel: 'mock-perplexity'
};
const baseUserPrompt = 'Solve this problem';
const baseSystemPrompt = 'System prompt';

describe('processWithSequentialThinking', () => {

  beforeEach(() => {
    // Reset mocks usage between tests
    vi.clearAllMocks();
    // Re-establish the mock for getNextThought before each test
    // If getNextThought is truly internal, this spy might fail.
    // Consider exporting getNextThought for testing or using vi.mock for the whole module.
    // Assign the spy result directly to our typed mock variable
    getNextThoughtMock = vi.spyOn(sequentialThinkingModule as any, 'getNextThought');
    // Clear any previous mock state/calls from other tests
    getNextThoughtMock.mockClear();
  });

  afterEach(() => {
      // Restore mocks if necessary, especially if implementations were changed
      // vi.restoreAllMocks();
  });

  it('should complete successfully after multiple thoughts', async () => {
    // Mock sequence: Thought 1 -> Thought 2 -> Final Thought
    getNextThoughtMock
      .mockResolvedValueOnce({ thought: 'Step 1 analysis', next_thought_needed: true, thought_number: 1, total_thoughts: 3 } as ZodSequentialThought)
      .mockResolvedValueOnce({ thought: 'Step 2 refinement', next_thought_needed: true, thought_number: 2, total_thoughts: 3 } as ZodSequentialThought)
      .mockResolvedValueOnce({ thought: 'Final Answer', next_thought_needed: false, thought_number: 3, total_thoughts: 3 } as ZodSequentialThought);

    const result = await sequentialThinkingModule.processWithSequentialThinking(baseUserPrompt, mockConfig, baseSystemPrompt);

    expect(result).toBe('Final Answer');
    expect(getNextThoughtMock).toHaveBeenCalledTimes(3);
    // Check context aggregation in prompts
    expect(getNextThoughtMock.mock.calls[0][0]).toContain('Provide your first thought:');
    expect(getNextThoughtMock.mock.calls[1][0]).toContain('Previous thoughts:\n[Thought 1/3]: Step 1 analysis');
    expect(getNextThoughtMock.mock.calls[1][0]).toContain('Continue with the next thought:');
    expect(getNextThoughtMock.mock.calls[2][0]).toContain('Previous thoughts:\n[Thought 1/3]: Step 1 analysis\n\n[Thought 2/3]: Step 2 refinement');
    // Check system prompt usage
     expect(getNextThoughtMock.mock.calls[0][1]).toContain(baseSystemPrompt);
     expect(getNextThoughtMock.mock.calls[0][1]).toContain('You are a dynamic and reflective problem-solver'); // Base seq thinking prompt
  });

  it('should retry on validation error and succeed on retry', async () => {
     const validationError = new ValidationError('Invalid JSON structure in thought', [{path: ['field'], message:'bad'}]);
     getNextThoughtMock
       .mockRejectedValueOnce(validationError) // First attempt fails validation
       .mockResolvedValueOnce({ thought: 'Successful Retry Answer', next_thought_needed: false, thought_number: 1, total_thoughts: 1 } as ZodSequentialThought); // Second attempt succeeds

     const result = await sequentialThinkingModule.processWithSequentialThinking(baseUserPrompt, mockConfig);

     expect(result).toBe('Successful Retry Answer');
     expect(getNextThoughtMock).toHaveBeenCalledTimes(2);
     // Verify the second call's prompt contains the error message
     expect(getNextThoughtMock.mock.calls[1][0]).toContain('PREVIOUS ATTEMPT FAILED');
     expect(getNextThoughtMock.mock.calls[1][0]).toContain(validationError.message);
     expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: validationError, attempt: 1 }), expect.stringContaining('Attempt 1 to get thought failed.'));
     expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Retrying thought generation (attempt 2)...'));
   });

   it('should fail after exhausting retries on persistent validation errors', async () => {
       const validationError = new ValidationError('Persistent Invalid JSON');
       getNextThoughtMock.mockRejectedValue(validationError); // Always fail

       // Assuming maxRetries = 3 internally in the implementation
       await expect(sequentialThinkingModule.processWithSequentialThinking(baseUserPrompt, mockConfig))
         .rejects.toThrow(ValidationError); // Expect the specific error from the last attempt

       expect(getNextThoughtMock).toHaveBeenCalledTimes(3);
       expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('All 3 attempts failed'));
       expect(logger.warn).toHaveBeenCalledTimes(3); // Called for each failed attempt
   });

   it('should fail immediately on API error without retrying', async () => {
       const apiError = new ApiError('Auth failed', 401);
       getNextThoughtMock.mockRejectedValueOnce(apiError); // Fail with API error

        await expect(sequentialThinkingModule.processWithSequentialThinking(baseUserPrompt, mockConfig))
          .rejects.toThrow(ApiError); // Expect the specific error

       expect(getNextThoughtMock).toHaveBeenCalledTimes(1); // Should only be called once
       expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: apiError, attempt: 1 }), expect.stringContaining('Attempt 1 to get thought failed.'));
       // It should NOT log "Retrying" or "All attempts failed" in this case
       expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Retrying'));
       expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('All attempts failed'));
   });

   it('should fail immediately on Parsing error without retrying', async () => {
    const parsingError = new ParsingError('Bad JSON');
    getNextThoughtMock.mockRejectedValueOnce(parsingError); // Fail with Parsing error

     await expect(sequentialThinkingModule.processWithSequentialThinking(baseUserPrompt, mockConfig))
       .rejects.toThrow(ParsingError); // Expect the specific error

    expect(getNextThoughtMock).toHaveBeenCalledTimes(1); // Should only be called once
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: parsingError, attempt: 1 }), expect.stringContaining('Attempt 1 to get thought failed.'));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Retrying'));
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('All attempts failed'));
});

});
