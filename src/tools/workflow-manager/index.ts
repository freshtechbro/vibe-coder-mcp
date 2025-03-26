import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../../types/workflow.js';
import { processWithSequentialThinking } from '../sequential-thinking.js';

// Ensure directories exist
const WORKFLOW_DIR = path.join(process.cwd(), 'workflow-agent-files', 'workflow-manager');
const MEMORY_BANK_DIR = path.join(process.cwd(), 'memory-bank');

// Initialize directories if they don't exist
export async function initDirectories() {
  await fs.ensureDir(WORKFLOW_DIR);
  
  // Check if memory-bank directory exists, create it if not
  try {
    await fs.ensureDir(MEMORY_BANK_DIR);
    
    // Ensure core memory bank files exist
    const coreFiles = [
      'projectbrief.md',
      'productContext.md',
      'activeContext.md',
      'systemPatterns.md',
      'techContext.md',
      'progress.md'
    ];
    
    for (const file of coreFiles) {
      const filePath = path.join(MEMORY_BANK_DIR, file);
      if (!(await fs.pathExists(filePath))) {
        await fs.writeFile(filePath, `# ${file.replace('.md', '')}\n\n_This file was automatically created by the workflow manager and needs to be populated._\n`);
      }
    }
  } catch (error) {
    console.error('Error initializing memory-bank directory:', error);
  }

  // Initialize IDE rule directories if they don't exist
  try {
    const IDE_RULE_DIRS = [
      '.clinerules',
      '.cursorrules',
      '.windsurfrules'
    ];

    for (const dir of IDE_RULE_DIRS) {
      const dirPath = path.join(process.cwd(), dir);
      if (!(await fs.pathExists(dirPath))) {
        await fs.ensureDir(dirPath);
        await fs.writeFile(
          path.join(dirPath, 'workflow.md'),
          `# Workflow Rules\n\n## General Guidelines\n- Always read Memory Bank files before starting work\n- Update progress.md after each significant change\n- Follow the project architecture defined in systemPatterns.md\n\n_Created by the workflow manager_\n`
        );
      }
    }
  } catch (error) {
    console.error('Error initializing IDE rule directories:', error);
  }
}

// Workflow manager-specific system prompt
const WORKFLOW_SYSTEM_PROMPT = `
You are an expert workflow management assistant that tracks project progress and task status.
Your goal is to maintain accurate records of what's been completed and what remains to be done.

When managing workflow tasks:
1. Keep track of completed tasks and pending tasks
2. Update relevant memory bank files
3. Maintain project status information
4. Provide insights on the current state of the project
5. Suggest next steps based on the current state
6. Ensure all project documentation is kept up-to-date

Key responsibilities:
- Update activeContext.md with current focus and recent changes
- Update progress.md with completed and pending tasks
- Ensure project state is accurately reflected
- Provide clear status reports

Memory Bank Structure:
- projectbrief.md: Core project requirements
- productContext.md: Problem and solution context
- systemPatterns.md: System architecture and patterns
- techContext.md: Technical details and dependencies
- activeContext.md: Current focus and recent changes
- progress.md: What works and what's left to build
`;

interface WorkflowState {
  completedTasks: string[];
  pendingTasks: string[];
  lastUpdated: string;
  currentFocus?: string;
}

/**
 * Update workflow state based on task list and completed task
 */
export async function manageWorkflow(
  taskList: string,
  completedTask?: string,
  config?: OpenRouterConfig
): Promise<{ content: { type: "text"; text: string }[] }> {
  try {
    await initDirectories();
    
    // Load or initialize workflow state
    let state: WorkflowState = await loadWorkflowState();
    
    // Update state with completed task if provided
    if (completedTask) {
      if (!state.completedTasks.includes(completedTask)) {
        state.completedTasks.push(completedTask);
      }
      
      // Remove from pending if it was there
      state.pendingTasks = state.pendingTasks.filter(task => task !== completedTask);
    }
    
    // Parse task list and update pending tasks
    const extractedTasks = extractTasksFromMarkdown(taskList);
    
    // Update pending tasks with any new tasks that aren't completed
    for (const task of extractedTasks) {
      if (!state.completedTasks.includes(task) && !state.pendingTasks.includes(task)) {
        state.pendingTasks.push(task);
      }
    }
    
    // Update last updated timestamp
    state.lastUpdated = new Date().toISOString();
    
    // Save updated state
    await saveWorkflowState(state);
    
    // Generate workflow status report
    let statusReport = generateStatusReport(state);
    
    // If config is provided, use sequential thinking to enhance the report
    if (config) {
      try {
        const enhancedReport = await processWithSequentialThinking(
          `Generate a workflow status report based on this information:\n\n${statusReport}`, 
          config,
          WORKFLOW_SYSTEM_PROMPT
        );
        
        statusReport = enhancedReport;
      } catch (error) {
        console.error('Error enhancing status report:', error);
        // Continue with basic report if enhancement fails
      }
    }
    
    // Update memory bank files
    await updateMemoryBankFiles(state, statusReport);
    
    return {
      content: [
        {
          type: "text",
          text: statusReport
        }
      ]
    };
  } catch (error) {
    console.error('Workflow Manager Error:', error);
    return {
      content: [
        {
          type: "text",
          text: `Error managing workflow: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
}

/**
 * Extract task IDs from markdown task list
 */
function extractTasksFromMarkdown(markdown: string): string[] {
  const tasks: string[] = [];
  
  // Match task IDs in format T-XXX or similar
  const taskIdRegex = /([A-Z]-\d{3})/g;
  const matches = markdown.match(taskIdRegex);
  
  if (matches) {
    for (const match of matches) {
      if (!tasks.includes(match)) {
        tasks.push(match);
      }
    }
  }
  
  return tasks;
}

/**
 * Load workflow state from file
 */
async function loadWorkflowState(): Promise<WorkflowState> {
  const statePath = path.join(WORKFLOW_DIR, 'workflow-state.json');
  
  try {
    if (await fs.pathExists(statePath)) {
      const stateJson = await fs.readFile(statePath, 'utf8');
      return JSON.parse(stateJson);
    }
  } catch (error) {
    console.error('Error loading workflow state:', error);
  }
  
  // Return default state if file doesn't exist or has issues
  return {
    completedTasks: [],
    pendingTasks: [],
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Save workflow state to file
 */
async function saveWorkflowState(state: WorkflowState): Promise<void> {
  const statePath = path.join(WORKFLOW_DIR, 'workflow-state.json');
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Generate a readable status report from workflow state
 */
function generateStatusReport(state: WorkflowState): string {
  const completedCount = state.completedTasks.length;
  const pendingCount = state.pendingTasks.length;
  const totalCount = completedCount + pendingCount;
  const percentComplete = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  let report = `# Project Status Report\n\n`;
  report += `## Overview\n`;
  report += `- **Last Updated**: ${new Date(state.lastUpdated).toLocaleString()}\n`;
  report += `- **Progress**: ${completedCount}/${totalCount} tasks completed (${percentComplete}%)\n`;
  
  if (state.currentFocus) {
    report += `- **Current Focus**: ${state.currentFocus}\n`;
  }
  
  report += `\n## Completed Tasks\n`;
  if (state.completedTasks.length > 0) {
    for (const task of state.completedTasks) {
      report += `- ${task}\n`;
    }
  } else {
    report += `- No tasks completed yet\n`;
  }
  
  report += `\n## Pending Tasks\n`;
  if (state.pendingTasks.length > 0) {
    for (const task of state.pendingTasks) {
      report += `- ${task}\n`;
    }
  } else {
    report += `- No pending tasks\n`;
  }
  
  return report;
}

/**
 * Update memory bank files with current workflow state
 */
async function updateMemoryBankFiles(state: WorkflowState, statusReport: string): Promise<void> {
  try {
    // Update progress.md
    const progressPath = path.join(MEMORY_BANK_DIR, 'progress.md');
    let progressContent = `# Project Progress\n\n`;
    progressContent += `## Current Status\n`;
    progressContent += `- **Last Updated**: ${new Date(state.lastUpdated).toLocaleString()}\n`;
    progressContent += `- **Completed Tasks**: ${state.completedTasks.length}\n`;
    progressContent += `- **Pending Tasks**: ${state.pendingTasks.length}\n\n`;
    
    progressContent += `## What Works\n`;
    if (state.completedTasks.length > 0) {
      for (const task of state.completedTasks) {
        progressContent += `- ${task}\n`;
      }
    } else {
      progressContent += `- No tasks completed yet\n`;
    }
    
    progressContent += `\n## What's Left To Build\n`;
    if (state.pendingTasks.length > 0) {
      for (const task of state.pendingTasks) {
        progressContent += `- ${task}\n`;
      }
    } else {
      progressContent += `- No pending tasks\n`;
    }
    
    await fs.writeFile(progressPath, progressContent, 'utf8');
    
    // Update activeContext.md
    const activeContextPath = path.join(MEMORY_BANK_DIR, 'activeContext.md');
    let activeContextContent = `# Active Context\n\n`;
    activeContextContent += `## Current Focus\n`;
    
    if (state.currentFocus) {
      activeContextContent += state.currentFocus + '\n\n';
    } else if (state.pendingTasks.length > 0) {
      activeContextContent += `Current focus should be on completing the next pending tasks:\n`;
      const nextTasks = state.pendingTasks.slice(0, 3);
      for (const task of nextTasks) {
        activeContextContent += `- ${task}\n`;
      }
      activeContextContent += '\n';
    } else {
      activeContextContent += `- No specific focus set\n\n`;
    }
    
    activeContextContent += `## Recent Changes\n`;
    if (state.completedTasks.length > 0) {
      const recentTasks = state.completedTasks.slice(-5);
      for (const task of recentTasks) {
        activeContextContent += `- Completed ${task}\n`;
      }
    } else {
      activeContextContent += `- No recent changes\n`;
    }
    
    activeContextContent += `\n## Next Steps\n`;
    if (state.pendingTasks.length > 0) {
      const nextTasks = state.pendingTasks.slice(0, 5);
      for (const task of nextTasks) {
        activeContextContent += `- Complete ${task}\n`;
      }
    } else {
      activeContextContent += `- No pending tasks\n`;
    }
    
    await fs.writeFile(activeContextPath, activeContextContent, 'utf8');
    
    // Save status report separately
    const statusPath = path.join(WORKFLOW_DIR, 'latest-status-report.md');
    await fs.writeFile(statusPath, statusReport, 'utf8');
    
  } catch (error) {
    console.error('Error updating memory bank files:', error);
  }
}
