import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import dotenv from "dotenv";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import logger from "./logger.js";

// Import all tool modules to trigger registration
import '../tools/index.js';
// Also import the request processor to register the process-request tool
import './services/request-processor/index.js';

// Import registry functions
import { getAllTools, executeTool } from './services/routing/toolRegistry.js';

// Import necessary types
import { OpenRouterConfig } from "./types/workflow.js";
import { ProcessedRequest } from "./services/request-processor/index.js"; // Keep this type if needed by process-request tool logic
// Remove direct executor imports as they are handled by the registry
// import { generateFullstackStarterKit } from "./tools/fullstack-starter-kit-generator/index.js";
// import { generateRules } from "./tools/rules-generator/index.js";
// import { generatePRD } from "./tools/prd-generator/index.js";
// import { generateUserStories } from "./tools/user-stories-generator/index.js";
// import { generateTaskList } from "./tools/task-list-generator/index.js";

// Load environment variables
dotenv.config();

// Create OpenRouter config from environment variables
const config: OpenRouterConfig = {
  baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "google/gemini-2.0-flash-001",
  perplexityModel: process.env.PERPLEXITY_MODEL || "perplexity/sonar-deep-research"
};

/**
 * Initialize the MCP server with all Vibe Coder tools
 */
export function createServer(): McpServer {
  // Create a new MCP server
  const server = new McpServer(
    {
      name: "vibe-coder-mcp",
      version: "1.0.0"
    },
    {
      instructions: `
Vibe Coder MCP server provides tools for development automation:

1. Fullstack Starter Kit - Generates custom full-stack project starter kits
2. Research - Performs deep research using Perplexity Sonar
3. Generate Rules - Creates project-specific development rules
4. Generate PRD - Creates comprehensive product requirements documents
5. Generate User Stories - Creates detailed user stories
6. Generate Task List - Creates detailed development task lists

All generated artifacts are stored in structured directories.
      `
    }
  );
  
  // Log server initialization
  logger.info('MCP Server initialized');
  
  // Note: McpServer doesn't expose direct error handling hook
  // Errors will be caught in the main index.ts

  // Tool registration will now be handled dynamically below.

  // --- REMOVE ALL server.tool(...) blocks from here down ---
  /*
  // Example of removed block:
  server.tool(
    "generate-rules",
    "Creates project-specific development rules based on product description",
    {
      productDescription: z.string().describe("Description of the product being developed"),
      userStories: z.string().optional().describe("Optional user stories to inform the rules"),
      ruleCategories: z.array(z.string()).optional().describe("Optional categories of rules to generate")
    },
    async ({ productDescription, userStories, ruleCategories }): Promise<CallToolResult> => {
      const result = await generateRules(productDescription, userStories, ruleCategories, config);
      return {
        content: result.content
      };
    }
  );

  // Register the PRD generator tool
  server.tool(
    "generate-prd",
    "Creates comprehensive product requirements documents",
    {
      productDescription: z.string().describe("Description of the product to create a PRD for")
    },
    async ({ productDescription }): Promise<CallToolResult> => {
      const result = await generatePRD(productDescription, config);
      return {
        content: result.content
      };
    }
  );

  // Register the user stories generator tool
  server.tool(
    "generate-user-stories",
    "Creates detailed user stories with acceptance criteria",
    {
      productDescription: z.string().describe("Description of the product to create user stories for")
    },
    async ({ productDescription }): Promise<CallToolResult> => {
      const result = await generateUserStories(productDescription, config);
      return {
        content: result.content
      };
    }
  );

  // Register the task list generator tool
  server.tool(
    "generate-task-list",
    "Creates structured development task lists with dependencies",
    {
      productDescription: z.string().describe("Description of the product"),
      userStories: z.string().describe("User stories to use for task list generation")
    },
    async ({ productDescription, userStories }): Promise<CallToolResult> => {
      const result = await generateTaskList(productDescription, userStories, config);
      return {
        content: result.content
      };
    }
  );

  // Register the fullstack starter kit generator tool
  server.tool(
    "generate-fullstack-starter-kit",
    "Generates full-stack project starter kits with custom tech stacks",
    {
      use_case: z.string().describe("The specific use case for the starter kit"),
      tech_stack_preferences: z.record(z.string().optional()).optional().describe("Optional tech stack preferences"),
      request_recommendation: z.boolean().optional().describe("Whether to request recommendations for tech stack components"),
      include_optional_features: z.array(z.string()).optional().describe("Optional features to include in the starter kit")
    },
    async ({ use_case, tech_stack_preferences, request_recommendation, include_optional_features }): Promise<CallToolResult> => {
      const input = {
        use_case,
        tech_stack_preferences: tech_stack_preferences || {},
        request_recommendation: request_recommendation || false,
        include_optional_features: include_optional_features || []
      };
      
      const result = await generateFullstackStarterKit(input, config);
      return {
        content: result.content
      };
    }
  );
  
  // Register the natural language request processor tool
  server.tool(
    "process-request",
    "Processes natural language requests and routes them to the appropriate tool",
    {
      request: z.string().describe("Natural language request to process")
    },
    async ({ request }): Promise<CallToolResult> => {
      // Process the request to determine which tool to use
      const result = await processUserRequest(request, config);
      
      // Check that we have content and it's text
      if (!result.content?.[0] || result.content[0].type !== 'text' || typeof result.content[0].text !== 'string') {
        return {
          content: [
            {
              type: "text",
              text: "Error: Failed to process request - invalid response format"
            }
          ],
          isError: true
        };
      }
      
      // If we need to confirm with the user, just return the processed request
      const processedRequest = JSON.parse(result.content[0].text) as ProcessedRequest;
      if (processedRequest.requiresConfirmation) {
        return {
          content: [
            {
              type: "text",
              text: `I'll use the ${processedRequest.toolName} for this request.\n\n${processedRequest.explanation}\n\nConfidence: ${Math.round(processedRequest.confidence * 100)}%`
            }
          ]
        };
      }
      
      // Otherwise, execute the tool directly
      // Create a map of tool executors
      const toolExecutors: Record<string, (params: Record<string, string>) => Promise<CallToolResult>> = {
        "fullstack-starter-kit-generator": async (params) => {
          const input = {
            use_case: params.use_case || params.project || request,
            tech_stack_preferences: params.tech_stack_preferences ? 
              JSON.parse(params.tech_stack_preferences) : {},
            request_recommendation: params.request_recommendation === 'true',
            include_optional_features: params.include_optional_features ? 
              params.include_optional_features.split(',') : []
          };
          const result = await generateFullstackStarterKit(input, config);
          return {
            content: result.content,
            isError: result.isError
          };
        },
        // "research-manager" execution is now handled by executeTool in toolRegistry
        "rules-generator": async (params) => {
          // Safe handling of rule categories
          const categories = typeof params.ruleCategories === 'string' ? 
            params.ruleCategories.split(",") : undefined;
          
          return generateRules(
            params.productDescription || request, 
            params.userStories, 
            categories, 
            config
          );
        },
        "prd-generator": async (params) => {
          return generatePRD(params.productDescription || request, config);
        },
        "user-stories-generator": async (params) => {
          return generateUserStories(params.productDescription || request, config);
        },
        "task-list-generator": async (params) => {
          return generateTaskList(
            params.productDescription || request, 
            params.userStories || "", 
            config
          );
        }
      };
      
      // Execute the appropriate tool
      const toolResult = await executeProcessedRequest(processedRequest, toolExecutors);
      
      // Return the result with an explanation
      return {
        content: [
          {
            type: "text",
            text: `Using ${processedRequest.toolName}:\n\n${processedRequest.explanation}\n\n---\n\n`
          },
          ...toolResult.content
        ],
        isError: toolResult.isError
      };
    }
  );
  */
  // --- End of removed blocks ---


  // Register all tools found in the registry
  logger.info('Registering tools from Tool Registry...');
  const allToolDefinitions = getAllTools();

  if (allToolDefinitions.length === 0) {
     logger.warn('No tools found in the registry. Ensure tools register themselves via imports.');
     // Consider if the server should start without tools or throw an error
  }

  for (const definition of allToolDefinitions) {
    logger.debug(`Registering tool "${definition.name}" with MCP server.`);
    server.tool(
      definition.name,
      definition.description,
      // Pass the raw shape directly, as expected by server.tool
      definition.inputSchema,
      // The handler now simply calls the central executeTool function
      async (params: Record<string, any>): Promise<CallToolResult> => {
        // 'config' is accessible from the outer scope
        return executeTool(definition.name, params, config);
      }
    );
  }
  logger.info(`Registered ${allToolDefinitions.length} tools dynamically with MCP server.`);

  // The "process-request" tool is now also registered dynamically via its module import.
  // The hardcoded registration block has been removed.

  return server;
}
