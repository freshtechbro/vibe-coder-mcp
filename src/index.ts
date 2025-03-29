#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"; 
import express from "express";
import { createServer } from "./server.js";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import logger from "./logger.js";
import { initializeToolEmbeddings } from './services/routing/embeddingStore.js'; // Added import

// Load environment variables from .env file
dotenv.config();

// Get directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the MCP server
const server = createServer();

// Determine transport based on command line arguments
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');

async function main() {
  try {
    if (useSSE) {
      // Set up Express server for SSE
      const app = express();
      app.use(cors());
      app.use(express.json());
      
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

      // SSE endpoint
      app.get('/sse', (req: express.Request, res: express.Response) => {
        const transport = new SSEServerTransport('/messages', res);
        server.connect(transport).catch((error: Error) => {
          logger.error({ err: error }, 'Failed to connect transport');
        });
      });

      // Message endpoint for POST requests
      app.post('/messages', async (req: express.Request, res: express.Response) => {
        if (!req.body) {
          return res.status(400).json({ error: 'Invalid request body' });
        }
        
        try {
          const sessionId = req.query.sessionId as string;
          // Find the active transport for this session
          const transport = server.server.transport;
          
          if (!transport || !sessionId) {
            return res.status(400).json({ error: 'No active SSE connection' });
          }

          // Use a type guard to safely check for and call handlePostMessage
          if (transport && 'handlePostMessage' in transport && typeof (transport as any).handlePostMessage === 'function') {
             // We still need 'any' for the call itself if the type system doesn't know the method,
             // but the 'in' and 'typeof' checks provide runtime safety.
             await (transport as any).handlePostMessage(req, res);
             // Assuming handlePostMessage sends the response, so we don't send one here.
          } else {
             logger.error('Active transport does not support handlePostMessage or is not defined.');
             // Ensure a response is sent if headers aren't already sent
             if (!res.headersSent) {
                  res.status(500).json({ error: 'Internal server error: Cannot handle POST message.' });
             }
             // Exit the handler after sending error response
             return;
          }
        } catch (error) {
          logger.error({ err: error }, 'Error handling POST message');
          // Ensure a response is sent in case of other errors within the try block
          if (!res.headersSent) {
             res.status(500).json({ error: 'Internal server error while handling POST message.' });
          }
        }
      });

      // Start the Express server
      app.listen(port, () => {
        logger.info(`Vibe Coder MCP server running on http://localhost:${port}`);
        logger.info('Connect using SSE at /sse and post messages to /messages');
      });
    } else {
      // Use stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
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
  await initDirectories(); // Keep existing dir init
  await initializeToolEmbeddings(); // Add embedding init
  logger.info('Application initialization complete.');
}

// Initialize app and start the server
initializeApp().then(() => {
  main().catch(error => {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  });
}).catch(initError => {
   logger.fatal({ err: initError }, 'Failed during application initialization');
   process.exit(1);
});
