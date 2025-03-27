import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { OpenRouterConfig, RulesGeneratorResult } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

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
Based SOLELY on the provided product description and user stories (if any), generate a set of development rules.

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

- Focus on interpreting the input data accurately
- Generate rules that are clear, specific, and actionable
- Format using Markdown for readability
- Do NOT assume access to external files or previous context
- The goal is to generate high-quality development rules in one pass
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
    
    // Create the prompt based on available information
    let prompt = `Create a comprehensive set of development rules for the following product:\n\n${productDescription}`;
    
    if (userStories) {
      prompt += `\n\nBased on these user stories:\n\n${userStories}`;
    }
    
    if (ruleCategories && ruleCategories.length > 0) {
      prompt += `\n\nFocus on these rule categories:\n${ruleCategories.map(c => `- ${c}`).join('\n')}`;
    }
    
    // Process the rules generation with sequential thinking
    console.error(`Generating rules for: ${productDescription.substring(0, 50)}...`);
    
    if (!config) {
      throw new Error("OpenRouter configuration is required");
    }
    
    const rulesResult = await processWithSequentialThinking(
      prompt, 
      config,
      RULES_SYSTEM_PROMPT
    );
    
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
    console.error('Rules Generator Error:', error);
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
