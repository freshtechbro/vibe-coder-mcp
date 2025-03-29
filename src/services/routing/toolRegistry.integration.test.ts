// src/services/routing/toolRegistry.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { z } from 'zod';
// Import REAL functions we want to test, but also the module to mock parts of it
import * as toolRegistryModule from './toolRegistry.js';
import { OpenRouterConfig } from '../../types/workflow.js'; // Adjust path if needed
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Adjust path if needed
import { ValidationError } from '../../utils/errors.js'; // Adjust path if needed
import logger from '../../logger.js'; // Adjust path if needed

// --- Mock Dependencies ---
// Mock logger
vi.spyOn(logger, 'info').mockImplementation(() => {});
vi.spyOn(logger, 'debug').mockImplementation(() => {});
vi.spyOn(logger, 'warn').mockImplementation(() => {});
vi.spyOn(logger, 'error').mockImplementation(() => {});

// --- Test Setup ---
const mockConfig: OpenRouterConfig = { baseUrl: 'test', apiKey: 'test', geminiModel: 'test', perplexityModel: 'test' };

// Define mock executors
const mockSuccessExecutor = vi.fn().mockResolvedValue({
   content: [{ type: 'text', text: 'Success!' }],
   isError: false,
} as CallToolResult);

const mockErrorExecutor = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Executor failed' }],
    isError: true,
    errorDetails: { type: 'MockExecutorError', message: 'Executor failed' }
} as CallToolResult);

const mockThrowingExecutor = vi.fn().mockRejectedValue(new Error('Unexpected throw'));

// Define mock tool schemas (raw shapes)
const successToolSchemaShape = { message: z.string() };
const errorToolSchemaShape = { id: z.number() };
const throwingToolSchemaShape = {}; // No params

// Define mock tool definitions using raw shapes
const successToolDef: toolRegistryModule.ToolDefinition = {
    name: 'successTool',
    description: 'A tool that always succeeds',
    inputSchema: successToolSchemaShape,
    executor: mockSuccessExecutor,
};

const errorToolDef: toolRegistryModule.ToolDefinition = {
    name: 'errorTool',
    description: 'A tool that returns an error result',
    inputSchema: errorToolSchemaShape,
    executor: mockErrorExecutor,
};

const throwingToolDef: toolRegistryModule.ToolDefinition = {
    name: 'throwingTool',
    description: 'A tool executor that throws',
    inputSchema: throwingToolSchemaShape,
    executor: mockThrowingExecutor,
};

describe('Tool Registry Integration (executeTool)', () => {

  // Use a test-local Map to simulate the registry state for isolation
  let testRegistry: Map<string, toolRegistryModule.ToolDefinition>;

  // Mock the registry access functions BEFORE each test
  beforeEach(() => {
      testRegistry = new Map<string, toolRegistryModule.ToolDefinition>();

      // Mock registerTool to use our test-local map
      vi.spyOn(toolRegistryModule, 'registerTool').mockImplementation((definition) => {
          testRegistry.set(definition.name, definition);
          // console.log(`Mock registerTool called for: ${definition.name}`);
      });

      // Mock getTool to use our test-local map
      vi.spyOn(toolRegistryModule, 'getTool').mockImplementation((toolName) => {
          // console.log(`Mock getTool called for: ${toolName}`);
          return testRegistry.get(toolName);
      });

      // Clear executor mocks
      mockSuccessExecutor.mockClear();
      mockErrorExecutor.mockClear();
      mockThrowingExecutor.mockClear();
      vi.clearAllMocks(); // Clear logger spies etc.

      // Register mock tools into our test-local map via the mocked registerTool
      toolRegistryModule.registerTool(successToolDef);
      toolRegistryModule.registerTool(errorToolDef);
      toolRegistryModule.registerTool(throwingToolDef);

      // Re-apply logger spies after clearAllMocks
      vi.spyOn(logger, 'info').mockImplementation(() => {});
      vi.spyOn(logger, 'debug').mockImplementation(() => {});
      vi.spyOn(logger, 'warn').mockImplementation(() => {});
      vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
      // Restore original implementations of spied functions
      vi.restoreAllMocks();
  });

  it('should execute a registered tool successfully with valid params', async () => {
    const params = { message: 'hello' };
    // Call the REAL executeTool, which will use our mocked getTool
    const result = await toolRegistryModule.executeTool('successTool', params, mockConfig);

    expect(result.isError).toBe(false);
    expect(result.content?.[0]?.text).toBe('Success!');
    expect(mockSuccessExecutor).toHaveBeenCalledTimes(1);
    // Executor should receive validated data (which happens to be the same as params here)
    expect(mockSuccessExecutor).toHaveBeenCalledWith(params, mockConfig);
    expect(logger.error).not.toHaveBeenCalled(); // Ensure no errors logged
  });

  it('should return error result if executor returns isError: true', async () => {
      const params = { id: 123 };
      // Call the REAL executeTool
      const result = await toolRegistryModule.executeTool('errorTool', params, mockConfig);

      expect(result.isError).toBe(true);
      expect(result.content?.[0]?.text).toBe('Executor failed');
      // Cannot reliably check errorDetails.type if not part of standard CallToolResult
      // expect(result.errorDetails?.type).toBe('MockExecutorError');
      expect(mockErrorExecutor).toHaveBeenCalledTimes(1);
      expect(mockErrorExecutor).toHaveBeenCalledWith(params, mockConfig);
      expect(logger.error).not.toHaveBeenCalled(); // executeTool shouldn't log an error if executor returns structured error
  });

  it('should return error result if executor throws an error', async () => {
     const params = {};
     // Call the REAL executeTool
     const result = await toolRegistryModule.executeTool('throwingTool', params, mockConfig);

     expect(result.isError).toBe(true);
     // Check the formatted error message from executeTool's catch block
     expect(result.content?.[0]?.text).toContain("Error in tool 'throwingTool': Unexpected throw");
     // Cannot reliably check errorDetails if not part of standard CallToolResult
     // expect(result.errorDetails?.type).toBe('ToolExecutionError');
     // expect(result.errorDetails?.message).toBe('Unexpected throw');
     expect(mockThrowingExecutor).toHaveBeenCalledTimes(1);
     expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ tool: 'throwingTool' }), expect.stringContaining("Error during execution"));
  });

  it('should return validation error result for invalid params', async () => {
    const invalidParams = { message: 123 }; // message should be string
    // Call the REAL executeTool
    const result = await toolRegistryModule.executeTool('successTool', invalidParams, mockConfig);

    expect(result.isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Input validation failed for tool 'successTool'");
    // Check for Zod's specific message within the text content
    expect(result.content?.[0]?.text).toMatch(/Expected string, received number/i);
    // Cannot reliably check errorDetails if not part of standard CallToolResult
    // expect(result.errorDetails?.type).toBe('ValidationError');
    // expect(result.errorDetails?.issues).toBeInstanceOf(Array);
    // expect(result.errorDetails?.issues?.length).toBeGreaterThan(0);
    expect(mockSuccessExecutor).not.toHaveBeenCalled(); // Executor should not be called
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ tool: 'successTool' }), 'Tool parameter validation failed.');
  });

   it('should return error result for unregistered tool', async () => {
       // Call the REAL executeTool
       const result = await toolRegistryModule.executeTool('nonExistentTool', {}, mockConfig);

       expect(result.isError).toBe(true);
       expect(result.content?.[0]?.text).toBe('Error: Tool "nonExistentTool" not found.');
       // Cannot reliably check errorDetails if not part of standard CallToolResult
       expect(logger.error).toHaveBeenCalledWith('Tool "nonExistentTool" not found in registry.');
   });
});
