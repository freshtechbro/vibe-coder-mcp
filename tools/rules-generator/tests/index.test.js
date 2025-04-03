// src/tools/rules-generator/tests/index.test.ts
// Removed @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Keep only one import
import { generateRules } from '../index.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import * as llmHelper from '../../../utils/llmHelper.js'; // Import the new helper
import fs from 'fs-extra';
// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js'); // Mock the new helper
vi.mock('fs-extra');
describe('Rules Generator', () => {
    // Mock data and responses
    const mockConfig = {
        baseUrl: 'https://api.example.com',
        apiKey: 'test-api-key',
        geminiModel: 'google/gemini-2.5-pro-exp-03-25:free',
        perplexityModel: 'perplexity/sonar-deep-research'
    };
    const mockUserStories = 'US-001: As a user, I want to...';
    const mockRuleCategories = ['Code Style', 'Architecture', 'Security'];
    const mockResearchResults = [
        "Mock best practices research data",
        "Mock rule categories research data",
        "Mock architecture patterns research data"
    ];
    const mockGeneratedRules = "# Mock Rules\n\nThis is a mock rules document generated by the test.";
    beforeEach(() => {
        // Clear all mocks before each test
        vi.clearAllMocks();
        // Mock initDirectories to avoid file system operations
        vi.spyOn(fs, 'ensureDir').mockResolvedValue();
        vi.spyOn(fs, 'writeFile').mockResolvedValue();
        // Mock the Promise.allSettled for research results
        vi.spyOn(Promise, 'allSettled').mockResolvedValue([
            { status: 'fulfilled', value: mockResearchResults[0] },
            { status: 'fulfilled', value: mockResearchResults[1] },
            { status: 'fulfilled', value: mockResearchResults[2] }
        ]);
        // Mock the performResearchQuery function
        vi.spyOn(researchHelper, 'performResearchQuery')
            .mockImplementation(async (query) => {
            // Return different results based on the query
            if (query.includes('practices'))
                return mockResearchResults[0];
            if (query.includes('categories'))
                return mockResearchResults[1];
            if (query.includes('architecture'))
                return mockResearchResults[2];
            return "Default mock research";
        });
        // Mock the performDirectLlmCall function
        vi.spyOn(llmHelper, 'performDirectLlmCall')
            .mockResolvedValue(mockGeneratedRules);
    });
    it('should perform research (Perplexity) then generation (Direct LLM) with research context', async () => {
        // Test input with params object matching new function signature
        const params = {
            productDescription: "A test product description",
            userStories: mockUserStories,
            ruleCategories: mockRuleCategories
        };
        // Call the function under test
        await generateRules(params, mockConfig);
        // Verify Perplexity research was called 3 times (for 3 different queries)
        expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
        // Verify each research query contains appropriate context and uses the correct config
        const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock.calls;
        expect(researchCalls[0][0]).toContain('practices');
        expect(researchCalls[0][1]).toBe(mockConfig); // Should pass full config with perplexityModel
        expect(researchCalls[1][0]).toContain('categories');
        expect(researchCalls[2][0]).toContain('architecture');
        // Verify direct LLM call was made once for generation
        expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(1);
        // Get the arguments passed to performDirectLlmCall
        const llmCallArgs = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0];
        const generationPrompt = llmCallArgs[0];
        const systemPrompt = llmCallArgs[1];
        const passedConfig = llmCallArgs[2];
        const logicalTaskName = llmCallArgs[3];
        const temperature = llmCallArgs[4];
        // Verify prompt content
        expect(generationPrompt).toContain(params.productDescription);
        expect(generationPrompt).toContain(params.userStories);
        expect(generationPrompt).toContain("Pre-Generation Research Context");
        // Verify system prompt
        expect(systemPrompt).toContain("Rules Generator");
        expect(systemPrompt).toContain("Using Research Context");
        // Verify config and logical task name
        expect(passedConfig).toBe(mockConfig);
        expect(logicalTaskName).toBe('rules_generation');
        expect(temperature).toBe(0.2); // Check the specific temperature used
        // Verify results are written to file
        expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });
    it('should handle custom rule categories in the research process', async () => {
        // Call with specific rule categories using params object
        const params = {
            productDescription: "Test product",
            ruleCategories: ["Security", "Performance"]
        };
        await generateRules(params, mockConfig);
        // Verify the second research query uses the provided categories
        const secondResearchQuery = vi.mocked(researchHelper.performResearchQuery).mock.calls[1][0];
        expect(secondResearchQuery).toContain("Security, Performance");
    });
    it('should handle research failures gracefully', async () => {
        // Mock a failed research query
        vi.mocked(Promise.allSettled).mockResolvedValueOnce([
            { status: 'rejected', reason: new Error('Research failed') },
            { status: 'fulfilled', value: mockResearchResults[1] },
            { status: 'fulfilled', value: mockResearchResults[2] }
        ]);
        const params = {
            productDescription: "A test product description",
            userStories: mockUserStories,
            ruleCategories: mockRuleCategories
        };
        await generateRules(params, mockConfig);
        // Verify direct LLM call was still made
        expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(1);
        // Verify the prompt passed to performDirectLlmCall contains the failure message
        const generationPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0][0];
        expect(generationPrompt).toContain("### Best Practices:\n*Research on this topic failed.*\n\n"); // Check specific failure message
        // Verify results are still written to file
        expect(fs.writeFile).toHaveBeenCalledTimes(1);
    });
    // --- Snapshot Test ---
    it('should generate rules content matching snapshot', async () => {
        const productDescription = "A sample product for snapshot";
        const userStories = "US-001: As a user, I want consistent rules";
        const ruleCategories = ["Code Style", "Architecture", "Security"];
        const consistentMockRules = "# Coding Rules\n\n## Code Style\n\n1. Rule description...\n\n## Architecture\n\n1. Rule description...\n\n## Security\n\n1. Rule description...";
        // Variable to capture the file path argument directly
        let capturedFilePath;
        // Reset mocks with consistent values for snapshot stability
        vi.mocked(researchHelper.performResearchQuery).mockResolvedValue("Consistent mock research.");
        vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(consistentMockRules); // Mock the direct call
        // Override writeFile to capture the path directly
        vi.mocked(fs.writeFile).mockImplementation(async (pathArg) => {
            capturedFilePath = pathArg;
        });
        // Call the function under test with params object
        const params = {
            productDescription,
            userStories,
            ruleCategories
        };
        const result = await generateRules(params, mockConfig);
        // Snapshot assertion for the content, excluding timestamp
        const resultText = result.content?.[0]?.text ?? '';
        const contentWithoutTimestamp = resultText.replace(/_Generated: .*_$/, '').trim();
        expect(contentWithoutTimestamp).toMatchSnapshot('Rules Generator Content');
        // Verify file write was called
        expect(fs.writeFile).toHaveBeenCalledTimes(1);
        // Verify file path was captured and contains expected components
        expect(capturedFilePath).toBeDefined();
        expect(capturedFilePath).toContain('rules-generator');
        expect(capturedFilePath).toMatch(/\.md$/); // Ends with .md
    });
});
