import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';

// Ensure directories exist
const USER_STORIES_DIR = path.join(process.cwd(), 'workflow-agent-files', 'user-stories-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(USER_STORIES_DIR);
}

// User stories generator-specific system prompt
const USER_STORIES_SYSTEM_PROMPT = `
# User Stories Generator

You are an AI assistant expert at generating comprehensive and well-structured user stories for software development projects.
Based on the provided product description and research context, generate detailed user stories.

## Using Research Context

* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* This research contains valuable insights on user personas, workflows, and expectations.
* Use these insights to inform your user stories while keeping the focus on the primary product requirements.
* Pay special attention to the "User Personas & Stakeholders" and "User Workflows & Use Cases" sections in the research.
* Incorporate identified pain points to create more relevant and valuable user stories.

## User Story Hierarchy

Generate user stories in a hierarchical structure:
- **Epics:** High-level descriptions of major functionalities
- **Main User Stories:** Core functionalities or user goals
- **Sub-User Stories:** More detailed tasks or scenarios

## User Story Template

| Field             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| User Story ID     | A unique identifier (e.g., US-100, US-100.1)         |
| Title             | A concise summary of the user story                  |
| As a              | The user role benefiting from this functionality (use personas from research)     |
| I want            | The user's goal or desire                            |
| So that           | The benefit the user receives                        |
| Acceptance Criteria | Specific, testable conditions for completion       |
| Priority          | High, Medium, or Low                                 |
| Dependencies      | Other user stories this depends on                   |
| Sample Implementation | A brief code example (when applicable)           |

## Guidelines

- Use the format: "As a [type of user], I want [an action] so that [a benefit]"
- Create user personas informed by the research context
- Ensure stories follow INVEST principles (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Include edge cases and error handling scenarios
- Focus on user benefits rather than implementation details
- Format your response as a well-structured markdown document with clear sections
- Do NOT assume access to external files or previous context beyond what's provided
- The goal is to generate high-quality user stories that incorporate both the product vision and research insights
`;

/**
 * Generate user stories based on a product description
 */
export async function generateUserStories(
  productDescription: string,
  config: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
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
    
    return {
      content: [
        {
          type: "text",
          text: formattedResult
        }
      ]
    };
  } catch (error) {
    logger.error({ err: error }, 'User Stories Generator Error');
    return {
      content: [
        {
          type: "text",
          text: `Error generating user stories: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
