import fs from 'fs-extra';
import path from 'path';
// Removed duplicate fs and path imports
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // Import the new helper
import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import necessary errors
// Helper function to get the base output directory
function getBaseOutputDir() {
    // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
    // Fallback to default relative to CWD
    return process.env.VIBE_CODER_OUTPUT_DIR
        ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
        : path.join(process.cwd(), 'workflow-agent-files');
}
// Define tool-specific directory using the helper
const RESEARCH_DIR = path.join(getBaseOutputDir(), 'research-manager');
// Initialize directories if they don't exist
export async function initDirectories() {
    const baseOutputDir = getBaseOutputDir();
    try {
        await fs.ensureDir(baseOutputDir); // Ensure base directory exists
        const toolDir = path.join(baseOutputDir, 'research-manager');
        await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
        logger.debug(`Ensured research directory exists: ${toolDir}`);
    }
    catch (error) {
        logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for research-manager.`);
        // Decide if we should re-throw or just log. Logging might be safer.
    }
}
// Research manager-specific system prompt
const RESEARCH_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert AI Research Specialist. Your goal is to synthesize initial research findings and the original user query into a comprehensive, well-structured, and insightful research report in Markdown format.

# CORE TASK
Process the initial research findings (provided as context) related to the user's original 'query'. Enhance, structure, and synthesize this information into a high-quality research report.

# INPUT HANDLING
- The user prompt will contain the original 'query' and the initial research findings (likely from Perplexity) under a heading like 'Incorporate this information:'.
- Your task is *not* to perform new research, but to *refine, structure, and deepen* the provided information based on the original query.

# RESEARCH CONTEXT INTEGRATION (Your Input IS the Context)
- Treat the provided research findings as your primary source material.
- Analyze the findings for key themes, data points, conflicting information, and gaps.
- Synthesize the information logically, adding depth and interpretation where possible. Do not simply reformat the input.
- If the initial research seems incomplete based on the original query, explicitly state the limitations or areas needing further investigation in the 'Limitations' section.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Research Report: [Topic from Original Query]'
- Use the following sections with the specified Markdown heading levels. Include all sections, even if brief.

  ## 1. Executive Summary
  - Provide a brief (2-4 sentence) overview of the key findings and conclusions based *only* on the provided research content.

  ## 2. Key Findings
  - List the most important discoveries or data points from the research as bullet points.
  - Directly synthesize information from the provided research context.

  ## 3. Detailed Analysis
  - Elaborate on the key findings.
  - Organize the information logically using subheadings (###).
  - Discuss different facets of the topic, incorporating various points from the research.
  - Compare and contrast different viewpoints or data points if present in the research.

  ## 4. Practical Applications / Implications
  - Discuss the real-world relevance or potential uses of the researched information.
  - How can this information be applied? What are the consequences?

  ## 5. Limitations and Caveats
  - Acknowledge any limitations mentioned in the research findings.
  - Identify potential gaps or areas where the provided research seems incomplete relative to the original query.
  - Mention any conflicting information found in the research.

  ## 6. Conclusion & Recommendations (Optional)
  - Summarize the main takeaways.
  - If appropriate based *only* on the provided research, suggest potential next steps or areas for further investigation.

# QUALITY ATTRIBUTES
- **Synthesized:** Do not just regurgitate the input; organize, connect, and add analytical value.
- **Structured:** Strictly adhere to the specified Markdown format and sections.
- **Accurate:** Faithfully represent the information provided in the research context.
- **Comprehensive (within context):** Cover the key aspects present in the provided research relative to the query.
- **Clear & Concise:** Use precise language.
- **Objective:** Present the information neutrally, clearly separating findings from interpretation.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# Research Report: ...' title.
- **NO New Research:** Do not attempt to access external websites or knowledge beyond the provided research context. Your task is synthesis and structuring.
- **NO Hallucination:** Do not invent findings or data not present in the input.
- **NO Process Commentary:** Do not mention Perplexity, Gemini, or the synthesis process itself.
- **Strict Formatting:** Use \`##\` for main sections and \`###\` for subheadings within the Detailed Analysis. Use bullet points for Key Findings.
`;
/**
 * Perform research on a topic using Perplexity Sonar via OpenRouter and enhance with sequential thinking.
 * This function now acts as the executor for the 'research' tool.
 * @param params The tool parameters, expecting { query: string }.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
// Change signature to match ToolExecutor, but we know 'params' is validated
export const performResearch = async (params, config) => {
    // We can safely access 'query' because executeTool validated it
    const query = params.query;
    try {
        // Ensure directories are initialized before writing
        await initDirectories();
        // Generate a filename for storing research (using the potentially configured RESEARCH_DIR)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedQuery = query.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = `${timestamp}-${sanitizedQuery}-research.md`;
        const filePath = path.join(RESEARCH_DIR, filename);
        // Process the research request
        logger.info(`Performing research on: ${query.substring(0, 50)}...`);
        // Use Perplexity model for research via centralized helper
        const researchResult = await performResearchQuery(query, config);
        // Enhance the research using a direct LLM call
        logger.info("Research Manager: Enhancing research results using direct LLM call...");
        const enhancementPrompt = `Synthesize and structure the following initial research findings based on the original query.\n\nOriginal Query: ${query}\n\nInitial Research Findings:\n${researchResult}`;
        const enhancedResearch = await performDirectLlmCall(enhancementPrompt, RESEARCH_SYSTEM_PROMPT, // System prompt guides the structuring
        config, 'research_enhancement', // Define a logical task name for potential mapping
        0.4 // Slightly higher temp for synthesis might be okay
        );
        logger.info("Research Manager: Enhancement completed.");
        // Basic validation
        if (!enhancedResearch || typeof enhancedResearch !== 'string' || !enhancedResearch.trim().startsWith('# Research Report:')) {
            logger.warn({ markdown: enhancedResearch }, 'Research enhancement returned empty or potentially invalid Markdown format.');
            throw new ToolExecutionError('Research enhancement returned empty or invalid Markdown content.');
        }
        // Format the research (already should be formatted by LLM, just add timestamp)
        const formattedResult = `${enhancedResearch}\n\n_Generated: ${new Date().toLocaleString()}_`;
        // Save the result
        await fs.writeFile(filePath, formattedResult, 'utf8');
        logger.info(`Research result saved to ${filePath}`);
        // Return CallToolResult structure for success
        return {
            content: [{ type: "text", text: formattedResult }],
            isError: false
        };
    }
    catch (error) {
        logger.error({ err: error, query }, 'Research Manager Error');
        let errorMessage = `Error performing research for query: "${query}".`;
        let errorType = 'ToolExecutionError'; // Default if it's not a recognized AppError
        let errorContext = { query };
        // Check if it's one of our custom errors bubbled up from underlying calls
        if (error instanceof AppError) {
            errorMessage = `Research failed: ${error.message}`;
            errorType = error.name; // e.g., 'ApiError', 'ParsingError'
            errorContext = { ...errorContext, ...error.context }; // Merge contexts
        }
        else if (error instanceof Error) {
            // Generic error from researchQuery or sequentialThinking
            errorMessage = `Unexpected error during research: ${error.message}`;
            errorType = error.name;
        }
        else {
            errorMessage = `Unknown error during research.`;
            errorType = 'UnknownError';
            errorContext.originalValue = String(error);
        }
        // Use McpError for structured error reporting
        const mcpError = new McpError(ErrorCode.InternalError, errorMessage, errorContext);
        return {
            content: [{ type: "text", text: mcpError.message }],
            isError: true,
            errorDetails: mcpError // Pass the structured McpError
        };
    }
};
// --- Tool Registration ---
// Define the raw shape for the Zod schema
const researchInputSchemaShape = {
    query: z.string().min(3, { message: "Query must be at least 3 characters long." }).describe("The research query or topic to investigate")
};
// Tool definition for the research tool, using the raw shape
const researchToolDefinition = {
    name: "research", // Keep the original tool name
    description: "Performs deep research on a given topic using Perplexity Sonar and enhances the result.",
    inputSchema: researchInputSchemaShape, // Use the raw shape here
    executor: performResearch // Reference the adapted function
};
// Register the tool with the central registry
registerTool(researchToolDefinition);
