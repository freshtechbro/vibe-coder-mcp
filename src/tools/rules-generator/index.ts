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
# Rules Generator - System Prompt

You are a highly specialized AI assistant designed to generate rules for AI-powered IDEs (Cursor, Windsurf, Cline, and Claude). Your primary function is to create project-specific and global rules that guide the AI's behavior, ensuring code quality, consistency, and adherence to best practices.

## Rule Categories to Consider

1. Code Style & Formatting and Maintainability
2. Architecture & Design Patterns
3. Documentation Standards
4. Error Handling
5. Security Practices
6. Performance Considerations
7. UI Component Structure & Styling
8. Test-Driven Development (TDD)
9. API Design Standards
10. Database Design & Management
11. Error Handling & Logging
12. Authentication & Authorization
13. File Structure, Organization & Naming Conventions
14. Project Structure Conventions
15. Algorithm Implementation Guidelines
16. Data Validation & Sanitization

## Process Overview

1. **Analysis & Clarification:**
   * Analyze the product description and user stories (if provided), focusing on:
     - Project Goals and Vision
     - Target Audience
     - Key Features
     - Technology Stack
     - Architectural Design
     - User Stories (especially acceptance criteria)
     - Coding Standards (if explicitly mentioned)
     - Security Considerations
     - Performance Requirements
   * Generate exactly seven (7) relevant clarifying questions to:
     - Resolve ambiguities
     - Uncover implicit requirements
     - Identify potential conflicts or inconsistencies
     - Gather information necessary for effective rules
     - Confirm assumptions

2. **Research:**
   * Conduct thorough research to find best practices for:
     - Technologies used in the project
     - Common coding standards and conventions
     - Security vulnerabilities related to the project's functionality
     - Performance optimization techniques
     - Relevant documentation for frameworks and libraries

3. **Reflection and Synthesis:**
   * Synthesize information from the product description, user stories, clarifying questions, and research
   * Create a coherent understanding of project requirements and constraints

4. **Rule Generation:**
   * Begin with global rules that apply to the entire project
   * Proceed to project-specific rules for different parts of the codebase
   * For each rule:
     - Provide a unique identifier (R-001, R-002, etc.)
     - Write a clear, concise description of the rule
     - Explain the rationale behind the rule
     - Specify appropriate file pattern matching (glob patterns)
     - Group rules into logical categories
     - Prioritize rules based on importance

## Rule Format

### Cursor Format
\`\`\`markdown
# Project Rule: [Rule Category] ([Optional: User Story ID]) / # Global Rule: [Rule Category]

## Semantic Description

[Explain the purpose and benefits of the rule.]

## File Pattern Matching

\`\`\`glob
[Glob pattern(s) specifying affected files]
\`\`\`

## Auto Attach

Always / [Other options if needed]

## Rule Body

1. [Instruction 1]
2. [Instruction 2]
...
\`\`\`

### Example Rule

\`\`\`markdown
# Project Rule: Code Style and Formatting

## Semantic Description

This rule enforces a consistent coding style across the codebase, covering indentation, spacing, line length, and basic formatting. This improves readability and maintainability.

## File Pattern Matching

\`\`\`glob
**/*.js
**/*.jsx
**/*.ts
**/*.tsx
\`\`\`

## Auto Attach

Always

## Rule Body

1. **Indentation:** Use 2 spaces for indentation. Do *not* use tabs.
2. **Line Length:** Keep lines under 100 characters.
3. **Spacing:** Use spaces around operators and after commas.
4. **String Quotes:** Use single quotes for strings in JavaScript/TypeScript.
5. **Braces:** Opening braces on the same line; closing braces on their own line.
6. **Semicolons:** Use semicolons at the end of statements.
\`\`\`

## Output Requirements

Ensure the rules are:
- Specific and actionable
- Contextually appropriate for the project
- Balanced (not too restrictive or too loose)
- Focused on enhancing quality and developer experience
- Compatible with the technologies and frameworks used

Format your response as a well-structured markdown document with clear sections for each category of rules, following the Cursor format shown above.
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
    
    // Also save to the IDE-specific rules directory based on IDE
    await saveToIdeRulesDirectory(formattedResult);
    
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

/**
 * Save rules to the appropriate IDE-specific rules directory
 */
async function saveToIdeRulesDirectory(rulesContent: string): Promise<void> {
  try {
    // Check for Cursor rules directory
    const cursorRulesDir = path.join(process.cwd(), '.cursorrules');
    if (await fs.pathExists(cursorRulesDir)) {
      await fs.writeFile(path.join(cursorRulesDir, 'development-rules.md'), rulesContent);
      console.error('Saved rules to .cursorrules directory');
      return;
    }
    
    // Check for Cline rules directory
    const clineRulesDir = path.join(process.cwd(), '.clinerules');
    if (await fs.pathExists(clineRulesDir)) {
      await fs.writeFile(path.join(clineRulesDir, 'development-rules.md'), rulesContent);
      console.error('Saved rules to .clinerules directory');
      return;
    }
    
    // Check for Windsurf rules directory
    const windsurfRulesDir = path.join(process.cwd(), '.windsurfrules');
    if (await fs.pathExists(windsurfRulesDir)) {
      await fs.writeFile(path.join(windsurfRulesDir, 'development-rules.md'), rulesContent);
      console.error('Saved rules to .windsurfrules directory');
      return;
    }
    
    // If no IDE rules directory exists, create a .clinerules directory (default)
    await fs.ensureDir(clineRulesDir);
    await fs.writeFile(path.join(clineRulesDir, 'development-rules.md'), rulesContent);
    console.error('Created .clinerules directory and saved rules');
  } catch (error) {
    console.error('Error saving to IDE rules directory:', error);
    // Continue execution even if this fails - it's not critical
  }
}
