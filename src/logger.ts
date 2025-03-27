// src/logger.ts
import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Create the logger instance
const logger = pino.default || pino;

// Configure the logger
const configuredLogger = logger({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

export default configuredLogger;
