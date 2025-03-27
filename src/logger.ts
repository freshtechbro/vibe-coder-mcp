// src/logger.ts
import { pino } from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const effectiveLogLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Configure the logger
const configuredLogger = pino(
  {
    level: effectiveLogLevel,
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined, // Use default JSON transport when not in development
  },
  // Redirect output to stderr when not in development to avoid interfering with MCP stdio
  isDevelopment ? process.stdout : process.stderr 
);

export default configuredLogger;
