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
const USER_STORIES_DIR = path.join(process.cwd(), 'workflow-agent-files', 'user-stories-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(USER_STORIES_DIR);
}

// User stories generator-specific system prompt
const USER_STORIES_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert Agile Business Analyst and Product Owner AI assistant. Your goal is to generate a comprehensive and well-structured set of User Stories, including Epics and Acceptance Criteria, in Markdown format.

# CORE TASK
Generate detailed user stories based on the user's product description and the provided research context.

# INPUT HANDLING
- Analyze the 'productDescription' to understand the product's purpose, core features, and intended value.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: User Personas & Stakeholders, User Workflows & Use Cases, and User Experience Expectations & Pain Points.
- **Use these insights** heavily to:
    - Define realistic 'As a [user type/persona]' roles based on the research.
    - Create stories that address identified 'User Workflows & Use Cases'.
    - Ensure stories align with 'User Experience Expectations' and address 'Pain Points'.
    - Inform the 'Priority' and 'Value/Benefit' parts of the stories.
- **Synthesize**, don't just list research findings. Create user stories that *embody* the research.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# User Stories: [Inferred Product Name]'
- Organize stories hierarchically using Markdown headings:
    - \`## Epic: [Epic Title]\` (e.g., \`## Epic: User Authentication\`)
    - \`### User Story: [Story Title]\` (e.g., \`### User Story: User Registration\`)
- For **each User Story**, use the following precise template within its \`###\` section:

  **ID:** US-[auto-incrementing number, e.g., US-101]
  **Title:** [Concise Story Title]
  
  **Story:**
  > As a **[User Role/Persona - informed by research]**,
  > I want to **[perform an action or achieve a goal]**
  > So that **[I gain a specific benefit - linked to user needs/pain points from research]**.
  
  **Acceptance Criteria:**
  *   GIVEN [precondition/context] WHEN [action is performed] THEN [expected, testable outcome].
  *   GIVEN [another context] WHEN [different action] THEN [another outcome].
  *   *(Provide multiple, specific, measurable criteria)*
  
  **Priority:** [High | Medium | Low - informed by perceived value/dependencies/research]
  **Dependencies:** [List of User Story IDs this depends on, e.g., US-100 | None]
  **(Optional) Notes:** [Any clarifying details or technical considerations.]

# QUALITY ATTRIBUTES
- **INVEST Principles:** Ensure stories are Independent, Negotiable, Valuable, Estimable, Small (appropriately sized), and Testable (via Acceptance Criteria).
- **User-Centric:** Focus on user roles, actions, and benefits, informed by research personas and needs.
- **Clear Acceptance Criteria:** Criteria must be specific, unambiguous, and testable.
- **Comprehensive:** Cover the core functionality implied by the description and research workflows.
- **Well-Structured:** Adhere strictly to the Epic/Story hierarchy and template format.
- **Consistent:** Use consistent terminology and formatting.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# User Stories: ...' title. No intros, summaries, or closings.
- **NO Markdown Violations:** Strictly adhere to the specified Markdown format (headings, blockquotes for the story, lists for AC).
- **NO Implementation Details:** Focus on *what* the user needs, not *how* it will be built (unless specified in 'Notes').
- **NO External Knowledge:** Base stories *only* on the provided inputs and research context.
- **NO Process Commentary:** Do not mention the research process in the output.
- **Strict Formatting:** Use \`##\` for Epics, \`###\` for Stories. Use the exact field names (ID, Title, Story, Acceptance Criteria, etc.) in bold. Use Markdown blockquotes for the As a/I want/So that structure.
`;

// Define Input Type based on Schema
const userStoriesInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product to create user stories for")
};

/**
 * Generate user stories based on a product description.
 * This function now acts as the executor for the 'generate-user-stories' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateUserStories: ToolExecutor = async (
  params: Record<string, any>, // Match ToolExecutor signature
  config: OpenRouterConfig
): Promise<CallToolResult> => { // Return CallToolResult
  const productDescription = params.productDescription as string; // Assert type after validation
  try {
    await initDirectories();

    // Generate a filename for storing the user stories
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-user-stories.md`;
    const filePath = path.join(USER_STORIES_DIR, filename);
    
    // Perform pre-generation research using Perplexity
    logger.info({ inputs: { productDescription: productDescription.substring(0, 50) } }, "User Stories Generator: Starting pre-generation research...");
    
    let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `User personas and stakeholders for: ${productDescription}`;
      const query2 = `Common user workflows and use cases for: ${productDescription}`;
      const query3 = `User experience expectations and pain points for: ${productDescription}`;
      
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
        const queryLabels = ["User Personas & Stakeholders", "User Workflows & Use Cases", "User Experience Expectations & Pain Points"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });
      
      logger.info("User Stories Generator: Pre-generation research completed.");
    } catch (researchError) {
      logger.error({ err: researchError }, "User Stories Generator: Error during research aggregation");
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
    }
    
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create comprehensive user stories for the following product:\n\n${productDescription}\n\n${researchContext}`;
    
    // Process the user stories generation with sequential thinking using Gemini
    logger.info("User Stories Generator: Starting main generation using Gemini...");
    
    const userStoriesResult = await processWithSequentialThinking(
      mainGenerationPrompt, 
      config, // Contains config.geminiModel which processWithSequentialThinking uses
      USER_STORIES_SYSTEM_PROMPT
    );
    
    logger.info("User Stories Generator: Main generation completed.");
    
    // Format the user stories with a title header
    const formattedResult = `# User Stories: ${productDescription.substring(0, 50)}...\n\n${userStoriesResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info(`User stories generated and saved to ${filePath}`);

    // Return success result
    return {
      content: [{ type: "text", text: formattedResult }],
      isError: false
    };
  } catch (error) {
    logger.error({ err: error, params }, 'User Stories Generator Error');
    // Return error result
    return {
      content: [{ type: "text", text: `Error generating user stories: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
};

// --- Tool Registration ---

// Tool definition for the user stories generator tool
const userStoriesToolDefinition: ToolDefinition = {
  name: "generate-user-stories",
  description: "Creates detailed user stories with acceptance criteria based on a product description and research.",
  inputSchema: userStoriesInputSchemaShape, // Use the raw shape
  executor: generateUserStories // Reference the adapted function
};

// Register the tool with the central registry
registerTool(userStoriesToolDefinition);
