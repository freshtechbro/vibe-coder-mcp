import axios, { AxiosError } from 'axios';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';
import { ApiError, ParsingError, AppError, ConfigurationError } from './errors.js'; // Import custom errors

/**
 * Performs a single research query using the configured Perplexity model.
 * @param query The research query string.
 * @param config OpenRouter configuration containing the specific perplexityModel name.
 * @returns The research result content as a string.
 * @throws Error if the API call fails or returns no content.
 */
export async function performResearchQuery(query: string, config: OpenRouterConfig): Promise<string> {
  logger.debug({ query, model: config.perplexityModel }, "Performing Perplexity research query");
  if (!config.perplexityModel) {
    // Throw specific ConfigurationError
    throw new ConfigurationError("Perplexity model name (PERPLEXITY_MODEL) is not configured in environment variables.");
  }
  if (!config.apiKey) {
    // Throw specific ConfigurationError
    throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
  }

  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.perplexityModel, // Use the specific model from config
        messages: [
          { role: "system", content: "You are a sophisticated AI research assistant using Perplexity Sonar Deep Research. Provide comprehensive, accurate, and up-to-date information. Research the user's query thoroughly." },
          { role: "user", content: query }
        ],
        max_tokens: 4000,
        temperature: 0.1
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional
        },
        timeout: 90000 // Increased timeout for potentially deeper research (90s)
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      logger.debug({ query }, "Perplexity query successful");
      return response.data.choices[0].message.content.trim();
    } else {
      logger.warn({ query, responseData: response.data }, "Received empty or unexpected response structure from Perplexity");
      // Throw specific ParsingError
      throw new ParsingError(
        "Invalid API response structure received from Perplexity",
        { query, responseData: response.data }
      );
    }
  } catch (error) {
    logger.error({ err: error, query, model: config.perplexityModel }, "Perplexity API call failed");

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      const apiMessage = `Perplexity API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
      // Throw specific ApiError
      throw new ApiError(
        apiMessage,
        status,
        { query, model: config.perplexityModel, responseData },
        axiosError // Pass original AxiosError
      );
    } else if (error instanceof AppError) {
        // Re-throw known AppErrors (like ParsingError from above)
        throw error;
    } else if (error instanceof Error) {
      // Wrap other standard errors
       throw new AppError(
         `Perplexity research failed: ${error.message}`,
         { query, model: config.perplexityModel },
         error // Pass original Error
       );
    } else {
      // Handle cases where a non-Error was thrown
      throw new AppError(
        `Unknown error during Perplexity research.`,
        { query, model: config.perplexityModel, thrownValue: String(error) }
      );
    }
  }
}
