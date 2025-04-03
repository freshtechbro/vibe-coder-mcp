#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path'; // Ensure path is imported
import { fileURLToPath } from 'url'; // Needed for ES Module path resolution
import logger from "./logger.js";
import { initializeToolEmbeddings } from './services/routing/embeddingStore.js';
import { loadLlmConfigMapping } from './utils/configLoader.js'; // Import the new loader
import { OpenRouterConfig } from './types/workflow.js'; // Import OpenRouterConfig type
import { ToolRegistry } from './services/routing/toolRegistry.js'; // Import ToolRegistry to initialize it properly
import { sseNotifier } from './services/sse-notifier/index.js'; // Import the SSE notifier singleton

// Import createServer *after* tool imports to ensure proper initialization order
import { createServer } from "./server.js";

// --- Load .env file explicitly ---
// Get the directory name of the current module (build/index.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Construct the path to the .env file in the project root (one level up from build)
const envPath = path.resolve(__dirname, '../.env');
// Load environment variables from the specific path
const dotenvResult = dotenv.config({ path: envPath });

if (dotenvResult.error) {
  logger.warn({ err: dotenvResult.error, path: envPath }, `Could not load .env file from explicit path. Environment variables might be missing.`);
} else {
  logger.info({ path: envPath, loaded: dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : [] }, `Loaded environment variables from .env file.`);
}
// --- End .env loading ---

// Define an interface for transports that handle POST messages
interface TransportWithMessageHandling {
  handlePostMessage(req: express.Request, res: express.Response): Promise<void>;
  // Add other common transport properties/methods if needed, e.g., from SSEServerTransport
}

// Type guard to check if an object conforms to TransportWithMessageHandling
const isMessageHandlingTransport = (t: unknown): t is TransportWithMessageHandling =>
  t !== null && typeof t === 'object' && 'handlePostMessage' in t && typeof (t as TransportWithMessageHandling).handlePostMessage === 'function';

// Determine transport based on command line arguments
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');

// Define main function *before* it's called
async function main(mcpServer: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer) {
  try {
    if (useSSE) {
      // Set up Express server for SSE
      const app = express();
      app.use(cors());
      app.use(express.json());
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

      app.get('/sse', (req: express.Request, res: express.Response) => {
        const transport = new SSEServerTransport('/messages', res);
        mcpServer.connect(transport).catch((error: Error) => { // Use mcpServer
          logger.error({ err: error }, 'Failed to connect transport');
        });
      });

      app.post('/messages', async (req: express.Request, res: express.Response) => {
         if (!req.body) {
           return res.status(400).json({ error: 'Invalid request body' });
         }
         try {
           const sessionId = req.query.sessionId as string;
           // Find the active transport for this session from the passed server instance
           const transport = mcpServer.server.transport; // Use mcpServer
           if (!transport || !sessionId) {
             return res.status(400).json({ error: 'No active SSE connection' });
           }
           if (isMessageHandlingTransport(transport)) {
              await transport.handlePostMessage(req, res);
           } else {
              logger.error('Active transport does not support handlePostMessage or is not defined.');
              if (!res.headersSent) {
                   res.status(500).json({ error: 'Internal server error: Cannot handle POST message.' });
              }
              return;
           }
         } catch (error) {
           logger.error({ err: error }, 'Error handling POST message');
           if (!res.headersSent) {
              res.status(500).json({ error: 'Internal server error while handling POST message.' });
           }
         }
      });

      app.listen(port, () => {
        logger.info(`Vibe Coder MCP server running on http://localhost:${port}`);
         logger.info('Connect using SSE at /sse and post messages to /messages');
         logger.info('Subscribe to job progress events at /events/:sessionId'); // Log new endpoint
       });

       // --- Add new SSE endpoint for job progress ---
       app.get('/events/:sessionId', (req: express.Request, res: express.Response) => {
         const sessionId = req.params.sessionId;
         if (!sessionId) {
           res.status(400).send('Session ID is required.');
           return;
         }
         logger.info({ sessionId }, `Received request to establish SSE connection for job progress.`);
         sseNotifier.registerConnection(sessionId, res);
       });
       // --- End new SSE endpoint ---

     } else {
      // Use stdio transport
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport); // Use mcpServer
      logger.info('Vibe Coder MCP server running on stdio');
    }
  } catch (error) {
    logger.fatal({ err: error }, 'Server error');
    process.exit(1);
  }
}

// Initialize all tool directories
async function initDirectories() {
  try {
    // Using dynamic imports with try/catch to handle missing files gracefully
    try {
      const researchManager = await import('./tools/research-manager/index.js');
      if (typeof researchManager.initDirectories === 'function') {
        await researchManager.initDirectories();
        logger.debug('Initialized research-manager directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing research-manager');
    }

    try {
      const rulesGenerator = await import('./tools/rules-generator/index.js');
      if (typeof rulesGenerator.initDirectories === 'function') {
        await rulesGenerator.initDirectories();
        logger.debug('Initialized rules-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing rules-generator');
    }

    try {
      const prdGenerator = await import('./tools/prd-generator/index.js');
      if (typeof prdGenerator.initDirectories === 'function') {
        await prdGenerator.initDirectories();
        logger.debug('Initialized prd-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing prd-generator');
    }

    try {
      const userStoriesGenerator = await import('./tools/user-stories-generator/index.js');
      if (typeof userStoriesGenerator.initDirectories === 'function') {
        await userStoriesGenerator.initDirectories();
        logger.debug('Initialized user-stories-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing user-stories-generator');
    }

    try {
      const taskListGenerator = await import('./tools/task-list-generator/index.js');
      if (typeof taskListGenerator.initDirectories === 'function') {
        await taskListGenerator.initDirectories();
        logger.debug('Initialized task-list-generator directories');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error initializing task-list-generator');
    }

    logger.info('Tool directory initialization complete');
  } catch (error) {
    logger.error({ err: error }, 'Error initializing directories');
  }
}

// New function to handle all async initialization steps
async function initializeApp() {
  // Load LLM configuration first (loader now handles path logic internally)
  logger.info(`Attempting to load LLM config (checking env var LLM_CONFIG_PATH, then CWD)...`);
  const llmMapping = loadLlmConfigMapping('llm_config.json'); // Pass only filename

  // Prepare OpenRouter config
  // Create openRouterConfig with a proper deep copy of llmMapping to prevent reference issues
  const openRouterConfig: OpenRouterConfig = {
      baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || "",
      geminiModel: process.env.GEMINI_MODEL || "google/gemini-2.0-flash-001",
      perplexityModel: process.env.PERPLEXITY_MODEL || "perplexity/sonar-deep-research",
      llm_mapping: JSON.parse(JSON.stringify(llmMapping)) // Create a deep copy using JSON serialization
  };
  
  // Log the loaded configuration details
  const mappingKeys = Object.keys(llmMapping);
  logger.info('Loaded LLM mapping configuration details:', {
      // filePath is now logged within loadLlmConfigMapping if successful
      mappingLoaded: mappingKeys.length > 0, // Indicate if mappings were actually loaded
      numberOfMappings: mappingKeys.length,
      mappingKeys: mappingKeys, // Log the keys found
      // Avoid logging the full mapping values unless debug level is set
      // mappingValues: llmMapping // Potentially too verbose for info level
  });

  // CRITICAL - Initialize the ToolRegistry with the proper config BEFORE any tools are registered
  // This ensures all tools will receive the correct config with llm_mapping intact
  logger.info('Initializing ToolRegistry with full configuration including model mappings');
  ToolRegistry.getInstance(openRouterConfig);

  // Now that the registry is initialized with the proper config, we can safely load tools
  // which will register themselves with the properly configured registry
  await initDirectories(); // Initialize tool directories
  await initializeToolEmbeddings(); // Initialize embeddings

  logger.info('Application initialization complete.');
  // Return the fully loaded config
  return openRouterConfig;
}

// Initialize app, create server with loaded config, then start main logic
initializeApp().then((loadedConfig) => {
  const server = createServer(loadedConfig); // Pass loaded config to server creation
  main(server).catch(error => { // Pass server instance to main
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  });
}).catch(initError => {
   logger.fatal({ err: initError }, 'Failed during application initialization');
   process.exit(1);
});
