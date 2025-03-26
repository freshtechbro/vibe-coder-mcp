/**
 * Configuration options for using OpenRouter API
 */
export interface OpenRouterConfig {
  baseUrl: string;
  apiKey: string;
  geminiModel: string;
  perplexityModel: string;
}

/**
 * Interface for tasks in the task list
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'In Progress' | 'Completed';
  dependencies?: string[];
  assignedTo?: string;
  userStoryId?: string;
}

/**
 * Message object for LLM requests
 */
export interface Message {
  role: string;
  content: string;
}

/**
 * Request format for LLM API calls
 */
export interface LLMRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
}

/**
 * Response format from LLM API calls
 */
export interface LLMResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  model: string;
}

/**
 * Result type for the PRD Generator tool
 */
export interface PrdGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the User Stories Generator tool
 */
export interface UserStoriesGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Task List Generator tool
 */
export interface TaskListGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Research Manager tool
 */
export interface ResearchManagerResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Rules Generator tool
 */
export interface RulesGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Workflow Manager tool
 */
export interface WorkflowManagerResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Standard response format for all tools
 */
export interface ToolResponse {
  content: {
    type: "text";
    text: string;
  }[];
  isError?: boolean;
}
