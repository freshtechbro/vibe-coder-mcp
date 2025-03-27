import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';

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
Based on the provided product description, user stories, and research context, generate a detailed task list.

## Using Research Context

* Carefully consider the **Pre-Generation Research Context** (provided by Perplexity) included in the main task prompt.
* This research contains valuable insights on development lifecycle, task estimation, and team structure.
* Use these insights to inform your task list while keeping the focus on the primary product requirements.
* Pay special attention to the "Development Lifecycle & Milestones" and "Task Estimation & Dependencies" sections in the research.
* Follow industry standards for task breakdown and estimation as identified in the research.

## Task Hierarchy

Generate tasks in a hierarchical structure:
- **Epics/Phases:** High-level project phases or major components (informed by research on development lifecycle)
- **Main Tasks:** Up to 10 Core tasks needed to complete each phase
- **Sub-Tasks:** Up to 10 More specific work items for each main task

## Task Template

Each task should include:
- **Task ID**: A unique identifier (T-001, T-002, etc.)
- **Task Title**: Clear, action-oriented title starting with a verb
- **Description**: Explanation of what needs to be done
- **Associated User Story ID**: Reference to relevant user story (if applicable)
- **Priority**: High, Medium, or Low
- **Dependencies**: List of Task IDs that must be completed before this task
- **Estimated Effort**: Relative size (Small, Medium, Large) based on industry standards from research
- **Implementation Notes**: Technical guidance (for key tasks)

## Guidelines

- Break down work into atomic, measurable tasks using industry standards from research
- Use clear, actionable task descriptions (start with verbs)
- Establish logical task dependencies based on research insights
- Cover the complete development lifecycle as outlined in the research
- Consider both technical and non-technical tasks
- Make task descriptions specific enough to be estimable
- Organize tasks into logical groups or phases
- Format your response as a well-structured markdown document
- Do NOT assume access to external files or previous context beyond what's provided
- The goal is to generate a high-quality task list that incorporates both project requirements and industry best practices
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
    
    // Perform pre-generation research using Perplexity
    logger.info({ inputs: { productDescription: productDescription.substring(0, 50), userStories: userStories.substring(0, 50) } }, "Task List Generator: Starting pre-generation research...");
    
    let researchContext = '';
    try {
      // Define relevant research queries
      const query1 = `Software development lifecycle tasks and milestones for: ${productDescription}`;
      const query2 = `Task estimation and dependency management best practices for software projects`;
      const query3 = `Development team structures and work breakdown for projects similar to: ${productDescription}`;
      
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
        const queryLabels = ["Development Lifecycle & Milestones", "Task Estimation & Dependencies", "Team Structure & Work Breakdown"];
        if (result.status === "fulfilled") {
          researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
        } else {
          logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
          researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
        }
      });
      
      logger.info("Task List Generator: Pre-generation research completed.");
    } catch (researchError) {
      logger.error({ err: researchError }, "Task List Generator: Error during research aggregation");
      researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
    }
    
    // Create the main generation prompt with combined research and inputs
    const mainGenerationPrompt = `Create a detailed task list for the following product:\n\n${productDescription}\n\nBased on these user stories:\n\n${userStories}\n\n${researchContext}`;
    
    // Process the task list generation with sequential thinking using Gemini
    logger.info("Task List Generator: Starting main generation using Gemini...");
    
    const taskListResult = await processWithSequentialThinking(
      mainGenerationPrompt, 
      config, // Contains config.geminiModel which processWithSequentialThinking uses
      TASK_LIST_SYSTEM_PROMPT
    );
    
    logger.info("Task List Generator: Main generation completed.");
    
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
    logger.error({ err: error }, 'Task List Generator Error');
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
