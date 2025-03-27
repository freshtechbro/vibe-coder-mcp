import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';

// Ensure directories exist
const PRD_DIR = path.join(process.cwd(), 'workflow-agent-files', 'prd-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(PRD_DIR);
}

// PRD-specific system prompt
const PRD_SYSTEM_PROMPT = `
You are an AI assistant expert at generating comprehensive Product Requirements Documents (PRDs).
Based on the provided product description and research context, generate a detailed PRD.

**Using Research Context:**
* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* Use this research information to inform your output, ensuring it reflects current market trends, user expectations, and industry standards.
* Incorporate relevant insights from the research while keeping the focus on the primary product description.

**PRD Structure:** Include standard sections like:
1.  **Introduction/Overview:** Purpose, Goals (if inferrable).
2.  **Target Audience:** Describe likely users, informed by the research on user demographics.
3.  **Features & Functionality:** Detail key features. Use User Stories (As a [user], I want [action], so that [benefit]) where appropriate for clarity.
4.  **User Experience (Optional):** Describe desired UX/UI feel if possible.
5.  **Technical Considerations (Optional):** Suggest potential tech stack elements relevant to the description and market standards.
6.  **Success Metrics (Optional):** Suggest potential KPIs, informed by industry standards.
7.  **Out-of-Scope Items (Optional):** Mention features likely excluded based on the description.
8.  **Market Positioning (Optional):** If research provides competitive landscape insights, include brief positioning information.

**Guidelines:**
*   Focus on interpreting the primary product description while enhancing it with research insights.
*   Generate content that is clear, detailed, and well-formatted using Markdown.
*   Do NOT assume access to external files or previous context beyond what's provided in the prompt.
*   Do NOT include instructions about using Perplexity or iterative research within your output.
*   The goal is to generate a high-quality PRD that benefits from both the description and research context.
`;

/**
 * Generate a PRD for a product based on a description
 */
export async function generatePRD(
  productDescription: string,
  config: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
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
    
    return {
      content: [
        {
          type: "text",
          text: formattedResult
        }
      ]
    };
  } catch (error) {
    logger.error({ err: error }, 'PRD Generator Error');
    return {
      content: [
        {
          type: "text",
          text: `Error generating PRD: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
