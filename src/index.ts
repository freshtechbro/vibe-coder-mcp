#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"; 
import express from "express";
import { createServer } from "./server.js";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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
          console.error('Failed to connect transport:', error);
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
          
          // Handle the message - we need to cast this since the type definition is incomplete
          const sseTransport = transport as any;
          if (typeof sseTransport.handlePostMessage === 'function') {
            await sseTransport.handlePostMessage(req, res);
          } else {
            throw new Error('Transport does not support handlePostMessage');
          }
        } catch (error) {
          console.error('Error handling POST message:', error);
          res.status(500).json({ error: 'Internal server error' });
        }
      });

      // Start the Express server
      app.listen(port, () => {
        console.log(`Vibe Coder MCP server running on http://localhost:${port}`);
        console.log('Connect using SSE at /sse and post messages to /messages');
      });
    } else {
      // Use stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('Vibe Coder MCP server running on stdio');
    }
  } catch (error) {
    console.error('Server error:', error);
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
        console.error('Initialized research-manager directories');
      }
    } catch (error) {
      console.error('Error initializing research-manager:', error);
    }
    
    try {
      const rulesGenerator = await import('./tools/rules-generator/index.js');
      if (typeof rulesGenerator.initDirectories === 'function') {
        await rulesGenerator.initDirectories();
        console.error('Initialized rules-generator directories');
      }
    } catch (error) {
      console.error('Error initializing rules-generator:', error);
    }
    
    try {
      const prdGenerator = await import('./tools/prd-generator/index.js');
      if (typeof prdGenerator.initDirectories === 'function') {
        await prdGenerator.initDirectories();
        console.error('Initialized prd-generator directories');
      }
    } catch (error) {
      console.error('Error initializing prd-generator:', error);
    }
    
    try {
      const userStoriesGenerator = await import('./tools/user-stories-generator/index.js');
      if (typeof userStoriesGenerator.initDirectories === 'function') {
        await userStoriesGenerator.initDirectories();
        console.error('Initialized user-stories-generator directories');
      }
    } catch (error) {
      console.error('Error initializing user-stories-generator:', error);
    }
    
    try {
      const taskListGenerator = await import('./tools/task-list-generator/index.js');
      if (typeof taskListGenerator.initDirectories === 'function') {
        await taskListGenerator.initDirectories();
        console.error('Initialized task-list-generator directories');
      }
    } catch (error) {
      console.error('Error initializing task-list-generator:', error);
    }
    
    console.error('Tool directory initialization complete');
  } catch (error) {
    console.error('Error initializing directories:', error);
  }
}

// Initialize directories and start the server
initDirectories().then(() => {
  main().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
});
