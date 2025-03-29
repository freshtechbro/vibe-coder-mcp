import { z } from 'zod'; // Keep one import
import { hybridMatch, getMatchExplanation, EnhancedMatchResult } from "../hybrid-matcher/index.js";
import { OpenRouterConfig } from "../../types/workflow.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, executeTool } from '../routing/toolRegistry.js'; // Import executeTool

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
 */
// Define Input Type based on Schema
const processRequestInputSchemaShape = {
  request: z.string().min(3, { message: "Request must be at least 3 characters." }).describe("Natural language request to process and route to the appropriate tool")
};

/**
 * Process a user request using the hybrid matching system.
 * This function now acts as the executor for the 'process-request' tool.
 * @param params The validated tool parameters, expecting { request: string }.
 * @param config Configuration for OpenRouter API.
 * @returns Either a confirmation message or the result of the executed tool.
 */
export const processUserRequest: ToolExecutor = async (
  params: Record<string, any>, // Match ToolExecutor signature
  config: OpenRouterConfig
): Promise<CallToolResult> => {
  const request = params.request as string; // Assert type after validation
  let matchResult: EnhancedMatchResult; // Use the enhanced type

  try {
    logger.info(`Processing request: "${request.substring(0, 50)}..."`);
    // Step 1: Use the hybrid matcher to determine the appropriate tool
    matchResult = await hybridMatch(request, config);

    // Step 2: Check if confirmation is needed
    if (matchResult.requiresConfirmation) {
      logger.info(`Tool execution requires confirmation: ${matchResult.toolName}`);
      const explanation = getMatchExplanation(matchResult);
      return {
        content: [{
          type: "text",
          // Provide a clear confirmation prompt to the user
          text: `I plan to use the '${matchResult.toolName}' tool for your request.\nExplanation: ${explanation}\nConfidence: ${Math.round(matchResult.confidence * 100)}%\n\nDo you want to proceed?`
        }],
        isError: false // Not an error, just needs confirmation
      };
    }

    // Step 3: No confirmation needed, execute the determined tool directly
    logger.info(`Executing tool '${matchResult.toolName}' directly based on processed request (Confidence: ${matchResult.confidence.toFixed(3)}).`);
    const toolResult = await executeTool(
      matchResult.toolName,
      matchResult.parameters, // Use parameters determined by hybridMatch
      config
    );

    // Step 4: Combine explanation with the actual tool result
    const explanation = getMatchExplanation(matchResult); // Get explanation again for the final message
    return {
      content: [
        {
          type: "text",
          text: `Using ${matchResult.toolName}:\n${explanation}\n\n---\n\n`
        },
        // Spread the content from the actual tool result, handling potential null/undefined content
        ...(toolResult.content || [{ type: 'text', text: '(Tool executed successfully but returned no content)' }])
      ],
      isError: toolResult.isError ?? false // Propagate error status, default to false
    };

  } catch (error) {
    logger.error({ err: error, request }, "Error processing user request");
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
}; // End of processUserRequest executor

// --- Tool Registration ---

// Tool definition for the request processor tool
const processRequestToolDefinition: ToolDefinition = {
  name: "process-request",
  description: "Processes natural language requests, determines the best tool using semantic matching and fallbacks, and either asks for confirmation or executes the tool directly.", // Updated description
  inputSchema: processRequestInputSchemaShape, // Use the raw shape
  executor: processUserRequest // Reference the adapted function
};

// Register the tool with the central registry
registerTool(processRequestToolDefinition);

// Remove the old executeProcessedRequest function as it's replaced by toolRegistry.executeTool
/*
export async function executeProcessedRequest(...) { ... }
*/
