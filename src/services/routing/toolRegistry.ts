// src/services/routing/toolRegistry.ts
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import logger from '../../logger.js';
import { AppError, ValidationError, ToolExecutionError, ParsingError, ApiError, ConfigurationError } from '../../utils/errors.js'; // Import custom errors

/**
 * Defines the function signature for executing a tool's core logic.
 * @param params The validated parameters for the tool, matching its inputSchema.
 * @param config The OpenRouter configuration, potentially needed for LLM calls within the tool.
 * @returns A Promise resolving to a CallToolResult object.
 */
export type ToolExecutor = (
  params: Record<string, any>, // Using Record<string, any> as executor input after validation
  config: OpenRouterConfig
) => Promise<CallToolResult>;

/**
 * Defines the structure for registering a tool, including its metadata,
 * input validation schema, and execution logic.
 */
export interface ToolDefinition {
  /** The unique name used to identify and call the tool. */
  name: string;
  /** A description of the tool's purpose, used for LLM awareness and potentially routing. */
  description: string;
  /** The raw shape definition for the Zod schema, defining expected input parameters. */
  inputSchema: z.ZodRawShape; // Changed to store the raw shape
  /** The asynchronous function that implements the tool's core logic. */
  executor: ToolExecutor;
}

// In-memory storage for registered tools. Maps tool name to its definition.
const toolRegistry = new Map<string, ToolDefinition>();

/**
 * Registers a tool definition with the registry.
 * Logs a warning if a tool with the same name is already registered (overwrites).
 * @param definition The ToolDefinition object to register.
 */
export function registerTool(definition: ToolDefinition): void {
  if (toolRegistry.has(definition.name)) {
    logger.warn(`Tool "${definition.name}" is already registered. Overwriting.`);
    // Alternatively, could throw new Error(`Tool "${definition.name}" is already registered.`);
  }
  toolRegistry.set(definition.name, definition);
  logger.info(`Registered tool: ${definition.name}`);
}

/**
 * Retrieves a tool definition from the registry by its name.
 * @param toolName The name of the tool to retrieve.
 * @returns The ToolDefinition if found, otherwise undefined.
 */
export function getTool(toolName: string): ToolDefinition | undefined {
  return toolRegistry.get(toolName);
}

/**
 * Retrieves all registered tool definitions as an array.
 * @returns An array containing all ToolDefinition objects currently in the registry.
 */
export function getAllTools(): ToolDefinition[] {
  return Array.from(toolRegistry.values());
}

/**
 * Finds a tool by name, validates the input parameters against its schema,
 * and executes the tool's logic with the validated parameters.
 *
 * @param toolName The name of the tool to execute.
 * @param params The raw parameters received for the tool execution.
 * @param config The OpenRouter configuration, passed to the tool executor.
 * @returns A Promise resolving to the CallToolResult from the tool's executor.
 * @throws Error if the tool is not found in the registry. Returns an error CallToolResult if validation fails or execution fails.
 */
export async function executeTool(
  toolName: string,
  params: Record<string, any>, // Raw parameters before validation
  config: OpenRouterConfig
): Promise<CallToolResult> {
  logger.info(`Attempting to execute tool: ${toolName}`);
  const toolDefinition = getTool(toolName);

  if (!toolDefinition) {
    logger.error(`Tool "${toolName}" not found in registry.`);
    // Return a structured error indicating the tool wasn't found
    return {
      content: [{ type: 'text', text: `Error: Tool "${toolName}" not found.` }],
      isError: true,
    };
    // Or throw: throw new Error(`Tool "${toolName}" not found.`);
  }

  // Compile the raw shape into a Zod object and validate parameters
  const schemaObject = z.object(toolDefinition.inputSchema);
  const validationResult = schemaObject.safeParse(params);

  if (!validationResult.success) {
    logger.error({ tool: toolName, errors: validationResult.error.issues, paramsReceived: params }, 'Tool parameter validation failed.');
    // Create a specific ValidationError
    const validationError = new ValidationError(
        `Input validation failed for tool '${toolName}'`,
        validationResult.error.issues,
        { toolName, paramsReceived: params }
    );
    // Return structured error in CallToolResult
    return {
      content: [{ type: 'text', text: validationError.message }],
      isError: true,
      errorDetails: { // Add structured details
          type: validationError.name, // 'ValidationError'
          message: validationError.message,
          issues: validationError.validationIssues,
      }
    };
  }

  // Parameters are valid (validationResult.data contains the typed, validated data)
  logger.debug(`Executing tool "${toolName}" with validated parameters.`);
  try {
    // Pass the validated data (validationResult.data) to the executor
    const result = await toolDefinition.executor(validationResult.data, config);
    logger.info(`Tool "${toolName}" executed successfully.`);
    return result;
  } catch (error) {
    logger.error({ err: error, tool: toolName, params: validationResult.data }, `Error during execution of tool "${toolName}".`);

    let errorMessage = `Execution error in tool '${toolName}'.`;
    let errorType = 'ToolExecutionError'; // Default type
    let errorContext: Record<string, any> | undefined = { toolName, params: validationResult.data };

    // Check if it's one of our custom AppErrors
    if (error instanceof AppError) {
      errorMessage = `Error in tool '${toolName}': ${error.message}`;
      errorType = error.name; // Get the specific class name (e.g., 'ApiError', 'ParsingError')
      errorContext = { ...errorContext, ...error.context }; // Merge contexts
    } else if (error instanceof Error) {
      // Generic Error
      errorMessage = `Unexpected error in tool '${toolName}': ${error.message}`;
      errorType = error.name; // e.g., 'TypeError'
    } else {
      // Non-Error type thrown
       errorMessage = `Unknown execution error in tool '${toolName}'.`;
       errorType = 'UnknownExecutionError';
       errorContext.originalValue = String(error); // Log the thrown value
    }

    // Return a structured error via CallToolResult
    return {
      content: [{ type: 'text', text: errorMessage }],
      isError: true,
      errorDetails: { // Add structured details
          type: errorType,
          message: (error instanceof Error) ? error.message : String(error),
          // stack: (error instanceof Error) ? error.stack : undefined, // Optional: stack trace
          context: errorContext,
      }
    };
    // Alternative: Re-throw a specific ToolExecutionError
    // throw new ToolExecutionError(`Execution failed for tool '${toolName}'`, errorContext, error instanceof Error ? error : undefined);
  }
}
