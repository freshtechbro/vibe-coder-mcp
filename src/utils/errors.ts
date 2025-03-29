// src/utils/errors.ts

/**
 * Base class for specific application errors, allowing for additional context
 * and tracking of the original error if applicable.
 */
export class AppError extends Error {
  /** Optional additional context related to the error. */
  public readonly context?: Record<string, any>;
  /** Optional original error that caused this AppError. */
  public readonly originalError?: Error;

  /**
   * Creates an instance of AppError.
   * @param message The error message.
   * @param context Optional additional context.
   * @param originalError Optional original error.
   */
  constructor(message: string, context?: Record<string, any>, originalError?: Error) {
    super(message);
    // Set the name property to the class name for easier identification
    this.name = this.constructor.name;
    this.context = context;
    this.originalError = originalError;
    // Maintain stack trace (important for V8 environments like Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Represents an error related to external API calls (e.g., OpenRouter, other services).
 * Can include the HTTP status code received from the API.
 */
export class ApiError extends AppError {
  /** Optional HTTP status code from the API response. */
  public readonly statusCode?: number;

  /**
   * Creates an instance of ApiError.
   * @param message The error message.
   * @param statusCode Optional HTTP status code.
   * @param context Optional additional context.
   * @param originalError Optional original error (e.g., the AxiosError).
   */
  constructor(message: string, statusCode?: number, context?: Record<string, any>, originalError?: Error) {
    super(message, context, originalError);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * Represents an error related to input validation, typically using Zod.
 * Can include the specific validation issues found.
 */
export class ValidationError extends AppError {
  /** Array of validation issues (e.g., from Zod's error.issues). */
  public readonly validationIssues?: any[];

  /**
   * Creates an instance of ValidationError.
   * @param message The error message (often from Zod's error.message).
   * @param validationIssues Optional array of validation issues.
   * @param context Optional additional context.
   */
  constructor(message: string, validationIssues?: any[], context?: Record<string, any>) {
    // Include validation issues in the base context for logging/debugging
    const errorContext = { ...(context || {}), validationIssues };
    super(message, errorContext);
    this.name = 'ValidationError';
    this.validationIssues = validationIssues;
  }
}

/**
 * Represents an error that occurred during the execution of a tool's core logic,
 * after input validation has passed.
 */
export class ToolExecutionError extends AppError {
  /**
   * Creates an instance of ToolExecutionError.
   * @param message The error message.
   * @param context Optional additional context (e.g., tool name, parameters).
   * @param originalError Optional original error thrown by the tool's logic.
   */
  constructor(message: string, context?: Record<string, any>, originalError?: Error) {
    super(message, context, originalError);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Represents an error related to application configuration issues,
 * such as missing environment variables or invalid config files.
 */
export class ConfigurationError extends AppError {
  /**
   * Creates an instance of ConfigurationError.
   * @param message The error message describing the configuration issue.
   * @param context Optional additional context (e.g., missing variable name).
   */
  constructor(message: string, context?: Record<string, any>) {
    super(message, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Represents an error related to parsing data, such as JSON responses from LLMs
 * or other structured data sources.
 */
export class ParsingError extends AppError {
    /**
     * Creates an instance of ParsingError.
     * @param message The error message describing the parsing failure.
     * @param context Optional additional context (e.g., raw data snippet).
     * @param originalError Optional original parsing error (e.g., from JSON.parse).
     */
    constructor(message: string, context?: Record<string, any>, originalError?: Error) {
        super(message, context, originalError);
        this.name = 'ParsingError';
    }
}
