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
const PRD_DIR = path.join(process.cwd(), 'workflow-agent-files', 'prd-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(PRD_DIR);
}

// PRD-specific system prompt (Exported for testing)
export const PRD_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert Product Manager and Technical Writer AI assistant. Your goal is to generate a comprehensive, clear, and well-structured Product Requirements Document (PRD) in Markdown format based on the provided inputs.

# CORE TASK
Generate a detailed PRD based on the user's product description and the research context provided.

# INPUT HANDLING
- The primary input is the user's 'productDescription'. Analyze it carefully to understand the core concept, features, and goals.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: Market Analysis, User Needs & Expectations, and Industry Standards & Best Practices.
- **Integrate** these insights strategically into the relevant PRD sections. For example:
    - Use 'Market Analysis' to inform the 'Goals' and 'Competitive Landscape' (if included).
    - Use 'User Needs & Expectations' and 'Personas' (if available in research) to define the 'Target Audience' and justify features.
    - Use 'Industry Standards & Best Practices' to guide 'Features & Functionality', 'Technical Considerations', and 'Non-Functional Requirements'.
- **Synthesize**, don't just copy. Weave the research findings naturally into the PRD narrative.
- If research context is missing or indicates failure for a topic, note this appropriately (e.g., "Market research was inconclusive, but based on the description...").

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# PRD: [Inferred Product Name]'
- Use the following sections with the specified Markdown heading levels. Include all mandatory sections; optional sections can be added if relevant information is available from the description or research.

  ## 1. Introduction / Overview (Mandatory)
  - Purpose of the product.
  - High-level summary.

  ## 2. Goals (Mandatory)
  - Business goals (e.g., increase market share, user engagement). Use research context if applicable.
  - Product goals (e.g., solve specific user problems, achieve specific functionality).

  ## 3. Target Audience (Mandatory)
  - Describe the primary user groups.
  - Incorporate insights on demographics, needs, and pain points from the research context. Use persona descriptions if research provided them.

  ## 4. Features & Functionality (Mandatory)
  - Use subheadings (###) for major features or epics.
  - For each feature, use the User Story format:
    - **User Story:** As a [user type/persona], I want to [perform action] so that [I get benefit].
    - **Description:** Further details about the story.
    - **Acceptance Criteria:**
      - GIVEN [context] WHEN [action] THEN [outcome]
      - (Provide multiple specific, testable criteria)

  ## 5. Design & UX Considerations (Mandatory)
  - High-level look-and-feel, usability goals. Informed by research on expectations.

  ## 6. Technical Considerations (Mandatory)
  - Non-functional requirements (performance, scalability, security - informed by research).
  - Potential technology constraints or suggestions based on research context.

  ## 7. Success Metrics (Mandatory)
  - Key Performance Indicators (KPIs) to measure success (e.g., user adoption rate, task completion time). Informed by industry standards research.

  ## 8. Open Issues / Questions (Mandatory)
  - List any ambiguities or areas needing further clarification.

  ## 9. Out-of-Scope / Future Considerations (Mandatory)
  - Features explicitly not included in this version.
  - Potential future enhancements.

# QUALITY ATTRIBUTES
- **Comprehensive:** Cover all aspects implied by the description and research.
- **Clear & Concise:** Use unambiguous language.
- **Structured:** Strictly adhere to the specified Markdown format and sections.
- **Actionable:** Requirements should be clear enough for design and development teams.
- **Accurate:** Reflect the product description and research context faithfully.
- **Modern:** Incorporate current best practices identified in research.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Do not include greetings, apologies, self-references ("Here is the PRD...", "I have generated..."). Start directly with the '# PRD: ...' title.
- **NO Markdown Violations:** Ensure all formatting is correct Markdown. Do not use unsupported syntax.
- **NO External Knowledge:** Base the PRD *only* on the provided product description and research context. Do not invent unrelated features or use external data.
- **NO Process Commentary:** Do not mention the research process or the models used (Perplexity/Gemini) within the PRD output itself.
- **Strict Formatting:** Adhere strictly to the section structure and Markdown heading levels specified.
`;

// Define Input Type based on Schema
const prdInputSchemaShape = {
  productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product to create a PRD for")
};

/**
 * Generate a PRD for a product based on a description.
 * This function now acts as the executor for the 'generate-prd' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generatePRD: ToolExecutor = async (
  params: Record<string, any>, // Match ToolExecutor signature
  config: OpenRouterConfig
): Promise<CallToolResult> => { // Return CallToolResult
  const productDescription = params.productDescription as string; // Assert type after validation
  try {
    await initDirectories();

    // Generate a filename for storing the PRD
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-prd.md`;
    const filePath = path.join(PRD_DIR, filename);
    
    // Perform pre-generation research using Perplexity
    logger.info({ inputs: { productDescription: productDescription.substring(0, 50) } }, "PRD Generator: Starting pre-generation research...");
    
    let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Market analysis and competitive landscape for: ${productDescription}`;
      const query2 = `User needs, demographics, and expectations for: ${productDescription}`;
      const query3 = `Industry standards, best practices, and common feature sets for products like: ${productDescription}`;
      
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
        const queryLabels = ["Market Analysis", "User Needs & Expectations", "Industry Standards & Best Practices"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });
      
      logger.info("PRD Generator: Pre-generation research completed.");
    } catch (researchError) {
      logger.error({ err: researchError }, "PRD Generator: Error during research aggregation");
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
    }
    
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create a comprehensive PRD for the following product:\n\n${productDescription}\n\n${researchContext}`;
    
    // Process the PRD generation with sequential thinking using Gemini
    logger.info("PRD Generator: Starting main generation using Gemini...");
    
    const prdResult = await processWithSequentialThinking(
      mainGenerationPrompt, 
      config, // Contains config.geminiModel which processWithSequentialThinking uses
      PRD_SYSTEM_PROMPT
    );
    
    logger.info("PRD Generator: Main generation completed.");
    
    // Format the PRD with a title header
    const titleMatch = prdResult.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : `PRD: ${productDescription.substring(0, 50)}...`;
    const formattedResult = `# ${title}\n\n${prdResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
    // Save the result
    await fs.writeFile(filePath, formattedResult, 'utf8');
    logger.info(`PRD generated and saved to ${filePath}`);

    // Return success result
    return {
      content: [{ type: "text", text: formattedResult }],
      isError: false
    };
  } catch (error) {
    logger.error({ err: error, params }, 'PRD Generator Error');
    // Return error result
    return {
      content: [{ type: "text", text: `Error generating PRD: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }
};

// --- Tool Registration ---

// Tool definition for the PRD generator tool
const prdToolDefinition: ToolDefinition = {
  name: "generate-prd",
  description: "Creates comprehensive product requirements documents based on a product description and research.",
  inputSchema: prdInputSchemaShape, // Use the raw shape
  executor: generatePRD // Reference the adapted function
};

// Register the tool with the central registry
registerTool(prdToolDefinition);
