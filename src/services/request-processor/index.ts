import { hybridMatch, getMatchExplanation } from "../hybrid-matcher/index.js";
import { OpenRouterConfig } from "../../types/workflow.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Result of processing a user request
 */
export interface ProcessedRequest {
  toolName: string;
  parameters: Record<string, string>;
  explanation: string;
  confidence: number;
  requiresConfirmation: boolean;
}

/**
 * Process a user request using the hybrid matching system
 * 
 * @param request The user's request text
 * @param config Configuration for OpenRouter API
 * @returns Processed request with tool name, parameters, explanation, and metadata
 */
export async function processUserRequest(
  request: string,
  config: OpenRouterConfig
): Promise<CallToolResult> {
  try {
    // Use the hybrid matcher to determine the appropriate tool
    const matchResult = await hybridMatch(request, config);
    
    // Get a human-readable explanation for the match
    const explanation = getMatchExplanation(matchResult);
    
    // Build the processed request result
    const processedRequest: ProcessedRequest = {
      toolName: matchResult.toolName,
      parameters: matchResult.parameters,
      explanation: explanation,
      confidence: matchResult.confidence,
      requiresConfirmation: matchResult.requiresConfirmation
    };
    
    // Return the result formatted as a CallToolResult
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(processedRequest, null, 2)
        }
      ]
    };
  } catch (error) {
    console.error("Error processing user request:", error);
    
    // Return an error result
    return {
      content: [
        {
          type: "text",
          text: `Error processing request: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Execute the appropriate tool based on the processed request
 * 
 * @param processedRequest The processed request with tool name and parameters
 * @param toolExecutors Map of tool executors keyed by tool name
 * @returns The result of executing the tool
 */
export async function executeProcessedRequest(
  processedRequest: ProcessedRequest,
  toolExecutors: Record<string, (params: Record<string, string>) => Promise<CallToolResult>>
): Promise<CallToolResult> {
  try {
    // Get the executor for the specified tool
    const executor = toolExecutors[processedRequest.toolName];
    
    if (!executor) {
      throw new Error(`No executor found for tool: ${processedRequest.toolName}`);
    }
    
    // Execute the tool with the extracted parameters
    return await executor(processedRequest.parameters);
  } catch (error) {
    console.error("Error executing tool:", error);
    
    // Return an error result
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}
