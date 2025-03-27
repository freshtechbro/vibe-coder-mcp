import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

// Ensure directories exist
const TASK_LIST_DIR = path.join(process.cwd(), 'workflow-agent-files', 'task-list-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(TASK_LIST_DIR);
}

// Task list generator-specific system prompt
const TASK_LIST_SYSTEM_PROMPT = `
# Task List Generator

You are an AI assistant expert at generating development task lists for software projects.
Based SOLELY on the provided product description and user stories, generate a detailed task list.

## Task Hierarchy

Generate tasks in a hierarchical structure:
- **Epics/Phases:** High-level project phases or major components
- **Main Tasks:** Core tasks needed to complete each phase
- **Sub-Tasks:** More specific work items for each main task

## Task Template

Each task should include:
- **Task ID**: A unique identifier (T-001, T-002, etc.)
- **Task Title**: Clear, action-oriented title starting with a verb
- **Description**: Explanation of what needs to be done
- **Associated User Story ID**: Reference to relevant user story (if applicable)
- **Priority**: High, Medium, or Low
- **Dependencies**: List of Task IDs that must be completed before this task
- **Estimated Effort**: Relative size (Small, Medium, Large)
- **Implementation Notes**: Technical guidance (for key tasks)

## Guidelines

- Break down work into atomic, measurable tasks
- Use clear, actionable task descriptions (start with verbs)
- Establish logical task dependencies
- Cover the complete development lifecycle
- Consider both technical and non-technical tasks
- Make task descriptions specific enough to be estimable
- Organize tasks into logical groups or phases
- Format your response as a well-structured markdown document
- Do NOT assume access to external files or previous context
- The goal is to generate a high-quality task list in one pass
`;

/**
 * Generate a task list based on product description and user stories
 */
export async function generateTaskList(
  productDescription: string,
  userStories: string,
  config: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    await initDirectories();
    
    // Generate a filename for storing the task list
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${timestamp}-${sanitizedName}-task-list.md`;
    const filePath = path.join(TASK_LIST_DIR, filename);
    
    // Process the task list generation with sequential thinking
    console.error(`Generating task list for: ${productDescription.substring(0, 50)}...`);
    
    // Create the full prompt
    const prompt = `Create a detailed task list for the following product:\n\n${productDescription}\n\nBased on these user stories:\n\n${userStories}`;
    
    const taskListResult = await processWithSequentialThinking(
      prompt, 
      config,
      TASK_LIST_SYSTEM_PROMPT
    );
    
    // Format the task list with a title header
    const formattedResult = `# Task List: ${productDescription.substring(0, 50)}...\n\n${taskListResult}\n\n_Generated: ${new Date().toLocaleString()}_`;
    
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
    console.error('Task List Generator Error:', error);
    return {
      content: [
        {
          type: "text",
          text: `Error generating task list: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}
