/**
 * Types for tool configuration and matching
 */

/**
 * Structure of a tool in the mcp-config.json file
 */
export interface ToolConfig {
  description: string;
  use_cases: string[];
  input_patterns: string[];
}

/**
 * Structure of the entire mcp-config.json file
 */
export interface ToolsConfig {
  tools: {
    [toolName: string]: ToolConfig;
  }
}

/**
 * Result from the matching service
 */
export interface MatchResult {
  toolName: string;
  confidence: number;
  matchedPattern?: string;
}
