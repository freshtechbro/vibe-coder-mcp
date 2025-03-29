import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod'; // Added Zod import
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Added MCP type import
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor } from '../../services/routing/toolRegistry.js'; // Added registry imports

// Ensure directories exist
const TASK_LIST_DIR = path.join(process.cwd(), 'workflow-agent-files', 'task-list-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(TASK_LIST_DIR);
}

// Task list generator-specific system prompt
const TASK_LIST_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert Project Manager and Technical Lead AI assistant. Your goal is to generate a detailed, actionable, and well-structured development task list in Markdown format, breaking down user stories into concrete development tasks.

# CORE TASK
Generate a hierarchical development task list based on the user's product description, provided user stories, and the research context.

# INPUT HANDLING
- Analyze the 'productDescription' for overall project scope and context.
- **Critically analyze the provided 'userStories'.** Each user story should be broken down into specific development tasks.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: Development Lifecycle & Milestones, Task Estimation & Dependencies, and Team Structure & Work Breakdown.
- **Use these insights** heavily to:
    - Structure the task list logically according to standard 'Development Lifecycle & Milestones' (e.g., Setup, Backend API, Frontend UI, Testing, Deployment phases).
    - Define realistic 'Dependencies' between tasks based on best practices.
    - Apply appropriate relative 'Estimated Effort' (Small, Medium, Large) based on research findings on task estimation.
    - Break down tasks to a suitable level of granularity, considering typical 'Work Breakdown' structures.
- **Synthesize**, don't just list research findings. Apply the research principles to the specific tasks derived from the user stories.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Task List: [Inferred Product Name]'
- Organize tasks hierarchically using Markdown headings and nested lists:
    - \`## Phase: [Phase Name]\` (e.g., \`## Phase: Project Setup\`, \`## Phase: Backend API Development\`, \`## Phase: Frontend UI Implementation\`) - Derived from research context on lifecycle.
    - \`### Epic/Feature: [Related Epic or Feature from User Stories]\` (Optional grouping under phases)
    - Use nested bullet points (\`-\`, \`  -\`, \`    -\`) for Main Tasks and Sub-Tasks.
- For **each Task/Sub-Task**, include the following details clearly formatted within the list item:
    - **ID:** T-[auto-incrementing number, e.g., T-101]
    - **Title:** [Clear, Action-Oriented Task Title (e.g., Implement user registration endpoint)]
    - *(Description):* [Brief explanation of the task.]
    - *(User Story):* [ID(s) of related User Story, e.g., US-101]
    - *(Priority):* [High | Medium | Low]
    - *(Dependencies):* [List of Task IDs, e.g., T-100, T-105 | None]
    - *(Est. Effort):* [Small | Medium | Large - informed by research]

**Example Task Format:**
\`\`\`markdown
- **ID:** T-201
  **Title:** Create User Model and Database Migration
  *(Description):* Define the data structure for users and create the necessary database migration scripts.
  *(User Story):* US-101
  *(Priority):* High
  *(Dependencies):* T-101 (Project Setup Complete)
  *(Est. Effort):* Medium
    - **ID:** T-201.1
      **Title:** Define User schema (username, password_hash, email)
      *(Description):* Specify fields and types for the user data model.
      *(User Story):* US-101
      *(Priority):* High
      *(Dependencies):* T-201
      *(Est. Effort):* Small
    - **ID:** T-201.2
      **Title:** Write database migration script using [ORM/Tool]
      *(Description):* Create the script to apply the User schema to the database.
      *(User Story):* US-101
      *(Priority):* High
      *(Dependencies):* T-201.1
      *(Est. Effort):* Small
\`\`\`

# QUALITY ATTRIBUTES
- **Actionable:** Tasks should be specific enough to be assigned and worked on.
- **Comprehensive:** Cover all user stories provided. Include setup, development, testing, and potentially deployment tasks based on lifecycle research.
- **Logical Flow:** Dependencies should reflect a realistic development sequence informed by research.
- **Well-Estimated:** Relative effort should be consistent and based on research insights.
- **Clearly Structured:** Adhere strictly to the hierarchical Markdown format.
- **Traceable:** Link tasks back to user stories.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# Task List: ...' title. No introductions or summaries.
- **NO Markdown Violations:** Strictly adhere to the specified Markdown format (headings, nested lists, bold field names).
- **NO External Knowledge:** Base tasks *only* on the provided inputs (description, stories) and research context.
- **NO Process Commentary:** Do not mention the research process in the output.
- **Strict Formatting:** Use \`##\` for Phases, \`###\` for Epics (optional), nested \`-\` for tasks/sub-tasks. Use the exact field names (ID, Title, etc.) in bold, followed by \`:\`.
`;

// Define Input Type based on Schema
const taskListInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product"),
  userStories: z.string().min(20, { message: "User stories must be provided and be at least 20 characters." }).describe("User stories (in Markdown format) to use for task list generation")
};

/**
 * Generate a task list based on product description and user stories.
 * This function now acts as the executor for the 'generate-task-list' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateTaskList: ToolExecutor = async (
  params: Record<string, any>, // Match ToolExecutor signature
  config: OpenRouterConfig
): Promise<CallToolResult> => { // Return CallToolResult
  const { productDescription, userStories } = params as { productDescription: string; userStories: string }; // Assert types after validation
  try {
    await initDirectories();

    // Generate a filename for storing the task list
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-task-list.md`;
    const filePath = path.join(TASK_LIST_DIR, filename);
    
    // Perform pre-generation research using Perplexity
    logger.info({ inputs: { productDescription: productDescription.substring(0, 50), userStories: userStories.substring(0, 50) } }, "Task List Generator: Starting pre-generation research...");
    
    let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Software development lifecycle tasks and milestones for: ${productDescription}`;
      const query2 = `Task estimation and dependency management best practices for software projects`;
      const query3 = `Development team structures and work breakdown for projects similar to: ${productDescription}`;
      
      // Execute research queries in parallel using Perplexity
      const researchResults = await Promise.allSettled([
        performResearchQuery(query1, config), // Uses config.perplexityModel (perplexity/sonar-deep-research)
        performResearchQuery(query2, config),
        performResearchQuery(query3, config)
      ]);
      
      // Process research results
      researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";
      
      // Add results that were fulfilled
      researchResults.forEach((result, index) => {
        const queryLabels = ["Development Lifecycle & Milestones", "Task Estimation & Dependencies", "Team Structure & Work Breakdown"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });
      
      logger.info("Task List Generator: Pre-generation research completed.");
    } catch (researchError) {
      logger.error({ err: researchError }, "Task List Generator: Error during research aggregation");
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
    }
    
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create a detailed task list for the following product:\n\n${productDescription}\n\nBased on these user stories:\n\n${userStories}\n\n${researchContext}`;
    
    // Process the task list generation with sequential thinking using Gemini
    logger.info("Task List Generator: Starting main generation using Gemini...");
    
    const taskListResult = await processWithSequentialThinking(
      mainGenerationPrompt, 
      config, // Contains config.geminiModel which processWithSequentialThinking uses
      TASK_LIST_SYSTEM_PROMPT
    );
    
    logger.info("Task List Generator: Main generation completed.");
    
    // Format the task list with a title header
    const formattedResult = `# Task List: ${productDescription.substring(0, 50)}...\n\n${taskListResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info(`Task list generated and saved to ${filePath}`);

    // Return success result
    return {
      content: [{ type: "text", text: formattedResult }],
      isError: false
    };
  } catch (error) {
    logger.error({ err: error, params }, 'Task List Generator Error');
    // Return error result
    return {
      content: [{ type: "text", text: `Error generating task list: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
};

// --- Tool Registration ---

// Tool definition for the task list generator tool
const taskListToolDefinition: ToolDefinition = {
  name: "generate-task-list",
  description: "Creates structured development task lists with dependencies based on product description, user stories, and research.",
  inputSchema: taskListInputSchemaShape, // Use the raw shape
  executor: generateTaskList // Reference the adapted function
};

// Register the tool with the central registry
registerTool(taskListToolDefinition);
