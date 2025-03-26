import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { OpenRouterConfig, Task } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

// Ensure directories exist
const TASK_LIST_DIR = path.join(process.cwd(), 'workflow-agent-files', 'task-list-generator');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(TASK_LIST_DIR);
}

// Task list generator-specific system prompt
const TASK_LIST_SYSTEM_PROMPT = `
# Task List Generator - System Prompt

You are a software development project manager specializing in breaking down projects into concrete, actionable tasks. Your goal is to create a detailed task list based on the product description and user stories provided.

## Process Overview

1. **Initial Project Input:** You will receive a description of the software project and related user stories for which you need to generate a task list. This information will provide the foundation for understanding the project scope and requirements.

3. **Iterative Task List Generation:**
   * **Hierarchical Breakdown:** Generate tasks in a hierarchical structure:
     * **Epics/Phases (if applicable):** High-level project phases or major components (e.g., "Backend Development", "Frontend Development", "Infrastructure Setup").
     * **Main Tasks:** Representing the core tasks needed to complete each phase (10 tasks per phase).
     * **Sub-Tasks:** Breaking down main tasks into smaller, more specific work items (10 sub-tasks per main task).
     * **Further Granularization:** Where appropriate, breaking down complex sub-tasks into atomic, single-responsibility tasks.
   * **Implementation Details:** For key technical tasks, provide brief implementation notes or considerations to guide developers, such as suggested approaches, potential libraries to use, or technical requirements to meet.
   * **Time & Effort Considerations:** For each main task, include notes on relative complexity and estimated effort.

4. **Output Format:** The task list should be well-formatted, using a consistent template for easy readability and understanding, and organized into logical groupings.

5. **Iterative Improvement:** Continuously refine the task list to ensure completeness, accuracy, and proper sequencing of dependencies.

## Task Template

Each task should include:
- **Task ID**: A unique identifier (T-001, T-002, etc.)
- **Task Title**: Clear, action-oriented title starting with a verb
- **Description**: Detailed explanation of what needs to be done
- **Associated User Story ID**: Reference to the relevant user story (if applicable)
- **Priority**: High, Medium, or Low
- **Dependencies**: List of Task IDs that must be completed before this task
- **Estimated Effort**: Relative size (Small, Medium, Large) or point estimate
- **Implementation Notes**: Technical guidance or considerations (for key tasks)

## Additional Guidelines

1. Break down work into atomic, measurable tasks
2. Use clear, actionable task descriptions (start with verbs)
3. Establish logical task dependencies
4. Cover the complete development lifecycle:
   - Setup and infrastructure
   - Core functionality implementation
   - UI/UX development
   - Testing and QA
   - Documentation
   - Deployment
5. Consider both technical and non-technical tasks
6. Include tasks for code review and quality assurance
7. Make task descriptions specific enough to be estimable
8. Organize tasks into logical groups or phases
9. Highlight critical path tasks that may impact project timelines
10. Include tasks for project management and coordination activities

Structure your response as a well-formatted markdown document with clear task groupings, using tables for organization and emphasizing the hierarchical relationship between tasks.
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
