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
# Rules Generator

You are an AI assistant expert at generating development rules for software projects.
Based on the provided product description, user stories (if any), and research context, generate a set of development rules.

## Using Research Context

* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* This research contains valuable insights on best practices, common rule categories, and architecture patterns.
* Use these insights to inform your rules while keeping the focus on the primary product requirements.
* Incorporate industry standards and modern development practices from the research.

## Rule Categories to Consider

1. Code Style & Formatting and Maintainability
2. Architecture & Design Patterns
3. Documentation Standards
4. Error Handling
5. Security Practices
6. Performance Considerations
7. UI Component Structure & Styling
8. File Structure, Organization & Naming Conventions
9. Project Structure Conventions

## Rule Format

\`\`\`markdown
# Rule: [Rule Name]

## Description

[Clear description of the rule]

## Rationale

[Why this rule is important]

## Applicable Files

\`\`\`glob
[File patterns this rule applies to]
\`\`\`

## Guidelines

1. [Specific guideline 1]
2. [Specific guideline 2]
...
\`\`\`

## Guidelines

- Focus on interpreting both the product requirements and research context accurately
- Generate rules that are clear, specific, and actionable
- Prioritize rules that align with both project requirements and industry best practices
- Format using Markdown for readability
- Do NOT assume access to external files or previous context beyond what's provided
- The goal is to generate high-quality development rules that incorporate both project-specific needs and industry standards
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
