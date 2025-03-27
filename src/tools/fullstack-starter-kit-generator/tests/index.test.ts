// src/tools/fullstack-starter-kit-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFullstackStarterKit, FullstackStarterKitInput, initDirectories } from '../index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import * as sequentialThinking from '../../sequential-thinking.js';
import * as schema from '../schema.js';
import { ZodError } from 'zod';
import * as scripts from '../scripts.js';
import fs from 'fs-extra';
import path from 'path';

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../sequential-thinking.js');
vi.mock('fs-extra');

describe('Fullstack Starter Kit Generator', () => {
  // Mock data and responses
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free', 
    perplexityModel: 'perplexity/sonar-deep-research'
  };
  
  const mockInput: FullstackStarterKitInput = {
    use_case: "E-commerce platform",
    tech_stack_preferences: {
      frontend: "React",
      backend: "Node.js"
    },
    request_recommendation: true,
    include_optional_features: ["authentication", "payment-processing"]
  };
  
  const mockResearchResults = [
    "Mock technology stack recommendations data",
    "Mock best practices and architectural patterns data",
    "Mock development tooling and libraries data"
  ];

  const mockAnalysisResult = "Mock analysis of use case and technology options.";
  
  // Valid JSON that matches the schema
  const mockValidJsonResult = JSON.stringify({
    projectName: "test-project",
    description: "A test project",
    techStack: {
      frontend: {
        name: "React",
        version: "18.x",
        rationale: "Popular library for UI development"
      },
      backend: {
        name: "Node.js",
        version: "16.x",
        rationale: "JavaScript runtime for server-side code"
      }
    },
    directoryStructure: [
      {
        path: "/",
        type: "directory",
        content: null,
        children: [
          {
            path: "/src",
            type: "directory",
            content: null,
            children: [
              {
                path: "/src/index.js",
                type: "file",
                content: "console.log('Hello');",
                generationPrompt: null
              }
            ]
          }
        ]
      }
    ],
    dependencies: {
      npm: {
        root: {
          dependencies: {
            express: "^4.18.2"
          }
        }
      }
    },
    setupCommands: ["npm install"],
    nextSteps: ["Configure database"]
  });
  
  // Invalid JSON format
  const mockInvalidJsonFormat = "{not valid json";
  
  // Valid JSON but doesn't match schema
  const mockInvalidSchemaJson = JSON.stringify({
    projectName: "test-project",
    // Missing required fields
  });

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Mock filesystem operations
    vi.spyOn(fs, 'ensureDir').mockResolvedValue();
    vi.spyOn(fs, 'writeJson').mockResolvedValue();
    vi.spyOn(fs, 'writeFile').mockResolvedValue();
    
    // Mock the script generation
    vi.spyOn(scripts, 'generateSetupScripts').mockReturnValue({
      sh: '#!/bin/bash\necho "Mock shell script"',
      bat: '@echo off\necho "Mock batch script"'
    });
    
    // Mock the Promise.allSettled for research results
    vi.spyOn(Promise, 'allSettled').mockResolvedValue([
      { status: 'fulfilled', value: mockResearchResults[0] },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);
    
    // Mock the performResearchQuery function
    vi.spyOn(researchHelper, 'performResearchQuery')
      .mockImplementation(async (query: string) => {
        // Return different results based on the query
        if (query.includes('technology stack')) return mockResearchResults[0];
        if (query.includes('best practices')) return mockResearchResults[1];
        if (query.includes('development tooling')) return mockResearchResults[2];
        return "Default mock research";
      });
    
    // Mock the processWithSequentialThinking function for default behavior
    vi.spyOn(sequentialThinking, 'processWithSequentialThinking')
      .mockImplementation(async (prompt) => {
        // First call is the analysis
        if (prompt.includes('You are tasked with creating a fullstack starter kit')) {
          return mockAnalysisResult;
        }
        // Second call is the JSON generation - return valid JSON by default
        return mockValidJsonResult;
      });
    
    // Mock schema validation to succeed by default
    vi.spyOn(schema.starterKitDefinitionSchema, 'safeParse')
      .mockReturnValue({
        success: true,
        data: JSON.parse(mockValidJsonResult)
      });
  });

  it('should initialize directories on startup', async () => {
    await initDirectories();
    expect(fs.ensureDir).toHaveBeenCalled();
  });

  it('should perform research (Perplexity) when recommendation is requested and validate output', async () => {
    // Call the function under test
    await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify Perplexity research was called 3 times (for 3 different queries)
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
    
    // Verify each research query contains appropriate context and uses the correct config
    const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock.calls;
    expect(researchCalls[0][0]).toContain('technology stack');
    expect(researchCalls[0][0]).toContain(mockInput.use_case);
    expect(researchCalls[0][1]).toBe(mockConfig); // Should pass full config with perplexityModel
    expect(researchCalls[1][0]).toContain('best practices');
    expect(researchCalls[2][0]).toContain('development tooling');
    
    // Verify Gemini generation was called twice (analysis and final recommendation)
    expect(sequentialThinking.processWithSequentialThinking).toHaveBeenCalledTimes(2);
    
    // Get the generation prompt and verify it contains research context
    const secondCallPrompt = vi.mocked(sequentialThinking.processWithSequentialThinking).mock.calls[1][0];
    expect(secondCallPrompt).toContain("Pre-Generation Research Context");
    expect(secondCallPrompt).toContain(mockInput.use_case);
    
    // Verify the config was correctly passed to processWithSequentialThinking
    const passedConfig = vi.mocked(sequentialThinking.processWithSequentialThinking).mock.calls[1][1];
    expect(passedConfig).toBe(mockConfig); // Should pass full config with geminiModel
  });

  it('should skip research when recommendation is not requested', async () => {
    // Create input with recommendation disabled
    const noRecommendationInput: FullstackStarterKitInput = {
      ...mockInput,
      request_recommendation: false
    };
    
    await generateFullstackStarterKit(noRecommendationInput, mockConfig);
    
    // Verify Perplexity research was NOT called
    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();
    
    // Verify Gemini generation was still called twice
    expect(sequentialThinking.processWithSequentialThinking).toHaveBeenCalledTimes(2);
    
    // Verify the second prompt doesn't contain research context
    const secondCallPrompt = vi.mocked(sequentialThinking.processWithSequentialThinking).mock.calls[1][0];
    expect(secondCallPrompt).not.toContain("Pre-Generation Research Context");
  });

  it('should handle research failures gracefully', async () => {
    // Mock a failed research query
    vi.mocked(Promise.allSettled).mockResolvedValueOnce([
      { status: 'rejected', reason: new Error('Research failed') },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);
    
    await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify Gemini generation was still called
    expect(sequentialThinking.processWithSequentialThinking).toHaveBeenCalledTimes(2);
    
    // Verify the prompt contains an error message for the failed research
    const finalPrompt = vi.mocked(sequentialThinking.processWithSequentialThinking).mock.calls[1][0];
    expect(finalPrompt).toContain("*Research on this topic failed*");
  });
  
  it('should validate JSON output, save it, and generate setup scripts', async () => {
    // Call the function
    const result = await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify schema validation was called
    expect(schema.starterKitDefinitionSchema.safeParse).toHaveBeenCalled();
    
    // Verify the definition file was saved
    expect(fs.writeJson).toHaveBeenCalledWith(
      expect.any(String), // path
      expect.objectContaining({ // content
        projectName: "test-project",
        description: "A test project"
      }),
      expect.objectContaining({ spaces: 2 }) // formatting options
    );
    
    // Verify script generation was called
    expect(scripts.generateSetupScripts).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "test-project",
        description: "A test project"
      })
    );
    
    // Verify the script files were saved
    expect(fs.writeFile).toHaveBeenCalledTimes(2); // One for .sh and one for .bat
    
    // Check .sh file was saved as executable
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
    const shCallIndex = writeFileCalls.findIndex(call => 
      typeof call[0] === 'string' && call[0].endsWith('.sh'));
    expect(shCallIndex).not.toBe(-1);
    expect(writeFileCalls[shCallIndex][2]).toEqual(expect.objectContaining({ mode: 0o755 }));
    
    // Verify the response includes script file information
    expect(result.content[0].text).toContain("## Project Structure Generation");
    expect(result.content[0].text).toContain("Linux/macOS Script");
    expect(result.content[0].text).toContain("Windows Script");
    expect(result.content[0].text).toContain("workflow-agent-files/fullstack-starter-kit-generator");
  });
  
  it('should return error on invalid JSON format', async () => {
    // Mock sequential thinking to return invalid JSON
    vi.mocked(sequentialThinking.processWithSequentialThinking).mockResolvedValueOnce(mockAnalysisResult);
    vi.mocked(sequentialThinking.processWithSequentialThinking).mockResolvedValueOnce(mockInvalidJsonFormat);
    
    const result = await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify error response
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: LLM did not return valid JSON definition");
    
    // Verify the file was not saved
    expect(fs.writeJson).not.toHaveBeenCalled();
  });
  
  it('should return error on JSON that fails schema validation', async () => {
    // Mock sequential thinking to return valid JSON but that doesn't match schema
    vi.mocked(sequentialThinking.processWithSequentialThinking).mockResolvedValueOnce(mockAnalysisResult);
    vi.mocked(sequentialThinking.processWithSequentialThinking).mockResolvedValueOnce(mockInvalidSchemaJson);
    
    // Create a real ZodError with the issues we want
    const zodError = new ZodError([{
      code: "invalid_type",
      expected: "string",
      received: "undefined",
      path: ["description"],
      message: "Required"
    }]);
    
    // Mock schema validation to fail with a proper ZodError
    vi.mocked(schema.starterKitDefinitionSchema.safeParse).mockReturnValueOnce({
      success: false,
      error: zodError
    });
    
    const result = await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify error response
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: LLM output failed validation");
    expect(result.content[0].text).toContain("Missing required fields");
    
    // Verify the file was not saved
    expect(fs.writeJson).not.toHaveBeenCalled();
  });
  
  it('should properly format the JSON prompt with strict instructions', async () => {
    await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Get the generation prompt for the JSON
    const jsonPrompt = vi.mocked(sequentialThinking.processWithSequentialThinking).mock.calls[1][0];
    
    // Verify it contains the strict instruction about JSON format
    expect(jsonPrompt).toContain("**CRITICAL:** Your entire response MUST be a single, valid JSON object");
    expect(jsonPrompt).toContain("Do NOT include any explanatory text, greetings, apologies, or markdown formatting");
    expect(jsonPrompt).toContain("The response should start with `{` and end with `}`");
  });
  
  it('should handle script generation failures gracefully', async () => {
    // Mock script generation to fail
    vi.mocked(scripts.generateSetupScripts).mockImplementationOnce(() => {
      throw new Error('Script generation failed');
    });
    
    const result = await generateFullstackStarterKit(mockInput, mockConfig);
    
    // Verify process didn't completely fail
    expect(result.isError).toBeUndefined();
    
    // Definition JSON should still be saved
    expect(fs.writeJson).toHaveBeenCalled();
    
    // Should still attempt to save placeholder scripts
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    
    // Response should still include structured definition info
    expect(result.content[0].text).toContain("## Project: test-project");
  });
});
