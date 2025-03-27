import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

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
Based SOLELY on the provided product description, generate detailed user stories.

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
| As a              | The user role benefiting from this functionality     |
| I want            | The user's goal or desire                            |
| So that           | The benefit the user receives                        |
| Acceptance Criteria | Specific, testable conditions for completion       |
| Priority          | High, Medium, or Low                                 |
| Dependencies      | Other user stories this depends on                   |
| Sample Implementation | A brief code example (when applicable)           |

## Guidelines

- Use the format: "As a [type of user], I want [an action] so that [a benefit]"
- Ensure stories follow INVEST principles (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Consider different user personas and their specific needs
- Include edge cases and error handling scenarios
- Focus on user benefits rather than implementation details
- Format your response as a well-structured markdown document with clear sections
- Do NOT assume access to external files or previous context
- The goal is to generate high-quality user stories in one pass
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
    
    // Process the user stories generation with sequential thinking
    console.error(`Generating user stories for: ${productDescription.substring(0, 50)}...`);
    
    const userStoriesResult = await processWithSequentialThinking(
      `Create comprehensive user stories for the following product:\n\n${productDescription}`, 
      config,
      USER_STORIES_SYSTEM_PROMPT
    );
    
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
    console.error('User Stories Generator Error:', error);
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
