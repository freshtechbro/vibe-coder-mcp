import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Define the RequestHandlerExtra type locally since it's not exported
interface RequestHandlerExtra {
  signal: AbortSignal;
  sessionId?: string;
}

interface TaskManagerConfig {
  workflowDirectory: string;
}

interface TaskManagerToolRequest {
  toolName: string;
  toolDescription: string;
  toolArguments?: Record<string, any>;
}

// Type for handling strongly-typed arguments
interface RulesGeneratorArgs {
  inputText: string;
  nextTask: string;
  requiredResources: string[];
  reviewers: string[];
}

interface PrdGeneratorArgs {
  projectName: string;
  projectDescription: string;
  objectives: string[];
  scope: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
}

interface UserStoriesGeneratorArgs {
  projectName: string;
  userRole: string;
  userNeed: string;
  businessValue: string;
}

interface TaskListGeneratorArgs {
  projectName: string;
  taskDescription: string;
  priority: string;
}

interface WorkflowManagerArgs {
  workflowName: string;
  steps: string[];
  dependencies: string[];
  reviewers: string[];
}

class TaskManagerTool {
  private server: Server;
  private workflowDirectory: string;

  constructor(server: Server, config: TaskManagerConfig) {
    this.server = server;
    this.workflowDirectory = config.workflowDirectory;

    // Register tools
    this.registerTools();
  }

  private registerTools() {
    // We'll use a single handler for all tools to avoid duplication
    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      switch (request.params.name) {
        case 'rules-generator':
          return this.handleRulesGenerator(request, extra);
        case 'prd-generator':
          return this.handlePrdGenerator(request, extra);
        case 'user-stories-generator':
          return this.handleUserStoriesGenerator(request, extra);
        case 'task-list-generator':
          return this.handleTaskListGenerator(request, extra);
        case 'workflow-manager':
          return this.handleWorkflowManager(request, extra);
        default:
          // Return empty result for unknown tools
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown tool: ${request.params.name}`
              }
            ],
            isError: true
          };
      }
    });
  }

  private async handleRulesGenerator(
    request: typeof CallToolRequestSchema._type,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    const args = request.params.arguments as unknown as RulesGeneratorArgs;
    
    // Validate input
    if (!args?.inputText) {
      return {
        content: [
          {
            type: "text" as const,
            text: 'Missing required inputText argument'
          }
        ],
        isError: true
      };
    }

    // Basic rules generation logic
    const rules = [
      `Rule 1: ${args.inputText} must be completed before ${args.nextTask}`,
      `Rule 2: ${args.inputText} requires ${args.requiredResources.join(', ')}`,
      `Rule 3: ${args.inputText} must be reviewed by ${args.reviewers.join(', ')}`,
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: rules.join('\n')
        }
      ]
    };
  }

  private async handlePrdGenerator(
    request: typeof CallToolRequestSchema._type,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    const args = request.params.arguments as unknown as PrdGeneratorArgs;
    
    // Validate input
    if (!args?.projectName) {
      return {
        content: [
          {
            type: "text" as const,
            text: 'Missing required projectName argument'
          }
        ],
        isError: true
      };
    }

    // Basic PRD generation logic
    const prd = `# ${args.projectName} PRD Document

## Overview
${args.projectDescription}

## Objectives
${args.objectives.join('\n')}

## Scope
${args.scope.join('\n')}

## Dependencies
${args.dependencies.join('\n')}

## Acceptance Criteria
${args.acceptanceCriteria.join('\n')}`;

    return {
      content: [
        {
          type: "text" as const,
          text: prd
        }
      ]
    };
  }

  private async handleUserStoriesGenerator(
    request: typeof CallToolRequestSchema._type,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    const args = request.params.arguments as unknown as UserStoriesGeneratorArgs;
    
    // Validate input
    if (!args?.projectName) {
      return {
        content: [
          {
            type: "text" as const,
            text: 'Missing required projectName argument'
          }
        ],
        isError: true
      };
    }

    // Basic user stories generation logic
    const userStories = [
      `As a ${args.userRole}, I want ${args.userNeed} so that ${args.businessValue}`,
      `As a ${args.userRole}, I want ${args.userNeed} so that ${args.businessValue}`,
      `As a ${args.userRole}, I want ${args.userNeed} so that ${args.businessValue}`,
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: userStories.join('\n')
        }
      ]
    };
  }

  private async handleTaskListGenerator(
    request: typeof CallToolRequestSchema._type,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    const args = request.params.arguments as unknown as TaskListGeneratorArgs;
    
    // Validate input
    if (!args?.projectName) {
      return {
        content: [
          {
            type: "text" as const,
            text: 'Missing required projectName argument'
          }
        ],
        isError: true
      };
    }

    // Basic task list generation logic
    const tasks = [
      `Task 1: ${args.taskDescription} (Priority: ${args.priority})`,
      `Task 2: ${args.taskDescription} (Priority: ${args.priority})`,
      `Task 3: ${args.taskDescription} (Priority: ${args.priority})`,
    ];

    return {
      content: [
        {
          type: "text" as const,
          text: tasks.join('\n')
        }
      ]
    };
  }

  private async handleWorkflowManager(
    request: typeof CallToolRequestSchema._type,
    extra: RequestHandlerExtra
  ): Promise<CallToolResult> {
    const args = request.params.arguments as unknown as WorkflowManagerArgs;
    
    // Validate input
    if (!args?.workflowName) {
      return {
        content: [
          {
            type: "text" as const,
            text: 'Missing required workflowName argument'
          }
        ],
        isError: true
      };
    }

    // Basic workflow management logic
    const workflow = `# ${args.workflowName} Workflow

## Steps
${args.steps.join('\n')}

## Dependencies
${args.dependencies.join('\n')}

## Reviewers
${args.reviewers.join('\n')}`;

    return {
      content: [
        {
          type: "text" as const,
          text: workflow
        }
      ]
    };
  }
}

export { TaskManagerTool };
