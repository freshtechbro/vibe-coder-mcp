import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig, RulesGeneratorResult } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';

// Ensure directories exist
const RULES_DIR = path.join(process.cwd(), 'workflow-agent-files', 'rules-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(RULES_DIR);
}

// Rules generator-specific system prompt
const RULES_SYSTEM_PROMPT = `
# ROLE & GOAL
You are an expert Software Architect and Lead Developer AI assistant. Your goal is to generate a clear, actionable, and comprehensive set of development rules (guidelines and standards) in Markdown format for a specific software project.

# CORE TASK
Generate a detailed set of development rules based on the user's product description, optional user stories, optional specified rule categories, and the provided research context.

# INPUT HANDLING
- Analyze the 'productDescription' to understand the project type, potential tech stack (if implied), and complexity.
- Consider the optional 'userStories' to infer requirements that might influence rules (e.g., performance needs for specific features).
- If 'ruleCategories' are provided, prioritize generating rules within those categories. If not, cover a broad range of standard categories.
- You will also receive 'Pre-Generation Research Context'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL:** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section provided in the user prompt.
- This section contains insights on: Best Practices & Coding Standards, Rule Categories, and Architecture Patterns & File Organization.
- **Use these insights** to:
    - Select relevant rule categories if not specified by the user.
    - Define rules that align with modern best practices for the identified product type/tech stack.
    - Suggest appropriate architecture and file structure conventions based on the research.
    - Provide strong rationale for rules, referencing industry standards where applicable.
- **Synthesize**, don't just copy. Tailor the research findings to the specific project context.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Development Rules: [Inferred Project Name/Type]'
- Organize rules under relevant category headings (e.g., \`## Category: Code Style & Formatting\`). Use the rule categories identified from input or research. Standard categories include:
    - Code Style & Formatting
    - Naming Conventions
    - Architecture & Design Patterns
    - File & Project Structure
    - State Management (if applicable)
    - API Design (if applicable)
    - Error Handling & Logging
    - Security Practices
    - Performance Optimization
    - Testing Standards
    - Documentation Standards
    - Dependency Management
    - Version Control (Git Flow)
- For **each rule**, use the following precise template:

  ### Rule: [Clear Rule Title Starting with a Verb, e.g., Use PascalCase for Components]
  
  **Description:** [Concise explanation of what the rule entails.]
  
  **Rationale:** [Why this rule is important for this specific project. Reference research/best practices.]
  
  **Applicability:** [Glob patterns or description of where this rule applies (e.g., \`src/components/**/*.tsx\`, "All API endpoint handlers").]
  
  **Guidelines / Examples:**
  \`\`\`[language, e.g., javascript, typescript, css, python]
  // Good Example:
  [Code snippet illustrating the correct way]

  // Bad Example:
  [Code snippet illustrating the incorrect way]
  \`\`\`
  *(Or provide bulleted guidelines if code examples are not suitable)*

# QUALITY ATTRIBUTES
- **Actionable:** Rules should be concrete and easy to follow.
- **Specific:** Avoid vague statements.
- **Relevant:** Tailored to the project described and informed by research.
- **Comprehensive:** Cover key areas of development.
- **Justified:** Provide clear rationale for each rule.
- **Consistent:** Maintain a uniform format for all rules.
- **Modern:** Reflect current best practices from the research.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Filler:** Start directly with the '# Development Rules: ...' title. No greetings, summaries, or apologies.
- **NO Markdown Violations:** Strictly adhere to the specified Markdown format, especially the rule template.
- **NO External Knowledge:** Base rules *only* on the provided inputs and research context.
- **NO Process Commentary:** Do not mention Perplexity, Gemini, or the generation process in the output.
- **Strict Formatting:** Use \`##\` for categories and \`###\` for individual rule titles. Use the exact field names (Description, Rationale, etc.) in bold. Use code blocks with language hints for examples.
`;

/**
 * Generate development rules based on a product description
 */
export async function generateRules(
  productDescription: string,
  userStories?: string,
  ruleCategories?: string[],
  config?: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    await initDirectories();
    
    // Generate a filename for storing the rules
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-rules.md`;
    const filePath = path.join(RULES_DIR, filename);
    
    // Validate config
    if (!config) {
      throw new Error("OpenRouter configuration is required");
    }
    
    // Perform pre-generation research using Perplexity
    logger.info({ inputs: { productDescription: productDescription.substring(0, 50), userStories: userStories?.substring(0, 50), ruleCategories } }, "Rules Generator: Starting pre-generation research...");
    
    let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Best development practices and coding standards for building: ${productDescription}`;
      
      const query2 = ruleCategories && ruleCategories.length > 0 
        ? `Specific rules and guidelines for these categories in software development: ${ruleCategories.join(', ')}`
        : `Common software development rule categories for: ${productDescription}`;
      
      // Extract product type for the third query
      const productTypeLowercase = productDescription.toLowerCase();
      let productType = "software application";
      if (productTypeLowercase.includes("web") || productTypeLowercase.includes("website")) {
        productType = "web application";
      } else if (productTypeLowercase.includes("mobile") || productTypeLowercase.includes("app")) {
        productType = "mobile application";
      } else if (productTypeLowercase.includes("api")) {
        productType = "API service";
      } else if (productTypeLowercase.includes("game")) {
        productType = "game";
      }
      
      const query3 = `Modern architecture patterns and file organization for ${productType} development`;
      
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
        const queryLabels = ["Best Practices", "Rule Categories", "Architecture Patterns"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });
      
      logger.info("Rules Generator: Pre-generation research completed.");
    } catch (researchError) {
      logger.error({ err: researchError }, "Rules Generator: Error during research aggregation");
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
    }
    
    // Create the main generation prompt with combined research and inputs
    let mainGenerationPrompt = `Create a comprehensive set of development rules for the following product:\n\n${productDescription}`;
    
    if (userStories) {
      mainGenerationPrompt += `\n\nBased on these user stories:\n\n${userStories}`;
    }
    
    if (ruleCategories && ruleCategories.length > 0) {
      mainGenerationPrompt += `\n\nFocus on these rule categories:\n${ruleCategories.map(c => `- ${c}`).join('\n')}`;
    }
    
    // Add research context to the prompt
    mainGenerationPrompt += `\n\n${researchContext}`;
    
    // Process the rules generation with sequential thinking using Gemini
    logger.info("Rules Generator: Starting main generation using Gemini...");
    
    const rulesResult = await processWithSequentialThinking(
      mainGenerationPrompt, 
      config, // Contains config.geminiModel which processWithSequentialThinking uses
      RULES_SYSTEM_PROMPT
    );
    
    logger.info("Rules Generator: Main generation completed.");
    
    // Format the rules with a title header
    const ruleset = productDescription.substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '');
    const formattedResult = `# Development Rules: ${ruleset}\n\n${rulesResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
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
    logger.error({ err: error }, 'Rules Generator Error');
    return {
      content: [
        {
          type: "text",
          text: `Error generating rules: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
